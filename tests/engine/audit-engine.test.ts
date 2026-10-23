import { describe, expect, it } from "vitest";
import { runAudit } from "../../src/engine/audit-engine";
import {
  frameNode,
  makeModel,
  textNode,
} from "../fixtures/model";

describe("audit engine", () => {
  it("builds a summary, stats, and limitations for a run", () => {
    const card = frameNode("card", "Card", { fill: "#ffffff" });
    const pass = textNode("pass", "Passing label", {
      parentId: "card",
      color: "#000000",
      bounds: { x: 20, y: 20, width: 180, height: 24 },
    });
    const fail = textNode("fail", "Failing label", {
      parentId: "card",
      color: "#777777",
      bounds: { x: 20, y: 60, width: 180, height: 24 },
    });
    const model = makeModel([card, pass, fail]);

    const run = runAudit(model, {
      id: "audit-test",
      startedAt: "2026-10-23T10:00:00.000Z",
      clock: () => new Date("2026-10-23T10:00:01.000Z"),
    });

    expect(run.id).toBe("audit-test");
    expect(run.startedAt).toBe("2026-10-23T10:00:00.000Z");
    expect(run.finishedAt).toBe("2026-10-23T10:00:01.000Z");
    expect(run.findings).toHaveLength(2);
    expect(run.summary).toMatchObject({
      total: 2,
      actionable: 1,
      affectedNodeCount: 1,
    });
    expect(run.summary.byStatus.fail).toBe(1);
    expect(run.summary.byStatus.pass).toBe(1);
    expect(run.stats.textNodesAudited).toBe(2);
    expect(run.limitations.join(" ")).toContain("static Figma evidence");
    expect(run.modes).toHaveLength(1);
    expect(run.comparison).toBeUndefined();
  });

  it("attaches a comparison when a previous snapshot is supplied", () => {
    const card = frameNode("card", "Card", { fill: "#ffffff" });
    const text = textNode("text", "Label", {
      parentId: "card",
      color: "#000000",
    });
    const model = makeModel([card, text]);

    const firstRun = runAudit(model, {
      id: "audit-first",
      startedAt: "2026-10-23T10:00:00.000Z",
      clock: () => new Date("2026-10-23T10:00:01.000Z"),
    });
    const previous = {
      version: 1 as const,
      auditId: firstRun.id,
      startedAt: firstRun.startedAt,
      scopeKind: firstRun.scope.kind,
      scopeLabel: firstRun.scope.label,
      findings: firstRun.findings.map((finding) => ({
        key: finding.key,
        ruleId: finding.ruleId,
        ruleName: finding.ruleName,
        status: "fail" as const,
        severity: finding.severity,
        nodeId: finding.nodeId,
        nodeName: finding.nodeName,
        measuredValue: finding.measuredValue,
      })),
    };

    const secondRun = runAudit(model, {
      id: "audit-second",
      startedAt: "2026-10-23T11:00:00.000Z",
      clock: () => new Date("2026-10-23T11:00:01.000Z"),
      previous,
    });

    expect(secondRun.comparison?.summary.improved).toBe(1);
    expect(secondRun.comparison?.changed[0]).toMatchObject({
      from: "fail",
      to: "pass",
    });
  });
});
