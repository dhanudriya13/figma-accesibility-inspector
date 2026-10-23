import type { AuditRun } from "../model/audit-run";
import type { AuditStatus, Severity } from "../model/finding";
import type {
  DiscoveryProgress,
  InventorySummary,
} from "../scanner/discover-assets";
import type { ScopeKind } from "../messages";

export type TabId = "findings" | "root-causes" | "comparison";
export type SortMode = "severity" | "status" | "node" | "rule";

export interface FindingFilters {
  status: AuditStatus | "all";
  severity: Severity | "all";
  ruleId: string | "all";
  rootCauseId: string | "all";
  search: string;
  sort: SortMode;
}

export interface UiState {
  phase: "loading" | "ready" | "scanning" | "error";
  inventory?: InventorySummary;
  selectionCount: number;
  selectionNames: string[];
  pluginVersion: string;
  scope: ScopeKind;
  run?: AuditRun;
  error?: string;
  progress?: DiscoveryProgress;
  activeTab: TabId;
  filters: FindingFilters;
  showLimit: number;
}

export function initialState(): UiState {
  return {
    phase: "loading",
    selectionCount: 0,
    selectionNames: [],
    pluginVersion: "0.1.0",
    scope: "file",
    activeTab: "findings",
    filters: {
      status: "all",
      severity: "all",
      ruleId: "all",
      rootCauseId: "all",
      search: "",
      sort: "severity",
    },
    showLimit: 100,
  };
}

export function resetFilters(state: UiState): void {
  state.filters = {
    status: "all",
    severity: "all",
    ruleId: "all",
    rootCauseId: "all",
    search: "",
    sort: "severity",
  };
  state.showLimit = 100;
}

export function activeFilterCount(filters: FindingFilters): number {
  let count = 0;
  if (filters.status !== "all") count += 1;
  if (filters.severity !== "all") count += 1;
  if (filters.ruleId !== "all") count += 1;
  if (filters.rootCauseId !== "all") count += 1;
  if (filters.search.trim().length > 0) count += 1;
  return count;
}
