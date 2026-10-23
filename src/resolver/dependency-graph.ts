import type {
  DesignAsset,
  StyleInfo,
  VariableInfo,
} from "../model/design-asset";
import { isVariableAliasValue } from "../model/normalized-node";

export interface DependencyEdge {
  from: string;
  to: string;
  kind: "alias" | "style-variable" | "variant-of" | "reference";
  detail?: string;
}

export interface DependencyGraph {
  nodes: Map<string, DesignAsset>;
  edges: DependencyEdge[];
  outgoing: Map<string, DependencyEdge[]>;
}

export function buildDependencyGraph(
  assets: DesignAsset[],
  variables: VariableInfo[],
  styles: StyleInfo[],
): DependencyGraph {
  const nodes = new Map(assets.map((asset) => [asset.id, asset]));
  const edges: DependencyEdge[] = [];

  for (const variable of variables) {
    const seen = new Set<string>();
    for (const [modeId, value] of Object.entries(variable.valuesByMode)) {
      if (!isVariableAliasValue(value)) continue;
      const key = `${variable.id}->${value.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({
        from: variable.id,
        to: value.id,
        kind: "alias",
        detail: `mode ${modeId}`,
      });
    }
  }

  for (const style of styles) {
    if (style.paint?.variableId) {
      edges.push({
        from: style.id,
        to: style.paint.variableId,
        kind: "style-variable",
        detail: "paint style uses a color variable",
      });
    }
  }

  for (const asset of assets) {
    if (asset.kind === "variant" && asset.componentSetId) {
      edges.push({
        from: asset.id,
        to: asset.componentSetId,
        kind: "variant-of",
        detail: "variant belongs to a component set",
      });
    }
  }

  const outgoing = new Map<string, DependencyEdge[]>();
  for (const edge of edges) {
    const list = outgoing.get(edge.from) ?? [];
    list.push(edge);
    outgoing.set(edge.from, list);
  }

  return { nodes, edges, outgoing };
}

export function getAsset(
  graph: DependencyGraph,
  assetId: string,
): DesignAsset | undefined {
  return graph.nodes.get(assetId);
}

export function traceDependencyPath(
  graph: DependencyGraph,
  fromId: string,
  maxDepth = 6,
): { assetId: string; name: string }[] {
  const path: { assetId: string; name: string }[] = [];
  const seen = new Set<string>();

  function visit(assetId: string, depth: number): void {
    if (depth > maxDepth || seen.has(assetId)) return;
    seen.add(assetId);
    const asset = graph.nodes.get(assetId);
    if (!asset) return;
    path.push({ assetId, name: asset.name });
    const firstEdge = graph.outgoing.get(assetId)?.[0];
    if (firstEdge) visit(firstEdge.to, depth + 1);
  }

  visit(fromId, 0);
  return path;
}

export function tracePathBetween(
  graph: DependencyGraph,
  fromId: string,
  targetId: string,
  maxDepth = 8,
): string[] | null {
  const queue: { id: string; path: string[] }[] = [{ id: fromId, path: [] }];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    if (current.id === targetId) return current.path;
    if (current.path.length >= maxDepth || seen.has(current.id)) continue;
    seen.add(current.id);

    for (const edge of graph.outgoing.get(current.id) ?? []) {
      queue.push({ id: edge.to, path: [...current.path, edge.to] });
    }
  }

  return null;
}
