export const esiLevels = {
  1: "Resuscitation",
  2: "Emergent",
  3: "Urgent",
  4: "Less urgent",
  5: "Non-urgent",
} as const;

export type EsiLevel = keyof typeof esiLevels;

export const clinicalTerms: Record<string, string> = {
  ARRIVAL: "Arrival",
  TRIAGE: "Triage",
  DOCTOR: "Clinician assessment",
  ECG: "ECG",
  BLOOD_TEST: "Blood test",
  XRAY: "X-ray",
  CT: "CT scan",
  RESULTS: "Results review",
  SURGERY: "Surgery",
  ADMIT: "Admission",
  DISCHARGE: "Discharge",
};

export function esiLabel(level: number): string {
  return esiLevels[level as EsiLevel] ?? "Unclassified";
}
