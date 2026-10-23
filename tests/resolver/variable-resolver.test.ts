import { describe, expect, it } from "vitest";
import {
  buildVariableIndex,
  resolvePaintColor,
  resolveVariableColor,
} from "../../src/resolver/variable-resolver";
import {
  makeCollection,
  makeStyle,
  makeVariable,
  solid,
} from "../fixtures/model";

const collection = makeCollection(
  "collection:colors",
  "Colors",
  [
    { modeId: "mode:light", name: "Light" },
    { modeId: "mode:dark", name: "Dark" },
  ],
  "mode:light",
);

const core = makeVariable("var:core", "core/ink", collection.id, {
  "mode:light": { r: 0, g: 0, b: 0, a: 1 },
  "mode:dark": { r: 1, g: 1, b: 1, a: 1 },
});

const alias = makeVariable("var:alias", "text/default", collection.id, {
  "mode:light": { type: "VARIABLE_ALIAS", id: core.id },
  "mode:dark": { type: "VARIABLE_ALIAS", id: core.id },
});

const outer = makeVariable("var:outer", "text/strong", collection.id, {
  "mode:light": { type: "VARIABLE_ALIAS", id: alias.id },
  "mode:dark": { type: "VARIABLE_ALIAS", id: alias.id },
});

const cycleA = makeVariable("var:cycle-a", "cycle/a", collection.id, {
  "mode:light": { type: "VARIABLE_ALIAS", id: "var:cycle-b" },
});
const cycleB = makeVariable("var:cycle-b", "cycle/b", collection.id, {
  "mode:light": { type: "VARIABLE_ALIAS", id: "var:cycle-a" },
});

const index = buildVariableIndex(
  [core, alias, outer, cycleA, cycleB],
  [collection],
);

describe("variable resolver", () => {
  it("resolves mode-specific values", () => {
    const light = resolveVariableColor(core.id, index, {
      [collection.id]: "mode:light",
    });
    const dark = resolveVariableColor(core.id, index, {
      [collection.id]: "mode:dark",
    });

    expect(light.status).toBe("resolved");
    expect(light.color).toMatchObject({ r: 0, g: 0, b: 0 });
    expect(light.modeName).toBe("Light");
    expect(dark.color).toMatchObject({ r: 1, g: 1, b: 1 });
    expect(dark.modeName).toBe("Dark");
  });

  it("follows alias chains and keeps the bound token as the source", () => {
    const result = resolveVariableColor(outer.id, index, {
      [collection.id]: "mode:light",
    });

    expect(result.status).toBe("resolved");
    expect(result.source?.assetId).toBe(outer.id);
    expect(result.dependencyPath).toEqual([
      "text/strong",
      "text/default",
      "core/ink",
    ]);
    expect(result.evidence.join(" ")).toContain("aliases");
  });

  it("detects alias cycles", () => {
    const result = resolveVariableColor(cycleA.id, index, {
      [collection.id]: "mode:light",
    });
    expect(result.status).toBe("cycle");
    expect(result.evidence.join(" ")).toContain("cycle");
  });

  it("reports remote or missing variables as unsupported", () => {
    const result = resolveVariableColor("var:missing", index, {});
    expect(result.status).toBe("unsupported");
    expect(result.limitations.join(" ")).toContain("team-library");
  });

  it("falls back to the collection default mode when a mode is not selected", () => {
    const result = resolveVariableColor(core.id, index, {});
    expect(result.status).toBe("resolved");
    expect(result.modeName).toBe("Light");
  });

  it("records a limitation when a requested mode is missing and the default is used", () => {
    const partial = makeVariable("var:partial", "partial/value", collection.id, {
      "mode:light": { r: 0, g: 0, b: 0, a: 1 },
    });
    const partialIndex = buildVariableIndex([partial], [collection]);
    const result = resolveVariableColor(partial.id, partialIndex, {
      [collection.id]: "mode:dark",
    });

    expect(result.status).toBe("resolved");
    expect(result.modeName).toBe("Light");
    expect(result.limitations.join(" ")).toContain("default mode");
  });

  it("resolves a paint style to its variable and records both names", () => {
    const style = makeStyle("style:surface", "Surface/Default", "#ffffff", {
      paint: solid("#ffffff", { variableId: core.id }),
    });
    const result = resolvePaintColor(
      solid("#ffffff", { styleId: style.id }),
      {
        index,
        styles: new Map([[style.id, style]]),
        modesByCollection: { [collection.id]: "mode:dark" },
      },
    );

    expect(result.status).toBe("resolved");
    expect(result.color).toMatchObject({ r: 1, g: 1, b: 1 });
    expect(result.source?.kind).toBe("style");
    expect(result.source?.name).toBe("Surface/Default");
    expect(result.dependencyPath).toEqual(["Surface/Default", "core/ink"]);
  });

  it("applies paint opacity", () => {
    const result = resolvePaintColor(
      solid("#000000", { opacity: 0.5 }),
      {
        index,
        styles: new Map(),
        modesByCollection: { [collection.id]: "mode:light" },
      },
    );

    expect(result.status).toBe("resolved");
    expect(result.color?.a).toBeCloseTo(0.5, 5);
  });

  it("does not reduce gradients to one color", () => {
    const result = resolvePaintColor(
      {
        status: "gradient",
        visible: true,
        opacity: 1,
        blendMode: "NORMAL",
        gradientType: "GRADIENT_LINEAR",
        gradientStops: [],
      },
      { index, styles: new Map(), modesByCollection: {} },
    );

    expect(result.status).toBe("unsupported");
    expect(result.limitations.join(" ")).toContain("gradient");
  });
});
