import { describe, expect, it } from "vitest";
import { compareRuns, snapshotRun } from "../../src/report/compare";
import { makeFinding, makeRun, snapshot } from "../fixtures/model";

const RULE = "wcag-1.4.3-text-contrast";

describe("run comparison", () => {
  it("reports introduced, improved, and unchanged findings", () => {
    const previousFinding = makeFinding({
      id: "a",
      ruleId: RULE,
      status: "fail",
      nodeName: "A",
    });
    const currentA = makeFinding({
      id: "a",
      ruleId: RULE,
      status: "pass",
      nodeName: "A",
    });
    const currentB = makeFinding({
      id: "b",
      ruleId: RULE,
      status: "fail",
      nodeName: "B",
    });

    const comparison = compareRuns(
      snapshot([previousFinding]),
      makeRun([currentA, currentB]),
    );

    expect(comparison.summary).toMatchObject({
      introduced: 1,
      resolved: 0,
      improved: 1,
      regressed: 0,
      unchanged: 0,
    });
    expect(comparison.introduced[0]?.key).toBe("b");
    expect(comparison.changed[0]).toMatchObject({
      key: "a",
      from: "fail",
      to: "pass",
    });
  });

  it("reports findings that disappear as resolved", () => {
    const previousFinding = makeFinding({
      id: "a",
      ruleId: RULE,
      status: "needs-review",
    });
    const comparison = compareRuns(
      snapshot([previousFinding]),
      makeRun([]),
    );

    expect(comparison.resolved).toHaveLength(1);
    expect(comparison.summary.resolved).toBe(1);
  });

  it("reports regressions when a passing finding starts failing", () => {
    const previousFinding = makeFinding({
      id: "a",
      ruleId: RULE,
      status: "pass",
    });
    const currentFinding = makeFinding({
      id: "a",
      ruleId: RULE,
      status: "fail",
    });
    const comparison = compareRuns(
      snapshot([previousFinding]),
      makeRun([currentFinding]),
    );

    expect(comparison.summary.regressed).toBe(1);
    expect(comparison.changed[0]).toMatchObject({
      from: "pass",
      to: "fail",
    });
  });

  it("warns when the scope kind changes", () => {
    const comparison = compareRuns(
      snapshot([makeFinding({ id: "a", ruleId: RULE, status: "fail" })]),
      makeRun([], { scopeKind: "selection" }),
    );
    expect(comparison.sameScope).toBe(false);
    expect(comparison.message).toContain("different scan scope");
  });

  it("snapshots a run into stable comparison fields", () => {
    const run = makeRun(
      [makeFinding({ id: "a", ruleId: RULE, status: "fail", measuredValue: 4.2 })],
      { id: "audit-1", startedAt: "2026-10-23T10:00:00.000Z" },
    );
    const snapshotValue = snapshotRun(run);

    expect(snapshotValue).toMatchObject({
      version: 1,
      auditId: "audit-1",
      scopeKind: "file",
    });
    expect(snapshotValue.findings[0]).toMatchObject({
      key: "a",
      status: "fail",
      measuredValue: 4.2,
    });
  });
});
