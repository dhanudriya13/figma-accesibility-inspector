import { describe, expect, it } from "vitest";
import type { DesignAsset } from "../../src/model/design-asset";
import type { NormalizedDesignModel } from "../../src/model/normalized-node";
import { analyzeRootCauses } from "../../src/engine/root-cause";
import {
  buildModeContexts,
  createRuleContext,
} from "../../src/rules/context";
import { runContrastRule } from "../../src/rules/contrast-minimum";
import {
  frameNode,
  makeCollection,
  makeModel,
  makeVariable,
  solid,
  textNode,
} from "../fixtures/model";

function contrastFindings(model: NormalizedDesignModel) {
  const mode = buildModeContexts(model).contexts[0]!;
  return runContrastRule(createRuleContext(model, mode));
}

describe("root cause analysis", () => {
  it("groups findings that share a verified variable binding", () => {
    const collection = makeCollection("collection:colors", "Colors", [
      { modeId: "mode:light", name: "Light" },
    ]);
    const ink = makeVariable("var:ink", "text/muted", collection.id, {
      "mode:light": { r: 0.4667, g: 0.4667, b: 0.4667, a: 1 },
    });
    const card = frameNode("card", "Card", { fill: "#ffffff" });
    const first = textNode("first", "First label", {
      parentId: "card",
      fillPaint: solid("#777777", { variableId: ink.id }),
      bounds: { x: 20, y: 20, width: 180, height: 24 },
    });
    const second = textNode("second", "Second label", {
      parentId: "card",
      fillPaint: solid("#777777", { variableId: ink.id }),
      bounds: { x: 20, y: 60, width: 180, height: 24 },
    });
    const model = makeModel([card, first, second], {
      variables: [ink],
      collections: [collection],
    });

    const findings = contrastFindings(model);
    const result = analyzeRootCauses(model, findings);

    expect(findings.every((finding) => finding.status === "fail")).toBe(true);
    expect(result.rootCauses).toHaveLength(1);
    expect(result.rootCauses[0]).toMatchObject({
      kind: "variable",
      name: "text/muted",
      estimatedReach: 2,
    });
    expect(result.rootCauses[0]?.affectedFindingIds).toHaveLength(2);
    expect(findings.every((finding) => finding.rootCauseIds.length === 1)).toBe(
      true,
    );
    expect(result.similarityHints).toHaveLength(0);
  });

  it("does not group findings by matching values alone", () => {
    const card = frameNode("card", "Card", { fill: "#ffffff" });
    const first = textNode("first", "First label", {
      parentId: "card",
      color: "#777777",
      bounds: { x: 20, y: 20, width: 180, height: 24 },
    });
    const second = textNode("second", "Second label", {
      parentId: "card",
      color: "#777777",
      bounds: { x: 20, y: 60, width: 180, height: 24 },
    });
    const model = makeModel([card, first, second]);

    const findings = contrastFindings(model);
    const result = analyzeRootCauses(model, findings);

    expect(result.rootCauses).toHaveLength(0);
    expect(result.similarityHints.length).toBeGreaterThan(0);
    expect(result.similarityHints[0]?.message).toContain("not confirmed");
    expect(findings.every((finding) => finding.rootCauseIds.length === 0)).toBe(
      true,
    );
  });

  it("groups component-level findings and uses the instance count as reach", () => {
    const component = frameNode("component:button", "Button", {
      fill: "#ffffff",
      bounds: { x: 0, y: 0, width: 200, height: 80 },
    });
    component.type = "COMPONENT";
    component.isComponentDefinition = true;

    const text = textNode("text", "Button label", {
      parentId: "component:button",
      color: "#777777",
    });
    const asset: DesignAsset = {
      id: "component:button",
      kind: "component",
      name: "Button",
      sourceNodeId: "component:button",
      dependencies: [],
      instanceCount: 3,
    };
    const model = makeModel([component, text], { assets: [asset] });

    const findings = contrastFindings(model);
    const result = analyzeRootCauses(model, findings);

    const componentCause = findings[0]?.causes.find(
      (cause) => cause.assetId === "component:button",
    );
    expect(componentCause).toBeDefined();
    expect(result.rootCauses[0]).toMatchObject({
      kind: "component",
      name: "Button",
      estimatedReach: 3,
    });
  });

  it("keeps distinct variable sources separate and adds a similarity hint", () => {
    const collection = makeCollection("collection:colors", "Colors", [
      { modeId: "mode:light", name: "Light" },
    ]);
    const firstVariable = makeVariable("var:first", "text/first", collection.id, {
      "mode:light": { r: 0.4667, g: 0.4667, b: 0.4667, a: 1 },
    });
    const secondVariable = makeVariable(
      "var:second",
      "text/second",
      collection.id,
      {
        "mode:light": { r: 0.4667, g: 0.4667, b: 0.4667, a: 1 },
      },
    );
    const card = frameNode("card", "Card", { fill: "#ffffff" });
    const first = textNode("first", "First label", {
      parentId: "card",
      fillPaint: solid("#777777", { variableId: firstVariable.id }),
      bounds: { x: 20, y: 20, width: 180, height: 24 },
    });
    const second = textNode("second", "Second label", {
      parentId: "card",
      fillPaint: solid("#777777", { variableId: secondVariable.id }),
      bounds: { x: 20, y: 60, width: 180, height: 24 },
    });
    const model = makeModel([card, first, second], {
      variables: [firstVariable, secondVariable],
      collections: [collection],
    });

    const findings = contrastFindings(model);
    const result = analyzeRootCauses(model, findings);

    expect(result.rootCauses).toHaveLength(2);
    expect(result.similarityHints.length).toBeGreaterThan(0);
  });
});
