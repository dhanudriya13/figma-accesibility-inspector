import { describe, expect, it } from "vitest";
import type { NormalizedDesignModel } from "../../src/model/normalized-node";
import {
  resolveBackground,
  type BackgroundResolverOptions,
} from "../../src/resolver/background-resolver";
import { colorKey } from "../../src/resolver/color-resolver";
import {
  buildVariableIndex,
  resolvePaintColor,
} from "../../src/resolver/variable-resolver";
import {
  frameNode,
  gradient,
  image,
  makeCollection,
  makeModel,
  makeNode,
  makeStyle,
  makeVariable,
  solid,
  textNode,
} from "../fixtures/model";

function resolverFor(
  model: NormalizedDesignModel,
  modesByCollection: Record<string, string> = {},
): BackgroundResolverOptions {
  const index = buildVariableIndex(model.variables, model.collections);
  const styles = new Map(model.styles.map((style) => [style.id, style]));
  return {
    resolvePaint: (paint) =>
      resolvePaintColor(paint, { index, styles, modesByCollection }),
  };
}

describe("background resolver", () => {
  it("resolves a solid ancestor fill", () => {
    const card = frameNode("card", "Card", { fill: "#ffffff" });
    const text = textNode("text", "Label", { parentId: "card" });
    const model = makeModel([card, text]);

    const result = resolveBackground(
      model,
      model.nodes.text!,
      resolverFor(model),
    );

    expect(result.status).toBe("resolved");
    expect(result.color && colorKey(result.color)).toBe("#ffffff");
    expect(result.sourceNodeId).toBe("card");
    expect(result.sourceNodeName).toBe("Card");
  });

  it("composites a solid sibling painted behind the text", () => {
    const group = frameNode("group", "Group", {
      bounds: { x: 0, y: 0, width: 400, height: 200 },
    });
    const background = makeNode({
      id: "background",
      name: "Background",
      type: "RECTANGLE",
      parentId: "group",
      fills: [solid("#000000")],
      bounds: { x: 0, y: 0, width: 400, height: 200 },
    });
    const text = textNode("text", "Label", { parentId: "group" });
    const model = makeModel([group, background, text]);

    const result = resolveBackground(
      model,
      model.nodes.text!,
      resolverFor(model),
    );

    expect(result.status).toBe("resolved");
    expect(result.color && colorKey(result.color)).toBe("#000000");
    expect(result.sourceNodeName).toBe("Background");
  });

  it("finds a page-level background rectangle", () => {
    const background = makeNode({
      id: "page-bg",
      name: "Page background",
      type: "RECTANGLE",
      fills: [solid("#123456")],
      bounds: { x: 0, y: 0, width: 800, height: 600 },
    });
    const text = textNode("text", "Label");
    const model = makeModel([background, text]);

    const result = resolveBackground(
      model,
      model.nodes.text!,
      resolverFor(model),
    );

    expect(result.status).toBe("resolved");
    expect(result.color && colorKey(result.color)).toBe("#123456");
  });

  it("reports a layer painted in front of the text as ambiguous", () => {
    const group = frameNode("group", "Group", {
      bounds: { x: 0, y: 0, width: 400, height: 200 },
    });
    const text = textNode("text", "Label", { parentId: "group" });
    const overlay = makeNode({
      id: "overlay",
      name: "Overlay",
      type: "RECTANGLE",
      parentId: "group",
      fills: [solid("#ffffff")],
      bounds: { x: 0, y: 0, width: 400, height: 200 },
    });
    const model = makeModel([group, text, overlay]);

    const result = resolveBackground(
      model,
      model.nodes.text!,
      resolverFor(model),
    );

    expect(result.status).toBe("ambiguous");
    expect(result.evidence.join(" ")).toContain("in front");
  });

  it("reports a gradient background as ambiguous", () => {
    const group = frameNode("group", "Group");
    const background = makeNode({
      id: "gradient",
      name: "Gradient",
      type: "RECTANGLE",
      parentId: "group",
      fills: [gradient()],
      bounds: { x: 0, y: 0, width: 400, height: 200 },
    });
    const text = textNode("text", "Label", { parentId: "group" });
    const model = makeModel([group, background, text]);

    const result = resolveBackground(
      model,
      model.nodes.text!,
      resolverFor(model),
    );

    expect(result.status).toBe("ambiguous");
    expect(result.limitations.join(" ")).toContain("background");
  });

  it("reports an image background as ambiguous", () => {
    const group = frameNode("group", "Group");
    const background = makeNode({
      id: "image",
      name: "Photo",
      type: "RECTANGLE",
      parentId: "group",
      fills: [image()],
      bounds: { x: 0, y: 0, width: 400, height: 200 },
    });
    const text = textNode("text", "Label", { parentId: "group" });
    const model = makeModel([group, background, text]);

    const result = resolveBackground(
      model,
      model.nodes.text!,
      resolverFor(model),
    );

    expect(result.status).toBe("ambiguous");
  });

  it("reports an undefined canvas background as ambiguous", () => {
    const text = textNode("text", "Label");
    const model = makeModel([text]);

    const result = resolveBackground(
      model,
      model.nodes.text!,
      resolverFor(model),
    );

    expect(result.status).toBe("ambiguous");
    expect(result.evidence.join(" ")).toContain("opaque background");
  });

  it("does not guess through ancestor opacity", () => {
    const card = frameNode("card", "Card", {
      fill: "#ffffff",
      opacity: 0.5,
    });
    const text = textNode("text", "Label", { parentId: "card" });
    const model = makeModel([card, text]);

    const result = resolveBackground(
      model,
      model.nodes.text!,
      resolverFor(model),
    );

    expect(result.status).toBe("ambiguous");
    expect(result.evidence.join(" ")).toContain("opacity");
  });

  it("resolves variable-bound backgrounds per mode", () => {
    const collection = makeCollection("collection:colors", "Colors", [
      { modeId: "mode:light", name: "Light" },
      { modeId: "mode:dark", name: "Dark" },
    ]);
    const surface = makeVariable("var:surface", "surface/default", collection.id, {
      "mode:light": { r: 1, g: 1, b: 1, a: 1 },
      "mode:dark": { r: 0, g: 0, b: 0, a: 1 },
    });
    const card = frameNode("card", "Card", {
      fillPaint: solid("#ffffff", { variableId: surface.id }),
    });
    const text = textNode("text", "Label", { parentId: "card" });
    const model = makeModel([card, text], {
      variables: [surface],
      collections: [collection],
    });

    const light = resolveBackground(model, model.nodes.text!, resolverFor(model, {
      [collection.id]: "mode:light",
    }));
    const dark = resolveBackground(model, model.nodes.text!, resolverFor(model, {
      [collection.id]: "mode:dark",
    }));

    expect(light.status).toBe("resolved");
    expect(light.color && colorKey(light.color)).toBe("#ffffff");
    expect(light.sources[0]?.assetId).toBe(surface.id);
    expect(dark.status).toBe("resolved");
    expect(dark.color && colorKey(dark.color)).toBe("#000000");
  });

  it("flags a background that does not fully cover the text bounds", () => {
    const card = frameNode("card", "Tight card", {
      fill: "#ffffff",
      bounds: { x: 0, y: 0, width: 100, height: 60 },
    });
    const text = textNode("text", "Long label", {
      parentId: "card",
      bounds: { x: 20, y: 20, width: 200, height: 30 },
    });
    const model = makeModel([card, text]);

    const result = resolveBackground(
      model,
      model.nodes.text!,
      resolverFor(model),
    );

    expect(result.status).toBe("ambiguous");
    expect(result.evidence.join(" ")).toContain("fully cover");
  });

  it("reports a missing variable background as unsupported", () => {
    const card = frameNode("card", "Card", {
      fillPaint: solid("#ffffff", { variableId: "var:missing" }),
    });
    const text = textNode("text", "Label", { parentId: "card" });
    const model = makeModel([card, text]);

    const result = resolveBackground(
      model,
      model.nodes.text!,
      resolverFor(model),
    );

    expect(result.status).toBe("unsupported");
  });

  it("uses a paint style as a background source", () => {
    const style = makeStyle("style:surface", "Surface/Default", "#eeeeee");
    const card = frameNode("card", "Card", {
      fillPaint: solid("#eeeeee", { styleId: style.id }),
    });
    const text = textNode("text", "Label", { parentId: "card" });
    const model = makeModel([card, text], { styles: [style] });

    const result = resolveBackground(
      model,
      model.nodes.text!,
      resolverFor(model),
    );

    expect(result.status).toBe("resolved");
    expect(result.sources[0]?.kind).toBe("style");
    expect(result.sources[0]?.name).toBe("Surface/Default");
  });
});
