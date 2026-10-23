import type { AuditRun } from "../../model/audit-run";
import type { AuditStatus } from "../../model/finding";
import type { UiState } from "../state";
import {
  escapeHtml,
  formatDate,
  plural,
  statusLabel,
} from "./shared";

function inventoryLine(state: UiState): string {
  const inventory = state.inventory;
  if (!inventory) return "Local asset inventory is unavailable.";

  const parts = [
    plural(inventory.pageCount, "page"),
    plural(inventory.variables, "variable"),
    inventory.variableCollections > 0
      ? `${inventory.variableCollections} collection${inventory.variableCollections === 1 ? "" : "s"}`
      : undefined,
    inventory.modes > 0 ? plural(inventory.modes, "mode") : undefined,
    plural(inventory.paintStyles + inventory.textStyles, "style"),
    state.selectionCount > 0
      ? plural(state.selectionCount, "selected layer")
      : "No selection",
  ].filter((part): part is string => Boolean(part));

  return parts.join(" · ");
}

function scopeControl(state: UiState): string {
  const selectionDisabled = state.selectionCount === 0;
  return `
    <div class="scope-row">
      <div class="scope-control" role="group" aria-label="Scan scope">
        <button type="button" class="segment ${state.scope === "file" ? "is-active" : ""}" data-action="set-scope" data-scope="file" aria-pressed="${state.scope === "file"}">Whole file</button>
        <button type="button" class="segment ${state.scope === "selection" ? "is-active" : ""}" data-action="set-scope" data-scope="selection" aria-pressed="${state.scope === "selection"}" ${selectionDisabled ? "disabled" : ""}>Selection${state.selectionCount > 0 ? ` (${state.selectionCount})` : ""}</button>
      </div>
      <button type="button" class="button button-primary" data-action="run-scan">
        ${state.run ? "Rescan" : "Run scan"}
      </button>
    </div>
    ${
      selectionDisabled
        ? `<p class="hint">Select one or more layers on the canvas to enable a selection scan.</p>`
        : state.selectionNames.length > 0
          ? `<p class="hint">Selected: ${escapeHtml(state.selectionNames.join(", "))}${state.selectionCount > state.selectionNames.length ? ", ..." : ""}</p>`
          : ""
    }
  `;
}

function scanNotes(state: UiState): string {
  const warnings = state.inventory?.warnings ?? [];
  const noLocalTokens =
    state.inventory !== undefined &&
    state.inventory.variables === 0 &&
    state.inventory.paintStyles === 0 &&
    state.inventory.textStyles === 0;
  return `
    <p class="hint">Read-only and local-first. Nothing is uploaded.</p>
    ${
      noLocalTokens
        ? `<p class="hint">No local variables or styles were detected. Standalone frames and text can still be audited; missing tokens are not treated as a failure.</p>`
        : ""
    }
    ${
      warnings.length > 0
        ? `<div class="callout callout-warning" role="status"><p class="callout-title">Inventory note</p><ul>${warnings
            .map((warning) => `<li>${escapeHtml(warning)}</li>`)
            .join("")}</ul></div>`
        : ""
    }
  `;
}

function progressSteps(progress: string | undefined): string {
  const steps: { id: string; label: string }[] = [
    { id: "scope", label: "Resolve scope" },
    { id: "assets", label: "Discover assets" },
    { id: "nodes", label: "Inspect layers" },
    { id: "rules", label: "Evaluate rules" },
  ];
  const activeIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === progress),
  );

  return `
    <ol class="phase-list">
      ${steps
        .map(
          (step, index) =>
            `<li class="${index < activeIndex ? "is-done" : index === activeIndex ? "is-current" : ""}" ${index === activeIndex ? 'aria-current="step"' : ""}>${step.label}</li>`,
        )
        .join("")}
    </ol>
  `;
}

export function renderScanPanel(state: UiState): string {
  if (state.phase === "loading") {
    return `
      <section class="panel" aria-labelledby="scan-heading">
        <h2 id="scan-heading" class="panel-title">Preparing the inspector</h2>
        <p class="panel-text" role="status">Reading local variables, styles, and the current selection...</p>
      </section>
    `;
  }

  if (state.phase === "scanning") {
    const progress = state.progress;
    const message = progress?.message ?? "Scanning the document...";
    const counter =
      progress?.current !== undefined && progress?.total !== undefined
        ? `${progress.current.toLocaleString()} / ${progress.total.toLocaleString()} layers`
        : "";
    return `
      <section class="panel panel-scanning" aria-labelledby="scan-heading">
        <div class="panel-heading-row">
          <h2 id="scan-heading" class="panel-title">Scan in progress</h2>
          <button type="button" class="button button-quiet" data-action="cancel-scan">Cancel scan</button>
        </div>
        <p class="panel-text" role="status" aria-live="polite">${escapeHtml(message)}</p>
        ${progressSteps(progress?.phase)}
        ${counter ? `<p class="hint tabular">${escapeHtml(counter)}</p>` : ""}
      </section>
    `;
  }

  if (state.phase === "error") {
    return `
      <section class="panel panel-error" aria-labelledby="scan-heading">
        <h2 id="scan-heading" class="panel-title">Scan could not finish</h2>
        <p class="panel-text" role="alert">${escapeHtml(state.error ?? "An unknown error stopped the scan.")}</p>
        <div class="button-row">
          <button type="button" class="button button-primary" data-action="run-scan">Try again</button>
        </div>
        ${state.run ? `<p class="hint">The previous results are still shown below.</p>` : ""}
      </section>
    `;
  }

  if (!state.run) {
    return `
      <section class="panel panel-onboarding" aria-labelledby="scan-heading">
        <h2 id="scan-heading" class="panel-title">Audit the file as it exists</h2>
        <p class="panel-text">The scan discovers local variables, modes, styles, components, text, and frames before checking WCAG 2.2 AA criteria that can be evaluated from design evidence.</p>
        <dl class="inventory-line">
          <dt class="sr-only">Detected assets</dt>
          <dd>${escapeHtml(inventoryLine(state))}</dd>
        </dl>
        ${scopeControl(state)}
        ${scanNotes(state)}
      </section>
    `;
  }

  return `
    <section class="panel panel-compact" aria-labelledby="scan-heading">
      <h2 id="scan-heading" class="sr-only">Run another scan</h2>
      <div class="compact-scope">
        <div>
          <p class="compact-label">Current scope</p>
          <p class="compact-value">${escapeHtml(state.run.scope.label)}</p>
          <p class="hint">${escapeHtml(inventoryLine(state))}</p>
        </div>
        ${scopeControl(state)}
      </div>
    </section>
  `;
}

