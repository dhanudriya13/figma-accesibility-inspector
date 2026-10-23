import type { AssetReference, DesignAsset } from "../model/design-asset";
import type {
  NormalizedDesignModel,
  NormalizedNode,
  NormalizedPaint,
} from "../model/normalized-node";

export function visiblePaints(paints: NormalizedPaint[]): NormalizedPaint[] {
  return paints.filter((paint) => paint.visible && paint.opacity > 0);
}

export function topVisiblePaint(
  paints: NormalizedPaint[],
): NormalizedPaint | undefined {
  const visible = visiblePaints(paints);
  return visible[visible.length - 1];
}

const INTERACTIVE_NAME =
  /\b(button|btn|cta|input|field|textbox|textarea|select|dropdown|combobox|checkbox|radio|switch|toggle|tab|slider|stepper|control|icon|indicator|link|menuitem|menu|chip|segmented|pagination)\b/i;

const GRAPHIC_NAME =
  /\b(icon|indicator|glyph|check|checkmark|close|search|arrow|chevron|logo|spinner|dot|badge|avatar)\b/i;

export function isInteractiveCandidate(node: NormalizedNode): boolean {
  if (node.type === "TEXT" || node.type === "PAGE") return false;
  if (node.type === "COMPONENT_SET") return false;
  if (node.bounds.width <= 0 || node.bounds.height <= 0) return false;
  if (!node.effectiveVisible) return false;

  return (
    INTERACTIVE_NAME.test(node.name) ||
    (node.mainComponentName !== undefined &&
      INTERACTIVE_NAME.test(node.mainComponentName))
  );
}

export function isGraphicCandidate(node: NormalizedNode): boolean {
  return GRAPHIC_NAME.test(node.name);
}

export function hasInteractiveAncestor(
  model: NormalizedDesignModel,
  node: NormalizedNode,
): boolean {
  let current = node.parentId ? model.nodes[node.parentId] : undefined;
  const seen = new Set<string>();

  while (current && !seen.has(current.id)) {
    if (isInteractiveCandidate(current)) return true;
    seen.add(current.id);
    current = current.parentId ? model.nodes[current.parentId] : undefined;
  }

  return false;
}

function findComponentDefinition(
  model: NormalizedDesignModel,
  node: NormalizedNode,
): NormalizedNode | undefined {
  let current: NormalizedNode | undefined = node;
  const seen = new Set<string>();

  while (current && !seen.has(current.id)) {
    if (current.isInstance) return undefined;
    if (current.type === "COMPONENT" || current.type === "COMPONENT_SET") {
      return current;
    }
    seen.add(current.id);
    current = current.parentId ? model.nodes[current.parentId] : undefined;
  }

  return undefined;
}

export function estimateReach(
  model: NormalizedDesignModel,
  assets: Map<string, DesignAsset>,
  node: NormalizedNode,
): number {
  if (node.isInstance) return 1;
  const definition = findComponentDefinition(model, node);
  if (!definition) return 1;
  const asset = assets.get(definition.id);
  return Math.max(1, asset?.instanceCount ?? 1);
}

function collectionIdsForVariable(
  variableId: string,
  byId: Map<string, { collectionId: string; valuesByMode: Record<string, unknown> }>,
  seen = new Set<string>(),
): string[] {
  if (seen.has(variableId)) return [];
  seen.add(variableId);
  const variable = byId.get(variableId);
  if (!variable) return [];

  const collections = new Set<string>([variable.collectionId]);
  for (const value of Object.values(variable.valuesByMode)) {
    if (
      value &&
      typeof value === "object" &&
      (value as { type?: string }).type === "VARIABLE_ALIAS" &&
      typeof (value as { id?: unknown }).id === "string"
    ) {
      for (const collectionId of collectionIdsForVariable(
        (value as { id: string }).id,
        byId,
        seen,
      )) {
        collections.add(collectionId);
      }
    }
  }

  return [...collections];
}

