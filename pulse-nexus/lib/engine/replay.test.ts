import { describe, expect, it } from "vitest";
import { deriveHandoffs, deriveParallelPaths } from "./replay";

const events = [
  { id: "move-1", t: 108, patientId: "T-091", fromDepartment: "TRIAGE", toDepartment: "RADIOLOGY", step: "XRAY" },
  { id: "parallel-1", t: 110, patientId: "J-512", step: "ECG", activeSteps: ["ECG", "BLOOD_TEST"] },
  { id: "parallel-2", t: 111, patientId: "K-104", step: "CT", activeSteps: ["CT", "RESULTS"] },
];

describe("replay event derivation", () => {
  it("creates a pending handoff and raises a gap after ten simulated minutes", () => {
    const [handoff] = deriveHandoffs(events, 120);
    expect(handoff).toMatchObject({ status: "PENDING", ownershipGap: true, fromDepartment: "TRIAGE", toDepartment: "RADIOLOGY" });
  });

  it("clears the ownership gap when the receiving station acknowledges", () => {
    const [handoff] = deriveHandoffs(events, 120, new Set(["handoff-move-1"]));
    expect(handoff).toMatchObject({ status: "ACKNOWLEDGED", ownershipGap: false });
  });

  it("derives simultaneous active steps from events", () => {
    expect(deriveParallelPaths(events)).toHaveLength(2);
    expect(deriveParallelPaths(events)[0].activeSteps).toEqual(["ECG", "BLOOD_TEST"]);
  });
});
