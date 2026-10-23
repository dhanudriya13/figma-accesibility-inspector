import type {
  AssetReference,
  StyleInfo,
  VariableCollectionInfo,
  VariableInfo,
} from "../model/design-asset";
import type { RGBA } from "../model/color";
import type { NormalizedPaint } from "../model/normalized-node";
import { isRgba, isVariableAliasValue } from "../model/normalized-node";
import { formatColor, toRgba } from "./color-resolver";

export type ColorResolutionStatus =
  | "resolved"
  | "unresolved"
  | "unsupported"
  | "cycle";

export interface ColorResolution {
  status: ColorResolutionStatus;
  color?: RGBA;
  source?: AssetReference;
  dependencyPath: string[];
  evidence: string[];
  limitations: string[];
  modeId?: string;
  modeName?: string;
}

export interface VariableIndex {
  byId: Map<string, VariableInfo>;
  collections: Map<string, VariableCollectionInfo>;
}

export interface PaintResolutionContext {
  index: VariableIndex;
  styles: Map<string, StyleInfo>;
  modesByCollection: Record<string, string>;
}

export function buildVariableIndex(
  variables: VariableInfo[],
  collections: VariableCollectionInfo[],
): VariableIndex {
  return {
    byId: new Map(variables.map((variable) => [variable.id, variable])),
    collections: new Map(
      collections.map((collection) => [collection.id, collection]),
    ),
  };
}

interface InternalResolution {
  status: ColorResolutionStatus;
  color?: RGBA;
  path: string[];
  evidence: string[];
  limitations: string[];
  modeId?: string;
  modeName?: string;
}

function resolveInternal(
  variableId: string,
  index: VariableIndex,
  modesByCollection: Record<string, string>,
  trail: Set<string>,
): InternalResolution {
  const variable = index.byId.get(variableId);
  if (!variable) {
    return {
      status: "unsupported",
      path: [],
      evidence: [
        `Variable ${variableId} is not available in the local variable set.`,
      ],
      limitations: [
        "The binding may point to a remote or team-library variable that this plugin did not load.",
      ],
    };
  }

  if (trail.has(variableId)) {
    return {
      status: "cycle",
      path: [variable.name],
      evidence: [`Variable alias cycle detected at "${variable.name}".`],
      limitations: ["The color value cannot be resolved until the cycle is fixed."],
    };
  }

  if (variable.resolvedType !== "COLOR") {
    return {
      status: "unsupported",
      path: [variable.name],
      evidence: [
        `Variable "${variable.name}" has type ${variable.resolvedType}, not COLOR.`,
      ],
      limitations: ["Only color variables can be evaluated by contrast rules."],
    };
  }

  const collection = index.collections.get(variable.collectionId);
  let modeId =
    modesByCollection[variable.collectionId] ?? collection?.defaultModeId;

  if (!modeId) {
    return {
      status: "unresolved",
      path: [variable.name],
      evidence: [`No mode could be selected for "${variable.name}".`],
      limitations: ["The variable collection mode is unknown."],
    };
  }

  let modeName = collection?.modes.find((mode) => mode.modeId === modeId)?.name;
  let value = variable.valuesByMode[modeId];
  let fallbackNote: string | undefined;

  if (value === undefined && collection) {
    const fallbackModeId = collection.defaultModeId;
    if (fallbackModeId !== modeId) {
      value = variable.valuesByMode[fallbackModeId];
      if (value !== undefined) {
        const requestedModeName = modeName;
        modeId = fallbackModeId;
        modeName =
          collection.modes.find((mode) => mode.modeId === fallbackModeId)?.name ??
          modeName;
        fallbackNote = `Variable "${variable.name}" had no value in the requested mode "${requestedModeName ?? "unknown"}"; the collection default mode "${modeName ?? modeId}" was used.`;
      }
    }
  }

  if (value === undefined) {
    return {
      status: "unresolved",
      path: [variable.name],
      evidence: [
        `Variable "${variable.name}" has no value in mode "${modeName ?? modeId}".`,
      ],
      limitations: ["The selected mode is not populated for this variable."],
      modeId,
      modeName,
    };
  }

  if (isVariableAliasValue(value)) {
    const next = resolveInternal(
      value.id,
      index,
      modesByCollection,
      new Set([...trail, variableId]),
    );
    const target = index.byId.get(value.id);
    const targetName = target?.name ?? value.id;
    return {
      ...next,
      path: [variable.name, ...next.path],
      evidence: [
        `Variable "${variable.name}" aliases "${targetName}".`,
        ...next.evidence,
      ],
    };
  }

  if (isRgba(value)) {
    return {
      status: "resolved",
      color: toRgba(value),
      path: [variable.name],
      evidence: [
        `Variable "${variable.name}" resolves to ${formatColor(toRgba(value))} in mode "${modeName ?? modeId}".`,
        ...(fallbackNote ? [fallbackNote] : []),
      ],
      limitations: fallbackNote ? [fallbackNote] : [],
      modeId,
      modeName,
    };
  }

  return {
    status: "unsupported",
    path: [variable.name],
    evidence: [
      `Variable "${variable.name}" does not resolve to a color value in mode "${modeName ?? modeId}".`,
    ],
    limitations: ["Only solid color values are supported."],
    modeId,
    modeName,
  };
}

