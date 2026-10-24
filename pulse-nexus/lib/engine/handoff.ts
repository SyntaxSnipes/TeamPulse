import type { DomainPatient, HandoffItem, HandoffWindow, Role } from "../types";

export type HandoffState = {
  now: number;
  windowMinutes?: number;
  ownerId?: string;
  ownerRole?: Role;
  nextOwnerId?: string;
};

export type HandoffSummary = HandoffItem & {
  ownershipGap: boolean;
  windowActive: boolean;
};

export type HandoffStatus = "PENDING" | "ACKNOWLEDGED";

/** The single activity ownership map shared by handoff logic and flow lanes. */
export const ACTIVITY_OWNER_DEPARTMENT: Record<string, string> = {
  ARRIVAL: "FRONT_DESK", TRIAGE: "TRIAGE", DOCTOR: "DOCTOR", ECG: "CARDIOLOGY",
  BLOOD_TEST: "LAB", XRAY: "RADIOLOGY", CT: "RADIOLOGY", RESULTS: "DOCTOR",
  SURGERY: "THEATRE", ADMIT: "WARD", DISCHARGE: "WARD",
};

export function handoffStatus(acknowledged: boolean): HandoffStatus {
  return acknowledged ? "ACKNOWLEDGED" : "PENDING";
}

export function hasOwnershipGap(patient: DomainPatient, state: Pick<HandoffState, "ownerId" | "nextOwnerId"> = {}): boolean {
  const owner = state.ownerId ?? patient.ownerId;
  return !owner || (!!state.nextOwnerId && state.nextOwnerId !== owner);
}

export const ownershipGap = hasOwnershipGap;
export const isOwnershipGap = hasOwnershipGap;

export function handoffWindow(patient: DomainPatient, now: number, windowMinutes = 30): HandoffWindow {
  const opensAt = patient.lastEventT;
  return { opensAt, closesAt: opensAt + windowMinutes };
}

export function buildHandoffSummary(
  patient: DomainPatient,
  stateOrNow: HandoffState | number,
  pendingResults: string[] = [],
): HandoffSummary {
  const state: HandoffState = typeof stateOrNow === "number" ? { now: stateOrNow } : stateOrNow;
  const window = handoffWindow(patient, state.now, state.windowMinutes);
  const gap = state.now - patient.lastEventT >= 10 && hasOwnershipGap(patient, state);
  const owner = state.ownerId ?? patient.ownerId;
  return {
    patient,
    window,
    owner,
    next: patient.currentStep,
    pendingResults,
    summary: `${patient.id} is at ${patient.currentStep}; next owner: ${state.nextOwnerId ?? owner ?? "unassigned"}`,
    ownershipGap: gap,
    windowActive: state.now >= window.opensAt && state.now <= window.closesAt,
  };
}
