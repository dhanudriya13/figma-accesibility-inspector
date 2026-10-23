import type {
  DesignAsset,
  StyleInfo,
  VariableCollectionInfo,
  VariableInfo,
} from "./design-asset";
import type { RGBA } from "./color";
import type { ScanScopeReport } from "./scope";

export type NormalizedPaintStatus =
  | "solid"
  | "gradient"
  | "image"
  | "unsupported";

export interface NormalizedPaint {
  status: NormalizedPaintStatus;
  visible: boolean;
  opacity: number;
  blendMode: string;
  color?: RGBA;
  variableId?: string;
  styleId?: string;
  gradientType?: string;
  gradientStops?: { position: number; color: RGBA }[];
  imageHash?: string;
  rawType?: string;
}

export interface NormalizedTextProperties {
  characters: string;
  fontSize?: number;
  fontWeight?: number;
  fontFamily?: string;
  lineHeight?: { unit: string; value?: number };
  letterSpacing?: { unit: string; value: number };
  textCase?: string;
  textAlignHorizontal?: string;
  textAutoResize?: string;
}

export type TextProperties = NormalizedTextProperties;

export interface NormalizedNode {
  id: string;
  name: string;
  type: string;
  pageId: string;
  pageName: string;
  parentId: string | null;
  path: string;
  inScope: boolean;
  visible: boolean;
  effectiveVisible: boolean;
  opacity: number;
  effectiveOpacity: number;
  blendMode: string;
  bounds: { x: number; y: number; width: number; height: number };
  boundsReliable: boolean;
  clipsContent: boolean;
  isMask: boolean;
  hasVisibleEffects: boolean;
  effectTypes: string[];
  fills: NormalizedPaint[];
  strokes: NormalizedPaint[];
  strokeWeight?: number;
  strokeAlign?: string;
  cornerRadius?: number;
  text?: NormalizedTextProperties;
  fillStyleId?: string;
  strokeStyleId?: string;
  textStyleId?: string;
  isInstance: boolean;
  isComponentDefinition: boolean;
  isVariant: boolean;
  componentId?: string;
  componentSetId?: string;
  variantProperties?: Record<string, string>;
  mainComponentId?: string;
  mainComponentName?: string;
  childIds: string[];
}

export interface InventoryCounts {
  nodes: number;
  frames: number;
  textNodes: number;
  instances: number;
  components: number;
  componentSets: number;
  variants: number;
  variables: number;
  variableCollections: number;
  paintStyles: number;
  textStyles: number;
}

export interface NormalizedDesignModel {
  documentName: string;
  pages: { id: string; name: string }[];
  scope: ScanScopeReport;
  nodes: Record<string, NormalizedNode>;
  nodeOrder: string[];
  pageChildren: Record<string, string[]>;
  variables: VariableInfo[];
  collections: VariableCollectionInfo[];
  styles: StyleInfo[];
  assets: DesignAsset[];
  warnings: string[];
  limitations: string[];
  inventory: InventoryCounts;
}

export function isRgba(value: unknown): value is RGBA {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.r === "number" &&
    typeof candidate.g === "number" &&
    typeof candidate.b === "number"
  );
}

export function isVariableAliasValue(
  value: unknown,
): value is { type: "VARIABLE_ALIAS"; id: string } {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return candidate.type === "VARIABLE_ALIAS" && typeof candidate.id === "string";
}

export function isTextNode(node: NormalizedNode): boolean {
  return node.type === "TEXT" && node.text !== undefined;
}

export function isVisiblePaint(paint: NormalizedPaint): boolean {
  return paint.visible && paint.opacity > 0;
}

export function getNode(model: NormalizedDesignModel, id: string): NormalizedNode | undefined {
  return model.nodes[id];
}

export function getAncestors(
  model: NormalizedDesignModel,
  node: NormalizedNode,
): NormalizedNode[] {
  const ancestors: NormalizedNode[] = [];
  let current = node.parentId ? model.nodes[node.parentId] : undefined;
  const seen = new Set<string>();

  while (current && !seen.has(current.id)) {
    ancestors.push(current);
    seen.add(current.id);
    current = current.parentId ? model.nodes[current.parentId] : undefined;
  }

  return ancestors;
}

export function isDescendantOf(
  model: NormalizedDesignModel,
  node: NormalizedNode,
  ancestorId: string,
): boolean {
  if (node.id === ancestorId) return true;
  return getAncestors(model, node).some((ancestor) => ancestor.id === ancestorId);
}
