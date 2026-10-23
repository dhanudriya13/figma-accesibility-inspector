import type {
  DesignAsset,
  StyleInfo,
  VariableCollectionInfo,
  VariableInfo,
  VariableValue,
} from "../../src/model/design-asset";
import type { RGBA } from "../../src/model/color";
import type {
  NormalizedDesignModel,
  NormalizedNode,
  NormalizedPaint,
  NormalizedTextProperties,
} from "../../src/model/normalized-node";
import type {
  AuditRun,
  AuditSnapshot,
  AuditSummary,
  RootCause,
} from "../../src/model/audit-run";
import type {
  AuditFinding,
  AuditStatus,
  Severity,
} from "../../src/model/finding";
import { hexToRgba } from "../../src/resolver/color-resolver";

export const PAGE_ID = "page:1";
export const PAGE_NAME = "Page 1";

export function solid(
  hex: string,
  options: Partial<NormalizedPaint> = {},
): NormalizedPaint {
  return {
    status: "solid",
    visible: true,
    opacity: 1,
    blendMode: "NORMAL",
    color: hexToRgba(hex),
    ...options,
  };
}

export function gradient(): NormalizedPaint {
  return {
    status: "gradient",
    visible: true,
    opacity: 1,
    blendMode: "NORMAL",
    gradientType: "GRADIENT_LINEAR",
    gradientStops: [
      { position: 0, color: hexToRgba("#000000") },
      { position: 1, color: hexToRgba("#ffffff") },
    ],
  };
}

export function image(): NormalizedPaint {
  return {
    status: "image",
    visible: true,
    opacity: 1,
    blendMode: "NORMAL",
    imageHash: "image-hash",
  };
}

export function makeNode(
  partial: Partial<NormalizedNode> & { id: string; name: string; type: string },
): NormalizedNode {
  return {
    pageId: PAGE_ID,
    pageName: PAGE_NAME,
    parentId: PAGE_ID,
    path: partial.name,
    inScope: true,
    visible: true,
    effectiveVisible: true,
    opacity: 1,
    effectiveOpacity: 1,
    blendMode: "NORMAL",
    bounds: { x: 0, y: 0, width: 100, height: 100 },
    boundsReliable: true,
    clipsContent: false,
    isMask: false,
    hasVisibleEffects: false,
    effectTypes: [],
    fills: [],
    strokes: [],
    isInstance: false,
    isComponentDefinition: false,
    isVariant: false,
    childIds: [],
    ...partial,
  };
}

export function frameNode(
  id: string,
  name: string,
  options: {
    parentId?: string;
    fill?: string;
    fillPaint?: NormalizedPaint;
    bounds?: NormalizedNode["bounds"];
    opacity?: number;
  } = {},
): NormalizedNode {
  const fills = options.fillPaint
    ? [options.fillPaint]
    : options.fill
      ? [solid(options.fill)]
      : [];

  return makeNode({
    id,
    name,
    type: "FRAME",
    parentId: options.parentId ?? PAGE_ID,
    fills,
    bounds: options.bounds ?? { x: 0, y: 0, width: 400, height: 200 },
    opacity: options.opacity ?? 1,
    effectiveOpacity: options.opacity ?? 1,
  });
}

export function textNode(
  id: string,
  name: string,
  options: {
    parentId?: string;
    text?: string;
    color?: string;
    fillPaint?: NormalizedPaint;
    fontSize?: number;
    fontWeight?: number;
    bounds?: NormalizedNode["bounds"];
    inScope?: boolean;
    opacity?: number;
    hasVisibleEffects?: boolean;
    textStyleId?: string;
  } = {},
): NormalizedNode {
  const text: NormalizedTextProperties = {
    characters: options.text ?? "Sample text",
    fontSize: options.fontSize ?? 16,
    fontWeight: options.fontWeight ?? 400,
  };

  return makeNode({
    id,
    name,
    type: "TEXT",
    parentId: options.parentId ?? PAGE_ID,
    fills: [
      options.fillPaint ?? solid(options.color ?? "#000000"),
    ],
    text,
    bounds: options.bounds ?? { x: 20, y: 20, width: 180, height: 24 },
    inScope: options.inScope ?? true,
    opacity: options.opacity ?? 1,
    effectiveOpacity: options.opacity ?? 1,
    hasVisibleEffects: options.hasVisibleEffects ?? false,
    textStyleId: options.textStyleId,
  });
}

