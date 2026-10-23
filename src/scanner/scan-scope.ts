export type ScanScopeKind = "file" | "selection";

export interface ResolvedScanScope {
  kind: ScanScopeKind;
  pages: PageNode[];
  roots: SceneNode[];
  selectedIds: Set<string>;
  selectionNames: string[];
  label: string;
  notes: string[];
}

export class ScanScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScanScopeError";
  }
}

function selectionLabel(names: string[]): string {
  if (names.length === 1) return `Selection: "${names[0]}"`;
  if (names.length === 2) return `Selection: "${names[0]}" and "${names[1]}"`;
  return `Selection: "${names[0]}" and ${names.length - 1} more`;
}

export async function resolveScanScope(
  kind: ScanScopeKind,
): Promise<ResolvedScanScope> {
  if (kind === "file") {
    await figma.loadAllPagesAsync();
    const pages = figma.root.children.filter(
      (node): node is PageNode => node.type === "PAGE",
    );

    return {
      kind,
      pages,
      roots: pages.flatMap((page) => [...page.children]),
      selectedIds: new Set(),
      selectionNames: [],
      label: `Whole file (${pages.length} page${pages.length === 1 ? "" : "s"})`,
      notes: ["All pages were loaded and scanned."],
    };
  }

  if (figma.currentPage.selection.length === 0) {
    throw new ScanScopeError(
      "Select at least one layer on the canvas, or run a whole-file scan.",
    );
  }

  const selection = [...figma.currentPage.selection];
  const names = selection.map((node) => node.name);

  return {
    kind,
    pages: [figma.currentPage],
    roots: [...figma.currentPage.children],
    selectedIds: new Set(selection.map((node) => node.id)),
    selectionNames: names,
    label: selectionLabel(names),
    notes: [
      "The current page was scanned so ancestors and overlapping layers can be resolved; only the selected layers and their descendants are audited.",
    ],
  };
}
