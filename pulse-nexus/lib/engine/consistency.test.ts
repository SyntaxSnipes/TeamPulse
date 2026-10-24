import { describe, expect, it } from "vitest";
import { crossCheck } from "./consistency";

describe("cross-system consistency checks", () => {
  it("reports disagreements without deciding which source is correct", () => {
    const flags = crossCheck([
      { id: "p1", pathway: "TRAUMA", currentStep: "CT", lastEventT: 0, source: "RIS" },
      { id: "p2", pathway: "TRAUMA", currentStep: "RESULTS", lastEventT: 0, source: "LIS", orderedSteps: [] },
    ], [
      { id: "CT", status: "OK", available: 1, source: "BED_SENSOR", lastUpdateT: 0 },
    ], 20);
    expect(flags).toHaveLength(2);
    expect(flags[0].reason).toContain("flagged for reconciliation");
    expect(flags[1].reason).toContain("no matching order");
  });
});
