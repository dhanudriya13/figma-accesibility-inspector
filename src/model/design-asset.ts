import type { RGBA } from "./color";
import type { NormalizedPaint, TextProperties } from "./normalized-node";

export type DesignAssetKind =
  | "variable"
  | "style"
  | "component"
  | "variant"
  | "frame"
  | "text"
  | "other";

export type AssetKind = "variable" | "style" | "component" | "variant";

export type AssetRole =
  | "foreground"
  | "background"
  | "boundary"
  | "typography"
  | "component";

export interface AssetReference {
  assetId: string;
  kind: AssetKind;
  name: string;
  propertyPath: string;
  dependencyPath: string[];
  evidence: string;
  role?: AssetRole;
}

export interface DesignAsset {
  id: string;
  kind: DesignAssetKind;
  name: string;
  sourceNodeId?: string;
  dependencies: string[];
  collectionId?: string;
  collectionName?: string;
  variableId?: string;
  styleId?: string;
  componentId?: string;
  componentSetId?: string;
  pageId?: string;
  pageName?: string;
  path?: string;
  modes?: { modeId: string; name: string }[];
  instanceCount?: number;
  variantCount?: number;
  description?: string;
}

export interface VariableAliasValue {
  type: "VARIABLE_ALIAS";
  id: string;
}

export type VariableValue =
  | RGBA
  | VariableAliasValue
  | string
  | number
  | boolean
  | null;

export interface VariableInfo {
  id: string;
  name: string;
  key: string;
  collectionId: string;
  collectionName: string;
  resolvedType: string;
  valuesByMode: Record<string, VariableValue>;
  description?: string;
  hiddenFromPublishing?: boolean;
  scopes?: string[];
  remote: boolean;
}

export interface VariableCollectionInfo {
  id: string;
  name: string;
  key: string;
  modes: { modeId: string; name: string }[];
  defaultModeId: string;
  remote: boolean;
}

export interface StyleInfo {
  id: string;
  name: string;
  key: string;
  type: "PAINT" | "TEXT" | "EFFECT" | "GRID";
  description?: string;
  paint?: NormalizedPaint;
  text?: TextProperties;
  remote: boolean;
}
