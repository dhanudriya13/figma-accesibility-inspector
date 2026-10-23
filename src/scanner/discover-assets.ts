import type {
  DesignAsset,
  StyleInfo,
  VariableCollectionInfo,
  VariableInfo,
  VariableValue,
} from "../model/design-asset";
import type {
  NormalizedDesignModel,
  NormalizedNode,
  NormalizedTextProperties,
} from "../model/normalized-node";
import { isRgba, isVariableAliasValue } from "../model/normalized-node";
import type { ScanScopeKind } from "./scan-scope";
import { resolveScanScope } from "./scan-scope";
import { adaptNode } from "./node-adapters";
import { toRgba } from "../resolver/color-resolver";
import { readPaints } from "./node-adapters";

export interface DiscoveryProgress {
  phase: string;
  message: string;
  current?: number;
  total?: number;
}

export interface DiscoveryHooks {
  onProgress?: (progress: DiscoveryProgress) => void;
  isCancelled?: () => boolean;
}

export class ScanCancelledError extends Error {
  constructor() {
    super("Scan cancelled.");
    this.name = "ScanCancelledError";
  }
}

export interface InventorySummary {
  documentName: string;
  pageCount: number;
  variables: number;
  variableCollections: number;
  paintStyles: number;
  textStyles: number;
  modes: number;
  warnings: string[];
}

interface SharedAssets {
  variables: VariableInfo[];
  collections: VariableCollectionInfo[];
  paintStyles: StyleInfo[];
  textStyles: StyleInfo[];
  warnings: string[];
}

interface TraversalEntry {
  node: SceneNode;
  page: PageNode;
  parentId: string | null;
  parentPath: string;
  inScope: boolean;
  inheritedVisible: boolean;
  inheritedOpacity: number;
}

interface SkippedDraft {
  reason: string;
  count: number;
  examples: { id: string; name: string; type: string }[];
}

class SkippedAccumulator {
  private groups = new Map<string, SkippedDraft>();

  add(reason: string, node: NormalizedNode): void {
    let group = this.groups.get(reason);
    if (!group) {
      group = { reason, count: 0, examples: [] };
      this.groups.set(reason, group);
    }
    group.count += 1;
    if (group.examples.length < 12) {
      group.examples.push({ id: node.id, name: node.name, type: node.type });
    }
  }

  addEntry(reason: string, node: SceneNode): void {
    let group = this.groups.get(reason);
    if (!group) {
      group = { reason, count: 0, examples: [] };
      this.groups.set(reason, group);
    }
    group.count += 1;
    if (group.examples.length < 12) {
      group.examples.push({ id: node.id, name: node.name, type: node.type });
    }
  }

  values(): SkippedDraft[] {
    return [...this.groups.values()].filter((group) => group.count > 0);
  }
}

function safeRootName(): string {
  try {
    return figma.root.name;
  } catch {
    return "Untitled file";
  }
}

