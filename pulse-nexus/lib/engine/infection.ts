export type RoomEvent = { roomId: string; t: number; patientId?: string; kind: "PRESENCE" | "CLEANING" | "INFECTION_SIGNAL"; positive?: boolean };
export type RoomVisit = { patientId: string; roomId: string; enteredAt: number; exitedAt: number };
export type TimeWindow = { start: number; end: number };

export function overlaps(a: TimeWindow, b: TimeWindow): boolean {
  return a.start <= b.end && b.start <= a.end;
}

export function withinWindow(t: number, window: TimeWindow): boolean {
  return t >= window.start && t <= window.end;
}

export function roomHistory(events: RoomEvent[], roomId: string, from = -Infinity, to = Infinity): RoomEvent[] {
  return events.filter((event) => event.roomId === roomId && event.t >= from && event.t <= to).sort((a, b) => a.t - b.t);
}
export function cleaningWindows(events: RoomEvent[], roomId: string): { start: number; end: number }[] {
  const clean = roomHistory(events, roomId).filter((event) => event.kind === "CLEANING");
  return clean.map((event, index) => ({ start: event.t, end: clean[index + 1]?.t ?? Infinity }));
}
export function isCleanAt(events: RoomEvent[], roomId: string, t: number): boolean {
  return cleaningWindows(events, roomId).some((window) => t >= window.start && t <= window.end);
}
export function exposureWindow(events: RoomEvent[], roomId: string, start: number, end: number): string[] {
  const cleaned = cleaningWindows(events, roomId);
  return [...new Set(roomHistory(events, roomId, start, end)
    .filter((event) => event.kind === "PRESENCE" && event.patientId && !cleaned.some((c) => event.t >= c.start && event.t <= c.end))
    .map((event) => event.patientId!))];
}
export function suspectedInfection(events: RoomEvent[], patientId: string, positiveAt: number, windowMinutes: number): { roomId: string; patientId: string }[] {
  const start = positiveAt - windowMinutes;
  return [...new Set(events.filter((e) => e.kind === "INFECTION_SIGNAL" && e.patientId === patientId && e.positive && e.t === positiveAt)
    .flatMap((positive) => exposureWindow(events, positive.roomId, start, positiveAt).filter((id) => id !== patientId).map((id) => ({ roomId: positive.roomId, patientId: id })) ))];
}

/** Convert a set of presence events into deterministic visits for interval checks. */
export function presenceVisits(events: RoomEvent[], roomId?: string): RoomVisit[] {
  const grouped = new Map<string, RoomEvent[]>();
  for (const event of events.filter((e) => e.kind === "PRESENCE" && e.patientId && (!roomId || e.roomId === roomId))) {
    const list = grouped.get(`${event.roomId}:${event.patientId}`) ?? [];
    list.push(event);
    grouped.set(`${event.roomId}:${event.patientId}`, list);
  }
  return [...grouped.entries()].flatMap(([key, list]) => {
    const [room, patient] = key.split(":");
    const sorted = [...list].sort((a, b) => a.t - b.t);
    return sorted.map((event, index) => ({
      roomId: room,
      patientId: patient,
      enteredAt: event.t,
      exitedAt: sorted[index + 1]?.t ?? event.t,
    }));
  });
}

export const overlappingVisits = (
  visits: RoomVisit[],
  window: TimeWindow,
): RoomVisit[] => visits.filter((visit) => overlaps(
  { start: visit.enteredAt, end: visit.exitedAt },
  window,
));
