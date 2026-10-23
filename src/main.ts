import type { AuditSnapshot } from "./model/audit-run";
import { runAudit } from "./engine/audit-engine";
import type { PluginToUiMessage, UiToPluginMessage } from "./messages";
import { snapshotRun } from "./report/compare";
import {
  ScanCancelledError,
  discoverDesignModel,
  getInventorySummary,
} from "./scanner/discover-assets";
import { ScanScopeError } from "./scanner/scan-scope";
import { PLUGIN_VERSION } from "./version";
import inlineUiHtml from "virtual:ui-html";

const STORAGE_KEY = "a11y-system-inspector:last-audit";

function safeDocumentName(): string {
  try {
    return figma.root.name;
  } catch {
    return "Untitled file";
  }
}

function storageKey(): string {
  let fileIdentity = safeDocumentName();
  try {
    fileIdentity = figma.fileKey ?? fileIdentity;
  } catch {
    fileIdentity = "unknown-file";
  }
  return `${STORAGE_KEY}:${fileIdentity}`;
}

const fallbackUi = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Figma Accesibility Inspector WCAG 2.2</title></head>
  <body style="font-family: system-ui, sans-serif; padding: 16px; line-height: 1.5;">
    <h1 style="font-size: 15px;">Figma Accesibility Inspector WCAG 2.2</h1>
    <p>The plugin UI file could not be loaded. Run <code>npm run build</code> and re-import <code>manifest.json</code>.</p>
  </body>