function normalizeVariableValue(value: unknown): VariableValue {
  if (value === null || value === undefined) return null;
  if (isVariableAliasValue(value)) {
    return { type: "VARIABLE_ALIAS", id: value.id };
  }
  if (isRgba(value)) {
    return toRgba(value);
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  return null;
}

function fontWeightFromStyleName(style: string): number | undefined {
  const name = style.toLowerCase();
  if (/\b(thin|hairline)\b/.test(name)) return 100;
  if (/\b(extra light|ultra light)\b/.test(name)) return 200;
  if (/\b(light)\b/.test(name)) return 300;
  if (/\b(regular|normal|book)\b/.test(name)) return 400;
  if (/\b(medium)\b/.test(name)) return 500;
  if (/\b(semi bold|semibold|demi bold)\b/.test(name)) return 600;
  if (/\b(extra bold|ultra bold)\b/.test(name)) return 800;
  if (/\b(black|heavy)\b/.test(name)) return 900;
  if (/\b(bold)\b/.test(name)) return 700;
  return undefined;
}

function styleTextProperties(style: TextStyle): NormalizedTextProperties {
  const fontWeight = fontWeightFromStyleName(style.fontName.style);
  return {
    characters: "",
    fontSize: style.fontSize,
    fontWeight,
    fontFamily: style.fontName.family,
    lineHeight: style.lineHeight
      ? {
          unit: style.lineHeight.unit,
          value:
            "value" in style.lineHeight ? style.lineHeight.value : undefined,
        }
      : undefined,
    letterSpacing: {
      unit: style.letterSpacing.unit,
      value: style.letterSpacing.value,
    },
    textCase: style.textCase,
  };
}

async function discoverSharedAssets(): Promise<SharedAssets> {
  const warnings: string[] = [];
  let collections: VariableCollectionInfo[] = [];
  let variables: VariableInfo[] = [];
  let paintStyles: StyleInfo[] = [];
  let textStyles: StyleInfo[] = [];

  try {
    const rawCollections =
      await figma.variables.getLocalVariableCollectionsAsync();
    collections = rawCollections.map((collection) => ({
      id: collection.id,
      name: collection.name,
      key: collection.key,
      modes: collection.modes.map((mode) => ({
        modeId: mode.modeId,
        name: mode.name,
      })),
      defaultModeId: collection.defaultModeId,
      remote: Boolean((collection as { remote?: boolean }).remote),
    }));
  } catch (error) {
    warnings.push(
      `Variable collections could not be read: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    const rawVariables = await figma.variables.getLocalVariablesAsync();
    variables = rawVariables.map((variable) => {
      const valuesByMode: Record<string, VariableValue> = {};
      for (const [modeId, value] of Object.entries(variable.valuesByMode)) {
        valuesByMode[modeId] = normalizeVariableValue(value);
      }

      return {
        id: variable.id,
        name: variable.name,
        key: variable.key,
        collectionId: variable.variableCollectionId,
        collectionName:
          collections.find(
            (collection) => collection.id === variable.variableCollectionId,
          )?.name ?? variable.variableCollectionId,
        resolvedType: variable.resolvedType,
        valuesByMode,
        description: variable.description,
        hiddenFromPublishing: Boolean(
          (variable as { hiddenFromPublishing?: boolean })
            .hiddenFromPublishing,
        ),
        scopes: (variable as { scopes?: string[] }).scopes,
        remote: Boolean((variable as { remote?: boolean }).remote),
      };
    });
  } catch (error) {
    warnings.push(
      `Variables could not be read: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    const rawPaintStyles = await figma.getLocalPaintStylesAsync();
    paintStyles = rawPaintStyles.map((style) => {
      const paints = readPaints(style.paints);
      const paint = [...paints].reverse().find((item) => item.visible);
      return {
        id: style.id,
        name: style.name,
        key: style.key,
        type: "PAINT",
        description: style.description,
        paint,
        remote: Boolean((style as { remote?: boolean }).remote),
      };
    });
  } catch (error) {
    warnings.push(
      `Paint styles could not be read: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    const rawTextStyles = await figma.getLocalTextStylesAsync();
    textStyles = rawTextStyles.map((style) => ({
      id: style.id,
      name: style.name,
      key: style.key,
      type: "TEXT",
      description: style.description,
      text: styleTextProperties(style),
      remote: Boolean((style as { remote?: boolean }).remote),
    }));
  } catch (error) {
    warnings.push(
      `Text styles could not be read: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return { variables, collections, paintStyles, textStyles, warnings };
}

export async function getInventorySummary(): Promise<InventorySummary> {
  const warnings: string[] = [];
  let variables = 0;
  let variableCollections = 0;
  let paintStyles = 0;
  let textStyles = 0;
  let modes = 0;

  try {
    const [collections, localVariables, localPaintStyles, localTextStyles] =
      await Promise.all([
        figma.variables.getLocalVariableCollectionsAsync(),
        figma.variables.getLocalVariablesAsync(),
        figma.getLocalPaintStylesAsync(),
        figma.getLocalTextStylesAsync(),
      ]);
    variableCollections = collections.length;
    variables = localVariables.length;
    modes = collections.reduce(
      (total, collection) => total + collection.modes.length,
      0,
    );
    paintStyles = localPaintStyles.length;
    textStyles = localTextStyles.length;
  } catch (error) {
    warnings.push(
      `Some local assets could not be inventoried: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  let pageCount = 0;
  try {
    pageCount = figma.root.children.filter((node) => node.type === "PAGE").length;
  } catch {
    pageCount = 0;
  }

  return {
    documentName: safeRootName(),
    pageCount,
    variables,
    variableCollections,
    paintStyles,
    textStyles,
    modes,
    warnings,
  };
}

function collectTraversalEntries(
  scope: Awaited<ReturnType<typeof resolveScanScope>>,
): TraversalEntry[] {
  const entries: TraversalEntry[] = [];
  const fileScope = scope.kind === "file";

  for (const page of scope.pages) {
    for (const root of page.children) {
    const stack: TraversalEntry[] = [
      {
        node: root,
        page,
        parentId: root.parent?.id ?? null,
        parentPath: "",
        inScope: fileScope || scope.selectedIds.has(root.id),
        inheritedVisible: true,
        inheritedOpacity: 1,
      },
    ];

    while (stack.length > 0) {
      const entry = stack.pop();
      if (!entry) break;
      entries.push(entry);

      if (!("children" in entry.node)) continue;
      const children = [...entry.node.children].reverse();
      for (const child of children) {
        stack.push({
          node: child,
          page: entry.page,
          parentId: entry.node.id,
          parentPath: entry.parentPath
            ? `${entry.parentPath} > ${entry.node.name}`
            : entry.node.name,
          inScope:
            fileScope ||
            entry.inScope ||
            scope.selectedIds.has(child.id),
          inheritedVisible:
            entry.inheritedVisible && entry.node.visible,
          inheritedOpacity:
            entry.inheritedOpacity *
            ("opacity" in entry.node && typeof entry.node.opacity === "number"
              ? entry.node.opacity
              : 1),
        });
      }
    }
    }
  }

  return entries;
}

function buildVariableAssets(
  variables: VariableInfo[],
): DesignAsset[] {
  return variables.map((variable) => {
    const dependencies = new Set<string>();
    for (const value of Object.values(variable.valuesByMode)) {
      if (isVariableAliasValue(value)) dependencies.add(value.id);
    }

    return {
      id: variable.id,
      kind: "variable",
      name: variable.name,
      collectionId: variable.collectionId,
      collectionName: variable.collectionName,
      variableId: variable.id,
      dependencies: [...dependencies],
      modes: [],
      description: variable.description,
    };
  });
}

function buildStyleAssets(styles: StyleInfo[]): DesignAsset[] {
  return styles.map((style) => ({
    id: style.id,
    kind: "style",
    name: style.name,
    styleId: style.id,
    dependencies: style.paint?.variableId ? [style.paint.variableId] : [],
    description: style.description,
  }));
}

function buildComponentAssets(
  nodes: Record<string, NormalizedNode>,
  nodeOrder: string[],
  instanceCounts: Map<string, number>,
): DesignAsset[] {
  const assets: DesignAsset[] = [];

  for (const nodeId of nodeOrder) {
    const node = nodes[nodeId];
    if (!node || !node.isComponentDefinition) continue;

    let instanceCount = instanceCounts.get(node.id) ?? 0;
    let variantCount = 0;

    if (node.type === "COMPONENT_SET") {
      const variants = Object.values(nodes).filter(
        (candidate) =>
          candidate.type === "COMPONENT" && candidate.componentSetId === node.id,
      );
      variantCount = variants.length;
      instanceCount = variants.reduce(
        (total, variant) => total + (instanceCounts.get(variant.id) ?? 0),
        0,
      );
    }

    assets.push({
      id: node.id,
      kind: node.isVariant ? "variant" : "component",
      name: node.name,
      sourceNodeId: node.id,
      dependencies: node.componentSetId ? [node.componentSetId] : [],
      componentId: node.id,
      componentSetId: node.componentSetId,
      pageId: node.pageId,
      pageName: node.pageName,
      path: node.path,
      instanceCount,
      variantCount,
    });
  }

  return assets;
}

function buildFrameAssets(
  nodes: Record<string, NormalizedNode>,
  pageChildren: Record<string, string[]>,
): DesignAsset[] {
  const assets: DesignAsset[] = [];

  for (const [pageId, childIds] of Object.entries(pageChildren)) {
    for (const nodeId of childIds) {
      const node = nodes[nodeId];
      if (!node) continue;
      if (node.type !== "FRAME" && node.type !== "SECTION") continue;
      assets.push({
        id: node.id,
        kind: "frame",
        name: node.name,
        sourceNodeId: node.id,
        dependencies: [],
        pageId,
        pageName: node.pageName,
        path: node.path,
      });
    }
  }

  return assets;
}

export async function discoverDesignModel(
  scopeKind: ScanScopeKind,
  hooks: DiscoveryHooks = {},
): Promise<NormalizedDesignModel> {
  hooks.onProgress?.({
    phase: "scope",
    message: "Resolving scan scope...",
  });
  const scope = await resolveScanScope(scopeKind);

  hooks.onProgress?.({
    phase: "assets",
    message: "Discovering variables, styles, and modes...",
  });
  const shared = await discoverSharedAssets();

  hooks.onProgress?.({
    phase: "nodes",
    message: "Walking the document...",
    current: 0,
    total: scope.roots.length,
  });

  const entries = collectTraversalEntries(scope);
  const nodes: Record<string, NormalizedNode> = {};
  const nodeOrder: string[] = [];
  const pageChildren: Record<string, string[]> = {};
  const instanceCounts = new Map<string, number>();
  const skipped = new SkippedAccumulator();
  const warnings = [...shared.warnings];
  const inventory = {
    nodes: entries.length,
    frames: 0,
    textNodes: 0,
    instances: 0,
    components: 0,
    componentSets: 0,
    variants: 0,
    variables: shared.variables.length,
    variableCollections: shared.collections.length,
    paintStyles: shared.paintStyles.length,
    textStyles: shared.textStyles.length,
  };
  let includedNodeCount = 0;

  for (const page of scope.pages) {
    pageChildren[page.id] = [...page.children].map((node) => node.id);
  }

  const batchSize = 40;

  for (let index = 0; index < entries.length; index += batchSize) {
    if (hooks.isCancelled?.()) throw new ScanCancelledError();
    if (index > 0 && index % (batchSize * 5) === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const batch = entries.slice(index, index + batchSize);
    const adapted = await Promise.all(
      batch.map(async (entry) => {
        try {
          return {
            entry,
            node: await adaptNode(entry.node, {
              page: entry.page,
              parentId: entry.parentId,
              parentPath: entry.parentPath,
              inScope: entry.inScope,
              inheritedVisible: entry.inheritedVisible,
              inheritedOpacity: entry.inheritedOpacity,
            }),
          };
        } catch (error) {
          return {
            entry,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );

    for (const result of adapted) {
      if (!result.node) {
        skipped.addEntry("Layers that could not be read", result.entry.node);
        if (warnings.length < 16) {
          warnings.push(
            `Layer "${result.entry.node.name}" could not be read: ${result.error ?? "unknown error"}`,
          );
        }
        continue;
      }

      const node = result.node;
      nodes[node.id] = node;
      nodeOrder.push(node.id);

      if (node.inScope) includedNodeCount += 1;
      if (node.type === "TEXT") inventory.textNodes += 1;
      if (node.type === "FRAME" || node.type === "SECTION") inventory.frames += 1;
      if (node.type === "INSTANCE") inventory.instances += 1;
      if (node.type === "COMPONENT") inventory.components += 1;
      if (node.type === "COMPONENT_SET") inventory.componentSets += 1;
      if (node.isVariant) inventory.variants += 1;

      if (node.isInstance && node.mainComponentId) {
        instanceCounts.set(
          node.mainComponentId,
          (instanceCounts.get(node.mainComponentId) ?? 0) + 1,
        );
      }

      if (node.inScope) {
        if (!node.effectiveVisible) {
          skipped.add("Hidden layers", node);
        }
        if (
          [...node.fills, ...node.strokes].some(
            (paint) =>
              paint.visible &&
              (paint.status === "gradient" ||
                paint.status === "image" ||
                paint.status === "unsupported"),
          )
        ) {
          skipped.add("Gradient, image, or unsupported paint", node);
        }
        if (node.hasVisibleEffects) {
          skipped.add("Layers with visible effects", node);
        }
        if (node.isMask) {
          skipped.add("Masked layers", node);
        }
        if (
          node.type === "TEXT" &&
          node.text &&
          (node.text.fontSize === undefined ||
            node.text.fontWeight === undefined)
        ) {
          skipped.add("Mixed or unavailable text properties", node);
        }
      }
    }

    hooks.onProgress?.({
      phase: "nodes",
      message: `Inspected ${Math.min(index + batch.length, entries.length)} of ${entries.length} layers...`,
      current: Math.min(index + batch.length, entries.length),
      total: entries.length,
    });
  }

  inventory.nodes = nodeOrder.length;

  if (scope.kind === "selection") {
    for (const entry of entries) {
      if (!entry.inScope) {
        skipped.addEntry("Outside the selected scope", entry.node);
      }
    }
  }

  hooks.onProgress?.({
    phase: "assets",
    message: "Building the design model and dependency inventory...",
  });

  const assets: DesignAsset[] = [
    ...buildVariableAssets(shared.variables),
    ...buildStyleAssets([...shared.paintStyles, ...shared.textStyles]),
    ...buildComponentAssets(nodes, nodeOrder, instanceCounts),
    ...buildFrameAssets(nodes, pageChildren),
  ];

  for (const asset of assets) {
    if (asset.kind !== "variable") continue;
    const collection = shared.collections.find(
      (candidate) => candidate.id === asset.collectionId,
    );
    asset.modes = collection?.modes ?? [];
  }

  const limitations = [
    "Remote team-library variables, styles, and components were not loaded; only local assets are inventoried.",
    "Layer opacity, masks, gradients, images, and effects are handled conservatively. Affected findings are reported as needs review or not evaluated rather than as definite failures.",
    "Frames and text nodes are counted in the inventory; shared variables, styles, components, variants, and page-level frames are listed as design assets.",
    "The audit is read-only and does not modify the document.",
    ...scope.notes,
  ];

  return {
    documentName: safeRootName(),
    pages: scope.pages.map((page) => ({ id: page.id, name: page.name })),
    scope: {
      kind: scope.kind,
      label: scope.label,
      pageIds: scope.pages.map((page) => page.id),
      pageNames: scope.pages.map((page) => page.name),
      includedNodeCount,
      selectionNames: scope.selectionNames,
      selectionCount: scope.selectedIds.size,
      skipped: skipped.values(),
      notes: scope.notes,
    },
    nodes,
    nodeOrder,
    pageChildren,
    variables: shared.variables,
    collections: shared.collections,
    styles: [...shared.paintStyles, ...shared.textStyles],
    assets,
    warnings,
    limitations,
    inventory,
  };
}
