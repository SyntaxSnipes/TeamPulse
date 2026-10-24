export type ReplayEvent = {
  id: string;
  t: number;
  patientId: string;
  fromDepartment?: string;
  toDepartment?: string;
  step: string;
  activeSteps?: string[];
};

export type ReplayHandoff = {
  id: string;
  patientId: string;
  fromDepartment: string;
  toDepartment: string;
  createdAt: number;
  status: "PENDING" | "ACKNOWLEDGED";
  ownershipGap: boolean;
  summary: string;
};

export type ParallelPath = {
  patientId: string;
  activeSteps: string[];
  at: number;
};

export function deriveHandoffs(events: ReplayEvent[], now: number, acknowledged: ReadonlySet<string> = new Set()): ReplayHandoff[] {
  return events.flatMap((event) => {
    if (!event.fromDepartment || !event.toDepartment || event.fromDepartment === event.toDepartment) return [];
    const id = `handoff-${event.id}`;
    const status = acknowledged.has(id) ? "ACKNOWLEDGED" : "PENDING";
    return [{
      id,
      patientId: event.patientId,
      fromDepartment: event.fromDepartment,
      toDepartment: event.toDepartment,
      createdAt: event.t,
      status,
      ownershipGap: status === "PENDING" && now - event.t >= 10,
      summary: `${event.patientId} moved from ${event.fromDepartment} to ${event.toDepartment}; receiving station must acknowledge.`,
    }];
  });
}

export function deriveParallelPaths(events: ReplayEvent[]): ParallelPath[] {
  return events.flatMap((event) => event.activeSteps && event.activeSteps.length > 1
    ? [{ patientId: event.patientId, activeSteps: event.activeSteps, at: event.t }]
    : []);
}
