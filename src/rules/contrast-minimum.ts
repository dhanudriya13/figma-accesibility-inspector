import type { AssetReference } from "../model/design-asset";
import type { AuditFinding, Confidence, Severity } from "../model/finding";
import { RULES, findingKey } from "../model/finding";
import type { NormalizedNode } from "../model/normalized-node";
import { resolveBackground } from "../resolver/background-resolver";
import type { BackgroundResolution } from "../resolver/background-resolver";
import {
  colorKey,
  compositeOver,
  contrastRatio,
  formatColor,
  isLargeText,
  roundRatio,
} from "../resolver/color-resolver";
import type { ColorResolution } from "../resolver/variable-resolver";
import type { RuleContext } from "./context";
import {
  componentCause,
  describeNode,
  estimateReach,
  isTextInScope,
  modeAppliesToSources,
  topVisiblePaint,
  uniqueCauses,
  visiblePaints,
} from "./shared";

const RULE = RULES["wcag-1.4.3-text-contrast"]!;

function truncate(value: string, length = 48): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > length ? `${compact.slice(0, length - 1)}...` : compact;
}

function textStyleCause(
  context: RuleContext,
  node: NormalizedNode,
): AssetReference | undefined {
  if (!node.textStyleId) return undefined;
  const style = context.styles.get(node.textStyleId);
  if (!style) return undefined;
  return {
    assetId: style.id,
    kind: "style",
    name: style.name,
    propertyPath: "textStyleId",
    dependencyPath: [style.name],
    evidence: `Bound to local text style "${style.name}".`,
    role: "typography",
  };
}

function severityFor(
  status: "pass" | "fail" | "needs-review" | "not-evaluated",
  ratio: number | undefined,
  threshold: number,
  large: boolean,
): Severity {
  if (status === "pass" || status === "not-evaluated") return "info";
  if (status === "needs-review") return "moderate";
  if (ratio !== undefined && ratio < threshold * 0.67) return "critical";
  return large ? "moderate" : "serious";
}

function confidenceFor(
  background: BackgroundResolution,
  foreground: ColorResolution,
  uncertainLargeText: boolean,
  hasEffects: boolean,
  hasAlpha: boolean,
): Confidence {
  if (background.status === "ambiguous") return "low";
  if (background.status === "unsupported") return "medium";
  if (
    background.confidence === "low" ||
    uncertainLargeText ||
    hasEffects ||
    hasAlpha
  ) {
    return "medium";
  }
  if (foreground.limitations.length > 0) return "medium";
  return background.confidence;
}

