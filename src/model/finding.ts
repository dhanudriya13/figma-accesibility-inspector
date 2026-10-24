import type { AssetReference } from "./design-asset";

export type AuditStatus = "pass" | "fail" | "needs-review" | "not-evaluated";
export type Confidence = "high" | "medium" | "low";
export type Severity = "critical" | "serious" | "moderate" | "minor" | "info";

export interface AuditFinding {
  id: string;
  key: string;
  ruleId: string;
  ruleName: string;
  status: AuditStatus;
  severity: Severity;
  title: string;
  description: string;
  helpUrl?: string;

  nodeId?: string;
  nodeName?: string;
  nodeType?: string;
  pageId?: string;
  pageName?: string;
  propertyPath?: string;

  modeId?: string;
  modeName?: string;
  collectionId?: string;
  collectionName?: string;

  measuredValue?: number | string;
  threshold?: number | string;
  foregroundColor?: string;
  backgroundColor?: string;
  fontSize?: number;
  fontWeight?: number;

  evidence: string[];
  confidence: Confidence;
  rootCauseIds: string[];
  causes: AssetReference[];
  limitations: string[];
  estimatedReach: number;
}

export interface RuleDefinition {
  id: string;
  name: string;
  shortName: string;
  wcag: string;
  level: "A" | "AA" | "AAA";
  helpUrl: string;
  description: string;
}

export const RULE_SET_VERSION = "2026.10.wcag22-aa.1";

export const RULES: Record<string, RuleDefinition> = {
  "wcag-1.4.3-text-contrast": {
    id: "wcag-1.4.3-text-contrast",
    name: "Text contrast (minimum)",
    shortName: "Text contrast",
    wcag: "1.4.3 Contrast (Minimum)",
    level: "AA",
    helpUrl:
      "https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html",
    description:
      "Text and images of text need a 4.5:1 contrast ratio against the background, or 3:1 for qualifying large text.",
  },
  "wcag-1.4.11-non-text-contrast": {
    id: "wcag-1.4.11-non-text-contrast",
    name: "Non-text contrast",
    shortName: "Non-text contrast",
    wcag: "1.4.11 Non-text Contrast",
    level: "AA",
    helpUrl:
      "https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html",
    description:
      "Visual information needed to identify UI components and states needs a 3:1 contrast ratio against adjacent colors.",
  },
  "wcag-2.5.8-target-size": {
    id: "wcag-2.5.8-target-size",
    name: "Target size (minimum)",
    shortName: "Target size",
    wcag: "2.5.8 Target Size (Minimum)",
    level: "AA",
    helpUrl:
      "https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html",
    description:
      "Pointer targets should be at least 24 by 24 CSS pixels, subject to spacing and other exceptions.",
  },
};

export const STATUS_ORDER: AuditStatus[] = [
  "fail",
  "needs-review",
  "pass",
  "not-evaluated",
];

export const SEVERITY_ORDER: Severity[] = [
  "critical",
  "serious",
  "moderate",
  "minor",
  "info",
];

export const CONFIDENCE_ORDER: Confidence[] = ["high", "medium", "low"];

export function severityRank(severity: Severity): number {
  return SEVERITY_ORDER.indexOf(severity);
}

export function statusRank(status: AuditStatus): number {
  return STATUS_ORDER.indexOf(status);
}

export function findingKey(input: {
  ruleId: string;
  nodeId?: string;
  propertyPath?: string;
  modeId?: string;
  collectionId?: string;
}): string {
  return [
    input.ruleId,
    input.nodeId ?? "document",
    input.propertyPath ?? "",
    input.collectionId ?? "",
    input.modeId ?? "",
  ].join("::");
}
