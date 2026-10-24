import type { PatientState, ResourceState } from "../types";

export type ConsistencyFlag = { patient: string; sourceA: string; sourceB: string; reason: string };

export function crossCheck(patientStates: PatientState[], resourceStates: ResourceState[], now: number): ConsistencyFlag[] {
  const flags: ConsistencyFlag[] = [];
  for (const patient of patientStates) {
    const resource = resourceStates.find((item) => item.id === patient.currentStep);
    if (resource?.available && resource.source === "BED_SENSOR" && patient.source && ["RTLS", "NURSE_TAP"].includes(patient.source)) {
      flags.push({ patient: patient.id, sourceA: "BED_SENSOR", sourceB: patient.source, reason: `BED_SENSOR says ${resource.id} is available while ${patient.source} places ${patient.id} there; flagged for reconciliation, we do not decide which system is correct` });
    }
    if (patient.currentStep === "CT" && patient.source === "RIS" && now - patient.lastEventT > 15) {
      flags.push({ patient: patient.id, sourceA: "RIS", sourceB: "pathway", reason: `RIS says scan is complete while pathway still says waiting at CT; flagged for reconciliation, we do not decide which system is correct` });
    }
    if (patient.currentStep === "RESULTS" && !patient.orderedSteps?.some((step) => ["BLOOD_TEST", "XRAY", "CT", "ECG"].includes(step))) {
      flags.push({ patient: patient.id, sourceA: "LIS", sourceB: "orders", reason: `result arrived with no matching order; flagged for reconciliation, we do not decide which system is correct` });
    }
  }
  return flags;
}

