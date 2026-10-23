import "./styles.css";
import type { AuditStatus } from "../model/finding";
import { RULES } from "../model/finding";
import type {
  PluginToUiMessage,
  ScopeKind,
  UiToPluginMessage,
} from "../messages";
import { toCsvReport } from "../report/csv-export";
import { reportFilename, toJsonReport } from "../report/json-export";
import type { TabId, UiState } from "./state";
import {
  activeFilterCount,
  initialState,
  resetFilters,
} from "./state";
import { renderComparisonPanel } from "./views/comparison";
import {
  renderFindingsList,
  renderFindingsToolbar,
} from "./views/findings";
import { renderRootCausesPanel } from "./views/root-causes";
import { escapeHtml, plural } from "./views/shared";
import {
  renderLimitations,
  renderRunSummary,
  renderScanPanel,
} from "./views/summary";

const state = initialState();
let dialogPayload:
  | { text: string; filename: string; mime: string }
  | undefined;

function post(message: UiToPluginMessage): void {
  parent.postMessage({ pluginMessage: message }, "*");
}

function renderScanRegion(): void {
  const region = document.getElementById("scan-region");
  if (region) region.innerHTML = renderScanPanel(state);
}

function renderEmptyRunInfo(): string {
  const rules = Object.values(RULES);
  return `
    <section class="panel panel-about" aria-labelledby="about-heading">
      <h2 id="about-heading" class="panel-title">What this release checks</h2>
      <ul class="rule-overview">
        ${rules
          .map(
            (rule) => `
              <li>
                <span class="rule-name">${escapeHtml(rule.name)}</span>
                <span class="rule-meta">WCAG ${escapeHtml(rule.wcag)} · Level ${rule.level}</span>
                <span class="rule-description">${escapeHtml(rule.description)}</span>
              </li>
            `,
          )
          .join("")}
      </ul>
      <p class="hint">The first release prioritizes a small set of testable checks over a broad compliance score. Root causes are grouped only when a real variable, style, or component dependency is traced.</p>
    </section>
  `;
}

function tabButton(
  tab: TabId,
  label: string,
  count: number | undefined,
): string {
  const active = state.activeTab === tab;
  return `
    <button
      type="button"
      role="tab"
      id="tab-${tab}"
      aria-controls="results-panel"
      aria-selected="${active}"
      tabindex="${active ? "0" : "-1"}"
      data-action="set-tab"
      data-tab="${tab}"
      class="${active ? "is-active" : ""}"
    >
      <span>${escapeHtml(label)}</span>
      ${count !== undefined ? `<span class="tab-count tabular">${count.toLocaleString()}</span>` : ""}
    </button>
  `;
}

function renderActivePanel(): string {
  const run = state.run;
  if (!run) return "";

  if (state.activeTab === "root-causes") {
    return renderRootCausesPanel(run);
  }
  if (state.activeTab === "comparison") {
    return renderComparisonPanel(run);
  }

  return `
    ${renderFindingsToolbar(run, state.filters)}
    <div id="findings-list">${renderFindingsList(state)}</div>
  `;
}

function renderRunRegion(): void {
  const region = document.getElementById("run-region");
  if (!region) return;

  if (!state.run) {
    region.innerHTML = renderEmptyRunInfo();
    return;
  }

  const run = state.run;
  const comparisonCount = run.comparison
    ? run.comparison.introduced.length +
      run.comparison.resolved.length +
      run.comparison.changed.length
    : undefined;

  region.innerHTML = `
    ${renderRunSummary(run, state.filters)}
    <section class="results-shell" id="results" aria-labelledby="tabs-heading">
      <h2 id="tabs-heading" class="sr-only">Audit results</h2>
      <div class="tabs" role="tablist" aria-label="Audit views">
        ${tabButton("findings", "Findings", run.findings.length)}
        ${tabButton("root-causes", "Root causes", run.rootCauses.length)}
        ${tabButton("comparison", "Comparison", comparisonCount)}
      </div>
      <div
        class="tab-panel"
        id="results-panel"
        role="tabpanel"
        aria-labelledby="tab-${state.activeTab}"
        tabindex="0"
      >
        ${renderActivePanel()}
      </div>
    </section>
    ${renderLimitations(run)}
  `;
}

