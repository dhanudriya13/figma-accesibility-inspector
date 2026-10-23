import type { AuditStatus, Confidence, Severity } from "../../model/finding";

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function statusLabel(status: AuditStatus): string {
  switch (status) {
    case "pass":
      return "Pass";
    case "fail":
      return "Fail";
    case "needs-review":
      return "Needs review";
    case "not-evaluated":
      return "Not evaluated";
  }
}

export function statusChip(status: AuditStatus): string {
  return `<span class="status-chip status-${status}">${statusLabel(status)}</span>`;
}

export function severityLabel(severity: Severity): string {
  switch (severity) {
    case "critical":
      return "Critical";
    case "serious":
      return "Serious";
    case "moderate":
      return "Moderate";
    case "minor":
      return "Minor";
    case "info":
      return "Info";
  }
}

export function severityChip(severity: Severity): string {
  return `<span class="severity-chip severity-${severity}">${severityLabel(severity)}</span>`;
}

export function confidenceLabel(confidence: Confidence): string {
  return `${confidence.charAt(0).toUpperCase()}${confidence.slice(1)} confidence`;
}

export function plural(count: number, singular: string, pluralForm?: string): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : pluralForm ?? `${singular}s`}`;
}

export function formatDate(iso: string | undefined): string {
  if (!iso) return "Unknown time";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatMeasured(
  ruleId: string,
  measured: number | string | undefined,
  threshold: number | string | undefined,
): string {
  if (measured === undefined) return "Not measured";
  if (ruleId.includes("contrast") && typeof measured === "number") {
    return `${measured.toFixed(2)}:1`;
  }
  if (typeof measured === "string") return measured;
  return threshold !== undefined ? `${measured} / ${threshold}` : String(measured);
}

export function formatMode(modeName: string | undefined): string {
  return modeName ? modeName : "No variable modes";
}

export function formatReach(reach: number): string {
  return reach === 1 ? "1 layer" : `${reach.toLocaleString()} layers`;
}

export function ruleLabel(ruleName: string, wcag?: string): string {
  return wcag ? `${ruleName} (${wcag})` : ruleName;
}

export function textOrDash(value: string | undefined): string {
  return value && value.trim().length > 0 ? escapeHtml(value) : "Not available";
}
