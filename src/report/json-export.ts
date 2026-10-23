import type { AuditRun } from "../model/audit-run";

export function toJsonReport(run: AuditRun): string {
  return JSON.stringify(
    {
      format: "a11y-system-inspector.audit",
      exportedAt: new Date().toISOString(),
      ...run,
    },
    null,
    2,
  );
}

export function reportFilename(
  run: AuditRun,
  extension: "json" | "csv",
): string {
  const stamp = run.startedAt
    .replace(/[^0-9A-Za-z]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 19);
  return `a11y-audit-${stamp}.${extension}`;
}