export function resolveVariableColor(
  variableId: string,
  index: VariableIndex,
  modesByCollection: Record<string, string>,
): ColorResolution {
  const variable = index.byId.get(variableId);
  const internal = resolveInternal(
    variableId,
    index,
    modesByCollection,
    new Set(),
  );

  return {
    ...internal,
    dependencyPath: internal.path,
    source: variable
      ? {
          assetId: variable.id,
          kind: "variable",
          name: variable.name,
          propertyPath: "fills",
          dependencyPath: internal.path,
          evidence: `Bound to variable "${variable.name}"${
            internal.path.length > 1
              ? ` via ${internal.path.slice(1).join(" -> ")}`
              : ""
          }.`,
        }
      : undefined,
  };
}

function withPaintOpacity(
  resolution: ColorResolution,
  paint: NormalizedPaint,
): ColorResolution {
  const color = resolution.color;
  const opacity = Math.min(1, Math.max(0, paint.opacity));
  const limitations = [...resolution.limitations];

  if (paint.blendMode !== "NORMAL") {
    limitations.push(
      `Blend mode ${paint.blendMode} is not modeled; the reported color may differ from the rendered result.`,
    );
  }

  if (!color) return { ...resolution, limitations };

  return {
    ...resolution,
    color:
      opacity >= 0.999
        ? color
        : { ...color, a: color.a * opacity },
    limitations,
    evidence:
      opacity < 0.999
        ? [
            ...resolution.evidence,
            `Paint opacity ${Math.round(opacity * 100)}% was applied.`,
          ]
        : resolution.evidence,
  };
}

function resolveStyleColor(
  style: StyleInfo,
  context: PaintResolutionContext,
): ColorResolution {
  const styleSource: AssetReference = {
    assetId: style.id,
    kind: "style",
    name: style.name,
    propertyPath: "style",
    dependencyPath: [style.name],
    evidence: `Bound to local paint style "${style.name}".`,
  };

  if (!style.paint) {
    return {
      status: "unsupported",
      source: styleSource,
      dependencyPath: [style.name],
      evidence: [`Paint style "${style.name}" has no readable paint value.`],
      limitations: ["The style may contain multiple paints or mixed values."],
    };
  }

  if (style.paint.variableId) {
    const variable = resolveVariableColor(
      style.paint.variableId,
      context.index,
      context.modesByCollection,
    );
    const withStyleOpacity = withPaintOpacity(variable, style.paint);
    return {
      ...withStyleOpacity,
      source: styleSource,
      dependencyPath: [style.name, ...variable.dependencyPath],
      evidence: [
        `Paint style "${style.name}" uses variable "${variable.source?.name ?? style.paint.variableId}".`,
        ...withStyleOpacity.evidence,
      ],
    };
  }

  if (style.paint.color) {
    const resolved: ColorResolution = {
      status: "resolved",
      color: style.paint.color,
      dependencyPath: [style.name],
      evidence: [
        `Paint style "${style.name}" resolves to ${formatColor(style.paint.color)}.`,
      ],
      limitations: [],
    };
    const withStyleOpacity = withPaintOpacity(resolved, style.paint);
    return {
      ...withStyleOpacity,
      source: styleSource,
      dependencyPath: [style.name],
    };
  }

  return {
    status: "unsupported",
    source: styleSource,
    dependencyPath: [style.name],
    evidence: [`Paint style "${style.name}" has no solid color value.`],
    limitations: ["Only solid paint styles are supported."],
  };
}

export function resolvePaintColor(
  paint: NormalizedPaint,
  context: PaintResolutionContext,
): ColorResolution {
  if (!paint.visible) {
    return {
      status: "unresolved",
      dependencyPath: [],
      evidence: ["Paint is hidden."],
      limitations: [],
    };
  }

  if (paint.opacity <= 0) {
    return {
      status: "unresolved",
      dependencyPath: [],
      evidence: ["Paint opacity is 0%."],
      limitations: [],
    };
  }

  if (paint.status === "gradient") {
    return {
      status: "unsupported",
      dependencyPath: [],
      evidence: [
        `Paint is a ${paint.gradientType ?? "gradient"} gradient with ${paint.gradientStops?.length ?? 0} stop(s).`,
      ],
      limitations: [
        "A gradient does not have one contrast ratio for the whole text or component area.",
      ],
    };
  }

  if (paint.status === "image") {
    return {
      status: "unsupported",
      dependencyPath: [],
      evidence: ["Paint is an image fill."],
      limitations: [
        "Image fills are not sampled; contrast can vary across the image.",
      ],
    };
  }

  if (paint.status !== "solid") {
    return {
      status: "unsupported",
      dependencyPath: [],
      evidence: [`Paint type ${paint.rawType ?? "unknown"} is not supported.`],
      limitations: ["Only solid colors are evaluated in this release."],
    };
  }

  if (paint.variableId) {
    return withPaintOpacity(
      resolveVariableColor(
        paint.variableId,
        context.index,
        context.modesByCollection,
      ),
      paint,
    );
  }

  if (paint.styleId) {
    const style = context.styles.get(paint.styleId);
    if (!style) {
      return {
        status: "unsupported",
        dependencyPath: [],
        evidence: [`Paint style ${paint.styleId} is not available locally.`],
        limitations: [
          "The style may come from a team library that this plugin did not load.",
        ],
      };
    }
    const resolved = resolveStyleColor(style, context);
    return withPaintOpacity(resolved, paint);
  }

  if (paint.color) {
    const color = paint.color;
    return withPaintOpacity(
      {
        status: "resolved",
        color,
        dependencyPath: [],
        evidence: [`Paint resolves to ${formatColor(color)}.`],
        limitations: [],
      },
      paint,
    );
  }

  return {
    status: "unresolved",
    dependencyPath: [],
    evidence: ["Paint has no readable color value."],
    limitations: [],
  };
}