export function makeCollection(
  id: string,
  name: string,
  modes: { modeId: string; name: string }[],
  defaultModeId = modes[0]?.modeId ?? "mode:default",
): VariableCollectionInfo {
  return {
    id,
    name,
    key: id,
    modes,
    defaultModeId,
    remote: false,
  };
}

export function makeVariable(
  id: string,
  name: string,
  collectionId: string,
  valuesByMode: Record<string, VariableValue>,
  options: Partial<VariableInfo> = {},
): VariableInfo {
  return {
    id,
    name,
    key: id,
    collectionId,
    collectionName: options.collectionName ?? "Colors",
    resolvedType: "COLOR",
    valuesByMode,
    remote: false,
    ...options,
  };
}

export function makeStyle(
  id: string,
  name: string,
  color: string,
  options: Partial<StyleInfo> = {},
): StyleInfo {
  return {
    id,
    name,
    key: id,
    type: "PAINT",
    paint: solid(color),
    remote: false,
    ...options,
  };
}

export interface ModelOptions {
  variables?: VariableInfo[];
  collections?: VariableCollectionInfo[];
  styles?: StyleInfo[];
  assets?: DesignAsset[];
}

export function makeModel(
  inputNodes: NormalizedNode[],
  options: ModelOptions = {},
): NormalizedDesignModel {
  const nodes: Record<string, NormalizedNode> = {};
  const nodeOrder: string[] = [];
  const pageChildren: string[] = [];

  for (const node of inputNodes) {
    nodes[node.id] = { ...node, childIds: [] };
    nodeOrder.push(node.id);
  }

  for (const nodeId of nodeOrder) {
    const node = nodes[nodeId];
    if (!node) continue;
    if (!node.parentId || node.parentId === node.pageId) {
      pageChildren.push(nodeId);
      continue;
    }
    const parent = nodes[node.parentId];
    if (!parent) {
      pageChildren.push(nodeId);
      continue;
    }
    parent.childIds.push(nodeId);
  }

  const assets =
    options.assets ??
    [
      ...(options.variables ?? []).map(
        (variable): DesignAsset => ({
          id: variable.id,
          kind: "variable",
          name: variable.name,
          variableId: variable.id,
          collectionId: variable.collectionId,
          collectionName: variable.collectionName,
          dependencies: Object.values(variable.valuesByMode)
            .filter(
              (value): value is { type: "VARIABLE_ALIAS"; id: string } =>
                Boolean(
                  value &&
                    typeof value === "object" &&
                    (value as { type?: string }).type === "VARIABLE_ALIAS",
                ),
            )
            .map((value) => value.id),
        }),
      ),
      ...(options.styles ?? []).map(
        (style): DesignAsset => ({
          id: style.id,
          kind: "style",
          name: style.name,
          styleId: style.id,
          dependencies: style.paint?.variableId
            ? [style.paint.variableId]
            : [],
        }),
      ),
    ];

  const textCount = inputNodes.filter((node) => node.type === "TEXT").length;
  const frameCount = inputNodes.filter(
    (node) => node.type === "FRAME" || node.type === "SECTION",
  ).length;
  const instanceCount = inputNodes.filter((node) => node.isInstance).length;
  const componentCount = inputNodes.filter(
    (node) => node.type === "COMPONENT",
  ).length;
  const componentSetCount = inputNodes.filter(
    (node) => node.type === "COMPONENT_SET",
  ).length;
  const variantCount = inputNodes.filter((node) => node.isVariant).length;

  return {
    documentName: "Fixture",
    pages: [{ id: PAGE_ID, name: PAGE_NAME }],
    scope: {
      kind: "file",
      label: "Whole file (1 page)",
      pageIds: [PAGE_ID],
      pageNames: [PAGE_NAME],
      includedNodeCount: inputNodes.filter((node) => node.inScope).length,
      selectionNames: [],
      selectionCount: 0,
      skipped: [],
      notes: [],
    },
    nodes,
    nodeOrder,
    pageChildren: { [PAGE_ID]: pageChildren },
    variables: options.variables ?? [],
    collections: options.collections ?? [],
    styles: options.styles ?? [],
    assets,
    warnings: [],
    limitations: [],
    inventory: {
      nodes: inputNodes.length,
      frames: frameCount,
      textNodes: textCount,
      instances: instanceCount,
      components: componentCount,
      componentSets: componentSetCount,
      variants: variantCount,
      variables: options.variables?.length ?? 0,
      variableCollections: options.collections?.length ?? 0,
      paintStyles: (options.styles ?? []).filter(
        (style) => style.type === "PAINT",
      ).length,
      textStyles: (options.styles ?? []).filter(
        (style) => style.type === "TEXT",
      ).length,
    },
  };
}

