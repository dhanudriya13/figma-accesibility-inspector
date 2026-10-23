import { describe, expect, it } from "vitest";
import type { NormalizedDesignModel } from "../../src/model/normalized-node";
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

function runAll(model: NormalizedDesignModel) {
  const contexts = buildModeContexts(model).contexts;
  return contexts.flatMap((mode) =>
    runContrastRule(createRuleContext(model, mode)),
  );
}

describe("text contrast rule", () => {
  it("passes black text on white", () => {
    const card = frameNode("card", "Card", { fill: "#ffffff" });
    const text = textNode("text", "Label", {
      parentId: "card",
      color: "#000000",
    });
    const model = makeModel([card, text]);
    const findings = runAll(model);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      status: "pass",
      measuredValue: 21,
      threshold: 4.5,
      confidence: "high",
    });
    expect(findings[0]?.evidence.join(" ")).toContain("4.5:1");
  });

  it("fails #777777 text on white at the normal-text threshold", () => {
    const card = frameNode("card", "Card", { fill: "#ffffff" });
    const text = textNode("text", "Muted label", {
      parentId: "card",
      color: "#777777",
    });
    const model = makeModel([card, text]);
    const findings = runAll(model);

    expect(findings[0]).toMatchObject({
      status: "fail",
      severity: "serious",
      threshold: 4.5,
    });
    expect(findings[0]?.measuredValue).toBe(4.48);
  });

  it("uses the 3:1 threshold for large text", () => {
    const card = frameNode("card", "Card", { fill: "#ffffff" });
    const text = textNode("text", "Large heading", {
      parentId: "card",
      color: "#777777",
      fontSize: 24,
      fontWeight: 400,
    });
    const model = makeModel([card, text]);
    const findings = runAll(model);

    expect(findings[0]).toMatchObject({
      status: "pass",
      threshold: 3,
    });
  });

  it("marks unresolved backgrounds as needs review", () => {
    const text = textNode("text", "Label", { color: "#000000" });
    const model = makeModel([text]);
    const findings = runAll(model);

    expect(findings[0]).toMatchObject({
      status: "needs-review",
      severity: "moderate",
      measuredValue: "unresolved",
    });
    expect(findings[0]?.limitations.length).toBeGreaterThan(0);
  });

  it("evaluates each variable mode separately", () => {
    const collection = makeCollection("collection:colors", "Colors", [
      { modeId: "mode:light", name: "Light" },
      { modeId: "mode:dark", name: "Dark" },
    ]);
    const surface = makeVariable("var:surface", "surface/default", collection.id, {
      "mode:light": { r: 1, g: 1, b: 1, a: 1 },
      "mode:dark": { r: 0, g: 0, b: 0, a: 1 },
    });
    const ink = makeVariable("var:ink", "text/default", collection.id, {
      "mode:light": { r: 0, g: 0, b: 0, a: 1 },
      "mode:dark": { r: 0.2, g: 0.2, b: 0.2, a: 1 },
    });
    const card = frameNode("card", "Card", {
      fillPaint: solid("#ffffff", { variableId: surface.id }),
    });
    const text = textNode("text", "Label", {
      parentId: "card",
      fillPaint: solid("#000000", { variableId: ink.id }),
    });
    const model = makeModel([card, text], {
      variables: [surface, ink],
      collections: [collection],
    });

    const findings = runAll(model);
    expect(findings).toHaveLength(2);

    const light = findings.find((finding) =>
      finding.modeName?.includes("Light"),
    );
    const dark = findings.find((finding) =>
      finding.modeName?.includes("Dark"),
    );

    expect(light?.status).toBe("pass");
    expect(dark?.status).toBe("fail");
  });

  it("does not claim a verdict when the text paint uses a blend mode", () => {
    const card = frameNode("card", "Card", { fill: "#ffffff" });
    const text = textNode("text", "Blended label", {
      parentId: "card",
      fillPaint: solid("#000000", { blendMode: "MULTIPLY" }),
    });
    const model = makeModel([card, text]);
    const findings = runAll(model);

    expect(findings[0]?.status).toBe("needs-review");
    expect(findings[0]?.limitations.join(" ")).toContain("Blend mode");
  });

  it("composites text layer opacity before measuring", () => {
    const card = frameNode("card", "Card", { fill: "#ffffff" });
    const text = textNode("text", "Faded label", {
      parentId: "card",
      color: "#000000",
      opacity: 0.5,
    });
    const model = makeModel([card, text]);
    const findings = runAll(model);

    expect(findings[0]?.status).toBe("fail");
    expect(findings[0]?.confidence).toBe("medium");
    expect(findings[0]?.evidence.join(" ")).toContain("opacity");
  });

  it("uses the stricter threshold when font weight is unavailable", () => {
    const card = frameNode("card", "Card", { fill: "#ffffff" });
    const text = textNode("text", "Heading", {
      parentId: "card",
      color: "#777777",
      fontSize: 20,
    });
    delete text.text?.fontWeight;
    const model = makeModel([card, text]);
    const findings = runAll(model);

    expect(findings[0]).toMatchObject({
      status: "fail",
      threshold: 4.5,
    });
    expect(findings[0]?.limitations.join(" ")).toContain("weight");
  });

  it("records a text style cause", () => {
    const card = frameNode("card", "Card", { fill: "#ffffff" });
    const text = textNode("text", "Label", {
      parentId: "card",
      color: "#000000",
      textStyleId: "style:text",
    });
    const model = makeModel([card, text], {
      styles: [
        {
          id: "style:text",
          name: "Body/Default",
          key: "style:text",
          type: "TEXT",
          remote: false,
        },
      ],
    });
    const findings = runAll(model);

    expect(findings[0]?.causes.some((cause) => cause.name === "Body/Default")).toBe(
      true,
    );
  });
});
