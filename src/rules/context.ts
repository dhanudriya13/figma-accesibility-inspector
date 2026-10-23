import type { DesignAsset, StyleInfo } from "../model/design-asset";
import type { NormalizedDesignModel } from "../model/normalized-node";
import { buildVariableIndex } from "../resolver/variable-resolver";
import type { VariableIndex } from "../resolver/variable-resolver";
import { resolvePaintColor } from "../resolver/variable-resolver";
import type { ColorResolution } from "../resolver/variable-resolver";
import type { NormalizedPaint } from "../model/normalized-node";

export interface ModeContext {
  id: string;
  label: string;
  modesByCollection: Record<string, string>;
  isDefault: boolean;
  focusCollectionId?: string;
  focusCollectionName?: string;
  focusModeId?: string;
  focusModeName?: string;
}

export interface ModeContextResult {
  contexts: ModeContext[];
  limitations: string[];
}

export interface RuleContext {
  model: NormalizedDesignModel;
  mode: ModeContext;
  variableIndex: VariableIndex;
  styles: Map<string, StyleInfo>;
  assets: Map<string, DesignAsset>;
  resolvePaint: (paint: NormalizedPaint) => ColorResolution;
}

const MAX_MODE_CONTEXTS = 16;

function collectReferencedCollectionIds(
  model: NormalizedDesignModel,
): string[] {
  const variableIds = new Set<string>();
  const styles = new Map(model.styles.map((style) => [style.id, style]));

  for (const node of Object.values(model.nodes)) {
    for (const paint of [...node.fills, ...node.strokes]) {
      if (paint.variableId) variableIds.add(paint.variableId);
      if (paint.styleId) {
        const style = styles.get(paint.styleId);
        if (style?.paint?.variableId) variableIds.add(style.paint.variableId);
      }
    }

    for (const styleId of [node.fillStyleId, node.strokeStyleId]) {
      if (!styleId) continue;
      const style = styles.get(styleId);
      if (style?.paint?.variableId) variableIds.add(style.paint.variableId);
    }
  }

  const variables = new Map(
    model.variables.map((variable) => [variable.id, variable]),
  );
  const collectionIds = new Set<string>();
  const queue = [...variableIds];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const variableId = queue.pop();
    if (!variableId || seen.has(variableId)) continue;
    seen.add(variableId);
    const variable = variables.get(variableId);
    if (!variable) continue;
    collectionIds.add(variable.collectionId);
    for (const value of Object.values(variable.valuesByMode)) {
      if (
        value &&
        typeof value === "object" &&
        (value as { type?: string }).type === "VARIABLE_ALIAS" &&
        typeof (value as { id?: unknown }).id === "string"
      ) {
        queue.push((value as { id: string }).id);
      }
    }
  }

  return [...collectionIds];
}

export function buildModeContexts(
  model: NormalizedDesignModel,
): ModeContextResult {
  const collectionIds = collectReferencedCollectionIds(model);
  const collections = model.collections.filter((collection) =>
    collectionIds.includes(collection.id),
  );

  if (collections.length === 0) {
    return {
      contexts: [
        {
          id: "no-variable-modes",
          label: "No variable modes",
          modesByCollection: {},
          isDefault: true,
        },
      ],
      limitations: [],
    };
  }

  const defaultModes: Record<string, string> = {};
  for (const collection of collections) {
    defaultModes[collection.id] = collection.defaultModeId;
  }

  const contexts: ModeContext[] = [];
  const seen = new Set<string>();
  const limitations: string[] = [];

  for (const collection of collections) {
    for (const mode of collection.modes) {
      const modesByCollection: Record<string, string> = {
        ...defaultModes,
        [collection.id]: mode.modeId,
      };
      const id = Object.keys(modesByCollection)
        .sort()
        .map((collectionId) => `${collectionId}:${modesByCollection[collectionId]}`)
        .join("|");

      if (seen.has(id)) continue;
      seen.add(id);

      contexts.push({
        id,
        label: `${collection.name}: ${mode.name}`,
        modesByCollection,
        isDefault: Object.entries(modesByCollection).every(
          ([collectionId, modeId]) => defaultModes[collectionId] === modeId,
        ),
        focusCollectionId: collection.id,
        focusCollectionName: collection.name,
        focusModeId: mode.modeId,
        focusModeName: mode.name,
      });
    }
  }

  if (collections.length > 1) {
    limitations.push(
      "Variable-mode evaluation varies one collection at a time; other referenced collections use their default mode in each context.",
    );
  }

  if (contexts.length > MAX_MODE_CONTEXTS) {
    limitations.push(
      `Only the first ${MAX_MODE_CONTEXTS} variable-mode contexts were evaluated; additional modes were skipped.`,
    );
    return {
      contexts: contexts.slice(0, MAX_MODE_CONTEXTS),
      limitations,
    };
  }

  return { contexts, limitations };
}

export function createRuleContext(
  model: NormalizedDesignModel,
  mode: ModeContext,
): RuleContext {
  const variableIndex = buildVariableIndex(model.variables, model.collections);
  const styles = new Map(model.styles.map((style) => [style.id, style]));
  const assets = new Map(model.assets.map((asset) => [asset.id, asset]));

  return {
    model,
    mode,
    variableIndex,
    styles,
    assets,
    resolvePaint: (paint) =>
      resolvePaintColor(paint, {
        index: variableIndex,
        styles,
        modesByCollection: mode.modesByCollection,
      }),
  };
}
