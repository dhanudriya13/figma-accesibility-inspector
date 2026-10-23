export interface SkippedAsset {
  id: string;
  name: string;
  type: string;
}

export interface SkippedGroup {
  reason: string;
  count: number;
  examples: SkippedAsset[];
}

export interface ScanScopeReport {
  kind: "file" | "selection";
  label: string;
  pageIds: string[];
  pageNames: string[];
  includedNodeCount: number;
  selectionNames: string[];
  selectionCount: number;
  skipped: SkippedGroup[];
  notes: string[];
}