function renderApp(): void {
  const root = document.getElementById("app");
  if (!root) return;

  const docName = state.inventory?.documentName;
  const skipHref = state.run ? "#results" : "#scan-region";
  const skipLabel = state.run ? "Skip to results" : "Skip to scan";
  root.innerHTML = `
    <a class="skip-link" href="${skipHref}">${skipLabel}</a>
    <div class="app">
      <header class="app-header">
        <div class="app-title">
          <h1>Figma Accesibility Inspector WCAG 2.2</h1>
          <p class="app-subtitle">${docName ? `${escapeHtml(docName)} · ` : ""}WCAG 2.2 AA evidence audit · Local and read-only</p>
        </div>
        <div class="header-actions">
          <button type="button" class="button button-quiet" data-action="export" data-format="json" ${state.run ? "" : "disabled"}>Export JSON</button>
          <button type="button" class="button button-quiet" data-action="export" data-format="csv" ${state.run ? "" : "disabled"}>Export CSV</button>
        </div>
      </header>
      <main class="main">
        <div id="scan-region"></div>
        <div id="run-region"></div>
      </main>
      <footer class="app-footer">
        <p>Static design inspection cannot prove full WCAG conformance.</p>
        <p>v${escapeHtml(state.pluginVersion)}</p>
      </footer>
    </div>
    <div id="toast-region" class="toast-region" aria-live="polite" aria-atomic="false"></div>
    <dialog id="report-dialog" class="dialog" aria-labelledby="dialog-title">
      <h2 id="dialog-title">Report</h2>
      <p id="dialog-desc" class="panel-text"></p>
      <textarea id="dialog-text" class="dialog-text" readonly rows="12" spellcheck="false" aria-label="Report text"></textarea>
      <div class="dialog-actions">
        <button type="button" class="button button-primary" data-action="copy-dialog">Copy to clipboard</button>
        <button type="button" class="button button-quiet" data-action="download-dialog">Download file</button>
        <button type="button" class="button button-quiet" data-action="close-dialog">Close</button>
      </div>
    </dialog>
  `;

  renderScanRegion();
  renderRunRegion();
}

