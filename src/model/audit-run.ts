import type { AssetKind, AssetRole } from "./design-asset";
import type {
  AuditFinding,
  AuditStatus,
  Confidence,
  Severity,
} from "./finding";
import type { ScanScopeReport } from "./scope";

export interface RootCause {
  id: string;
  assetId: string;
  kind: AssetKind;
  name: string;
  nodeId?: string;
  roles: AssetRole[];
  affectedFindingIds: string[];
  affectedNodeIds: string[];
  dependencyPaths: string[][];
  evidence: string[];
  severity: Severity;
  estimatedReach: number;
  confidence: Confidence;
  limitations: string[];
}

export interface SimilarityHint {
  color: string;
  findingIds: string[];
  nodeNames: string[];
  message: string;
}

export interface RuleSummary {
  ruleId: string;
  ruleName: string;
  total: number;
  pass: number;
  fail: number;
  needsReview: number;
  notEvaluated: number;
}

export interface AuditSummary {
  total: number;
  actionable: number;
  byStatus: Record<AuditStatus, number>;
  bySeverity: Record<Severity, number>;
  byRule: RuleSummary[];
  rootCauseCount: number;
  affectedNodeCount: number;
  modeContextCount: number;
}

export interface AuditStats {
  nodesScanned: number;
  nodesInScope: number;
  textNodesAudited: number;
  variablesDiscovered: number;
  stylesDiscovered: number;
  componentsDiscovered: number;
  instancesDiscovered: number;
  durationMs: number;
}

export interface ModeSummary {
  id: string;
  label: string;
  collectionId?: string;
  collectionName?: string;
  focusModeId?: string;
  focusModeName?: string;
}

export interface ComparisonItem {
  key: string;
  ruleId: string;
  ruleName: string;
  status: AuditStatus;
  previousStatus?: AuditStatus;
  nodeId?: string;
  nodeName?: string;
  modeName?: string;
  measuredValue?: number | string;
  severity: Severity;
}

export interface ChangedComparisonItem extends ComparisonItem {
  from: AuditStatus;
  to: AuditStatus;
}

export interface RunComparison {
  previousAt?: string;
  sameScope: boolean;
  introduced: ComparisonItem[];
  resolved: ComparisonItem[];
  changed: ChangedComparisonItem[];
  unchangedCount: number;
  summary: {
    introduced: number;
    resolved: number;
    improved: number;
    regressed: number;
    unchanged: number;
  };
  message?: string;
}

export interface AuditSnapshotFinding {
  key: string;
  ruleId: string;
  ruleName: string;
  status: AuditStatus;
  severity: Severity;
  nodeId?: string;
  nodeName?: string;
  modeName?: string;
  measuredValue?: number | string;
}

export interface AuditSnapshot {
  version: 1;
  auditId: string;
  startedAt: string;
  scopeKind: "file" | "selection";
  scopeLabel: string;
  findings: AuditSnapshotFinding[];
}

export interface AuditRun {
  schemaVersion: "1.0";
  id: string;
  startedAt: string;
  finishedAt: string;
  pluginVersion: string;
  ruleSetVersion: string;
  scope: ScanScopeReport;
  findings: AuditFinding[];
  rootCauses: RootCause[];
  similarityHints: SimilarityHint[];
  summary: AuditSummary;
  stats: AuditStats;
  modes: ModeSummary[];
  warnings: string[];
  limitations: string[];
  comparison?: RunComparison;
}
