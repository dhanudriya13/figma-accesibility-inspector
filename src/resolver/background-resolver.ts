import type { AssetReference } from "../model/design-asset";
import type { RGBA } from "../model/color";
import type {
  NormalizedDesignModel,
  NormalizedNode,
  NormalizedPaint,
} from "../model/normalized-node";
import type { Confidence } from "../model/finding";
import { colorKey, compositeOver, formatColor } from "./color-resolver";
import type { ColorResolution } from "./variable-resolver";

export type BackgroundStatus = "resolved" | "ambiguous" | "unsupported";

export interface BackgroundLayerInfo {
  nodeId: string;
  nodeName: string;
  role: "ancestor" | "sibling";
  paintStatus: string;
  color?: string;
  sourceName?: string;
  sourceKind?: string;
  opacityFactor: number;
  coversTarget: boolean;
  outcome: "resolved" | "ambiguous" | "unsupported" | "ignored";
}

export interface BackgroundResolution {
  status: BackgroundStatus;
  color?: RGBA;
  sourceNodeId?: string;
  sourceNodeName?: string;
  sources: AssetReference[];
  layers: BackgroundLayerInfo[];
  evidence: string[];
  limitations: string[];
  confidence: Confidence;
}

export interface BackgroundResolverOptions {
  resolvePaint: (paint: NormalizedPaint) => ColorResolution;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Layer {
  paint: NormalizedPaint;
  node: NormalizedNode;
  role: "ancestor" | "sibling";
  coversTarget: boolean;
}

interface Issue {
  status: "ambiguous" | "unsupported";
  message: string;
}

interface CollectState {
  layers: Layer[];
  frontIssues: Issue[];
  truncated: boolean;
  maskedSibling?: string;
}

const MAX_DEPTH = 12;
const MAX_LAYERS = 400;
const EPSILON = 0.5;

function rectsOverlap(first: Rect, second: Rect): boolean {
  return (
    first.x < second.x + second.width - EPSILON &&
    first.x + first.width > second.x + EPSILON &&
    first.y < second.y + second.height - EPSILON &&
    first.y + first.height > second.y + EPSILON
  );
}

function rectContains(outer: Rect, inner: Rect): boolean {
  return (
    outer.x <= inner.x + EPSILON &&
    outer.y <= inner.y + EPSILON &&
    outer.x + outer.width >= inner.x + inner.width - EPSILON &&
    outer.y + outer.height >= inner.y + inner.height - EPSILON
  );
}

function intersectionArea(first: Rect, second: Rect): number {
  const width = Math.max(
    0,
    Math.min(first.x + first.width, second.x + second.width) -
      Math.max(first.x, second.x),
  );
  const height = Math.max(
    0,
    Math.min(first.y + first.height, second.y + second.height) -
      Math.max(first.y, second.y),
  );
  return width * height;
}

function hasVisiblePaint(node: NormalizedNode): boolean {
  return (
    node.fills.some((paint) => paint.visible && paint.opacity > 0) ||
    node.strokes.some((paint) => paint.visible && paint.opacity > 0)
  );
}

function collectSubtree(
  model: NormalizedDesignModel,
  node: NormalizedNode,
  target: Rect,
  state: CollectState,
  depth = 0,
): void {
  if (state.truncated || depth > MAX_DEPTH) {
    state.truncated = true;
    return;
  }
  if (!node.effectiveVisible || node.type === "TEXT") return;
  if (!rectsOverlap(node.bounds, target)) return;
  if (node.isMask) {
    state.maskedSibling = node.name;
    return;
  }

  for (const paint of node.fills) {
    if (!paint.visible || paint.opacity <= 0) continue;
    if (state.layers.length >= MAX_LAYERS) {
      state.truncated = true;
      return;
    }
    state.layers.push({
      paint,
      node,
      role: "sibling",
      coversTarget: rectContains(node.bounds, target),
    });
  }

  for (const childId of node.childIds) {
    const child = model.nodes[childId];
    if (child) collectSubtree(model, child, target, state, depth + 1);
  }
}

function addLayer(
  state: CollectState,
  paint: NormalizedPaint,
  node: NormalizedNode,
  role: "ancestor" | "sibling",
  target: Rect,
): void {
  if (!paint.visible || paint.opacity <= 0) return;
  if (state.layers.length >= MAX_LAYERS) {
    state.truncated = true;
    return;
  }
  state.layers.push({
    paint,
    node,
    role,
    coversTarget: rectContains(node.bounds, target),
  });
}

export function resolveBackground(
  model: NormalizedDesignModel,
  node: NormalizedNode,
  options: BackgroundResolverOptions,
): BackgroundResolution {
  const target = node.bounds;

  if (!node.boundsReliable) {
    return {
      status: "ambiguous",
      sources: [],
      layers: [],
      evidence: [
        "The text layer has no reliable absolute bounds, so overlapping background layers could not be checked.",
      ],
      limitations: [
        "Rotated, transformed, or unloaded layers can have unreliable geometry.",
      ],
      confidence: "low",
    };
  }

  if (node.blendMode !== "NORMAL") {
    return {
      status: "ambiguous",
      sources: [],
      layers: [],
      evidence: [
        `The text layer uses blend mode ${node.blendMode}, which is not modeled.`,
      ],
      limitations: [
        "Blend modes can change the effective foreground and background colors.",
      ],
      confidence: "low",
    };
  }

  const ancestors: NormalizedNode[] = [];
  let current = node.parentId ? model.nodes[node.parentId] : undefined;
  const seen = new Set<string>();

  while (current) {
    if (seen.has(current.id)) break;
    seen.add(current.id);
    ancestors.push(current);
    current = current.parentId ? model.nodes[current.parentId] : undefined;
  }
  ancestors.reverse();

  if (
    node.parentId &&
    node.parentId !== node.pageId &&
    !model.nodes[node.parentId]
  ) {
    return {
      status: "unsupported",
      sources: [],
      layers: [],
      evidence: [
        "An ancestor of this layer was outside the scanned context, so its background could not be resolved.",
      ],
      limitations: [
        "Run a whole-file scan or include the surrounding frame in the selection.",
      ],
      confidence: "high",
    };
  }

  const pathOpacityIssue = ancestors.find(
    (ancestor) => ancestor.effectiveOpacity < 0.999,
  );
  if (pathOpacityIssue) {
    return {
      status: "ambiguous",
      sources: [],
      layers: [],
      evidence: [
        `Ancestor layer "${pathOpacityIssue.name}" has ${Math.round(pathOpacityIssue.effectiveOpacity * 100)}% opacity.`,
      ],
      limitations: [
        "Layer opacity blends the text and its background with content outside the scanned path.",
      ],
      confidence: "low",
    };
  }

  const blendIssue = ancestors.find((ancestor) => ancestor.blendMode !== "NORMAL");
  if (blendIssue) {
    return {
      status: "ambiguous",
      sources: [],
      layers: [],
      evidence: [
        `Ancestor layer "${blendIssue.name}" uses blend mode ${blendIssue.blendMode}, which is not modeled.`,
      ],
      limitations: ["Blend modes can change the rendered background color."],
      confidence: "low",
    };
  }

  const maskIssue = ancestors.find((ancestor) => ancestor.isMask);
  if (maskIssue) {
    return {
      status: "ambiguous",
      sources: [],
      layers: [],
      evidence: [
        `Ancestor layer "${maskIssue.name}" participates in masking, which is not modeled.`,
      ],
      limitations: [
        "Masking can change which pixels of a background layer are visible.",
      ],
      confidence: "low",
    };
  }

  const state: CollectState = {
    layers: [],
    frontIssues: [],
    truncated: false,
  };

  const levelNodes: (NormalizedNode | null)[] = [null, ...ancestors];

  for (let index = 0; index < levelNodes.length; index += 1) {
    const parent = levelNodes[index];
    const pathChild =
      index + 1 < levelNodes.length
        ? levelNodes[index + 1]
        : node;

    const parentChildIds = parent
      ? parent.childIds
      : model.pageChildren[node.pageId] ?? [];
    const parentBounds = parent
      ? parent.bounds
      : {
          x: -1e9,
          y: -1e9,
          width: 2e9,
          height: 2e9,
        };

    if (!pathChild) continue;

    if (parent) {
      for (const paint of parent.fills) {
        addLayer(state, paint, parent, "ancestor", target);
      }
    }

    const pathIndex = parentChildIds.indexOf(pathChild.id);
    const before = pathIndex >= 0 ? parentChildIds.slice(0, pathIndex) : [];
    const after = pathIndex >= 0 ? parentChildIds.slice(pathIndex + 1) : [];

    for (const childId of before) {
      const sibling = model.nodes[childId];
      if (!sibling) continue;
      collectSubtree(model, sibling, target, state);
    }

    for (const childId of after) {
      const sibling = model.nodes[childId];
      if (!sibling || !sibling.effectiveVisible) continue;
      if (!rectsOverlap(sibling.bounds, target)) continue;
      const area = intersectionArea(sibling.bounds, target);
      const targetArea = Math.max(1, target.width * target.height);
      if (area / targetArea < 0.02) continue;
      if (hasVisiblePaint(sibling)) {
        state.frontIssues.push({
          status: "ambiguous",
          message: `Layer "${sibling.name}" is painted in front of the text and overlaps its bounds.`,
        });
      } else if (
        parentBounds &&
        sibling.childIds.some((id) => {
          const child = model.nodes[id];
          return child ? hasVisiblePaint(child) : false;
        })
      ) {
        state.frontIssues.push({
          status: "ambiguous",
          message: `Content inside "${sibling.name}" is painted in front of the text and overlaps its bounds.`,
        });
      }
    }
  }

  if (state.maskedSibling) {
    return {
      status: "ambiguous",
      sources: [],
      layers: [],
      evidence: [
        `A mask layer "${state.maskedSibling}" overlaps the background path, so the visible background pixels are not deterministic.`,
      ],
      limitations: [
        "Masking in overlapping sibling content is not modeled.",
      ],
      confidence: "low",
    };
  }

  if (state.frontIssues.length > 0) {
    return {
      status: "ambiguous",
      sources: [],
      layers: [],
      evidence: state.frontIssues.map((issue) => issue.message),
      limitations: [
        "A layer painted above the text may cover the characters; contrast for the visible pixels is not deterministic.",
      ],
      confidence: "low",
    };
  }

  let accumulated: RGBA | null = null;
  let opaque = false;
  let pendingIssues: Issue[] = [];
  let finalIssues: Issue[] = [];
  let coverageIssue: Issue | undefined;
  let sourceLayer: Layer | undefined;
  let contributingSources: AssetReference[] = [];
  const layerReports: BackgroundLayerInfo[] = [];
  const limitations: string[] = [];
  const evidence: string[] = [];

  for (const layer of state.layers) {
    const resolution = options.resolvePaint(layer.paint);

    if (
      layer.paint.status !== "solid" ||
      resolution.status !== "resolved" ||
      !resolution.color
    ) {
      const status: "ambiguous" | "unsupported" =
        layer.paint.status === "gradient" || layer.paint.status === "image"
          ? "ambiguous"
          : "unsupported";
      const issue: Issue = {
        status,
        message:
          resolution.evidence[0] ??
          `Layer "${layer.node.name}" could not be resolved to a solid color.`,
      };
      if (opaque) {
        finalIssues.push(issue);
      } else {
        pendingIssues.push(issue);
      }
      limitations.push(...resolution.limitations);
      layerReports.push({
        nodeId: layer.node.id,
        nodeName: layer.node.name,
        role: layer.role,
        paintStatus: layer.paint.status,
        opacityFactor: layer.node.effectiveOpacity,
        coversTarget: layer.coversTarget,
        outcome: status,
      });
      continue;
    }

    let color = resolution.color;
    limitations.push(...resolution.limitations);
    const opacityFactor = layer.node.effectiveOpacity;

    if (layer.paint.blendMode !== "NORMAL") {
      const issue: Issue = {
        status: "ambiguous",
        message: `Layer "${layer.node.name}" uses blend mode ${layer.paint.blendMode}, which is not modeled.`,
      };
      if (opaque) finalIssues.push(issue);
      else pendingIssues.push(issue);
    }
    if (opacityFactor < 0.999) {
      color = { ...color, a: color.a * opacityFactor };
      const issue: Issue = {
        status: "ambiguous",
        message: `Layer "${layer.node.name}" has ${Math.round(opacityFactor * 100)}% effective opacity. Its rendered result depends on content outside the resolved background.`,
      };
      if (opaque) finalIssues.push(issue);
      else pendingIssues.push(issue);
      limitations.push(
        `Layer "${layer.node.name}" has ${Math.round(opacityFactor * 100)}% effective opacity.`,
      );
    }

    const source = resolution.source;
    const colorLabel = formatColor(color);
    const sourceLabel = source
      ? ` from ${source.kind} "${source.name}"`
      : "";
    evidence.push(
      `Layer "${layer.node.name}" resolves to ${colorLabel}${sourceLabel}${layer.coversTarget ? "" : " and does not fully cover the text bounds"}.`,
    );

    if (color.a >= 0.999) {
      accumulated = color;
      opaque = true;
      sourceLayer = layer;
      pendingIssues = [];
      finalIssues = [];
      coverageIssue = layer.coversTarget
        ? undefined
        : {
            status: "ambiguous",
            message: `Background layer "${layer.node.name}" does not fully cover the text bounds.`,
          };
      contributingSources = source ? [source] : [];
    } else if (accumulated) {
      accumulated = compositeOver(color, accumulated);
      const previousOpaque = opaque;
      opaque = accumulated.a >= 0.999;
      if (!previousOpaque && opaque) pendingIssues = [];
      if (source) contributingSources.push(source);
      sourceLayer = layer;
    } else {
      accumulated = color;
      opaque = false;
      if (source) contributingSources = [source];
      sourceLayer = layer;
    }

    layerReports.push({
      nodeId: layer.node.id,
      nodeName: layer.node.name,
      role: layer.role,
      paintStatus: layer.paint.status,
      color: colorLabel,
      sourceName: source?.name,
      sourceKind: source?.kind,
      opacityFactor,
      coversTarget: layer.coversTarget,
      outcome: "resolved",
    });
  }

  if (state.truncated) {
    limitations.push(
      "The background layer search reached its depth or layer limit; deeper overlapping content was not inspected.",
    );
  }

  if (pendingIssues.length > 0) {
    finalIssues = [...pendingIssues, ...finalIssues];
  }
  if (coverageIssue) {
    finalIssues.push(coverageIssue);
  }

  if (finalIssues.length > 0) {
    const status: BackgroundStatus = finalIssues.some(
      (issue) => issue.status === "unsupported",
    )
      ? "unsupported"
      : "ambiguous";
    return {
      status,
      sources: contributingSources,
      layers: layerReports,
      evidence: [...evidence, ...finalIssues.map((issue) => issue.message)],
      limitations: [
        ...limitations,
        "The background cannot be reduced to one reliable color for a contrast verdict.",
      ],
      confidence: "low",
    };
  }

  if (!accumulated || accumulated.a < 0.999) {
    return {
      status: "ambiguous",
      color: accumulated ?? undefined,
      sources: contributingSources,
      layers: layerReports,
      evidence: [
        ...evidence,
        "No opaque background fill was found behind this layer. The Figma canvas or export background is not part of the document.",
      ],
      limitations: [
        ...limitations,
        "A transparent or undefined background cannot be evaluated reliably.",
      ],
      confidence: "low",
    };
  }

  const sourceName = sourceLayer ? sourceLayer.node.name : undefined;
  const confidence: Confidence =
    limitations.length > 0 || state.truncated ? "medium" : "high";

  return {
    status: "resolved",
    color: accumulated,
    sourceNodeId: sourceLayer?.node.id,
    sourceNodeName: sourceName,
    sources: contributingSources,
    layers: layerReports,
    evidence: [
      ...evidence,
      `Resolved background ${colorKey(accumulated)} from "${sourceName ?? "document"}".`,
    ],
    limitations,
    confidence,
  };
}
