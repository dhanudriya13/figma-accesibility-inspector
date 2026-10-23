import { describe, expect, it } from "vitest";
import type { NormalizedDesignModel } from "../../src/model/normalized-node";
import {
  buildModeContexts,
  createRuleContext,
} from "../../src/rules/context";
import { runNonTextContrastRule } from "../../src/rules/non-text-contrast";
import { runTargetSizeRule } from "../../src/rules/target-size";
import {
  frameNode,
  gradient,
  makeModel,
  makeNode,
  solid,
} from "../fixtures/model";

function runNonText(model: NormalizedDesignModel) {
  const mode = buildModeContexts(model).contexts[0]!;
  return runNonTextContrastRule(createRuleContext(model, mode));
}

function runTarget(model: NormalizedDesignModel) {
  const mode = buildModeContexts(model).contexts[0]!;
  return runTargetSizeRule(createRuleContext(model, mode));
}

describe("non-text contrast rule", () => {
  it("fails a white control surface on a white background", () => {
    const card = frameNode("card", "Card", { fill: "#ffffff" });
    const button = frameNode("button", "Button/Primary", {
      parentId: "card",
      fill: "#ffffff",
      bounds: { x: 20, y: 20, width: 120, height: 44 },
    });
    const model = makeModel([card, button]);
    const findings = runNonText(model);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      status: "fail",
      severity: "serious",
      confidence: "medium",
    });
  });

  it("passes a control surface with sufficient contrast", () => {
    const card = frameNode("card", "Card", { fill: "#ffffff" });
    const button = frameNode("button", "Button/Primary", {
      parentId: "card",
      fill: "#000000",
      bounds: { x: 20, y: 20, width: 120, height: 44 },
    });
    const model = makeModel([card, button]);
    const findings = runNonText(model);

    expect(findings[0]?.status).toBe("pass");
  });

  it("evaluates an icon against the control fill behind it", () => {
    const card = frameNode("card", "Card", { fill: "#ffffff" });
    const button = frameNode("button", "Button/Primary", {
      parentId: "card",
      fill: "#ffffff",
      bounds: { x: 20, y: 20, width: 120, height: 44 },
    });
    const icon = makeNode({
      id: "icon",
      name: "Icon/Search",
      type: "VECTOR",
      parentId: "button",
      fills: [solid("#000000")],
      bounds: { x: 40, y: 30, width: 24, height: 24 },
    });
    const model = makeModel([card, button, icon]);
    const findings = runNonText(model);

    const buttonFinding = findings.find((finding) => finding.nodeId === "button");
    const iconFinding = findings.find((finding) => finding.nodeId === "icon");

    expect(buttonFinding?.status).toBe("fail");
    expect(iconFinding?.status).toBe("pass");
  });

  it("skips a nested non-graphic control wrapper", () => {
    const card = frameNode("card", "Card", { fill: "#ffffff" });
    const button = frameNode("button", "Button/Primary", {
      parentId: "card",
      fill: "#000000",
      bounds: { x: 20, y: 20, width: 120, height: 44 },
    });
    const content = frameNode("content", "Button content", {
      parentId: "button",
      fill: "#000000",
      bounds: { x: 24, y: 24, width: 110, height: 36 },
    });
    const model = makeModel([card, button, content]);
    const findings = runNonText(model);

    expect(findings.some((finding) => finding.nodeId === "content")).toBe(false);
  });

  it("uses a stroke when it provides the boundary", () => {
    const card = frameNode("card", "Card", { fill: "#ffffff" });
    const button = makeNode({
      id: "button",
      name: "Button/Outline",
      type: "FRAME",
      parentId: "card",
      fills: [solid("#ffffff")],
      strokes: [solid("#000000")],
      strokeWeight: 1,
      bounds: { x: 20, y: 20, width: 120, height: 44 },
    });
    const model = makeModel([card, button]);
    const findings = runNonText(model);

    expect(findings[0]?.status).toBe("pass");
  });

  it("marks a boundary paint with a blend mode as needs review", () => {
    const card = frameNode("card", "Card", { fill: "#ffffff" });
    const button = makeNode({
      id: "button",
      name: "Button/Blended",
      type: "FRAME",
      parentId: "card",
      fills: [solid("#000000", { blendMode: "MULTIPLY" })],
      bounds: { x: 20, y: 20, width: 120, height: 44 },
    });
    const model = makeModel([card, button]);
    const findings = runNonText(model);

    expect(findings[0]?.status).toBe("needs-review");
    expect(findings[0]?.limitations.join(" ")).toContain("blend mode");
  });

  it("marks an unsupported gradient boundary as needs review", () => {
    const card = frameNode("card", "Card", { fill: "#ffffff" });
    const button = makeNode({
      id: "button",
      name: "Button/Gradient",
      type: "FRAME",
      parentId: "card",
      fills: [gradient()],
      bounds: { x: 20, y: 20, width: 120, height: 44 },
    });
    const model = makeModel([card, button]);
    const findings = runNonText(model);

    expect(findings[0]?.status).toBe("needs-review");
  });
});

describe("target size rule", () => {
  it("flags an undersized candidate for review", () => {
    const button = frameNode("button", "Button/Primary", {
      fill: "#000000",
      bounds: { x: 20, y: 20, width: 20, height: 20 },
    });
    const model = makeModel([button]);
    const findings = runTarget(model);

    expect(findings[0]).toMatchObject({
      status: "needs-review",
      severity: "moderate",
      measuredValue: "20 x 20",
      threshold: "24 x 24 CSS px",
    });
  });

  it("reduces severity when the spacing exception may apply", () => {
    const first = frameNode("first", "Button/First", {
      fill: "#000000",
      bounds: { x: 20, y: 20, width: 20, height: 20 },
    });
    const second = frameNode("second", "Button/Second", {
      fill: "#000000",
      bounds: { x: 60, y: 20, width: 20, height: 20 },
    });
    const model = makeModel([first, second]);
    const findings = runTarget(model);
    const firstFinding = findings.find((finding) => finding.nodeId === "first");

    expect(firstFinding?.severity).toBe("minor");
    expect(firstFinding?.evidence.join(" ")).toContain("spacing exception");
  });

  it("passes targets that meet the minimum geometry", () => {
    const button = frameNode("button", "Button/Primary", {
      fill: "#000000",
      bounds: { x: 20, y: 20, width: 32, height: 32 },
    });
    const model = makeModel([button]);
    const findings = runTarget(model);

    expect(findings[0]?.status).toBe("pass");
  });

  it("does not treat an icon inside a control as a separate target", () => {
    const button = frameNode("button", "Button/Primary", {
      fill: "#000000",
      bounds: { x: 20, y: 20, width: 44, height: 44 },
    });
    const icon = makeNode({
      id: "icon",
      name: "Icon/Search",
      type: "VECTOR",
      parentId: "button",
      fills: [solid("#ffffff")],
      bounds: { x: 30, y: 30, width: 12, height: 12 },
    });
    const model = makeModel([button, icon]);
    const findings = runTarget(model);

    expect(findings.some((finding) => finding.nodeId === "icon")).toBe(false);
    expect(findings.find((finding) => finding.nodeId === "button")?.status).toBe(
      "pass",
    );
  });
});
