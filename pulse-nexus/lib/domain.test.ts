import { describe, expect, it } from "vitest";
import { canSee, scopeFor } from "./rbac";
import { buildHandoffSummary, hasOwnershipGap } from "./engine/handoff";
import { incomingHeadsUp, nextAfterMe, pendingResults } from "./engine/incoming";
import { orderParallelTasks } from "./engine/parallel";
import type { DomainPatient, ParallelGroup } from "./types";

const patient: DomainPatient = {
  id: "p1", pathway: "TRAUMA", currentStep: "CT", lastEventT: 100,
  department: "ED", ownerId: "nurse-1", orderedSteps: ["CT", "XRAY"],
};

describe("Addendum B domain rules", () => {
  it("scopes patient-level access and hides it from administrators", () => {
    expect(canSee("Charge nurse", patient)).toBe(true);
    expect(canSee("Physician", patient, { department: "RADIOLOGY" })).toBe(false);
    expect(canSee("Administrator", patient)).toBe(false);
    expect(scopeFor("Administrator").aggregates).toBe(true);
  });

  it("marks handoff windows and ownership gaps", () => {
    expect(hasOwnershipGap({ ...patient, ownerId: undefined })).toBe(true);
    const result = buildHandoffSummary(patient, { now: 120, windowMinutes: 30, nextOwnerId: "doctor-1" }, ["XRAY"]);
    expect(result.windowActive).toBe(true);
    expect(result.ownershipGap).toBe(true);
    expect(result.pendingResults).toEqual(["XRAY"]);
  });

  it("sorts incoming heads-up by probability and computes ETA", () => {
    const headsUp = incomingHeadsUp(patient, [
      { from: "CT", to: "RESULTS", prob: 0.8, medianMin: 12 },
      { from: "CT", to: "REVIEW", prob: 0.2, etaMinutes: 5 },
    ], 200);
    expect(headsUp[0]).toMatchObject({ next: "RESULTS", probability: 0.8, etaMinutes: 12, arrivesAt: 212 });
    expect(nextAfterMe(patient, headsUp.map((item) => ({ from: "CT", to: item.next, prob: item.probability })) )?.next).toBe("RESULTS");
    expect(pendingResults(patient, ["CT"])).toEqual(["XRAY"]);
  });

  it("orders parallel work by dependencies, then stable explicit order", () => {
    const group: ParallelGroup = {
      id: "g1",
      tasks: [
        { id: "results", dependsOn: ["scan"], order: 1 },
        { id: "blood", order: 2 },
        { id: "scan", order: 3 },
      ],
    };
    expect(orderParallelTasks(group).map((task) => task.id)).toEqual(["blood", "scan", "results"]);
  });
});
