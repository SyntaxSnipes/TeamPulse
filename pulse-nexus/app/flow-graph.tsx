"use client";

import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import type { Device, Floor } from "@/lib/types";
import { canSeeRoom } from "@/lib/rbac";
import { roomBodyBounds, seatsForRoom } from "@/lib/engine/floor-plan";

type EventRecord = {
  raw: { id: string; t: number; deviceId: string; payload: string };
  deviceId: string;
  parse: { status: string; confidence: number; protocol: string };
  canonical?: { patientId?: string; roomId?: string; kind?: string; values?: Record<string, string | number>; text?: string };
};
type Patient = { id: string; alias: string; esi: number; roomId: string; urgent: boolean; exposed: boolean };
type InspectorTab = "Raw message" | "Canonical event" | "Patient state" | "Room state";
type RoomFlag = "cleaning" | "exposed";
type Selection = { kind: "patient" | "room"; id: string } | null;

/* ------------------------------------------------------------------ */
/* Pure state: patients, stable seat assignment, room flags, event index */
/* ------------------------------------------------------------------ */

type State = {
  patients: Patient[];
  seatOf: Record<string, number>; // patient id -> seat index inside the patient's current room
  roomFlags: Record<string, RoomFlag>;
  eventIndex: number;
  moved: { id: string; n: number } | null; // last patient that changed room
};
type Action =
  | { type: "NEXT"; events: EventRecord[] }
  | { type: "JUMP"; events: EventRecord[]; index: number }
  | { type: "RESET" };

const initialPatients: Patient[] = [
  { id: "P001", alias: "Patient P-001", esi: 2, roomId: "WAIT", urgent: false, exposed: false },
  { id: "P002", alias: "Patient P-002", esi: 3, roomId: "BAY2", urgent: true, exposed: false },
  { id: "P003", alias: "Patient P-003", esi: 2, roomId: "ISOLATION", urgent: false, exposed: true },
  { id: "P004", alias: "Patient P-004", esi: 1, roomId: "CT", urgent: true, exposed: false },
];

function assignInitialSeats(patients: Patient[]): Record<string, number> {
  const next: Record<string, number> = {};
  const used: Record<string, number> = {};
  for (const patient of patients) {
    next[patient.id] = used[patient.roomId] ?? 0;
    used[patient.roomId] = next[patient.id] + 1;
  }
  return next;
}

/** Lowest seat index in `roomId` that nobody else occupies. Nobody else is ever moved. */
function freeSeat(patients: Patient[], seatOf: Record<string, number>, roomId: string, excludeId: string): number {
  const taken = new Set(patients.filter((p) => p.roomId === roomId && p.id !== excludeId).map((p) => seatOf[p.id]));
  let index = 0;
  while (taken.has(index)) index += 1;
  return index;
}

export const INITIAL_STATE: State = {
  patients: initialPatients,
  seatOf: assignInitialSeats(initialPatients),
  roomFlags: { ISOLATION: "exposed" },
  eventIndex: -1,
  moved: null,
};

function applyEvent(state: State, event: EventRecord): State {
  const canonical = event.canonical;
  let { patients, seatOf, roomFlags, moved } = state;
  if (canonical?.patientId && canonical.roomId) {
    const roomId = canonical.roomId;
    const patient = patients.find((item) => item.id === canonical.patientId);
    if (patient && patient.roomId !== roomId) {
      patients = patients.map((item) => (item.id === patient.id ? { ...item, roomId } : item));
      seatOf = { ...seatOf, [patient.id]: freeSeat(patients, seatOf, roomId, patient.id) };
      moved = { id: patient.id, n: (moved?.n ?? 0) + 1 };
    } else if (!patient && canonical.kind === "ARRIVAL") {
      const id = canonical.patientId;
      const esi = Number(canonical.values?.esi) || 3;
      patients = [...patients, { id, alias: `Patient ${id.replace(/^P/, "P-")}`, esi, roomId, urgent: esi <= 2, exposed: false }];
      seatOf = { ...seatOf, [id]: freeSeat(patients, seatOf, roomId, id) };
      moved = { id, n: (moved?.n ?? 0) + 1 };
    }
  }
  if (canonical?.kind === "CLEANING" && canonical.roomId) {
    roomFlags = { ...roomFlags, [canonical.roomId]: "cleaning" };
  }
  return { ...state, patients, seatOf, roomFlags, moved };
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "NEXT": {
      const last = action.events.length - 1;
      if (last < 0 || state.eventIndex >= last) return state;
      const index = state.eventIndex + 1;
      return { ...applyEvent(state, action.events[index]), eventIndex: index };
    }
    case "JUMP": {
      // Replay from the start so the floor always matches "Event N of M".
      let next = INITIAL_STATE;
      for (let i = 0; i <= action.index && i < action.events.length; i += 1) next = applyEvent(next, action.events[i]);
      return { ...next, eventIndex: action.index };
    }
    case "RESET":
      return INITIAL_STATE;
    default:
      return state;
  }
}

