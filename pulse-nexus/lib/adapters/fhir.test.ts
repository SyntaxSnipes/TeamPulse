import { describe, expect, it } from "vitest";
import { encounterToCanonical, observationToCanonical } from "./fhir";

describe("FHIR mappings", () => {
  it("maps Encounter location and patient reference", () => {
    expect(encounterToCanonical({ resourceType: "Encounter", id: "e", status: "in-progress", subject: { reference: "Patient/P-1" }, location: [{ location: { display: "Triage" } }] }, 1)).toMatchObject({ patientId: "P-1", roomId: "Triage", kind: "ENCOUNTER" });
  });

  it("maps Observation value, unit, and interpretation", () => {
    expect(observationToCanonical({ resourceType: "Observation", id: "o", status: "final", subject: { reference: "Patient/P-1" }, code: { coding: [{ code: "8867-4" }] }, valueQuantity: { value: 86, unit: "beats/min" } }, 1).values).toMatchObject({ value: 86, unit: "beats/min" });
  });
});