</html>`;

const uiHtml = inlineUiHtml.trim().length > 0 ? inlineUiHtml : fallbackUi;

try {
  figma.showUI(uiHtml, {
    width: 600,
    height: 800,
    themeColors: true,
  });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Figma Accesibility Inspector WCAG 2.2 failed to open its UI", error);
  figma.notify(
    `Figma Accesibility Inspector WCAG 2.2 could not open its panel: ${message}`,
    { error: true, timeout: 15000 },
  );
}

let scanToken = 0;
let cancelled = false;
let scanning = false;

function post(message: PluginToUiMessage): void {
  figma.ui.postMessage(message);
}

function rootPageCount(): number {
  try {
    return figma.root.children.filter((node) => node.type === "PAGE").length;
  } catch {
    return 0;
  }
}

function selectionState(): { count: number; names: string[] } {
  const selection = figma.currentPage.selection;
  return {
    count: selection.length,
    names: selection.slice(0, 5).map((node) => node.name),
  };
}

async function sendInit(): Promise<void> {
  const selection = selectionState();
  try {
    const inventory = await getInventorySummary();
    post({
      type: "init",
      inventory,
      selectionCount: selection.count,
      selectionNames: selection.names,
      pluginVersion: PLUGIN_VERSION,
    });
  } catch (error) {
    post({
      type: "init",
      inventory: {
        documentName: safeDocumentName(),
        pageCount: rootPageCount(),
        variables: 0,
        variableCollections: 0,
        paintStyles: 0,
        textStyles: 0,
        modes: 0,
        warnings: [
          error instanceof Error
            ? error.message
            : "Local assets could not be inventoried.",
        ],
      },
      selectionCount: selection.count,
      selectionNames: selection.names,
      pluginVersion: PLUGIN_VERSION,
    });
  }
}

async function loadPrevious(): Promise<AuditSnapshot | undefined> {
  try {
    const stored = await figma.clientStorage.getAsync(storageKey());
    if (
      stored &&
      typeof stored === "object" &&
      (stored as AuditSnapshot).version === 1
    ) {
      return stored as AuditSnapshot;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

async function storePrevious(snapshot: AuditSnapshot): Promise<void> {
  try {
    await figma.clientStorage.setAsync(storageKey(), snapshot);
  } catch {
    post({
      type: "toast",
      tone: "warning",
      message:
        "The audit finished, but the comparison history could not be saved locally.",
    });
  }
}

async function runScan(scope: "file" | "selection"): Promise<void> {
  if (scanning) {
    post({
      type: "toast",
      tone: "info",
      message: "A scan is already running.",
    });
    return;
  }

  scanning = true;
  cancelled = false;
  const token = ++scanToken;
  const scanStartedAt = Date.now();

  try {
    post({
      type: "progress",
      progress: {
        phase: "scope",
        message:
          scope === "file"
            ? "Preparing a whole-file scan..."
            : "Preparing a selection scan...",
      },
    });

    const previous = await loadPrevious();
    const model = await discoverDesignModel(scope, {
      onProgress: (progress) => {
        if (token === scanToken) post({ type: "progress", progress });
      },
      isCancelled: () => cancelled || token !== scanToken,
    });

    post({
      type: "progress",
      progress: {
        phase: "rules",
        message: "Evaluating WCAG rules and tracing shared sources...",
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    const run = runAudit(model, {
      previous,
      scanDurationMs: Date.now() - scanStartedAt,
    });
    if (cancelled) throw new ScanCancelledError();
    await storePrevious(snapshotRun(run));

    if (token === scanToken) {
      post({ type: "audit-complete", run });
    }
  } catch (error) {
    if (token !== scanToken) return;

    if (error instanceof ScanCancelledError) {
      post({
        type: "audit-error",
        message: "Scan cancelled. The previous results, if any, are unchanged.",
        canRetry: true,
      });
      return;
    }

    if (error instanceof ScanScopeError) {
      post({ type: "audit-error", message: error.message, canRetry: true });
      return;
    }

    post({
      type: "audit-error",
      message:
        error instanceof Error
          ? `The audit could not finish: ${error.message}`
          : "The audit could not finish because of an unknown error.",
      canRetry: true,
    });
  } finally {
    scanning = false;
  }
}

async function navigateToNode(nodeId: string): Promise<void> {
  try {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
      post({
        type: "navigated",
        ok: false,
        message: "That layer no longer exists in the file.",
      });
      return;
    }

    if (node.type === "DOCUMENT" || node.type === "PAGE") {
      post({
        type: "navigated",
        ok: false,
        message: "The source is a page, not a layer.",
      });
      return;
    }

    let parent: BaseNode | null = node.parent;
    let page: PageNode | null = null;
    while (parent) {
      if (parent.type === "PAGE") {
        page = parent;
        break;
      }
      parent = parent.parent;
    }

    if (page && page !== figma.currentPage) {
      const dynamicFigma = figma as typeof figma & {
        setCurrentPageAsync?: (target: PageNode) => Promise<void>;
      };
      if (dynamicFigma.setCurrentPageAsync) {
        await dynamicFigma.setCurrentPageAsync(page);
      } else {
        figma.currentPage = page;
      }
    }

    const sceneNode = node as SceneNode;
    figma.currentPage.selection = [sceneNode];
    figma.viewport.scrollAndZoomIntoView([sceneNode]);

    post({
      type: "navigated",
      ok: true,
      message: `Selected "${node.name}" on the canvas.`,
    });
  } catch (error) {
    post({
      type: "navigated",
      ok: false,
      message:
        error instanceof Error
          ? `Could not navigate to the layer: ${error.message}`
          : "Could not navigate to the layer.",
    });
  }
}

async function clearHistory(): Promise<void> {
  try {
    await figma.clientStorage.deleteAsync(storageKey());
    await sendInit();
    post({
      type: "toast",
      tone: "info",
      message: "Comparison history cleared.",
    });
  } catch {
    post({
      type: "toast",
      tone: "error",
      message: "Comparison history could not be cleared.",
    });
  }
}

figma.ui.onmessage = async (raw: unknown) => {
  const message = raw as UiToPluginMessage;
  if (!message || typeof message !== "object" || !("type" in message)) return;

  switch (message.type) {
    case "ui-ready":
      await sendInit();
      break;
    case "run-audit":
      await runScan(message.scope);
      break;
    case "cancel":
      if (scanning) {
        cancelled = true;
        post({
          type: "toast",
          tone: "info",
          message: "Cancelling after the current batch...",
        });
      }
      break;
    case "navigate":
      await navigateToNode(message.nodeId);
      break;
    case "refresh-inventory":
      await sendInit();
      break;
    case "clear-history":
      await clearHistory();
      break;
  }
};

figma.on("selectionchange", () => {
  const selection = selectionState();
  post({
    type: "selection-changed",
    selectionCount: selection.count,
    selectionNames: selection.names,
  });
});