const EMPTY_SUMMARY: AuditSummary = {
  total: 0,
  actionable: 0,
  byStatus: {
    pass: 0,
    fail: 0,
    "needs-review": 0,
    "not-evaluated": 0,
  },
  bySeverity: {
    critical: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
    info: 0,
  },
  byRule: [],
  rootCauseCount: 0,
  affectedNodeCount: 0,
  modeContextCount: 0,
};

export function makeFinding(
  partial: Partial<AuditFinding> & {
    id: string;
    ruleId: string;
    status: AuditStatus;
    nodeName?: string;
  },
): AuditFinding {
  const severity: Severity = partial.severity ?? "serious";
  return {
    ...partial,
    id: partial.id,
    key: partial.key ?? partial.id,
    ruleId: partial.ruleId,
    ruleName: partial.ruleName ?? "Text contrast",
    title: partial.title ?? `Finding ${partial.nodeName ?? partial.id}`,
    description: partial.description ?? "Test finding",
    status: partial.status,
    severity,
    nodeId: partial.nodeId ?? "node:1",
    nodeName: partial.nodeName ?? "Node 1",
    evidence: partial.evidence ?? [],
    confidence: partial.confidence ?? "high",
    rootCauseIds: partial.rootCauseIds ?? [],
    causes: partial.causes ?? [],
    limitations: partial.limitations ?? [],
    estimatedReach: partial.estimatedReach ?? 1,
  };
}

export function makeRun(
  findings: AuditFinding[],
  options: {
    id?: string;
    startedAt?: string;
    scopeKind?: "file" | "selection";
    rootCauses?: RootCause[];
    comparison?: AuditRun["comparison"];
  } = {},
): AuditRun {
  const byStatus: AuditSummary["byStatus"] = {
    pass: 0,
    fail: 0,
    "needs-review": 0,
    "not-evaluated": 0,
  };
  for (const finding of findings) byStatus[finding.status] += 1;

  return {
    schemaVersion: "1.0",
    id: options.id ?? "audit-current",
    startedAt: options.startedAt ?? "2026-10-23T10:00:00.000Z",
    finishedAt: "2026-10-23T10:00:01.000Z",
    pluginVersion: "0.1.0",
    ruleSetVersion: "test",
    scope: {
      kind: options.scopeKind ?? "file",
      label: "Whole file (1 page)",
      pageIds: [PAGE_ID],
      pageNames: [PAGE_NAME],
      includedNodeCount: 1,
      selectionNames: [],
      selectionCount: 0,
      skipped: [],
      notes: [],
    },
    findings,
    rootCauses: options.rootCauses ?? [],
    similarityHints: [],
    summary: {
      ...EMPTY_SUMMARY,
      total: findings.length,
      actionable: byStatus.fail + byStatus["needs-review"],
      byStatus,
    },
    stats: {
      nodesScanned: 1,
      nodesInScope: 1,
      textNodesAudited: 0,
      variablesDiscovered: 0,
      stylesDiscovered: 0,
      componentsDiscovered: 0,
      instancesDiscovered: 0,
      durationMs: 10,
    },
    modes: [],
    warnings: [],
    limitations: [],
    comparison: options.comparison,
  };
}

export function snapshot(findings: AuditFinding[]): AuditSnapshot {
  return {
    version: 1,
    auditId: "audit-previous",
    startedAt: "2026-10-22T09:00:00.000Z",
    scopeKind: "file",
    scopeLabel: "Whole file (1 page)",
    findings: findings.map((finding) => ({
      key: finding.key,
      ruleId: finding.ruleId,
      ruleName: finding.ruleName,
      status: finding.status,
      severity: finding.severity,
      nodeId: finding.nodeId,
      nodeName: finding.nodeName,
      modeName: finding.modeName,
      measuredValue: finding.measuredValue,
    })),
  };
}

export function rgba(hex: string): RGBA {
  return hexToRgba(hex);
}
