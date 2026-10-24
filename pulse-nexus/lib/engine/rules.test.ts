import { describe, expect, it } from "vitest";
import { evaluate } from "./rules";
import type { Sop } from "../types";

const sop: Sop = {
  synthetic: true,
  pathways: {
    TRAUMA: {
      allowedTransitions: [["ARRIVAL", "TRIAGE"], ["TRIAGE", "DOCTOR"], ["DOCTOR", "CT"], ["CT", "RESULTS"], ["CT", "ADMIT"]],
      prerequisites: { RESULTS: ["CT"], ADMIT: ["CT"] },
      defaultMaxMinutes: { CT: 30 },
    },
  },
};
const model = {
  synthetic: true as const, generatedAt: "2026-01-01", sampleSize: 12,
  nodes: [{ id: "CT", label: "CT", medianMin: 10, p90Min: 20, visits: 12, visitsByPathway: {} }],
  edges: [{ from: "DOCTOR", to: "CT", prob: 0.7, medianMin: 10, p90Min: 20, count: 8, countByPathway: { TRAUMA: 8 } }],
};

describe("SOP-aware pathway rules", () => {
  it("uses the SOP when a learned node has fewer than 30 visits", () => {
    const result = evaluate(model, sop, { id: "p1", pathway: "TRAUMA", currentStep: "CT", previousStep: "DOCTOR", lastEventT: 0 }, [], 31);
    expect(result.status).toBe("LATE");
    expect(result.reason).toContain("90% move on within 30");
  });

  it("flags transitions outside the SOP for staff review", () => {
    const result = evaluate(model, sop, { id: "p1", pathway: "TRAUMA", currentStep: "RESULTS", previousStep: "ARRIVAL", lastEventT: 0 }, [], 1);
    expect(result.status).toBe("UNEXPECTED");
    expect(result.reason).toContain("Never seen");
  });

  it("flags missing prerequisites", () => {
    const result = evaluate(model, sop, { id: "p1", pathway: "TRAUMA", currentStep: "ADMIT", previousStep: "CT", lastEventT: 0, orderedSteps: [] }, [], 1);
    expect(result.status).toBe("UNEXPECTED");
    expect(result.reason).toContain("Step skipped");
  });
});
