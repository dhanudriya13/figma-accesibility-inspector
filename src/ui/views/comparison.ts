import type {
  AuditRun,
  ChangedComparisonItem,
  ComparisonItem,
} from "../../model/audit-run";
import type { AuditStatus } from "../../model/finding";
import {
  escapeHtml,
  formatDate,
  formatMeasured,
  plural,
  statusChip,
  statusLabel,
} from "./shared";

function comparisonRow(
  item: ComparisonItem,
  options: { previous?: AuditStatus; changedTo?: AuditStatus } = {},
): string {
  const measured =
    item.measuredValue !== undefined
      ? `<span class="comparison-measure tabular">${escapeHtml(formatMeasured(item.ruleId, item.measuredValue, undefined))}</span>`
      : "";

  return `
    <li class="comparison-row">
      <span class="comparison-status">${statusChip(item.status)}</span>
      <span class="comparison-main">
        <span class="comparison-title">${escapeHtml(item.nodeName ?? "Document-level finding")}</span>
        <span class="finding-meta">
          <span class="meta-item">${escapeHtml(item.ruleName)}</span>
          ${item.modeName ? `<span class="meta-item">${escapeHtml(item.modeName)}</span>` : ""}
          ${
            options.previous && options.changedTo
              ? `<span class="meta-item">${statusLabel(options.previous)} to ${statusLabel(options.changedTo)}</span>`
              : ""
          }
        </span>
      </span>
      ${measured}
      ${
        item.nodeId
          ? `<button type="button" class="button button-quiet button-small" data-action="navigate" data-node-id="${escapeHtml(item.nodeId)}">Select layer</button>`
          : ""
      }
    </li>
  `;
}

function changedRow(item: ChangedComparisonItem): string {
  return comparisonRow(item, { previous: item.from, changedTo: item.to });
}

export function renderComparisonPanel(run: AuditRun): string {
  const comparison = run.comparison;
  if (!comparison) {
    return `
      <div class="empty-state">
        <h3>No previous run to compare</h3>
        <p>The first scan has no baseline. Revise the design, run the audit again, and this view will show new, resolved, and changed findings.</p>
      </div>
    `;
  }

  const totalChanges =
    comparison.summary.introduced +
    comparison.summary.resolved +
    comparison.summary.improved +
    comparison.summary.regressed;

  return `
    <div class="list-status">
      <p class="results-count" role="status">Compared with the local run from ${escapeHtml(formatDate(comparison.previousAt))}.</p>
      <p class="hint">Comparison uses the last local scan stored for this plugin. Nothing leaves the device.</p>
    </div>
    ${
      comparison.message
        ? `<div class="callout callout-warning" role="status"><p class="callout-title">Scope changed</p><p>${escapeHtml(comparison.message)}</p></div>`
        : ""
    }
    <dl class="comparison-ledger">
      <div><dt>New</dt><dd class="tabular">${comparison.summary.introduced}</dd></div>
      <div><dt>Resolved</dt><dd class="tabular">${comparison.summary.resolved}</dd></div>
      <div><dt>Improved</dt><dd class="tabular">${comparison.summary.improved}</dd></div>
      <div><dt>Regressed</dt><dd class="tabular">${comparison.summary.regressed}</dd></div>
      <div><dt>Unchanged</dt><dd class="tabular">${comparison.summary.unchanged}</dd></div>
    </dl>
    ${
      totalChanges === 0
        ? `<div class="empty-state"><h3>No status changes</h3><p>The findings that still apply have the same status as the previous run.</p></div>`
        : ""
    }
    ${
      comparison.introduced.length > 0
        ? `<section class="comparison-section" aria-labelledby="introduced-heading"><h3 id="introduced-heading">New findings <span class="count-badge">${comparison.introduced.length}</span></h3><ul class="comparison-list">${comparison.introduced.map((item) => comparisonRow(item)).join("")}</ul></section>`
        : ""
    }
    ${
      comparison.resolved.length > 0
        ? `<section class="comparison-section" aria-labelledby="resolved-heading"><h3 id="resolved-heading">Resolved findings <span class="count-badge">${comparison.resolved.length}</span></h3><ul class="comparison-list">${comparison.resolved.map((item) => comparisonRow(item)).join("")}</ul></section>`
        : ""
    }
    ${
      comparison.changed.length > 0
        ? `<section class="comparison-section" aria-labelledby="changed-heading"><h3 id="changed-heading">Changed findings <span class="count-badge">${comparison.changed.length}</span></h3><ul class="comparison-list">${comparison.changed.map(changedRow).join("")}</ul></section>`
        : ""
    }
    <div class="toolbar-footer">
      <p class="hint">${plural(comparison.unchangedCount, "finding")} unchanged.</p>
      <button type="button" class="button button-quiet" data-action="clear-history">Clear comparison history</button>
    </div>
  `;
}