function syncFilterControls(): void {
  const search = document.querySelector<HTMLInputElement>(
    '[data-filter="search"]',
  );
  if (search && document.activeElement !== search) {
    search.value = state.filters.search;
  }

  const values: Record<string, string> = {
    status: state.filters.status,
    severity: state.filters.severity,
    ruleId: state.filters.ruleId,
    rootCauseId: state.filters.rootCauseId,
    sort: state.filters.sort,
  };

  for (const [key, value] of Object.entries(values)) {
    const control = document.querySelector<HTMLSelectElement>(
      `[data-filter="${key}"]`,
    );
    if (control) control.value = value;
  }

  const clear = document.querySelector<HTMLButtonElement>(
    '[data-action="clear-filters"]',
  );
  if (clear) clear.disabled = activeFilterCount(state.filters) === 0;

  document
    .querySelectorAll<HTMLButtonElement>('[data-action="set-status-filter"]')
    .forEach((button) => {
      const active = button.dataset.status === state.filters.status;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
}

function updateResults(): void {
  if (!state.run) return;

  if (state.activeTab === "findings") {
    const list = document.getElementById("findings-list");
    if (list) {
      list.innerHTML = renderFindingsList(state);
      syncFilterControls();
      return;
    }
  }

  const panel = document.getElementById("results-panel");
  if (panel) {
    panel.setAttribute("aria-labelledby", `tab-${state.activeTab}`);
    panel.innerHTML = renderActivePanel();
    syncFilterControls();
  }
}

function setActiveTab(tab: TabId, focusTab = false): void {
  state.activeTab = tab;

  document
    .querySelectorAll<HTMLButtonElement>('[role="tab"]')
    .forEach((button) => {
      const active = button.dataset.tab === tab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
      if (active && focusTab) button.focus();
    });

  const panel = document.getElementById("results-panel");
  if (panel) {
    panel.setAttribute("aria-labelledby", `tab-${tab}`);
    panel.innerHTML = renderActivePanel();
    syncFilterControls();
  }
}

function showToast(
  message: string,
  tone: "info" | "warning" | "error" = "info",
): void {
  const region = document.getElementById("toast-region");
  if (!region) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${tone}`;
  toast.textContent = message;
  if (tone === "error") toast.setAttribute("role", "alert");
  region.append(toast);

  while (region.children.length > 3) {
    region.firstElementChild?.remove();
  }

  window.setTimeout(
    () => toast.remove(),
    tone === "error" ? 9000 : 5000,
  );
}

function triggerDownload(
  text: string,
  filename: string,
  mime: string,
): boolean {
  try {
    const blob = new Blob([text], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    return true;
  } catch {
    return false;
  }
}

function openReportDialog(
  title: string,
  text: string,
  filename: string,
  mime: string,
): void {
  dialogPayload = { text, filename, mime };
  const dialog = document.getElementById("report-dialog") as
    | HTMLDialogElement
    | null;
  if (!dialog) return;

  const titleNode = document.getElementById("dialog-title");
  const descNode = document.getElementById("dialog-desc");
  const textarea = document.getElementById("dialog-text") as
    | HTMLTextAreaElement
    | null;

  if (titleNode) titleNode.textContent = title;
  if (descNode) {
    descNode.textContent = `The file ${filename} could not be downloaded automatically. Copy the report below or try the download again.`;
  }
  if (textarea) textarea.value = text;

  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }

  document.querySelector<HTMLButtonElement>('[data-action="copy-dialog"]')?.focus();
}

function exportReport(format: "json" | "csv"): void {
  const run = state.run;
  if (!run) return;

  const text = format === "json" ? toJsonReport(run) : toCsvReport(run);
  const filename = reportFilename(run, format);
  const mime = format === "json" ? "application/json" : "text/csv";

  if (triggerDownload(text, filename, mime)) {
    showToast(`Exported ${filename}.`, "info");
    return;
  }

  openReportDialog(
    `Export ${format.toUpperCase()}`,
    text,
    filename,
    mime,
  );
}

async function copyDialogText(): Promise<void> {
  const textarea = document.getElementById("dialog-text") as
    | HTMLTextAreaElement
    | null;
  if (!textarea) return;

  try {
    await navigator.clipboard.writeText(textarea.value);
    showToast("Report copied to the clipboard.", "info");
  } catch {
    textarea.focus();
    textarea.select();
    const copied = document.execCommand("copy");
    showToast(
      copied
        ? "Report copied to the clipboard."
        : "Could not copy automatically. Select the report text and copy it manually.",
      copied ? "info" : "warning",
    );
  }
}

function closeDialog(): void {
  const dialog = document.getElementById("report-dialog") as
    | HTMLDialogElement
    | null;
  if (!dialog) return;
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

function focusResultsPanel(): void {
  window.requestAnimationFrame(() => {
    document.getElementById("results-panel")?.focus();
  });
}

function handleAction(action: string, element: HTMLElement): void {
  switch (action) {
    case "set-scope": {
      const scope = element.dataset.scope as ScopeKind | undefined;
      if (!scope) return;
      state.scope = scope;
      renderScanRegion();
      window.requestAnimationFrame(() => {
        document
          .querySelector<HTMLButtonElement>(
            `[data-action="set-scope"][data-scope="${scope}"]`,
          )
          ?.focus();
      });
      break;
    }
    case "run-scan": {
      state.phase = "scanning";
      state.error = undefined;
      state.progress = {
        phase: "scope",
        message:
          state.scope === "file"
            ? "Preparing a whole-file scan..."
            : "Preparing a selection scan...",
      };
      renderScanRegion();
      post({ type: "run-audit", scope: state.scope });
      break;
    }
    case "cancel-scan": {
      state.progress = {
        ...state.progress,
        phase: state.progress?.phase ?? "scope",
        message: "Cancelling after the current batch...",
      };
      renderScanRegion();
      post({ type: "cancel" });
      break;
    }
    case "set-tab": {
      const tab = element.dataset.tab as TabId | undefined;
      if (tab) setActiveTab(tab);
      break;
    }
    case "set-status-filter": {
      const status = element.dataset.status as AuditStatus | undefined;
      if (!status) return;
      state.filters.status =
        state.filters.status === status ? "all" : status;
      state.showLimit = 100;
      if (state.activeTab !== "findings") {
        setActiveTab("findings");
      } else {
        syncFilterControls();
        updateResults();
      }
      break;
    }
    case "clear-filters": {
      resetFilters(state);
      if (state.activeTab !== "findings") {
        setActiveTab("findings");
      } else {
        syncFilterControls();
        updateResults();
      }
      focusResultsPanel();
      break;
    }
    case "filter-root-cause": {
      const rootCauseId = element.dataset.rootCauseId;
      if (!rootCauseId) return;
      state.filters.rootCauseId = rootCauseId;
      state.filters.status = "all";
      state.showLimit = 100;
      if (state.activeTab !== "findings") {
        setActiveTab("findings");
      } else {
        syncFilterControls();
        updateResults();
      }
      document
        .getElementById("results")
        ?.scrollIntoView({ block: "start" });
      focusResultsPanel();
      break;
    }
    case "navigate": {
      const nodeId = element.dataset.nodeId;
      if (!nodeId) return;
      post({ type: "navigate", nodeId });
      break;
    }
    case "show-more": {
      state.showLimit += 100;
      updateResults();
      focusResultsPanel();
      break;
    }
    case "export": {
      const format = element.dataset.format;
      if (format === "json" || format === "csv") exportReport(format);
      break;
    }
    case "clear-history": {
      if (state.run) state.run.comparison = undefined;
      post({ type: "clear-history" });
      updateResults();
      break;
    }
    case "copy-dialog": {
      void copyDialogText();
      break;
    }
    case "download-dialog": {
      if (
        dialogPayload &&
        triggerDownload(
          dialogPayload.text,
          dialogPayload.filename,
          dialogPayload.mime,
        )
      ) {
        showToast(`Exported ${dialogPayload.filename}.`, "info");
        closeDialog();
      } else {
        showToast("The download did not start.", "warning");
      }
      break;
    }
    case "close-dialog": {
      closeDialog();
      break;
    }
  }
}

document.addEventListener("click", (event) => {
  const target = event.target as HTMLElement | null;
  const element = target?.closest<HTMLElement>("[data-action]");
  if (!element) return;
  if (element instanceof HTMLButtonElement && element.disabled) return;
  event.preventDefault();
  handleAction(element.dataset.action ?? "", element);
});

document.addEventListener("change", (event) => {
  const target = event.target as HTMLElement | null;
  const control = target?.closest<HTMLSelectElement>("[data-filter]");
  if (!control) return;

  const key = control.dataset.filter;
  const value = control.value;
  switch (key) {
    case "status":
      state.filters.status = value as UiState["filters"]["status"];
      break;
    case "severity":
      state.filters.severity = value as UiState["filters"]["severity"];
      break;
    case "ruleId":
      state.filters.ruleId = value;
      break;
    case "rootCauseId":
      state.filters.rootCauseId = value;
      break;
    case "sort":
      state.filters.sort = value as UiState["filters"]["sort"];
      break;
    default:
      return;
  }

  state.showLimit = 100;
  syncFilterControls();
  updateResults();
});

let searchTimer: number | undefined;

document.addEventListener("input", (event) => {
  const target = event.target as HTMLElement | null;
  const input = target?.closest<HTMLInputElement>('[data-filter="search"]');
  if (!input) return;

  state.filters.search = input.value;
  state.showLimit = 100;

  if (searchTimer !== undefined) window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    updateResults();
    syncFilterControls();
  }, 120);
});

document.addEventListener("keydown", (event) => {
  const target = event.target as HTMLElement | null;
  const tab = target?.closest<HTMLButtonElement>('[role="tab"]');
  if (!tab) return;

  const tabs = [
    ...document.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
  ];
  const currentIndex = tabs.indexOf(tab);

  if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (currentIndex + direction + tabs.length) % tabs.length;
    const next = tabs[nextIndex];
    if (next?.dataset.tab) {
      setActiveTab(next.dataset.tab as TabId, true);
    }
  } else if (event.key === "Home" || event.key === "End") {
    event.preventDefault();
    const next = event.key === "Home" ? tabs[0] : tabs[tabs.length - 1];
    if (next?.dataset.tab) {
      setActiveTab(next.dataset.tab as TabId, true);
    }
  }
});

window.addEventListener("message", (event: MessageEvent) => {
  const message = (
    event.data as { pluginMessage?: PluginToUiMessage } | undefined
  )?.pluginMessage;
  if (!message) return;

  switch (message.type) {
    case "init": {
      state.phase = "ready";
      state.inventory = message.inventory;
      state.selectionCount = message.selectionCount;
      state.selectionNames = message.selectionNames;
      state.pluginVersion = message.pluginVersion;
      if (state.selectionCount === 0 && state.scope === "selection") {
        state.scope = "file";
      }
      renderApp();
      break;
    }
    case "inventory": {
      state.inventory = message.inventory;
      renderScanRegion();
      break;
    }
    case "progress": {
      state.phase = "scanning";
      state.progress = message.progress;
      renderScanRegion();
      break;
    }
    case "audit-complete": {
      state.phase = "ready";
      state.error = undefined;
      state.progress = undefined;
      state.run = message.run;
      state.activeTab = "findings";
      resetFilters(state);
      renderApp();
      window.requestAnimationFrame(() => {
        document
          .getElementById("tab-findings")
          ?.focus();
      });
      showToast(
        `Scan complete: ${plural(message.run.summary.byStatus.fail, "failure")} and ${plural(message.run.summary.byStatus["needs-review"], "review item")}.`,
        message.run.summary.actionable > 0 ? "warning" : "info",
      );
      break;
    }
    case "audit-error": {
      const wasCancelled = message.message.toLowerCase().includes("cancel");
      state.phase = wasCancelled ? "ready" : "error";
      state.error = wasCancelled ? undefined : message.message;
      state.progress = undefined;
      renderScanRegion();
      showToast(message.message, wasCancelled ? "warning" : "error");
      window.requestAnimationFrame(() => {
        document
          .querySelector<HTMLButtonElement>('[data-action="run-scan"]')
          ?.focus();
      });
      break;
    }
    case "selection-changed": {
      state.selectionCount = message.selectionCount;
      state.selectionNames = message.selectionNames;
      if (state.selectionCount === 0 && state.scope === "selection") {
        state.scope = "file";
      }
      renderScanRegion();
      break;
    }
    case "navigated": {
      showToast(message.message, message.ok ? "info" : "warning");
      break;
    }
    case "toast": {
      showToast(message.message, message.tone);
      break;
    }
  }
});

renderApp();
post({ type: "ui-ready" });
