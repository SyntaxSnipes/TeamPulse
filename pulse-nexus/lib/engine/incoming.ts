import type { DomainPatient } from "../types";

export type IncomingTransition = {
  from: string;
  to: string;
  prob: number;
  etaMinutes?: number;
  medianMin?: number;
  p90Min?: number;
};

export type IncomingHeadsUp = {
  patientId: string;
  next: string;
  probability: number;
  etaMinutes?: number;
  arrivesAt?: number;
};

export function incomingHeadsUp(
  patient: DomainPatient,
  transitions: IncomingTransition[],
  now = 0,
): IncomingHeadsUp[] {
  return transitions
    .filter((edge) => edge.from === patient.currentStep && edge.prob > 0)
    .sort((a, b) => b.prob - a.prob || a.to.localeCompare(b.to))
    .map((edge) => {
      const etaMinutes = edge.etaMinutes ?? edge.medianMin;
      return {
        patientId: patient.id,
        next: edge.to,
        probability: edge.prob,
        etaMinutes,
        arrivesAt: etaMinutes === undefined ? undefined : now + etaMinutes,
      };
    });
}

export const generateIncomingHeadsUp = incomingHeadsUp;
export const buildIncomingHeadsUp = incomingHeadsUp;

/** The first likely destination after the current owner/step. */
export function nextAfterMe(patient: DomainPatient, transitions: IncomingTransition[]): IncomingHeadsUp | undefined {
  return incomingHeadsUp(patient, transitions)[0];
}

export function pendingResults(patient: DomainPatient, completed: string[] = []): string[] {
  const ordered = patient.orderedSteps ?? [];
  return ordered.filter((step) => !completed.includes(step) && ["BLOOD_TEST", "XRAY", "CT", "ECG"].includes(step));
}
