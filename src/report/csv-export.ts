import type { AuditRun } from "../model/audit-run";
import type { AuditFinding } from "../model/finding";

const COLUMNS = [
  "finding_id",
  "rule_id",
  "rule_name",
  "status",
  "severity",
  "confidence",
  "node_id",
  "node_name",
  "node_type",
  "page_name",
  "property_path",
  "mode",
  "measured_value",
  "threshold",
  "foreground",
  "background",
  "font_size",
  "font_weight",
  "estimated_reach",
  "root_causes",
  "causes",
  "evidence",
  "limitations",
] as const;

function spreadsheetSafe(value: string): string {
  return /^\s*[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export function csvEscape(value: unknown): string {
  const text = value === undefined || value === null ? "" : String(value);
  const safe = spreadsheetSafe(text);
  if (/[",\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

function causeText(finding: AuditFinding): string {
  return finding.causes
    .map(
      (cause) =>
        `${cause.kind}:${cause.name}${cause.dependencyPath.length > 1 ? ` [${cause.dependencyPath.join(" > ")}]` : ""}`,
    )
    .join(" | ");
}

function rowFor(run: AuditRun, finding: AuditFinding): string {
  const rootCauses = run.rootCauses
    .filter((cause) => finding.rootCauseIds.includes(cause.id))
    .map((cause) => `${cause.kind}:${cause.name}`)
    .join(" | ");

  return [
    finding.id,
    finding.ruleId,
    finding.ruleName,
    finding.status,
    finding.severity,
    finding.confidence,
    finding.nodeId,
    finding.nodeName,
    finding.nodeType,
    finding.pageName,
    finding.propertyPath,
    finding.modeName,
    finding.measuredValue,
    finding.threshold,
    finding.foregroundColor,
    finding.backgroundColor,
    finding.fontSize,
    finding.fontWeight,
    finding.estimatedReach,
    rootCauses,
    causeText(finding),
    finding.evidence.join(" | "),
    finding.limitations.join(" | "),
  ]
    .map(csvEscape)
    .join(",");
}

export function toCsvReport(run: AuditRun): string {
  const lines = [COLUMNS.join(",")];
  for (const finding of run.findings) {
    lines.push(rowFor(run, finding));
  }
  return `${lines.join("\r\n")}\r\n`;
}