/* ------------------------------------------------------------------ */
/* Scripted device events: pads a short feed out to a full shift       */
/* ------------------------------------------------------------------ */

type RoomKey = "wait" | "triage" | "resus" | "ct" | "bay1" | "bay2" | "bay3" | "bay4";
type Step = { format: string; kind: string; patient?: string; to?: RoomKey; values?: Record<string, string | number>; text?: string; confidence?: number };
const ROOM_PATTERNS: Record<RoomKey, [RegExp, string]> = {
  wait: [/wait/i, "WAIT"], triage: [/triage/i, "TRIAGE"], resus: [/resus/i, "RESUS"], ct: [/^ct\b|\bct$/i, "CT"],
  bay1: [/bay\s*1\b/i, "BAY1"], bay2: [/bay\s*2\b/i, "BAY2"], bay3: [/bay\s*3\b/i, "BAY3"], bay4: [/bay\s*4\b/i, "BAY4"],
};
// Vitals, lab and imaging events carry no room, so they never move a patient by accident. Only LOCATION, ARRIVAL and CLEANING events name a room.
const SCRIPT: Step[] = [
  { format: "SERIAL_FIXED", kind: "ARRIVAL", patient: "P005", to: "wait", values: { esi: 3 } },
  { format: "SERIAL_FIXED", kind: "ARRIVAL", patient: "P006", to: "wait", values: { esi: 4 } },
  { format: "BLE_JSON", kind: "LOCATION", patient: "P001", to: "triage" },
  { format: "DELIMITED_VITALS", kind: "HR", patient: "P001", values: { value: 118, unit: "bpm" } },
  { format: "FREE_TEXT", kind: "ARRIVAL", patient: "P007", to: "wait", values: { esi: 2 }, text: "New arrival P007, chest pain, sweating. Waiting room.", confidence: 0.82 },
  { format: "BLE_JSON", kind: "LOCATION", patient: "P004", to: "resus" },
  { format: "HL7_V2", kind: "LAB", patient: "P002", values: { code: "2524-7", name: "Lactate", value: 4.1, unit: "mmol/L" } },
  { format: "BLE_JSON", kind: "LOCATION", patient: "P007", to: "triage" },
  { format: "SERIAL_FIXED", kind: "ARRIVAL", patient: "P008", to: "wait", values: { esi: 5 } },
  { format: "FHIR_JSON", kind: "VITALS", patient: "P001", values: { code: "8867-4", name: "Heart rate", value: 96, unit: "/min" } },
  { format: "BLE_JSON", kind: "LOCATION", patient: "P001", to: "bay1" },
  { format: "BLE_JSON", kind: "LOCATION", patient: "P005", to: "triage" },
  { format: "BLE_JSON", kind: "LOCATION", patient: "P002", to: "ct" },
  { format: "FREE_TEXT", kind: "CLEANING", to: "bay2", text: "Bay 2 needs cleaning after transfer.", confidence: 0.85 },
  { format: "DICOM", kind: "IMAGING", patient: "P002", values: { modality: "CT", study: "CT head without contrast" } },
  { format: "BLE_JSON", kind: "LOCATION", patient: "P007", to: "bay3" },
  { format: "SERIAL_FIXED", kind: "ARRIVAL", patient: "P009", to: "wait", values: { esi: 3 } },
  { format: "DELIMITED_VITALS", kind: "SPO2", patient: "P007", values: { value: 91, unit: "%" } },
  { format: "BLE_JSON", kind: "LOCATION", patient: "P006", to: "triage" },
  { format: "HL7_V2", kind: "LAB", patient: "P007", values: { code: "718-7", name: "Hemoglobin", value: 13.1, unit: "g/dL" } },
  { format: "BLE_JSON", kind: "LOCATION", patient: "P002", to: "bay4" },
  { format: "SERIAL_FIXED", kind: "ARRIVAL", patient: "P010", to: "wait", values: { esi: 4 } },
  { format: "BLE_JSON", kind: "LOCATION", patient: "P008", to: "triage" },
  { format: "FHIR_JSON", kind: "VITALS", patient: "P004", values: { code: "8867-4", name: "Heart rate", value: 128, unit: "/min" } },
];

