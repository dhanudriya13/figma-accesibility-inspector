import type { AuditRun } from "../../model/audit-run";
import type { AuditFinding } from "../../model/finding";
import { RULES, severityRank, statusRank } from "../../model/finding";
import type { UiState } from "../state";
import { activeFilterCount } from "../state";
import {
  confidenceLabel,
  escapeHtml,
  formatMeasured,
  formatMode,
  formatReach,
  plural,
  severityChip,
  statusChip,
  textOrDash,
} from "./shared";

export function filterAndSortFindings(
  run: AuditRun,
  filters: UiState["filters"],
): AuditFinding[] {
  const query = filters.search.trim().toLowerCase();

  const filtered = run.findings.filter((finding) => {
    if (filters.status !== "all" && finding.status !== filters.status) {
      return false;
    }
    if (filters.severity !== "all" && finding.severity !== filters.severity) {
      return false;
    }
    if (filters.ruleId !== "all" && finding.ruleId !== filters.ruleId) {
      return false;
    }
    if (
      filters.rootCauseId !== "all" &&
      !finding.rootCauseIds.includes(filters.rootCauseId)
    ) {
      return false;
    }
    if (query.length === 0) return true;

    const haystack = [
      finding.title,
      finding.nodeName,
      finding.pageName,
      finding.ruleName,
      finding.modeName,
      finding.measuredValue,
      finding.evidence.join(" "),
      finding.limitations.join(" "),
      finding.causes.map((cause) => cause.name).join(" "),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(query);
  });

  return filtered.sort((first, second) => {
    switch (filters.sort) {
      case "status": {
        const status = statusRank(first.status) - statusRank(second.status);
        if (status !== 0) return status;
        break;
      }
      case "node": {
        const node = (first.nodeName ?? "").localeCompare(
          second.nodeName ?? "",
        );
        if (node !== 0) return node;
        break;
      }
      case "rule": {
        const rule = first.ruleName.localeCompare(second.ruleName);
        if (rule !== 0) return rule;
        break;
      }
      case "severity":
      default: {
        const severity =
          severityRank(first.severity) - severityRank(second.severity);
        if (severity !== 0) return severity;
        break;
      }
    }

    return first.title.localeCompare(second.title);
  });
}

function options(
  values: { value: string; label: string }[],
  selected: string,
): string {
  return values
    .map(
      (value) =>
        `<option value="${escapeHtml(value.value)}" ${value.value === selected ? "selected" : ""}>${escapeHtml(value.label)}</option>`,
    )
    .join("");
}

export function renderFindingsToolbar(
  run: AuditRun,
  filters: UiState["filters"],
): string {
  const filterCount = activeFilterCount(filters);
  const ruleOptions = [
    { value: "all", label: "All rules" },
    ...run.summary.byRule.map((rule) => ({
      value: rule.ruleId,
      label: rule.ruleName,
    })),
  ];
  const rootCauseOptions = [
    { value: "all", label: "All verified sources" },
    ...run.rootCauses.map((cause) => ({
      value: cause.id,
      label: `${cause.kind}: ${cause.name}`,
    })),
  ];

  return `
    <div class="toolbar">
      <label class="field field-search">
        <span>Search findings</span>
        <input type="search" data-filter="search" value="${escapeHtml(filters.search)}" placeholder="Layer, rule, evidence..." autocomplete="off" spellcheck="false" />
      </label>
      <div class="field-grid">
        <label class="field">
          <span>Status</span>
          <select data-filter="status">
            ${options(
              [
                { value: "all", label: "All statuses" },
                { value: "fail", label: "Fail" },
                { value: "needs-review", label: "Needs review" },
                { value: "pass", label: "Pass" },
                { value: "not-evaluated", label: "Not evaluated" },
              ],
              filters.status,
            )}
          </select>
        </label>
        <label class="field">
          <span>Severity</span>
          <select data-filter="severity">
            ${options(
              [
                { value: "all", label: "All severities" },
                { value: "critical", label: "Critical" },
                { value: "serious", label: "Serious" },
                { value: "moderate", label: "Moderate" },
                { value: "minor", label: "Minor" },
                { value: "info", label: "Info" },
              ],
              filters.severity,
            )}
          </select>
        </label>
        <label class="field">
          <span>Rule</span>
          <select data-filter="ruleId">${options(ruleOptions, filters.ruleId)}</select>
        </label>
        <label class="field">
          <span>Verified source</span>
          <select data-filter="rootCauseId">${options(rootCauseOptions, filters.rootCauseId)}</select>
        </label>
        <label class="field">
          <span>Sort</span>
          <select data-filter="sort">
            ${options(
              [
                { value: "severity", label: "Severity" },
                { value: "status", label: "Status" },
                { value: "node", label: "Layer name" },
                { value: "rule", label: "Rule" },
              ],
              filters.sort,
            )}
          </select>
        </label>
      </div>
      <div class="toolbar-footer">
        <p class="hint">Filters stay local to this panel.</p>
        <button type="button" class="button button-quiet" data-action="clear-filters" ${filterCount === 0 ? "disabled" : ""}>Clear ${filterCount > 0 ? `${filterCount} ` : ""}filter${filterCount === 1 ? "" : "s"}</button>
      </div>
    </div>
  `;
}

function rootCauseButtons(run: AuditRun, finding: AuditFinding): string {
  const causes = run.rootCauses.filter((cause) =>
    finding.rootCauseIds.includes(cause.id),
  );
  if (causes.length === 0) {
    return `<p class="hint">No verified shared source was found for this finding.</p>`;
  }

  return `
    <div class="chip-row">
      ${causes
        .map(
          (cause) =>
            `<button type="button" class="chip-button" data-action="filter-root-cause" data-root-cause-id="${escapeHtml(cause.id)}">${escapeHtml(cause.kind)}: ${escapeHtml(cause.name)}</button>`,
        )
        .join("")}
    </div>
  `;
}

function sources(finding: AuditFinding): string {
  if (finding.causes.length === 0) {
    return `<p class="hint">No variable, style, or component binding was recorded for this property.</p>`;
  }

  return `
    <ul class="source-list">
      ${finding.causes
        .map(
          (cause) => `
            <li>
              <span class="source-name">${escapeHtml(cause.name)}</span>
              <span class="source-kind">${escapeHtml(cause.kind)}${cause.role ? ` · ${escapeHtml(cause.role)}` : ""}</span>
              <span class="source-path">${escapeHtml(cause.dependencyPath.join(" > "))}</span>
            </li>
          `,
        )
        .join("")}
    </ul>
  `;
}

function findingRow(run: AuditRun, finding: AuditFinding): string {
  const wcag = RULES[finding.ruleId]?.wcag;
  const measured = formatMeasured(
    finding.ruleId,
    finding.measuredValue,
    finding.threshold,
  );
  const mode = finding.modeName
    ? `<span class="meta-item">${escapeHtml(formatMode(finding.modeName))}</span>`
    : "";

  return `
    <article class="finding" data-status="${finding.status}">
      <details class="finding-details">
        <summary class="finding-summary">
          <span class="disclosure" aria-hidden="true"></span>
          <span class="finding-main">
            <span class="finding-line">
              ${statusChip(finding.status)}
              <span class="finding-title">${escapeHtml(finding.title)}</span>
            </span>
            <span class="finding-meta">
              <span class="meta-item">${escapeHtml(finding.ruleName)}</span>
              <span class="meta-item">${escapeHtml(textOrDash(finding.nodeName))}</span>
              ${mode}
              <span class="meta-item">${escapeHtml(confidenceLabel(finding.confidence))}</span>
            </span>
          </span>
          <span class="finding-measure tabular">${escapeHtml(measured)}</span>
        </summary>
        <div class="finding-body">
          <p class="panel-text">${escapeHtml(finding.description)}</p>
          <dl class="fact-grid">
            <div><dt>Layer</dt><dd>${escapeHtml(textOrDash(finding.nodeName))}</dd></div>
            <div><dt>Page</dt><dd>${escapeHtml(textOrDash(finding.pageName))}</dd></div>
            <div><dt>Rule</dt><dd>${escapeHtml(wcag ? `${finding.ruleName} · ${wcag}` : finding.ruleName)}</dd></div>
            <div><dt>Severity</dt><dd>${severityChip(finding.severity)}</dd></div>
            <div><dt>Measured / threshold</dt><dd class="tabular">${escapeHtml(measured)}${finding.threshold !== undefined && typeof finding.threshold === "number" ? ` / ${finding.threshold}:1` : finding.threshold !== undefined ? ` / ${escapeHtml(String(finding.threshold))}` : ""}</dd></div>
            <div><dt>Estimated reach</dt><dd>${escapeHtml(formatReach(finding.estimatedReach))}</dd></div>
            <div><dt>Property</dt><dd>${escapeHtml(textOrDash(finding.propertyPath))}</dd></div>
            <div><dt>Mode</dt><dd>${escapeHtml(formatMode(finding.modeName))}</dd></div>
          </dl>

          <h4>Evidence</h4>
          <ul class="evidence-list">${finding.evidence.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>

          <h4>Verified shared causes</h4>
          ${rootCauseButtons(run, finding)}
          ${sources(finding)}

          <h4>Limitations</h4>
          ${
            finding.limitations.length > 0
              ? `<ul class="limitation-list">${finding.limitations.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`
              : `<p class="hint">No additional limitations were recorded for this finding.</p>`
          }

          <div class="finding-actions">
            ${
              finding.nodeId
                ? `<button type="button" class="button button-primary" data-action="navigate" data-node-id="${escapeHtml(finding.nodeId)}">Select layer in Figma</button>`
                : ""
            }
            ${
              finding.rootCauseIds.length > 0
                ? `<button type="button" class="button button-quiet" data-action="filter-root-cause" data-root-cause-id="${escapeHtml(finding.rootCauseIds[0] ?? "")}">Filter by this source</button>`
                : ""
            }
          </div>
        </div>
      </details>
    </article>
  `;
}

export function renderFindingsList(state: UiState): string {
  const run = state.run;
  if (!run) return "";

  const filtered = filterAndSortFindings(run, state.filters);
  const visible = filtered.slice(0, state.showLimit);

  if (run.findings.length === 0) {
    return `
      <div class="empty-state">
        <h3>No automated findings were produced</h3>
        <p>This does not prove conformance. Static design inspection cannot establish every WCAG criterion, runtime behavior, or assistive-technology outcome.</p>
        <button type="button" class="button button-quiet" data-action="run-scan">Rescan after changes</button>
      </div>
    `;
  }

  if (filtered.length === 0) {
    return `
      <div class="empty-state">
        <h3>No findings match these filters</h3>
        <p>Remove one or more filters to see the rest of the run.</p>
        <button type="button" class="button button-primary" data-action="clear-filters">Clear filters</button>
      </div>
    `;
  }

  return `
    <div class="list-status">
      <p class="results-count" role="status" aria-live="polite">Showing ${visible.length.toLocaleString()} of ${filtered.length.toLocaleString()} matching findings${filtered.length !== run.findings.length ? ` (${run.findings.length.toLocaleString()} total)` : ""}.</p>
      <p class="hint">${plural(state.run?.summary.byStatus.fail ?? 0, "failure")} and ${plural(state.run?.summary.byStatus["needs-review"] ?? 0, "review item")} in the full run.</p>
    </div>
    <div class="finding-list">
      ${visible.map((finding) => findingRow(run, finding)).join("")}
    </div>
    ${
      filtered.length > visible.length
        ? `<div class="load-more"><button type="button" class="button button-quiet" data-action="show-more">Show next ${Math.min(100, filtered.length - visible.length)} findings</button></div>`
        : ""
    }
  `;
}
