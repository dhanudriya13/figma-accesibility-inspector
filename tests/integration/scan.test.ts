import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { discoverDesignModel } from "../../src/scanner/discover-assets";
import { runAudit } from "../../src/engine/audit-engine";

const mixed = Symbol("mixed");

function paint(hex: string) {
  const value = hex.replace("#", "");
  return {
    type: "SOLID",
    color: {
      r: parseInt(value.slice(0, 2), 16) / 255,
      g: parseInt(value.slice(2, 4), 16) / 255,
      b: parseInt(value.slice(4, 6), 16) / 255,
    },
    visible: true,
    opacity: 1,
    blendMode: "NORMAL",
  };
}

function baseNode(
  id: string,
  name: string,
  type: string,
  parent: unknown,
  bounds: { x: number; y: number; width: number; height: number },
): Record<string, any> {
  return {
    id,
    name,
    type,
    parent,
    visible: true,
    opacity: 1,
    blendMode: "NORMAL",
    absoluteBoundingBox: { ...bounds },
    absoluteTransform: [
      [1, 0, bounds.x],
      [0, 1, bounds.y],
    ],
    width: bounds.width,
    height: bounds.height,
    fills: [],
    strokes: [],
    effects: [],
    strokeWeight: 1,
    strokeAlign: "INSIDE",
    cornerRadius: 0,
    clipsContent: false,
    isMask: false,
    children: [],
  };
}

function textNode(
  id: string,
  name: string,
  parent: unknown,
  color: string,
  bounds: { x: number; y: number; width: number; height: number },
) {
  return {
    ...baseNode(id, name, "TEXT", parent, bounds),
    fills: [paint(color)],
    characters: name,
    fontSize: 16,
    fontWeight: 400,
    fontName: { family: "Inter", style: "Regular" },
    lineHeight: { unit: "AUTO" },
    letterSpacing: { unit: "PIXELS", value: 0 },
    textCase: "ORIGINAL",
    textAlignHorizontal: "LEFT",
    textAutoResize: "NONE",
  };
}

function createFigmaMock() {
  const page: Record<string, unknown> = {
    id: "page:1",
    name: "Page 1",
    type: "PAGE",
    children: [],
  };
  const card = baseNode("card", "Card", "FRAME", page, {
    x: 0,
    y: 0,
    width: 400,
    height: 220,
  });
  const muted = textNode("muted", "Muted label", card, "#777777", {
    x: 20,
    y: 20,
    width: 200,
    height: 24,
  });
  const good = textNode("good", "Good label", card, "#000000", {
    x: 20,
    y: 60,
    width: 200,
    height: 24,
  });
  const button = baseNode("button", "Button/Primary", "FRAME", card, {
    x: 20,
    y: 100,
    width: 120,
    height: 44,
  });
  const buttonLabel = textNode("button-label", "Button label", button, "#ffffff", {
    x: 30,
    y: 112,
    width: 100,
    height: 20,
  });

  card.fills = [paint("#ffffff")];
  button.fills = [paint("#000000")];
  card.children = [muted, good, button];
  button.children = [buttonLabel];
  page.children = [card];

  return {
    mixed,
    root: { id: "0:0", name: "Mock file", type: "DOCUMENT", children: [page] },
    currentPage: page,
    fileKey: "mock-file-key",
    loadAllPagesAsync: async () => undefined,
    variables: {
      getLocalVariableCollectionsAsync: async () => [],
      getLocalVariablesAsync: async () => [],
    },
    getLocalPaintStylesAsync: async () => [],
    getLocalTextStylesAsync: async () => [],
  };
}

describe("scanner integration", () => {
  beforeAll(() => {
    vi.stubGlobal("figma", createFigmaMock());
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("adapts a mock Figma file and produces an evidence-based run", async () => {
    const model = await discoverDesignModel("file");

    expect(model.documentName).toBe("Mock file");
    expect(model.scope.kind).toBe("file");
    expect(model.scope.includedNodeCount).toBeGreaterThanOrEqual(5);
    expect(model.nodes.muted).toMatchObject({
      type: "TEXT",
      inScope: true,
      parentId: "card",
      pageName: "Page 1",
    });
    expect(model.nodes.card?.childIds).toEqual(["muted", "good", "button"]);

    const run = runAudit(model, { id: "integration-run" });
    const muted = run.findings.find(
      (finding) =>
        finding.ruleId === "wcag-1.4.3-text-contrast" &&
        finding.nodeId === "muted",
    );
    const good = run.findings.find(
      (finding) =>
        finding.ruleId === "wcag-1.4.3-text-contrast" &&
        finding.nodeId === "good",
    );

    expect(muted?.status).toBe("fail");
    expect(muted?.measuredValue).toBe(4.48);
    expect(good?.status).toBe("pass");
    expect(run.stats.nodesScanned).toBeGreaterThanOrEqual(5);
    expect(run.limitations.join(" ")).toContain("static Figma evidence");
  });
});