function rawPayload(step: Step, index: number, roomLabel: string): string {
  const patient = step.patient ?? "";
  const v = step.values ?? {};
  switch (step.format) {
    case "SERIAL_FIXED": return `${patient.padEnd(6)}${roomLabel.toUpperCase().padEnd(14)}${step.kind === "ARRIVAL" ? "IN" : "SEEN"}`;
    case "BLE_JSON": return JSON.stringify({ tag: patient, zone: roomLabel, rssi: -48 - ((index * 7) % 25) });
    case "DELIMITED_VITALS": return `${patient},${step.kind},${v.value}`;
    case "HL7_V2": return [`MSH|^~\\&|LIS|ED|ER|ED|20261024120000||ORU^R01|MSG${String(index).padStart(4, "0")}|P|2.5`, `PID|1||${patient}`, `OBX|1|NM|${v.code}^${v.name}^LN||${v.value}|${v.unit}`].join("\n");
    case "FHIR_JSON": return JSON.stringify({ resourceType: "Observation", status: "final", code: { coding: [{ system: "http://loinc.org", code: v.code, display: v.name }] }, subject: { reference: `Patient/${patient}` }, valueQuantity: { value: v.value, unit: v.unit } });
    case "DICOM": return `C-STORE | Modality=${v.modality} | PatientID=${patient} | Study=${v.study} | Status=COMPLETE`;
    default: return step.text ?? "";
  }
}

/** Appends the scripted shift to a short stream so the replay runs for 20+ events. Uses the real device and room ids from your data files. */
export function withScript(loaded: EventRecord[], devices: Device[], floor: Floor | null): EventRecord[] {
  if (loaded.length >= 20 || !floor || devices.length === 0) return loaded;
  const rooms = floor.floors.flatMap((item) => item.rooms);
  const ids = new Set(rooms.map((room) => room.id));
  const resolve = (key: RoomKey) => {
    const [pattern, guess] = ROOM_PATTERNS[key];
    return rooms.find((room) => pattern.test(room.label))?.id ?? (ids.has(guess) ? guess : "WAIT");
  };
  const labelOf = (id: string) => rooms.find((room) => room.id === id)?.label ?? id;
  const start = loaded.reduce((latest, event) => Math.max(latest, event.raw.t), 1710000000000);
  const extra = SCRIPT.map((step, index): EventRecord => {
    const device = devices.find((item) => item.format === step.format) ?? devices[0];
    const roomId = step.to ? resolve(step.to) : undefined;
    return {
      raw: { id: `scripted-${String(index + 1).padStart(2, "0")}`, t: start + (index + 1) * 30000, deviceId: device.id, payload: rawPayload(step, index + 1, roomId ? labelOf(roomId) : "") },
      deviceId: device.id,
      parse: { status: "OK", confidence: step.confidence ?? 0.99, protocol: device.format },
      canonical: { ...(step.patient ? { patientId: step.patient } : {}), ...(roomId ? { roomId } : {}), kind: step.kind, ...(step.values ? { values: step.values } : {}), ...(step.text ? { text: step.text } : {}) },
    };
  });
  return [...loaded, ...extra];
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function pretty(value: unknown) { return JSON.stringify(value, null, 2); }

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json() as Promise<T>;
}

