import type { AuditRun, RootCause } from "../../model/audit-run";
import {
  confidenceLabel,
  escapeHtml,
  formatReach,
  plural,
  severityChip,
} from "./shared";

function dependencyPaths(cause: RootCause): string {
  if (cause.dependencyPaths.length === 0) {
    return `<p class="hint">No dependency path was recorded.</p>`;
  }

  return `
    <ul class="source-list">
      ${cause.dependencyPaths
        .map(
          (path) =>
            `<li><span class="source-path">${escapeHtml(path.join(" > "))}</span></li>`,
        )
        .join("")}
    </ul>
  `;
}

function rootCauseCard(cause: RootCause): string {
  return `
    <article class="root-cause">
      <div class="root-cause-heading">
        <div class="root-cause-title">
          ${severityChip(cause.severity)}
          <span class="kind-chip">${escapeHtml(cause.kind)}</span>
          <h3>${escapeHtml(cause.name)}</h3>
        </div>
        <span class="meta-chip">${escapeHtml(formatReach(cause.estimatedReach))}</span>
      </div>
      <p class="root-cause-meta">${plural(cause.affectedFindingIds.length, "finding")} · ${plural(cause.affectedNodeIds.length, "affected layer")} · ${escapeHtml(confidenceLabel(cause.confidence))}${cause.roles.length > 0 ? ` · ${cause.roles.map((role) => escapeHtml(role)).join(", ")}` : ""}</p>
      <ul class="evidence-list">${cause.evidence.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
      <h4>Dependency path</h4>
      ${dependencyPaths(cause)}
      <details class="inline-details">
        <summary>Limitations</summary>
        ${
          cause.limitations.length > 0
            ? `<ul class="limitation-list">${cause.limitations.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`
            : `<p class="hint">No additional limitations were recorded.</p>`
        }
      </details>
      <div class="finding-actions">
        <button type="button" class="button button-primary" data-action="filter-root-cause" data-root-cause-id="${escapeHtml(cause.id)}">Filter findings by this source</button>
        ${
          cause.nodeId
            ? `<button type="button" class="button button-quiet" data-action="navigate" data-node-id="${escapeHtml(cause.nodeId)}">Select source layer</button>`
            : ""
        }
      </div>
    </article>
  `;
}

export function renderRootCausesPanel(run: AuditRun): string {
  const hints =
    run.similarityHints.length > 0
      ? `
        <section class="hints" aria-labelledby="hints-heading">
          <h3 id="hints-heading">Value similarity hints</h3>
          <p class="panel-text">These colors appear in more than one finding, but matching values alone are not treated as a shared cause. Use them as investigation leads, not as root causes.</p>
          <ul class="hint-list">
            ${run.similarityHints
              .map(
                (hint) => `
                  <li>
                    <span class="color-sample" style="background:${escapeHtml(hint.color)}" aria-hidden="true"></span>
                    <span class="tabular">${escapeHtml(hint.color)}</span>
                    <span>${escapeHtml(hint.message)}</span>
                    ${
                      hint.nodeNames.length > 0
                        ? `<span class="hint">${escapeHtml(hint.nodeNames.join(", "))}</span>`
                        : ""
                    }
                  </li>
                `,
              )
              .join("")}
          </ul>
        </section>
      `
      : "";

  if (run.rootCauses.length === 0) {
    return `
      <div class="empty-state">
        <h3>No verified shared sources were found</h3>
        <p>Findings were not grouped by matching colors or similar values. A root cause is only reported when a variable, style, or component binding was traced.</p>
        ${
          run.summary.byStatus.fail + run.summary.byStatus["needs-review"] > 0
            ? `<button type="button" class="button button-quiet" data-action="set-tab" data-tab="findings">Review findings</button>`
            : ""
        }
      </div>
      ${hints}
    `;
  }

  return `
    <div class="list-status">
      <p class="results-count" role="status">${plural(run.rootCauses.length, "verified shared source")} across ${plural(run.summary.affectedNodeCount, "affected layer")}.</p>
      <p class="hint">A root cause groups findings only when a real binding or component relationship was traced.</p>
    </div>
    <div class="root-cause-list">
      ${run.rootCauses.map(rootCauseCard).join("")}
    </div>
    ${hints}
  `;
}
