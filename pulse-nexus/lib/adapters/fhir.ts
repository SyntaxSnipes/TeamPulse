import type { CanonicalStreamEvent } from "../types";

export type FhirEncounter = {
  resourceType: "Encounter";
  id: string;
  status: string;
  class?: { code?: string };
  subject?: { reference?: string };
  period?: { start?: string; end?: string };
  location?: Array<{ location?: { display?: string } }>;
};

export type FhirObservation = {
  resourceType: "Observation";
  id: string;
  status: string;
  subject?: { reference?: string };
  code?: { coding?: Array<{ system?: string; code?: string; display?: string }> };
  valueQuantity?: { value?: number; unit?: string; code?: string };
  interpretation?: Array<{ coding?: Array<{ code?: string; display?: string }> }>;
};

export function encounterToCanonical(resource: FhirEncounter, timestamp = Date.now()): CanonicalStreamEvent {
  return {
    patientId: resource.subject?.reference?.replace(/^Patient\//, ""),
    roomId: resource.location?.[0]?.location?.display,
    timestamp,
    kind: "ENCOUNTER",
    values: { status: resource.status, class: resource.class?.code ?? "" },
  };
}

export function observationToCanonical(resource: FhirObservation, timestamp = Date.now()): CanonicalStreamEvent {
  const coding = resource.code?.coding?.[0];
  const value = resource.valueQuantity?.value;
  return {
    patientId: resource.subject?.reference?.replace(/^Patient\//, ""),
    timestamp,
    kind: "OBSERVATION",
    values: {
      code: coding?.code ?? "",
      label: coding?.display ?? "",
      value: value ?? "",
      unit: resource.valueQuantity?.unit ?? resource.valueQuantity?.code ?? "",
      interpretation: resource.interpretation?.[0]?.coding?.[0]?.display ?? "",
    },
  };
}
