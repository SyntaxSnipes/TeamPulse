import type { Department, DomainPatient, Role } from "./types";

export type AccessState = {
  department?: Department;
  floor?: number;
  roomId?: string;
  userId?: string;
  patientLevel?: boolean;
  now?: number;
};

export type FloorAccess = { floor: number; departments: Department[] };

/** Floor policy is a narrow, additive check: role scope still applies. */
export function canSeeFloor(role: Role, floor: number, department?: Department): boolean {
  const scope = scopeFor(role);
  if (scope.departments === "all") return true;
  return department !== undefined && scope.departments.includes(department);
}

export function canSeeRoom(
  role: Role,
  room: { id: string; floor: number; department: Department },
  state: AccessState = {},
): boolean {
  if (state.floor !== undefined && state.floor !== room.floor) return false;
  if (state.roomId !== undefined && state.roomId !== room.id) return false;
  return canSeeFloor(role, room.floor, room.department);
}

export function floorDepartments(
  floor: number,
  rooms: ReadonlyArray<{ floor: number; department: Department }>,
): Department[] {
  return [...new Set(rooms.filter((room) => room.floor === floor).map((room) => room.department))];
}

export type RoleScope = {
  patientLevel: boolean;
  departments: "all" | Department[];
  aggregates: boolean;
  nodes: string[];
};

const roleName = (role: Role): string => role.toUpperCase().replaceAll(" ", "_");
const stationNodes: Record<string, string[]> = {
  FRONT_DESK: ["ARRIVAL"], TRIAGE: ["TRIAGE"], DOCTOR: ["DOCTOR"], CARDIOLOGY: ["ECG"],
  LAB: ["BLOOD_TEST"], RADIOLOGY: ["XRAY", "CT"], THEATRE: ["SURGERY"], WARD: ["ADMIT", "DISCHARGE"],
};

export function scopeFor(role: Role): RoleScope {
  const name = roleName(role);
  if (name === "HOSPITAL_ADMIN" || name === "ADMINISTRATOR" || name === "ADMIN") {
    return { patientLevel: false, departments: "all", aggregates: true, nodes: [] };
  }
  if (name === "ER_MANAGER" || name === "PHYSICIAN" || name === "CHARGE_NURSE") {
    return { patientLevel: true, departments: "all", aggregates: true, nodes: Object.values(stationNodes).flat() };
  }
  return { patientLevel: true, departments: [name as never], aggregates: true, nodes: stationNodes[name] ?? [] };
}

/**
 * Patient-level access is intentionally deny-by-default for administrators.
 * A state can further narrow a clinician to a department or assigned owner.
 */
export function canSee(role: Role, patient: DomainPatient, state: AccessState = {}): boolean {
  const scope = scopeFor(role);
  if (!scope.patientLevel || state.patientLevel === false) return false;
  if (state.userId && patient.ownerId && state.userId !== patient.ownerId) return false;
  if (nameForStation(role) && patient.department !== nameForStation(role)) {
    const ownsNode = scope.nodes.includes(patient.currentStep);
    const incoming = patient.incomingTo?.some((node) => scope.nodes.includes(node)) ?? false;
    const recentlyLeft = patient.lastDepartmentChangeT !== undefined && state.now !== undefined && state.now - patient.lastDepartmentChangeT <= 30;
    if (!ownsNode && !incoming && !recentlyLeft) return false;
  }
  if (state.department && patient.department && state.department !== patient.department) return false;
  return true;
}

function nameForStation(role: Role): string | undefined {
  const name = roleName(role);
  return stationNodes[name] ? name : undefined;
}
