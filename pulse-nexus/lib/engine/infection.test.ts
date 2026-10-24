import { describe, expect, it } from "vitest";
import { exposureWindow, isCleanAt, suspectedInfection } from "./infection";
const events = [
  { roomId: "R1", t: 10, patientId: "A", kind: "PRESENCE" as const },
  { roomId: "R1", t: 20, patientId: "B", kind: "PRESENCE" as const },
  { roomId: "R1", t: 30, kind: "CLEANING" as const },
  { roomId: "R1", t: 40, patientId: "C", kind: "PRESENCE" as const },
  { roomId: "R1", t: 50, patientId: "D", kind: "INFECTION_SIGNAL" as const, positive: true },
];
describe("room infection and cleaning rules", () => {
  it("uses inclusive exposure boundaries and cleaning", () => {
    expect(exposureWindow(events, "R1", 10, 20)).toEqual(["A", "B"]);
    expect(isCleanAt(events, "R1", 30)).toBe(true);
    expect(isCleanAt(events, "R1", 29)).toBe(false);
  });
  it("identifies prior exposed patients without mutating history", () => {
    expect(suspectedInfection(events, "D", 50, 45)).toEqual([{ roomId: "R1", patientId: "A" }, { roomId: "R1", patientId: "B" }]);
  });
});
