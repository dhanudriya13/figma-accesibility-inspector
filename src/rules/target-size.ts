import type { AuditFinding, Severity } from "../model/finding";
import { RULES, findingKey } from "../model/finding";
import type { NormalizedNode } from "../model/normalized-node";
import type { RuleContext } from "./context";
import {
  componentCause,
  estimateReach,
  hasInteractiveAncestor,
  isInteractiveCandidate,
} from "./shared";

const RULE = RULES["wcag-2.5.8-target-size"]!;
const MIN_SIZE = 24;
const SPACING = 24;

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function center(node: NormalizedNode): { x: number; y: number } {
  return {
    x: node.bounds.x + node.bounds.width / 2,
    y: node.bounds.y + node.bounds.height / 2,
  };
}

function distance(
  first: NormalizedNode,
  second: NormalizedNode,
): number {
  const firstCenter = center(first);
  const secondCenter = center(second);
  return Math.hypot(
    firstCenter.x - secondCenter.x,
    firstCenter.y - secondCenter.y,
  );
}

function nearestCandidate(
  node: NormalizedNode,
  candidates: NormalizedNode[],
): { node: NormalizedNode; distance: number } | undefined {
  let nearest: { node: NormalizedNode; distance: number } | undefined;

  for (const candidate of candidates) {
    if (candidate.id === node.id) continue;
    const gap = distance(node, candidate);
    if (!nearest || gap < nearest.distance) {
      nearest = { node: candidate, distance: gap };
    }
  }

  return nearest;
}

function severityFor(
  status: "pass" | "needs-review",
  spacingQualifies: boolean,
): Severity {
  if (status === "pass") return "info";
  return spacingQualifies ? "minor" : "moderate";
}

export function runTargetSizeRule(context: RuleContext): AuditFinding[] {
  const candidates = context.model.nodeOrder
    .map((nodeId) => context.model.nodes[nodeId])
    .filter((node): node is NormalizedNode => {
      if (!node || !node.inScope || !node.effectiveVisible) return false;
      if (!isInteractiveCandidate(node)) return false;
      return !hasInteractiveAncestor(context.model, node);
    });

  const findings: AuditFinding[] = [];

  for (const node of candidates) {
    const tooSmall =
      node.bounds.width < MIN_SIZE - 0.5 ||
      node.bounds.height < MIN_SIZE - 0.5;
    const nearest = nearestCandidate(node, candidates);
    const spacingQualifies =
      nearest !== undefined && nearest.distance >= SPACING - 0.5;

    const measured = `${round(node.bounds.width)} x ${round(node.bounds.height)}`;
    const status = tooSmall ? "needs-review" : "pass";
    const evidence = [
      `Layer "${node.name}" was treated as a likely interactive target because its name or component name matches a control term.`,
      `Measured geometry ${measured} in Figma units.`,
      tooSmall
        ? `The layer is below the ${MIN_SIZE} x ${MIN_SIZE} CSS pixel minimum in at least one dimension.`
        : `The layer meets the ${MIN_SIZE} x ${MIN_SIZE} CSS pixel minimum in Figma geometry.`,
    ];

    if (nearest) {
      evidence.push(
        `Nearest interactive candidate "${nearest.node.name}" is ${round(nearest.distance)}px away center-to-center.`,
      );
      if (tooSmall) {
        evidence.push(
          spacingQualifies
            ? "The measured spacing is at least 24px, so the spacing exception may apply."
            : "The measured spacing is below 24px, so the spacing exception is unlikely to apply.",
        );
      }
    }

    const causes = [
      componentCause(context, node, { includeInstances: true }),
    ].filter((cause): cause is NonNullable<typeof cause> => cause !== undefined);

    findings.push({
      id: findingKey({
        ruleId: RULE.id,
        nodeId: node.id,
        propertyPath: "bounds",
      }),
      key: findingKey({
        ruleId: RULE.id,
        nodeId: node.id,
        propertyPath: "bounds",
      }),
      ruleId: RULE.id,
      ruleName: RULE.name,
      status,
      severity: severityFor(status, spacingQualifies),
      title: tooSmall
        ? `Small target candidate on "${node.name}"`
        : `Target size on "${node.name}"`,
      description: RULE.description,
      helpUrl: RULE.helpUrl,
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      pageId: node.pageId,
      pageName: node.pageName,
      propertyPath: "bounds",
      measuredValue: measured,
      threshold: `${MIN_SIZE} x ${MIN_SIZE} CSS px`,
      evidence,
      confidence: "low",
      rootCauseIds: [],
      causes,
      limitations: [
        "Figma geometry is not proof of the implemented CSS pixel size, zoom, or responsive behavior.",
        "The interactive role is inferred from naming and component structure.",
        "Only a center-to-center spacing proxy was used; the full spacing exception considers the target's actual hit area and neighboring targets.",
        ...(spacingQualifies
          ? [
              "The layer may qualify for the spacing exception, so this is reported for review rather than as a definite failure.",
            ]
          : []),
      ],
      estimatedReach: estimateReach(context.model, context.assets, node),
    });
  }

  return findings;
}