function ledgerButton(
  status: AuditStatus,
  count: number,
  filters: UiState["filters"],
): string {
  const active = filters.status === status;
  return `
    <button type="button" class="ledger-item ledger-${status} ${active ? "is-active" : ""}" data-action="set-status-filter" data-status="${status}" aria-pressed="${active}">
      <span class="ledger-count tabular">${count.toLocaleString()}</span>
      <span class="ledger-label">${statusLabel(status)}</span>
    </button>
  `;
}

export function renderRunSummary(
  run: AuditRun,
  filters: UiState["filters"],
): string {
  const duration = `${(run.stats.durationMs / 1000).toFixed(1)}s`;
  const modes =
    run.modes.length === 1 && run.modes[0]?.id === "no-variable-modes"
      ? "No variable modes"
      : plural(run.modes.length, "mode context");

  return `
    <section class="run-overview" aria-labelledby="overview-heading">
      <div class="overview-heading-row">
        <div>
          <h2 id="overview-heading" class="panel-title">Audit summary</h2>
          <p class="panel-text">${escapeHtml(run.scope.label)} · ${plural(run.stats.nodesInScope, "layer")} in scope · ${escapeHtml(modes)} · ${duration}</p>
        </div>
        <div class="overview-badges">
          <span class="meta-chip">${plural(run.rootCauses.length, "root cause")}</span>
          <span class="meta-chip">${plural(run.summary.affectedNodeCount, "affected layer")}</span>
        </div>
      </div>
      <div class="ledger" role="group" aria-label="Filter findings by status">
        ${ledgerButton("fail", run.summary.byStatus.fail, filters)}
        ${ledgerButton("needs-review", run.summary.byStatus["needs-review"], filters)}
        ${ledgerButton("pass", run.summary.byStatus.pass, filters)}
        ${ledgerButton("not-evaluated", run.summary.byStatus["not-evaluated"], filters)}
      </div>
      <p class="hint">Counts describe static checks, not a compliance score. ${run.summary.actionable.toLocaleString()} finding${run.summary.actionable === 1 ? "" : "s"} need attention or review. Select a count to filter the findings list.</p>
      <details class="rule-summary">
        <summary>Breakdown by rule</summary>
        <table class="rule-table">
          <caption class="sr-only">Findings by rule and status</caption>
          <thead>
            <tr><th scope="col">Rule</th><th scope="col">Fail</th><th scope="col">Review</th><th scope="col">Pass</th><th scope="col">Not evaluated</th></tr>
          </thead>
          <tbody>
            ${run.summary.byRule
              .map(
                (rule) => `<tr><th scope="row">${escapeHtml(rule.ruleName)}</th><td class="tabular">${rule.fail}</td><td class="tabular">${rule.needsReview}</td><td class="tabular">${rule.pass}</td><td class="tabular">${rule.notEvaluated}</td></tr>`,
              )
              .join("")}
          </tbody>
        </table>
      </details>
    </section>
  `;
}

function skippedList(run: AuditRun): string {
  if (run.scope.skipped.length === 0) {
    return `<p class="hint">No skipped or partially evaluated assets were recorded.</p>`;
  }

  return `
    <ul class="skipped-list">
      ${run.scope.skipped
        .map(
          (group) => `
            <li>
              <div class="skipped-heading">
                <span>${escapeHtml(group.reason)}</span>
                <span class="tabular">${group.count.toLocaleString()}</span>
              </div>
              ${
                group.examples.length > 0
                  ? `<p class="hint">${escapeHtml(group.examples.slice(0, 5).map((example) => example.name).join(", "))}${group.count > 5 ? ", ..." : ""}</p>`
                  : ""
              }
            </li>
          `,
        )
        .join("")}
    </ul>
  `;
}

export function renderLimitations(run: AuditRun): string {
  return `
    <details class="limits">
      <summary>Audit limitations and coverage</summary>
      <div class="limits-body">
        <h3>What this run does not establish</h3>
        <ul>${run.limitations.map((limitation) => `<li>${escapeHtml(limitation)}</li>`).join("")}</ul>
        ${
          run.warnings.length > 0
            ? `<h3>Warnings</h3><ul>${run.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>`
            : ""
        }
        <h3>Skipped or partially evaluated assets</h3>
        ${skippedList(run)}
        <p class="fine-print">Rule set ${escapeHtml(run.ruleSetVersion)} · Plugin ${escapeHtml(run.pluginVersion)} · Finished ${escapeHtml(formatDate(run.finishedAt))}</p>
      </div>
    </details>
  `;
}