export function collectionIdsForSource(
  context: {
    variableIndex: {
      byId: Map<
        string,
        { collectionId: string; valuesByMode: Record<string, unknown> }
      >;
    };
    styles: Map<string, { paint?: { variableId?: string } }>;
  },
  source: AssetReference | undefined,
): string[] {
  if (!source) return [];
  if (source.kind === "variable") {
    return collectionIdsForVariable(source.assetId, context.variableIndex.byId);
  }
  if (source.kind === "style") {
    const style = context.styles.get(source.assetId);
    if (!style?.paint?.variableId) return [];
    return collectionIdsForVariable(
      style.paint.variableId,
      context.variableIndex.byId,
    );
  }
  return [];
}

export function modeAppliesToSources(
  context: {
    mode: {
      isDefault: boolean;
      focusCollectionId?: string;
    };
    variableIndex: {
      byId: Map<
        string,
        { collectionId: string; valuesByMode: Record<string, unknown> }
      >;
    };
    styles: Map<string, { paint?: { variableId?: string } }>;
  },
  sources: (AssetReference | undefined)[],
): boolean {
  const collections = new Set<string>();
  let hasVariableBinding = false;

  for (const source of sources) {
    if (!source) continue;
    if (source.kind === "variable") hasVariableBinding = true;
    if (source.kind === "style") {
      const style = context.styles.get(source.assetId);
      if (style?.paint?.variableId) hasVariableBinding = true;
    }
    for (const collectionId of collectionIdsForSource(context, source)) {
      collections.add(collectionId);
    }
  }

  if (!hasVariableBinding || collections.size === 0) return context.mode.isDefault;
  if (context.mode.isDefault) return true;
  return (
    context.mode.focusCollectionId !== undefined &&
    collections.has(context.mode.focusCollectionId)
  );
}

export function componentCause(
  context: {
    model: NormalizedDesignModel;
    assets: Map<string, DesignAsset>;
  },
  node: NormalizedNode,
  options: { includeInstances?: boolean } = {},
): AssetReference | undefined {
  if (node.isInstance && options.includeInstances) {
    const asset = node.mainComponentId
      ? context.assets.get(node.mainComponentId)
      : undefined;
    if (!asset) return undefined;
    return {
      assetId: asset.id,
      kind: asset.kind === "variant" ? "variant" : "component",
      name: asset.name,
      propertyPath: "component",
      dependencyPath: [asset.name],
      evidence: `This is an instance of ${asset.kind} "${asset.name}"; instance overrides may change the measured property.`,
      role: "component",
    };
  }

  let current: NormalizedNode | undefined = node;
  const seen = new Set<string>();

  while (current && !seen.has(current.id)) {
    if (current.isInstance) return undefined;
    if (current.type === "COMPONENT" || current.type === "COMPONENT_SET") {
      const asset = context.assets.get(current.id);
      if (!asset) return undefined;
      return {
        assetId: asset.id,
        kind: asset.kind === "variant" ? "variant" : "component",
        name: asset.name,
        propertyPath: "component",
        dependencyPath: [asset.name],
        evidence: `The layer is part of ${asset.kind} "${asset.name}".`,
        role: "component",
      };
    }
    seen.add(current.id);
    current = current.parentId
      ? context.model.nodes[current.parentId]
      : undefined;
  }

  return undefined;
}

export function uniqueCauses(
  causes: (AssetReference | undefined)[],
): AssetReference[] {
  const seen = new Set<string>();
  const result: AssetReference[] = [];
  for (const cause of causes) {
    if (!cause || seen.has(cause.assetId)) continue;
    seen.add(cause.assetId);
    result.push(cause);
  }
  return result;
}

export function describeNode(node: NormalizedNode): string {
  return `${node.name} (${node.type.toLowerCase()})`;
}

export function isTextInScope(node: NormalizedNode): boolean {
  return (
    node.inScope &&
    node.effectiveVisible &&
    node.type === "TEXT" &&
    node.text !== undefined &&
    node.text.characters.trim().length > 0
  );
}
