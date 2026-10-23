import { describe, expect, it } from "vitest";
import { toCsvReport, csvEscape } from "../../src/report/csv-export";
import { reportFilename, toJsonReport } from "../../src/report/json-export";
import { makeFinding, makeRun } from "../fixtures/model";

const RULE = "wcag-1.4.3-text-contrast";

describe("report export", () => {
  it("escapes CSV values and neutralizes spreadsheet formulas", () => {
    expect(csvEscape("plain")).toBe("plain");
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape("line\nbreak")).toBe('"line\nbreak"');
    expect(csvEscape("=SUM(1,2)")).toBe('"\'=SUM(1,2)"');
  });

  it("exports one CSV row per finding with evidence", () => {
    const finding = makeFinding({
      id: "finding-1",
      ruleId: RULE,
      status: "fail",
      nodeName: "Muted label",
      measuredValue: 4.2,
      threshold: 4.5,
      evidence: ["Foreground #777777.", "Background #ffffff."],
    });
    const run = makeRun([finding]);
    const csv = toCsvReport(run);

    expect(csv.split("\r\n")[0]).toContain("finding_id");
    expect(csv).toContain("finding-1");
    expect(csv).toContain("Muted label");
    expect(csv).toContain("Foreground #777777.");
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("exports a machine-readable JSON report", () => {
    const finding = makeFinding({
      id: "finding-1",
      ruleId: RULE,
      status: "needs-review",
    });
    const run = makeRun([finding]);
    const parsed = JSON.parse(toJsonReport(run)) as Record<string, unknown>;

    expect(parsed.format).toBe("a11y-system-inspector.audit");
    expect(parsed.schemaVersion).toBe("1.0");
    expect(Array.isArray(parsed.findings)).toBe(true);
    expect(parsed.exportedAt).toBeTypeOf("string");
  });

  it("creates a safe filename from the run timestamp", () => {
    const run = makeRun([], { startedAt: "2026-10-23T10:11:12.000Z" });
    expect(reportFilename(run, "json")).toBe("a11y-audit-2026-10-23T10-11-12.json");
    expect(reportFilename(run, "csv")).toMatch(/\.csv$/);
  });
});
