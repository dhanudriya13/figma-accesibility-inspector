import { describe, expect, it } from "vitest";
import type { DesignAsset } from "../../src/model/design-asset";
import {
  buildDependencyGraph,
  traceDependencyPath,
  tracePathBetween,
} from "../../src/resolver/dependency-graph";
import {
  makeStyle,
  makeVariable,
  solid,
} from "../fixtures/model";

const collectionId = "collection:colors";
const base = makeVariable("var:base", "core/base", collectionId, {
  "mode:light": { r: 0, g: 0, b: 0, a: 1 },
});
const alias = makeVariable("var:alias", "text/default", collectionId, {
  "mode:light": { type: "VARIABLE_ALIAS", id: base.id },
});
const style = makeStyle("style:text", "Text/Default", "#000000", {
  paint: solid("#000000", { variableId: alias.id }),
});
const assets: DesignAsset[] = [
  { id: base.id, kind: "variable", name: base.name, dependencies: [] },
  { id: alias.id, kind: "variable", name: alias.name, dependencies: [base.id] },
  { id: style.id, kind: "style", name: style.name, dependencies: [alias.id] },
  {
    id: "component:set",
    kind: "component",
    name: "Button",
    dependencies: [],
  },
  {
    id: "component:variant",
    kind: "variant",
    name: "Button/Primary",
    dependencies: ["component:set"],
    componentSetId: "component:set",
  },
];

describe("dependency graph", () => {
  it("builds alias, style, and variant edges", () => {
    const graph = buildDependencyGraph(assets, [base, alias], [style]);
    expect(
      graph.edges.some(
        (edge) =>
          edge.from === alias.id && edge.to === base.id && edge.kind === "alias",
      ),
    ).toBe(true);
    expect(
      graph.edges.some(
        (edge) =>
          edge.from === style.id &&
          edge.to === alias.id &&
          edge.kind === "style-variable",
      ),
    ).toBe(true);
    expect(
      graph.edges.some(
        (edge) =>
          edge.from === "component:variant" &&
          edge.to === "component:set" &&
          edge.kind === "variant-of",
      ),
    ).toBe(true);
  });

  it("traces a path from a style to the underlying variable", () => {
    const graph = buildDependencyGraph(assets, [base, alias], [style]);
    const path = traceDependencyPath(graph, style.id);

    expect(path.map((step) => step.assetId)).toEqual([
      style.id,
      alias.id,
      base.id,
    ]);
    expect(tracePathBetween(graph, style.id, base.id)).toEqual([
      alias.id,
      base.id,
    ]);
  });
});
