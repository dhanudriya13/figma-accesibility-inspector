import type { AssetRole, DesignAsset } from "../model/design-asset";
import type {
  AuditFinding,
  Confidence,
  Severity,
} from "../model/finding";
import { severityRank } from "../model/finding";
import type { NormalizedDesignModel } from "../model/normalized-node";
import type { RootCause, SimilarityHint } from "../model/audit-run";
import {
  buildDependencyGraph,
  traceDependencyPath,
} from "../resolver/dependency-graph";

interface RootCauseDraft {
  assetId: string;
  kind: RootCause["kind"];
  name: string;
  nodeId?: string;
  roles: Set<AssetRole>;
  affectedFindingIds: Set<string>;
  affectedNodeIds: Set<string>;
  dependencyPaths: string[][];
  evidence: Set<string>;
  severity: Severity;
  estimatedReach: number;
  confidence: Confidence;
  limitations: Set<string>;
}

const CONFIDENCE_RANK: Record<Confidence, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function worseConfidence(first: Confidence, second: Confidence): Confidence {
  return CONFIDENCE_RANK[second] > CONFIDENCE_RANK[first] ? second : first;
}

function actionable(finding: AuditFinding): boolean {
  return finding.status === "fail" || finding.status === "needs-review";
}

function assetById(
  assets: Map<string, DesignAsset>,
  id: string,
): DesignAsset | undefined {
  return assets.get(id);
}

function buildRootCauses(
  model: NormalizedDesignModel,
  findings: AuditFinding[],
): RootCause[] {
  const assets = new Map(model.assets.map((asset) => [asset.id, asset]));
  const dependencyGraph = buildDependencyGraph(
    model.assets,
    model.variables,
    model.styles,
  );
  const drafts = new Map<string, RootCauseDraft>();

  for (const finding of findings) {
    if (!actionable(finding)) continue;

    for (const cause of finding.causes) {
      const asset = assetById(assets, cause.assetId);
      let draft = drafts.get(cause.assetId);

      if (!draft) {
        draft = {
          assetId: cause.assetId,
          kind: cause.kind,
          name: asset?.name ?? cause.name,
          nodeId: asset?.sourceNodeId,
          roles: new Set(),
          affectedFindingIds: new Set(),
          affectedNodeIds: new Set(),
          dependencyPaths: [],
          evidence: new Set(),
          severity: finding.severity,
          estimatedReach: 0,
          confidence: finding.confidence,
          limitations: new Set(),
        };
        drafts.set(cause.assetId, draft);
      }

      if (cause.role) draft.roles.add(cause.role);
      draft.affectedFindingIds.add(finding.id);
      if (finding.nodeId) draft.affectedNodeIds.add(finding.nodeId);
      draft.evidence.add(cause.evidence);
      for (const limitation of finding.limitations) {
        draft.limitations.add(limitation);
      }
      const tracedPath = traceDependencyPath(
        dependencyGraph,
        cause.assetId,
      ).map((step) => step.name);
      const dependencyPath =
        cause.dependencyPath.length > 1
          ? cause.dependencyPath
          : tracedPath.length > 0
            ? tracedPath
            : cause.dependencyPath;
      if (
        !draft.dependencyPaths.some(
          (path) => path.join(">") === dependencyPath.join(">"),
        )
      ) {
        draft.dependencyPaths.push(dependencyPath);
      }
      if (severityRank(finding.severity) < severityRank(draft.severity)) {
        draft.severity = finding.severity;
      }
      draft.confidence = worseConfidence(draft.confidence, finding.confidence);
      draft.estimatedReach = Math.max(
        draft.estimatedReach,
        finding.estimatedReach,
        draft.affectedNodeIds.size,
        asset?.instanceCount ?? 0,
      );
    }
  }

  return [...drafts.values()]
    .map((draft) => {
      const id = `rc-${draft.assetId}`;
      const nodeNames = findings
        .filter(
          (finding) =>
            draft.affectedFindingIds.has(finding.id) && finding.nodeName,
        )
        .map((finding) => finding.nodeName)
        .filter((name, index, names): name is string => Boolean(name) && names.indexOf(name) === index)
        .slice(0, 6);

      return {
        id,
        assetId: draft.assetId,
        kind: draft.kind,
        name: draft.name,
        nodeId: draft.nodeId,
        roles: [...draft.roles].sort(),
        affectedFindingIds: [...draft.affectedFindingIds],
        affectedNodeIds: [...draft.affectedNodeIds],
        dependencyPaths: draft.dependencyPaths,
        evidence: [
          ...draft.evidence,
          `${draft.affectedFindingIds.size} finding(s) on ${draft.affectedNodeIds.size} layer(s) share this verified source.`,
          ...(nodeNames.length > 0
            ? [`Affected layers include ${nodeNames.join(", ")}.`]
            : []),
        ],
        severity: draft.severity,
        estimatedReach: Math.max(1, draft.estimatedReach),
        confidence: draft.confidence,
        limitations: [...draft.limitations],
      } satisfies RootCause;
    })
    .sort((first, second) => {
      const severity =
        severityRank(first.severity) - severityRank(second.severity);
      if (severity !== 0) return severity;
      return second.affectedFindingIds.length - first.affectedFindingIds.length;
    });
}

function buildSimilarityHints(findings: AuditFinding[]): SimilarityHint[] {
  const hints: SimilarityHint[] = [];
  const candidates = findings.filter(actionable);

  for (const field of ["foregroundColor", "backgroundColor"] as const) {
    const groups = new Map<string, AuditFinding[]>();

    for (const finding of candidates) {
      const color = finding[field];
      if (!color) continue;
      const list = groups.get(color) ?? [];
      list.push(finding);
      groups.set(color, list);
    }

    for (const [color, group] of groups) {
      if (group.length < 2) continue;

      const sharedRootCauses = group[0]?.rootCauseIds ?? [];
      const allShareRootCause =
        sharedRootCauses.length > 0 &&
        group.every((finding) =>
          sharedRootCauses.some((id) => finding.rootCauseIds.includes(id)),
        );
      if (allShareRootCause) continue;

      const nodeNames = group
        .map((finding) => finding.nodeName)
        .filter((name, index, names): name is string => Boolean(name) && names.indexOf(name) === index)
        .slice(0, 5);

      hints.push({
        color,
        findingIds: group.map((finding) => finding.id),
        nodeNames,
        message: `The same ${field === "foregroundColor" ? "foreground" : "background"} color ${color} appears in ${group.length} findings, but it is not confirmed as a shared source. Value similarity alone is not treated as a root cause.`,
      });
    }
  }

  return hints;
}

export function analyzeRootCauses(
  model: NormalizedDesignModel,
  findings: AuditFinding[],
): { rootCauses: RootCause[]; similarityHints: SimilarityHint[] } {
  const rootCauses = buildRootCauses(model, findings);
  const byFinding = new Map<string, string[]>();

  for (const cause of rootCauses) {
    for (const findingId of cause.affectedFindingIds) {
      const ids = byFinding.get(findingId) ?? [];
      ids.push(cause.id);
      byFinding.set(findingId, ids);
    }
  }

  for (const finding of findings) {
    finding.rootCauseIds = byFinding.get(finding.id) ?? [];
  }

  return {
    rootCauses,
    similarityHints: buildSimilarityHints(findings),
  };
}