export function runContrastRule(context: RuleContext): AuditFinding[] {
  const findings: AuditFinding[] = [];

  for (const nodeId of context.model.nodeOrder) {
    const node = context.model.nodes[nodeId];
    if (!node || !isTextInScope(node)) continue;

    const text = node.text;
    if (!text) continue;

    const foregroundPaint = topVisiblePaint(node.fills);
    if (!foregroundPaint) continue;

    const foreground = context.resolvePaint(foregroundPaint);
    const background = resolveBackground(context.model, node, {
      resolvePaint: context.resolvePaint,
    });

    if (
      !modeAppliesToSources(context, [
        foreground.source,
        ...background.sources,
      ])
    ) {
      continue;
    }

    const large = isLargeText(text.fontSize, text.fontWeight);
    const threshold = large.threshold;
    const modeFields = {
      modeId: context.mode.focusModeId,
      modeName: context.mode.focusModeName
        ? context.mode.label
        : undefined,
      collectionId: context.mode.focusCollectionId,
      collectionName: context.mode.focusCollectionName,
    };
    const causes = uniqueCauses([
      foreground.source ? { ...foreground.source, role: "foreground" } : undefined,
      ...background.sources.map((source) => ({
        ...source,
        role: "background" as const,
      })),
      textStyleCause(context, node),
      componentCause(context, node),
    ]);
    const base = {
      key: findingKey({
        ruleId: RULE.id,
        nodeId: node.id,
        propertyPath: "fills",
        modeId: context.mode.focusModeId,
        collectionId: context.mode.focusCollectionId,
      }),
      ruleId: RULE.id,
      ruleName: RULE.name,
      title: `Text contrast on "${truncate(text.characters)}"`,
      description: RULE.description,
      helpUrl: RULE.helpUrl,
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      pageId: node.pageId,
      pageName: node.pageName,
      propertyPath: "fills",
      ...modeFields,
      threshold,
      causes,
      estimatedReach: estimateReach(context.model, context.assets, node),
    };

    if (
      foreground.status === "resolved" &&
      foreground.color &&
      foregroundPaint.blendMode !== "NORMAL"
    ) {
      findings.push({
        ...base,
        id: base.key,
        status: "needs-review",
        severity: "moderate",
        measuredValue: "unresolved",
        foregroundColor: formatColor(foreground.color),
        backgroundColor: background.color
          ? formatColor(background.color)
          : undefined,
        evidence: [
          `Text layer ${describeNode(node)} uses paint blend mode ${foregroundPaint.blendMode}, which is not modeled.`,
          ...foreground.evidence,
          ...background.evidence,
        ],
        confidence: "low",
        rootCauseIds: [],
        limitations: [
          ...foreground.limitations,
          ...background.limitations,
          "Blend mode can change the rendered foreground, so a definite contrast verdict is not claimed.",
        ],
      });
      continue;
    }

    if (foreground.status !== "resolved" || !foreground.color) {
      findings.push({
        ...base,
        id: base.key,
        status: "not-evaluated",
        severity: "info",
        measuredValue: "not evaluated",
        evidence: [
          `Text node ${describeNode(node)} uses a foreground that could not be resolved.`,
          ...foreground.evidence,
          ...background.evidence,
        ],
        confidence: "high",
        rootCauseIds: [],
        limitations: [
          ...foreground.limitations,
          "A contrast verdict requires a resolved foreground color.",
        ],
      });
      continue;
    }

    const textOpacity = Math.min(1, Math.max(0, node.opacity));
    const fgColor =
      textOpacity >= 0.999
        ? foreground.color
        : { ...foreground.color, a: foreground.color.a * textOpacity };
    const backgroundLayers = background.layers;
    const textEvidence = [
      `Foreground resolves to ${formatColor(fgColor)}${textOpacity < 0.999 ? ` after ${Math.round(textOpacity * 100)}% layer opacity` : ""}.`,
      ...foreground.evidence,
      ...background.evidence,
      `${text.fontSize === undefined ? "Unknown" : `${roundRatio(text.fontSize)}px`} / ${text.fontWeight ?? "unknown weight"}; ${large.large ? "large" : "normal"} text threshold ${threshold}:1.`,
    ];

    if (background.status !== "resolved" || !background.color) {
      const needsReview = background.status === "ambiguous";
      findings.push({
        ...base,
        id: base.key,
        status: needsReview ? "needs-review" : "not-evaluated",
        severity: needsReview ? "moderate" : "info",
        measuredValue: needsReview ? "unresolved" : "not evaluated",
        foregroundColor: formatColor(fgColor),
        backgroundColor: background.color
          ? formatColor(background.color)
          : undefined,
        evidence: textEvidence,
        confidence: confidenceFor(
          background,
          foreground,
          large.uncertain,
          node.hasVisibleEffects,
          fgColor.a < 0.999,
        ),
        rootCauseIds: [],
        limitations: [
          ...background.limitations,
          ...(large.uncertain ? [large.reason] : []),
          ...(node.hasVisibleEffects || visiblePaints(node.strokes).length > 0
            ? [
                "Visible text effects or text strokes such as shadows or outlines are not modeled.",
              ]
            : []),
          "No contrast verdict is claimed for this layer.",
        ],
      });
      continue;
    }

    const bgColor = background.color;
    let effectiveForeground = fgColor;
    const extraEvidence: string[] = [];
    const extraLimitations: string[] = [];

    if (fgColor.a < 0.999) {
      effectiveForeground = compositeOver(fgColor, bgColor);
      extraEvidence.push(
        `Text opacity composites the foreground to ${formatColor(effectiveForeground)} over the resolved background.`,
      );
      extraLimitations.push(
        "Text opacity was composited over the resolved background.",
      );
    }

    if (node.hasVisibleEffects || visiblePaints(node.strokes).length > 0) {
      extraLimitations.push(
        "Visible text effects or text strokes such as shadows or outlines are not modeled and may change the perceived contrast.",
      );
    }

    if (large.uncertain) {
      extraLimitations.push(large.reason);
    }

    const ratio = roundRatio(contrastRatio(effectiveForeground, bgColor));
    const passes = ratio + 0.0001 >= threshold;
    const status = passes ? "pass" : "fail";
    const confidence = confidenceFor(
      background,
      foreground,
      large.uncertain,
      node.hasVisibleEffects,
      fgColor.a < 0.999,
    );

    findings.push({
      ...base,
      id: base.key,
      status,
      severity: severityFor(status, ratio, threshold, large.large),
      measuredValue: ratio,
      foregroundColor: formatColor(effectiveForeground),
      backgroundColor: formatColor(bgColor),
      evidence: [
        ...textEvidence,
        ...extraEvidence,
        `Measured contrast ${ratio}:1 against the ${threshold}:1 ${large.large ? "large" : "normal"}-text threshold.`,
        `Background source: ${background.sourceNodeName ?? "resolved layer"} (${colorKey(bgColor)}).`,
        ...backgroundLayers
          .filter((layer) => layer.outcome === "resolved")
          .map(
            (layer) =>
              `Background layer "${layer.nodeName}"${layer.color ? `: ${layer.color}` : ""}${layer.sourceName ? ` from ${layer.sourceKind} "${layer.sourceName}"` : ""}.`,
          ),
      ],
      confidence,
      rootCauseIds: [],
      limitations: [...background.limitations, ...extraLimitations],
    });
  }

  return findings;
}
