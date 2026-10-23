import type { AuditRun } from "./model/audit-run";
import type {
  DiscoveryProgress,
  InventorySummary,
} from "./scanner/discover-assets";

export type ScopeKind = "file" | "selection";

export type PluginToUiMessage =
  | {
      type: "init";
      inventory: InventorySummary;
      selectionCount: number;
      selectionNames: string[];
      pluginVersion: string;
    }
  | { type: "inventory"; inventory: InventorySummary }
  | { type: "progress"; progress: DiscoveryProgress }
  | { type: "audit-complete"; run: AuditRun }
  | {
      type: "audit-error";
      message: string;
      canRetry: boolean;
    }
  | {
      type: "selection-changed";
      selectionCount: number;
      selectionNames: string[];
    }
  | { type: "navigated"; ok: boolean; message: string }
  | {
      type: "toast";
      message: string;
      tone: "info" | "warning" | "error";
    };

export type UiToPluginMessage =
  | { type: "ui-ready" }
  | { type: "run-audit"; scope: ScopeKind }
  | { type: "cancel" }
  | { type: "navigate"; nodeId: string }
  | { type: "refresh-inventory" }
  | { type: "clear-history" };
