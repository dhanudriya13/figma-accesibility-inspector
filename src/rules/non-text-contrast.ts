import type { AuditFinding, Confidence, Severity } from "../model/finding";
import { RULES, findingKey } from "../model/finding";
import type { NormalizedPaint } from "../model/normalized-node";
import { resolveBackground } from "../resolver/background-resolver";
import {
  compositeOver,
  contrastRatio,
  formatColor,
  roundRatio,
} from "../resolver/color-resolver";
import type { ColorResolution } from "../resolver/variable-resolver";
import type { RuleContext } from "./context";
import {
  componentCause,
  estimateReach,
  hasInteractiveAncestor,
  isGraphicCandidate,
  isInteractiveCandidate,
  modeAppliesToSources,
  uniqueCauses,
  visiblePaints,
} from "./shared";

const RULE = RULES["wcag-1.4.11-non-text-contrast"]!;
const THRESHOLD = 3;

interface BoundaryPaint {
  paint: NormalizedPaint;
  kind: "stroke" | "fill";
  resolution: ColorResolution;
  color?: ReturnType<typeof compositeOver>;
  ratio?: number;
  unreliable?: boolean;
}

function modeForNode(context: RuleContext) {
  return {
    modeId: context.mode.focusModeId,
    modeName: context.mode.focusModeName ? context.mode.label : undefined,
    collectionId: context.mode.focusCollectionId,
    collectionName: context.mode.focusCollectionName,
  };
}

function severityFor(status: "pass" | "fail" | "needs-review" | "not-evaluated"): Severity {
  if (status === "fail") return "serious";
  if (status === "needs-review") return "moderate";
  return "info";
}

function confidenceFor(
  backgroundStatus: string,
  unresolvedPaints: number,
  resolvedPaints: number,
): Confidence {
  if (backgroundStatus !== "resolved") return "low";
  if (unresolvedPaints > 0) return "low";
  return resolvedPaints > 0 ? "medium" : "low";
}

