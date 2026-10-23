import type {
  AuditRun,
  AuditSnapshot,
  ChangedComparisonItem,
  ComparisonItem,
  RunComparison,
} from "../model/audit-run";
import type { AuditFinding, AuditStatus } from "../model/finding";
import { statusRank } from "../model/finding";

function isActionable(status: AuditStatus): boolean {
  return status === "fail" || status === "needs-review";
}

function toItem(
  finding: AuditFinding,
  previousStatus?: AuditStatus,
): ComparisonItem {
  return {
    key: finding.key,
    ruleId: finding.ruleId,
    ruleName: finding.ruleName,
    status: finding.status,
    previousStatus,
    nodeId: finding.nodeId,
    nodeName: finding.nodeName,
    modeName: finding.modeName,
    measuredValue: finding.measuredValue,
    severity: finding.severity,
  };
}

export function snapshotRun(run: AuditRun): AuditSnapshot {
  return {
    version: 1,
    auditId: run.id,
    startedAt: run.startedAt,
    scopeKind: run.scope.kind,
    scopeLabel: run.scope.label,
    findings: run.findings.map((finding) => ({
      key: finding.key,
      ruleId: finding.ruleId,
      ruleName: finding.ruleName,
      status: finding.status,
      severity: finding.severity,
      nodeId: finding.nodeId,
      nodeName: finding.nodeName,
      modeName: finding.modeName,
      measuredValue: finding.measuredValue,
    })),
  };
}

export function compareRuns(
  previous: AuditSnapshot,
  current: AuditRun,
): RunComparison {
  const previousByKey = new Map(
    previous.findings.map((finding) => [finding.key, finding]),
  );
  const currentByKey = new Map(
    current.findings.map((finding) => [finding.key, finding]),
  );

  const introduced: ComparisonItem[] = [];
  const resolved: ComparisonItem[] = [];
  const changed: ChangedComparisonItem[] = [];
  let unchanged = 0;
  let improved = 0;
  let regressed = 0;

  for (const finding of current.findings) {
    const earlier = previousByKey.get(finding.key);
    if (!earlier) {
      if (isActionable(finding.status)) {
        introduced.push(toItem(finding));
      }
      continue;
    }

    if (earlier.status === finding.status) {
      unchanged += 1;
      continue;
    }

    const item: ChangedComparisonItem = {
      ...toItem(finding, earlier.status),
      from: earlier.status,
      to: finding.status,
    };
    changed.push(item);

    const before = statusRank(earlier.status);
    const after = statusRank(finding.status);
    if (after > before && finding.status !== "not-evaluated") {
      improved += 1;
    } else if (after < before && isActionable(finding.status)) {
      regressed += 1;
    }
  }

  for (const earlier of previous.findings) {
    if (currentByKey.has(earlier.key)) continue;
    if (!isActionable(earlier.status)) continue;
    resolved.push({
      key: earlier.key,
      ruleId: earlier.ruleId,
      ruleName: earlier.ruleName,
      status: earlier.status,
      previousStatus: earlier.status,
      nodeId: earlier.nodeId,
      nodeName: earlier.nodeName,
      modeName: earlier.modeName,
      measuredValue: earlier.measuredValue,
      severity: earlier.severity,
    });
  }

  const sameScope =
    previous.scopeKind === current.scope.kind &&
    previous.scopeLabel === current.scope.label;

  return {
    previousAt: previous.startedAt,
    sameScope,
    introduced,
    resolved,
    changed,
    unchangedCount: unchanged,
    summary: {
      introduced: introduced.length,
      resolved: resolved.length,
      improved,
      regressed,
      unchanged,
    },
    message: sameScope
      ? undefined
      : `The previous run used a different scan scope (${previous.scopeLabel}); comparison can include unrelated changes.`,
  };
}
