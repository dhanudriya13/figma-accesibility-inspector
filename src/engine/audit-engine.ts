import type { AuditRun, AuditSnapshot, AuditSummary, RuleSummary } from "../model/audit-run";
import type {
  AuditFinding,
  AuditStatus,
  Severity,
} from "../model/finding";
import {
  RULE_SET_VERSION,
  RULES,
  findingKey,
  severityRank,
  statusRank,
} from "../model/finding";
import type { NormalizedDesignModel } from "../model/normalized-node";
import { compareRuns } from "../report/compare";
import { PLUGIN_VERSION } from "../version";
import { buildModeContexts, createRuleContext } from "../rules/context";
import { runContrastRule } from "../rules/contrast-minimum";
import { runNonTextContrastRule } from "../rules/non-text-contrast";
import { runTargetSizeRule } from "../rules/target-size";
import { analyzeRootCauses } from "./root-cause";

export interface AuditOptions {
  previous?: AuditSnapshot;
  startedAt?: string;
  id?: string;
  clock?: () => Date;
  scanDurationMs?: number;
}

const GLOBAL_LIMITATIONS = [
  "This audit evaluates static Figma evidence only. It cannot establish every WCAG criterion or prove full conformance.",
  "Only checks supported by this rule set are evaluated. Other accessibility requirements may still fail in the implemented interface.",
  "Remote team-library variables, styles, and components that were not loaded locally are out of scope.",
  "Figma geometry and colors are not guaranteed to match the implemented CSS pixel values, themes, or runtime states.",
  "Automated failure verdicts use the WCAG 2.2 Level AA baseline where a reliable comparison could be resolved.",
];

function dedupe(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function buildSummary(
  findings: AuditFinding[],
  rootCauseCount: number,
  modeContextCount: number,
): AuditSummary {
  const byStatus: Record<AuditStatus, number> = {
    pass: 0,
    fail: 0,
    "needs-review": 0,
    "not-evaluated": 0,
  };
  const bySeverity: Record<Severity, number> = {
    critical: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
    info: 0,
  };
  const byRule = new Map<string, RuleSummary>();
  const affectedNodes = new Set<string>();

  for (const finding of findings) {
    byStatus[finding.status] += 1;
    bySeverity[finding.severity] += 1;

    let rule = byRule.get(finding.ruleId);
    if (!rule) {
      rule = {
        ruleId: finding.ruleId,
        ruleName: RULES[finding.ruleId]?.name ?? finding.ruleName,
        total: 0,
        pass: 0,
        fail: 0,
        needsReview: 0,
        notEvaluated: 0,
      };
      byRule.set(finding.ruleId, rule);
    }

    rule.total += 1;
    if (finding.status === "pass") rule.pass += 1;
    if (finding.status === "fail") rule.fail += 1;
    if (finding.status === "needs-review") rule.needsReview += 1;
    if (finding.status === "not-evaluated") rule.notEvaluated += 1;

    if (
      (finding.status === "fail" || finding.status === "needs-review") &&
      finding.nodeId
    ) {
      affectedNodes.add(finding.nodeId);
    }
  }

  return {
    total: findings.length,
    actionable: byStatus.fail + byStatus["needs-review"],
    byStatus,
    bySeverity,
    byRule: [...byRule.values()].sort((first, second) =>
      first.ruleName.localeCompare(second.ruleName),
    ),
    rootCauseCount,
    affectedNodeCount: affectedNodes.size,
    modeContextCount,
  };
}

function sortFindings(findings: AuditFinding[]): AuditFinding[] {
  return [...findings].sort((first, second) => {
    const status = statusRank(first.status) - statusRank(second.status);
    if (status !== 0) return status;
    const severity = severityRank(first.severity) - severityRank(second.severity);
    if (severity !== 0) return severity;
    const rule = first.ruleName.localeCompare(second.ruleName);
    if (rule !== 0) return rule;
    return (first.nodeName ?? "").localeCompare(second.nodeName ?? "");
  });
}

export function runAudit(
  model: NormalizedDesignModel,
  options: AuditOptions = {},
): AuditRun {
  const clock = options.clock ?? (() => new Date());
  const startedDate = options.startedAt ? new Date(options.startedAt) : clock();
  const startedAt = startedDate.toISOString();
  const startMs = Date.now();
  const modeResult = buildModeContexts(model);
  const findings: AuditFinding[] = [];

  for (const mode of modeResult.contexts) {
    const context = createRuleContext(model, mode);
    findings.push(...runContrastRule(context));
    findings.push(...runNonTextContrastRule(context));
    if (mode.isDefault) {
      findings.push(...runTargetSizeRule(context));
    }
  }

  const unique = new Map<string, AuditFinding>();
  for (const finding of findings) {
    const key = finding.key || findingKey(finding);
    if (!unique.has(key)) {
      unique.set(key, { ...finding, id: key, key });
    }
  }

  const ordered = sortFindings([...unique.values()]);
  const { rootCauses, similarityHints } = analyzeRootCauses(model, ordered);

  const finishedAt = clock().toISOString();
  const stats = {
    nodesScanned: model.inventory.nodes,
    nodesInScope: model.scope.includedNodeCount,
    textNodesAudited: new Set(
      ordered
        .filter((finding) => finding.ruleId === RULES["wcag-1.4.3-text-contrast"]!.id)
        .map((finding) => finding.nodeId)
        .filter((nodeId): nodeId is string => Boolean(nodeId)),
    ).size,
    variablesDiscovered: model.inventory.variables,
    stylesDiscovered:
      model.inventory.paintStyles + model.inventory.textStyles,
    componentsDiscovered: model.inventory.components,
    instancesDiscovered: model.inventory.instances,
    durationMs: (options.scanDurationMs ?? 0) + (Date.now() - startMs),
  };

  const limitations = dedupe([
    ...model.limitations,
    ...modeResult.limitations,
    ...GLOBAL_LIMITATIONS,
  ]);

  const baseRun: AuditRun = {
    schemaVersion: "1.0",
    id:
      options.id ??
      `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    startedAt,
    finishedAt,
    pluginVersion: PLUGIN_VERSION,
    ruleSetVersion: RULE_SET_VERSION,
    scope: model.scope,
    findings: ordered,
    rootCauses,
    similarityHints,
    summary: buildSummary(ordered, rootCauses.length, modeResult.contexts.length),
    stats,
    modes: modeResult.contexts.map((mode) => ({
      id: mode.id,
      label: mode.label,
      collectionId: mode.focusCollectionId,
      collectionName: mode.focusCollectionName,
      focusModeId: mode.focusModeId,
      focusModeName: mode.focusModeName,
    })),
    warnings: dedupe(model.warnings),
    limitations,
  };

  if (options.previous) {
    baseRun.comparison = compareRuns(options.previous, baseRun);
  }

  return baseRun;
}