export function runNonTextContrastRule(context: RuleContext): AuditFinding[] {
  const findings: AuditFinding[] = [];

  for (const nodeId of context.model.nodeOrder) {
    const node = context.model.nodes[nodeId];
    if (!node || !node.inScope || !node.effectiveVisible) continue;
    if (node.type === "TEXT" || node.type === "PAGE") continue;
    if (!isInteractiveCandidate(node)) continue;

    const graphic = isGraphicCandidate(node);
    if (!graphic && hasInteractiveAncestor(context.model, node)) continue;

    const boundaryPaints: { paint: NormalizedPaint; kind: "stroke" | "fill" }[] =
      [];
    const stroke = (() => { const paints = visiblePaints(node.strokes); return paints[paints.length - 1]; })();
    if (
      stroke &&
      node.strokeWeight !== undefined &&
      node.strokeWeight > 0
    ) {
      boundaryPaints.push({ paint: stroke, kind: "stroke" });
    }

    const fill = (() => { const paints = visiblePaints(node.fills); return paints[paints.length - 1]; })();
    if (fill) boundaryPaints.push({ paint: fill, kind: "fill" });

    if (boundaryPaints.length === 0) continue;

    const background = resolveBackground(context.model, node, {
      resolvePaint: context.resolvePaint,
    });

    const nodeOpacity = Math.min(1, Math.max(0, node.opacity));
    const resolved: BoundaryPaint[] = boundaryPaints.map((entry) => {
      const resolution = context.resolvePaint(entry.paint);
      let color = resolution.color;
      if (color && nodeOpacity < 0.999) {
        color = { ...color, a: color.a * nodeOpacity };
      }
      if (color && color.a < 0.999 && background.color) {
        color = compositeOver(color, background.color);
      }
      return {
        ...entry,
        resolution,
        color,
        ratio:
          color !== undefined && background.color
            ? roundRatio(contrastRatio(color, background.color))
            : undefined,
        unreliable: entry.paint.blendMode !== "NORMAL",
      };
    });

    if (
      !modeAppliesToSources(context, [
        ...resolved.map((entry) => entry.resolution.source),
        ...background.sources,
      ])
    ) {
      continue;
    }

    const base = {
      key: findingKey({
        ruleId: RULE.id,
        nodeId: node.id,
        propertyPath: "strokes/fills",
        modeId: context.mode.focusModeId,
        collectionId: context.mode.focusCollectionId,
      }),
      ruleId: RULE.id,
      ruleName: RULE.name,
      title: `Non-text contrast on "${node.name}"`,
      description: RULE.description,
      helpUrl: RULE.helpUrl,
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      pageId: node.pageId,
      pageName: node.pageName,
      propertyPath: "strokes/fills",
      ...modeForNode(context),
      threshold: THRESHOLD,
      estimatedReach: estimateReach(context.model, context.assets, node),
    };

    if (background.status !== "resolved" || !background.color) {
      const needsReview = background.status === "ambiguous";
      findings.push({
        ...base,
        id: base.key,
        status: needsReview ? "needs-review" : "not-evaluated",
        severity: needsReview ? "moderate" : "info",
        measuredValue: needsReview ? "unresolved" : "not evaluated",
        evidence: [
          `Layer "${node.name}" was treated as a UI control or graphical indicator because its name or component name matches a control term.`,
          ...background.evidence,
          ...resolved.flatMap((entry) =>
            entry.resolution.evidence.map((line) => `${entry.kind}: ${line}`),
          ),
        ],
        confidence: "low",
        rootCauseIds: [],
        causes: uniqueCauses([
          ...resolved.map((entry) =>
            entry.resolution.source
              ? { ...entry.resolution.source, role: "boundary" as const }
              : undefined,
          ),
          ...background.sources.map((source) => ({
            ...source,
            role: "background" as const,
          })),
          componentCause(context, node),
        ]),
        limitations: [
          ...background.limitations,
          "The interactive role is inferred from naming and component structure, not from runtime behavior.",
          "No non-text contrast verdict is claimed for this layer.",
        ],
      });
      continue;
    }

    const comparable = resolved
      .filter(
        (entry) =>
          entry.color !== undefined &&
          entry.ratio !== undefined &&
          !entry.unreliable,
      )
      .sort((first, second) => (second.ratio ?? 0) - (first.ratio ?? 0));
    const best = comparable[0];

    const unresolvedCount = resolved.filter(
      (entry) => entry.color === undefined || entry.unreliable,
    ).length;

    let status: "pass" | "fail" | "needs-review";
    if (best && (best.ratio ?? 0) + 0.0001 >= THRESHOLD) {
      status = "pass";
    } else if (unresolvedCount > 0) {
      status = "needs-review";
    } else {
      status = "fail";
    }

    const causes = uniqueCauses([
      ...resolved.map((entry) =>
        entry.resolution.source
          ? { ...entry.resolution.source, role: "boundary" as const }
          : undefined,
      ),
      ...background.sources.map((source) => ({
        ...source,
        role: "background" as const,
      })),
      componentCause(context, node),
    ]);

    const evidence = [
      `Layer "${node.name}" was treated as a UI control or graphical indicator because its name or component name matches a control term.`,
      ...resolved.flatMap((entry) => [
        `${entry.kind === "stroke" ? "Stroke" : "Fill"} resolves to ${entry.color ? formatColor(entry.color) : "an unsupported value"}.`,
        ...entry.resolution.evidence,
      ]),
      `Adjacent background resolves to ${formatColor(background.color)}${background.sourceNodeName ? ` from "${background.sourceNodeName}"` : ""}.`,
      ...background.evidence,
      ...(best
        ? [
            `Best measured contrast ${best.ratio}:1 against the ${THRESHOLD}:1 non-text threshold.`,
          ]
        : []),
    ];

    findings.push({
      ...base,
      id: base.key,
      status,
      severity: severityFor(status),
      measuredValue: best?.ratio ?? "not evaluated",
      foregroundColor: best?.color ? formatColor(best.color) : undefined,
      backgroundColor: formatColor(background.color),
      evidence,
      confidence: confidenceFor(
        background.status,
        unresolvedCount,
        resolved.length,
      ),
      rootCauseIds: [],
      causes,
      limitations: [
        ...background.limitations,
        ...(nodeOpacity < 0.999
          ? [
              `Layer opacity ${Math.round(nodeOpacity * 100)}% was composited over the resolved background.`,
            ]
          : []),
        "The interactive role is inferred from naming and component structure, not from runtime behavior.",
        "This check evaluates one visible boundary or indicator against one resolved adjacent color; focus and hover states are separate.",
        ...(resolved.some((entry) => entry.unreliable)
          ? [
              "At least one boundary paint uses a blend mode that is not modeled.",
            ]
          : []),
        ...(unresolvedCount > 0
          ? [
              "At least one boundary paint could not be resolved, so a definite failure is not claimed.",
            ]
          : []),
      ],
    });
  }

  return findings;
}