/** Writes an audit entry. Resolves true only if the server accepted it. */
async function recordAudit(role: string, action: string, target: string): Promise<boolean> {
  try {
    const response = await fetch("/api/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, action, target, at: Date.now() }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduce(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduce;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function FloorPlan({ role }: { role: string }) {
  const reduceMotion = usePrefersReducedMotion();
  const [floor, setFloor] = useState<Floor | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loadedEvents, setEvents] = useState<EventRecord[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const { patients, seatOf, roomFlags, eventIndex } = state;
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<Selection>(null);
  const [tab, setTab] = useState<InspectorTab>("Raw message");
  const [floorIndex, setFloorIndex] = useState(0);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [auditOk, setAuditOk] = useState<boolean | null>(null);

  const events = useMemo(() => withScript(loadedEvents, devices, floor), [loadedEvents, devices, floor]);
  const canExport = role === "ER_MANAGER";

  /* ---- data loading ---- */
  useEffect(() => {
    let cancelled = false;
    setLoadError(false);
    Promise.all([
      getJson<Floor>("/data/floor.json"),
      getJson<{ devices: Device[] }>("/data/devices.json"),
      getJson<{ events: EventRecord[] }>("/data/stream.json"),
    ]).then(([nextFloor, nextDevices, stream]) => {
      if (cancelled) return;
      setFloor(nextFloor); setDevices(nextDevices.devices); setEvents(stream.events);
    }).catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  /* ---- auto-play: one pure dispatch per tick ---- */
  useEffect(() => {
    if (!playing || events.length === 0) return undefined;
    const timer = window.setInterval(() => dispatch({ type: "NEXT", events }), 2200);
    return () => window.clearInterval(timer);
  }, [playing, events]);
  useEffect(() => {
    if (playing && events.length > 0 && eventIndex >= events.length - 1) setPlaying(false);
  }, [playing, events, eventIndex]);

  /* ---- reduced motion: show where the last patient moved to for one second ---- */
  const movedToken = state.moved?.n ?? 0;
  useEffect(() => {
    if (!state.moved) return undefined;
    setFlashId(state.moved.id);
    const timer = window.setTimeout(() => setFlashId(null), 1000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movedToken]);

  /* ---- derived data ---- */
  const roleCanSee = role !== "HOSPITAL_ADMIN";
  const currentFloor = floor?.floors[floorIndex];
  const rooms = useMemo(() => currentFloor?.rooms.filter((room) => roleCanSee && canSeeRoom(role as never, {
    id: room.id, floor: floorIndex + 1, department: room.dept as never,
  })) ?? [], [currentFloor, floorIndex, role, roleCanSee]);
  const visiblePatients = useMemo(
    () => patients.filter((patient) => rooms.some((room) => room.id === patient.roomId)),
    [patients, rooms],
  );
  const activeEvent = eventIndex >= 0 ? events[eventIndex] : events[0];
  const roomFor = useCallback((id: string) => rooms.find((room) => room.id === id), [rooms]);

  const layout = useMemo(() => rooms.map((room) => {
    const occupants = visiblePatients.filter((patient) => patient.roomId === room.id);
    const seatCount = Math.max(occupants.length, ...occupants.map((patient) => (seatOf[patient.id] ?? 0) + 1));
    const seats = seatsForRoom(room, seatCount);
    const taken = new Set(occupants.map((patient) => seatOf[patient.id] ?? 0));
    return {
      room, occupants, seats, taken,
      occupied: Math.min(occupants.length, room.capacity),
      over: occupants.length > room.capacity,
      full: room.capacity > 0 && occupants.length === room.capacity,
    };
  }), [rooms, visiblePatients, seatOf]);

  const tokens = useMemo(() => layout.flatMap(({ room, occupants, seats }) => occupants.map((patient) => {
    const seatIndex = seatOf[patient.id] ?? 0;
    const seat = seats.find((item) => item.index === seatIndex);
    return {
      patient, room, seatIndex,
      x: room.x + (seat ? seat.x : 8),
      y: room.y + (seat ? seat.y : 40),
      size: seat ? seat.size : 18,
    };
  })), [layout, seatOf]);

  /* ---- selection derived from live state, never a stale copy ---- */
  const selectedPatient = selected?.kind === "patient" ? visiblePatients.find((p) => p.id === selected.id) ?? null : null;
  const selectedRoom = selected?.kind === "room" ? rooms.find((r) => r.id === selected.id) ?? null : null;
  const hasSelection = Boolean(selectedPatient || selectedRoom);
  const selectedKey = selectedPatient ? `patient:${selectedPatient.id}` : selectedRoom ? `room:${selectedRoom.id}` : null;

  useEffect(() => {
    if (!selectedKey) return;
    let cancelled = false;
    void recordAudit(role, "FLOOR_INSPECTOR_OPEN", selectedKey).then((ok) => { if (!cancelled) setAuditOk(ok); });
    return () => { cancelled = true; };
  }, [selectedKey, role]);

  function selectPatient(id: string) { setSelected({ kind: "patient", id }); setTab("Patient state"); }
  function selectRoom(id: string) { setSelected({ kind: "room", id }); setTab("Room state"); }
  function togglePlay() {
    if (!playing && events.length > 0 && eventIndex >= events.length - 1) dispatch({ type: "RESET" });
    setPlaying((value) => !value);
  }

  /* ---- early returns (all hooks are above) ---- */
  if (!roleCanSee) return <section className="card"><h2>Floor plan unavailable</h2><p className="muted">Hospital admin receives aggregate operations only. Patient locations and JSON inspection are not available.</p></section>;
  if (loadError) return <section className="card"><h2>Floor plan could not load</h2><p className="muted">The floor, device or event files did not load.</p><button onClick={() => setReloadKey((value) => value + 1)}>Try again</button></section>;
  if (!floor || !currentFloor) return <section className="card"><p>Loading floor plan.</p></section>;

  const patientStateJson = selectedPatient
    ? { ...selectedPatient, room: roomFor(selectedPatient.roomId)?.label ?? selectedPatient.roomId, seat: (seatOf[selectedPatient.id] ?? 0) + 1 }
    : { status: "No patient selected" };
  const inspectorJson: unknown =
    tab === "Raw message" ? activeEvent?.raw?.payload
    : tab === "Canonical event" ? activeEvent?.canonical
    : tab === "Patient state" ? patientStateJson
    : selectedRoom ?? { status: "No room selected" };
  const inspectorText = typeof inspectorJson === "string" ? inspectorJson : pretty(inspectorJson ?? { status: "Waiting" });

  const slideTransition = reduceMotion ? "none" : "transform 600ms cubic-bezier(0.4, 0, 0.2, 1)";
  const barTransition = reduceMotion ? "none" : "transform 200ms ease-out";

  const auditNote =
    auditOk === true ? "Inspector use is recorded in the audit log."
    : auditOk === false ? "Audit logging is unavailable in this build. Inspector use is not being recorded."
    : "Inspector use is recorded when the audit service is connected.";

  return <section className="floor-shell">
    <style>{"@keyframes floor-token-in { from { opacity: 0 } to { opacity: 1 } }"}</style>
    <div className="floor-toolbar"><div><h2>Floor plan</h2><p className="muted">Patient locations from synthetic device events. The floor is decision support, not a command system.</p></div><div className="controls"><button onClick={togglePlay}>{playing ? "Pause" : "Play"}</button><button onClick={() => dispatch({ type: "NEXT", events })}>Next event</button><button onClick={() => dispatch({ type: "RESET" })}>Restart</button>{floor.floors.length > 1 && <select aria-label="Floor" value={floorIndex} onChange={(event) => setFloorIndex(Number(event.target.value))}>{floor.floors.map((item, index) => <option key={item.id} value={index}>{item.label}</option>)}</select>}</div></div>
    <div className="floor-grid"><div className="floor-map-card">
      <svg className="floor-map" viewBox={currentFloor.viewBox} role="group" aria-label={`${currentFloor.label} floor plan`}>
        <defs><pattern id="cleaning-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="#D98A00" strokeWidth="2" /></pattern></defs>

        {/* Layer 1: rooms, seats and occupancy. Static, never moves. */}
        {layout.map(({ room, occupants, seats, taken, occupied, over, full }) => {
          const body = roomBodyBounds(room);
          const changedRoom = state.moved ? occupants.some((patient) => patient.id === state.moved?.id) : false;
          const flag = roomFlags[room.id];
          return <g key={room.id} className={`floor-room-group ${changedRoom ? "seat-changed" : ""}`} role="button" tabIndex={0}
            aria-label={`${room.label}, ${occupants.length} of ${room.capacity} occupied. Open room details.`}
            onClick={() => selectRoom(room.id)}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectRoom(room.id); } }}>
            <rect x={room.x} y={room.y} width={room.w} height={room.h} className={`floor-room ${room.negativePressure ? "negative-room" : ""} ${flag === "cleaning" ? "cleaning-room" : ""} ${over ? "over-capacity" : ""}`} />
            <rect x={room.x + 8} y={room.y + 31} width={Math.max(0, room.w - 16)} height="3" className="occupancy-track" />
            <rect x={room.x + 8} y={room.y + 31} width={Math.max(0, room.w - 16)} height="3" className={`occupancy-bar ${full ? "full" : ""} ${over ? "over" : ""}`}
              style={{ transform: `scaleX(${room.capacity ? Math.min(1, occupied / room.capacity) : 0})`, transformBox: "fill-box", transformOrigin: "left center", transition: barTransition }} />
            <text className="floor-label floor-room-title" x={room.x + 8} y={room.y + 16}>{room.label}</text>
            <text className={`floor-label floor-room-count ${over ? "over-text" : ""}`} x={room.x + room.w - 8} y={room.y + 16} textAnchor="end">{room.capacity ? `${occupants.length} of ${room.capacity}` : ""}</text>
            <g className="floor-room-body" transform={`translate(${room.x} ${room.y})`} aria-hidden="true">
              {seats.map((seat) => <g key={seat.index} className={`floor-seat empty ${seat.overflow ? "overflow-seat" : ""}`} transform={`translate(${seat.x} ${seat.y})`}>
                <rect width={seat.size} height={seat.size} rx="4" className="empty-seat" />
                {!taken.has(seat.index) && <text x={seat.size / 2} y="13" textAnchor="middle" className="seat-glyph">–</text>}
              </g>)}
              {flag && <rect x={body.x + 1} y={body.y + body.height - 15} width={room.w - 2} height="15" className="room-note-strip" />}
            </g>
            {room.negativePressure && <text className="floor-label room-subtitle" x={room.x + 8} y={room.y + 26}>negative pressure</text>}
            {flag && <text className="floor-label room-footer" x={room.x + room.w / 2} y={room.y + room.h - 5} textAnchor="middle">{flag === "cleaning" ? "needs cleaning" : "possible exposure"}</text>}
            {over && <text className="floor-label overflow-label" x={room.x + room.w / 2} y={room.y + room.h + 14} textAnchor="middle">+{occupants.length - room.capacity} over capacity</text>}
          </g>;
        })}

        {/* Layer 2: patients. One persistent element per patient, so a room change glides seat to seat. */}
        {tokens.map(({ patient, room, seatIndex, x, y, size }) => {
            const isSelected = selectedPatient?.id === patient.id;
            const isFlash = !!reduceMotion && flashId === patient.id;
            return <g key={patient.id} className="floor-seat occupied" role="button" tabIndex={0}
              aria-label={`${patient.id}, ESI ${patient.esi}, ${room.label} seat ${seatIndex + 1} of ${room.capacity}${patient.urgent ? ", urgent" : ""}${patient.exposed ? ", possible exposure" : ""}`}
              style={{ transform: `translate(${x}px, ${y}px)`, transition: slideTransition, animation: reduceMotion ? undefined : "floor-token-in 200ms ease-out" }}
              onClick={() => selectPatient(patient.id)}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectPatient(patient.id); } }}>
              <g className={`floor-patient ${patient.exposed ? "patient-exposed" : ""} ${patient.urgent ? "patient-urgent" : ""}`}>
                <rect width={size} height={size} rx="4" className={`esi-fill-${patient.esi}`} />
                <text x={size / 2} y="13" textAnchor="middle">{patient.esi}</text>
                <title>{patient.alias}, ESI {patient.esi}</title>
                {patient.urgent && <rect x="-3" y="-3" width={size + 6} height={size + 6} rx="6" className="urgent-ring" />}
                {patient.exposed && <rect x="-5" y="-5" width={size + 10} height={size + 10} rx="7" className="exposure-ring" />}
                {isSelected && <rect x="-7" y="-7" width={size + 14} height={size + 14} rx="9" fill="none" stroke="#1D2B36" strokeWidth="2" strokeDasharray="4 3" />}
                {isFlash && <rect x="-4" y="-4" width={size + 8} height={size + 8} rx="7" fill="none" stroke="#2F5FD0" strokeWidth="2.5" />}
              </g>
            </g>;
          })}
      </svg>
      <div className="floor-legend"><span><i className="legend-square empty-seat" /> empty</span><span><i className="legend-square esi-fill-2" /> occupied, ESI</span><span><i className="legend-square cleaning-sample" /> reserved or cleaning</span><span><i className="legend-square overflow-sample" /> over capacity</span><span><i className="legend-ring urgent-ring" /> urgent</span><span><i className="legend-ring exposure-ring" /> possible exposure</span></div>
    </div>
      <div className="device-pane"><div className="card-heading"><h2>Live device feed</h2><span className="muted">{`Event ${Math.max(0, eventIndex + 1)} of ${events.length}`}</span></div>
        {selectedPatient && <p className="selected-readout">Selected: {selectedPatient.id}, ESI {selectedPatient.esi}, {roomFor(selectedPatient.roomId)?.label ?? selectedPatient.roomId}</p>}
        <div className="device-chips">{devices.map((device) => <button className={activeEvent?.deviceId === device.id ? "device-chip active" : "device-chip"} key={device.id} onClick={() => { const index = events.findIndex((event) => event.deviceId === device.id); if (index >= 0) dispatch({ type: "JUMP", events, index }); }}>{device.label} <small>{device.format}</small></button>)}</div>
        <div className="device-flow"><div><h3>Raw message</h3><pre>{activeEvent?.raw.payload ?? "Waiting for device event"}</pre></div><div><h3>Parsed event</h3><pre>{pretty(activeEvent?.canonical ?? { status: "Waiting" })}</pre><p className="muted">{activeEvent?.parse.protocol} / {activeEvent ? `confidence ${Math.round(activeEvent.parse.confidence * 100)}%` : "no event"}</p>{activeEvent && activeEvent.parse.confidence < .95 && <p className="confirmation-note">Needs confirmation. Sent to a nurse for confirmation.</p>}</div></div>
      </div></div>
    <div className="floor-alert-note">Free text is read by keyword rules in this demo. A clinical NLP model could replace it in production. Infection-control windows and isolation rules are configurable policy set by the hospital infection prevention team.</div>
    {hasSelection && <aside className="inspector-drawer" aria-label="JSON inspector"><div className="card-heading"><h2>JSON inspector</h2><button onClick={() => setSelected(null)}>Close</button></div><p className="muted">Aliases only. {auditNote}</p><div className="inspector-tabs" role="tablist">{(["Raw message", "Canonical event", "Patient state", "Room state"] as InspectorTab[]).map((item) => <button role="tab" aria-selected={tab === item} className={tab === item ? "active" : ""} key={item} onClick={() => setTab(item)}>{item}</button>)}</div><pre className="json-inspector">{inspectorText}</pre>
      <button onClick={() => { void navigator.clipboard?.writeText(inspectorText); void recordAudit(role, "FLOOR_INSPECTOR_COPY", selectedKey ?? "none"); }}>Copy JSON</button>
      {canExport && <button onClick={() => { void recordAudit(role, "FLOOR_EVENTS_EXPORT", "events.json"); const blob = new Blob([pretty(events)], { type: "application/json" }); const link = document.createElement("a"); const url = URL.createObjectURL(blob); link.href = url; link.download = "events.json"; link.click(); URL.revokeObjectURL(url); }}>Download events.json</button>}
    </aside>}
  </section>;
}