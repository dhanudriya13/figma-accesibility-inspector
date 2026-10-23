import type {
  NormalizedNode,
  NormalizedPaint,
  NormalizedTextProperties,
} from "../model/normalized-node";
import { toRgba } from "../resolver/color-resolver";

export interface AdaptContext {
  page: PageNode;
  parentId: string | null;
  parentPath: string;
  inScope: boolean;
  inheritedVisible: boolean;
  inheritedOpacity: number;
}

interface PaintReadOptions {
  styleId?: string;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function boundColorVariable(paint: Paint): string | undefined {
  const bound = (
    paint as Paint & {
      boundVariables?: { color?: VariableAlias };
    }
  ).boundVariables;
  const id = bound?.color?.id;
  return typeof id === "string" ? id : undefined;
}

function unsupportedPaint(rawType: string): NormalizedPaint {
  return {
    status: "unsupported",
    visible: true,
    opacity: 1,
    blendMode: "NORMAL",
    rawType,
  };
}

export function readPaints(
  value: readonly Paint[] | PluginAPI["mixed"] | undefined,
  options: PaintReadOptions = {},
): NormalizedPaint[] {
  if (value === undefined) return [];
  if (value === figma.mixed) return [unsupportedPaint("MIXED")];

  return value.map((paint): NormalizedPaint => {
    const base = {
      visible: paint.visible !== false,
      opacity: numberOrUndefined(paint.opacity) ?? 1,
      blendMode: stringOrUndefined(paint.blendMode) ?? "NORMAL",
      styleId: options.styleId,
    };

    if (paint.type === "SOLID") {
      return {
        ...base,
        status: "solid",
        color: toRgba(paint.color),
        variableId: boundColorVariable(paint),
      };
    }

    if (paint.type.startsWith("GRADIENT_")) {
      const gradient = paint as GradientPaint;
      return {
        ...base,
        status: "gradient",
        gradientType: paint.type,
        gradientStops: gradient.gradientStops.map((stop) => ({
          position: stop.position,
          color: toRgba(stop.color),
        })),
        variableId: boundColorVariable(paint),
      };
    }

    if (paint.type === "IMAGE" || paint.type === "VIDEO") {
      const image = paint as ImagePaint;
      return {
        ...base,
        status: "image",
        imageHash: image.imageHash ?? undefined,
      };
    }

    return {
      ...base,
      status: "unsupported",
      rawType: paint.type,
    };
  });
}

function readText(node: TextNode): NormalizedTextProperties {
  const fontName =
    node.fontName !== figma.mixed ? node.fontName : undefined;
  const lineHeight =
    node.lineHeight !== figma.mixed ? node.lineHeight : undefined;
  const letterSpacing =
    node.letterSpacing !== figma.mixed ? node.letterSpacing : undefined;

  return {
    characters: node.characters,
    fontSize: numberOrUndefined(node.fontSize),
    fontWeight: numberOrUndefined(node.fontWeight),
    fontFamily: fontName?.family,
    lineHeight: lineHeight
      ? {
          unit: lineHeight.unit,
          value:
            "value" in lineHeight
              ? numberOrUndefined(lineHeight.value)
              : undefined,
        }
      : undefined,
    letterSpacing: letterSpacing
      ? {
          unit: letterSpacing.unit,
          value: numberOrUndefined(letterSpacing.value) ?? 0,
        }
      : undefined,
    textCase: stringOrUndefined(node.textCase),
    textAlignHorizontal: stringOrUndefined(node.textAlignHorizontal),
    textAutoResize: stringOrUndefined(node.textAutoResize),
  };
}

function readBounds(node: SceneNode): {
  bounds: { x: number; y: number; width: number; height: number };
  reliable: boolean;
} {
  if (node.absoluteBoundingBox) {
    return {
      bounds: {
        x: node.absoluteBoundingBox.x,
        y: node.absoluteBoundingBox.y,
        width: node.absoluteBoundingBox.width,
        height: node.absoluteBoundingBox.height,
      },
      reliable: true,
    };
  }

  const width = numberOrUndefined(node.width) ?? 0;
  const height = numberOrUndefined(node.height) ?? 0;
  const transform = node.absoluteTransform;

  return {
    bounds: {
      x: transform?.[0]?.[2] ?? 0,
      y: transform?.[1]?.[2] ?? 0,
      width,
      height,
    },
    reliable: false,
  };
}

function readEffects(node: SceneNode): {
  hasVisibleEffects: boolean;
  effectTypes: string[];
} {
  if (!("effects" in node)) {
    return { hasVisibleEffects: false, effectTypes: [] };
  }

  const effects = node.effects;
  const visible = effects.filter((effect) => effect.visible !== false);
  return {
    hasVisibleEffects: visible.length > 0,
    effectTypes: [...new Set(visible.map((effect) => effect.type))],
  };
}

async function readMainComponent(
  node: InstanceNode,
): Promise<{ id?: string; name?: string }> {
  try {
    const main = await node.getMainComponentAsync();
    return { id: main?.id, name: main?.name };
  } catch {
    return {};
  }
}

export async function adaptNode(
  node: SceneNode,
  context: AdaptContext,
): Promise<NormalizedNode> {
  const { bounds, reliable } = readBounds(node);
  const effects = readEffects(node);
  const fillStyleId = stringOrUndefined(
    "fillStyleId" in node ? node.fillStyleId : undefined,
  );
  const strokeStyleId = stringOrUndefined(
    "strokeStyleId" in node ? node.strokeStyleId : undefined,
  );
  const textStyleId = stringOrUndefined(
    "textStyleId" in node ? node.textStyleId : undefined,
  );

  const fills = readPaints(
    "fills" in node ? node.fills : undefined,
    fillStyleId ? { styleId: fillStyleId } : {},
  );
  const strokes = readPaints(
    "strokes" in node ? node.strokes : undefined,
    strokeStyleId ? { styleId: strokeStyleId } : {},
  );

  const isInstance = node.type === "INSTANCE";
  const main = isInstance ? await readMainComponent(node) : {};

  const parentIsComponentSet =
    node.parent !== null && node.parent.type === "COMPONENT_SET";
  const variantProperties =
    node.type === "COMPONENT" &&
    node.variantProperties !== null &&
    typeof node.variantProperties === "object"
      ? node.variantProperties
      : undefined;

  return {
    id: node.id,
    name: node.name,
    type: node.type,
    pageId: context.page.id,
    pageName: context.page.name,
    parentId: context.parentId,
    path: context.parentPath
      ? `${context.parentPath} > ${node.name}`
      : node.name,
    inScope: context.inScope,
    visible: node.visible,
    effectiveVisible: context.inheritedVisible && node.visible,
    opacity:
      "opacity" in node && typeof node.opacity === "number" ? node.opacity : 1,
    effectiveOpacity:
      context.inheritedOpacity *
      ("opacity" in node && typeof node.opacity === "number"
        ? node.opacity
        : 1),
    blendMode: stringOrUndefined(
      "blendMode" in node ? node.blendMode : undefined,
    ) ?? "NORMAL",
    bounds,
    boundsReliable: reliable,
    clipsContent:
      "clipsContent" in node ? Boolean(node.clipsContent) : false,
    isMask: "isMask" in node ? Boolean(node.isMask) : false,
    hasVisibleEffects: effects.hasVisibleEffects,
    effectTypes: effects.effectTypes,
    fills,
    strokes,
    strokeWeight: numberOrUndefined(
      "strokeWeight" in node ? node.strokeWeight : undefined,
    ),
    strokeAlign: stringOrUndefined(
      "strokeAlign" in node ? node.strokeAlign : undefined,
    ),
    cornerRadius: numberOrUndefined(
      "cornerRadius" in node ? node.cornerRadius : undefined,
    ),
    text: node.type === "TEXT" ? readText(node) : undefined,
    fillStyleId,
    strokeStyleId,
    textStyleId,
    isInstance,
    isComponentDefinition:
      node.type === "COMPONENT" || node.type === "COMPONENT_SET",
    isVariant: node.type === "COMPONENT" && parentIsComponentSet,
    componentId:
      node.type === "COMPONENT" || node.type === "COMPONENT_SET"
        ? node.id
        : main.id,
    componentSetId: parentIsComponentSet ? node.parent?.id : undefined,
    variantProperties,
    mainComponentId: main.id,
    mainComponentName: main.name,
    childIds:
      "children" in node
        ? node.children.map((child) => child.id)
        : [],
  };
}
