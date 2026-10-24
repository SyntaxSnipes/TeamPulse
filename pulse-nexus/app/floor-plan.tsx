"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Device, Floor, FloorRoom } from "@/lib/types";
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
type Movement = { patientId: string; fromX: number; fromY: number; token: number };

const initialPatients: Patient[] = [
  { id: "P001", alias: "Patient P-001", esi: 2, roomId: "WAIT", urgent: false, exposed: false },
  { id: "P002", alias: "Patient P-002", esi: 3, roomId: "BAY2", urgent: true, exposed: false },
  { id: "P003", alias: "Patient P-003", esi: 2, roomId: "ISOLATION", urgent: false, exposed: true },
  { id: "P004", alias: "Patient P-004", esi: 1, roomId: "CT", urgent: true, exposed: false },
];

function pretty(value: unknown) { return JSON.stringify(value, null, 2); }

export default function FloorPlan({ role }: { role: string }) {
  const [floor, setFloor] = useState<Floor | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [patients, setPatients] = useState<Patient[]>(initialPatients);
  const [roomFlags, setRoomFlags] = useState<Record<string, "cleaning" | "exposed">>({ ISOLATION: "exposed" });
  const [eventIndex, setEventIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<{ kind: "patient" | "room" | "event"; value: unknown } | null>(null);
  const [tab, setTab] = useState<InspectorTab>("Raw message");
  const [floorIndex, setFloorIndex] = useState(0);
  const [movement, setMovement] = useState<Movement | null>(null);

  useEffect(() => {
    void Promise.all([
      fetch("/data/floor.json").then((response) => response.json() as Promise<Floor>),
      fetch("/data/devices.json").then((response) => response.json() as Promise<{ devices: Device[] }>),
      fetch("/data/stream.json").then((response) => response.json() as Promise<{ events: EventRecord[] }>),
    ]).then(([nextFloor, nextDevices, stream]) => {
      setFloor(nextFloor); setDevices(nextDevices.devices); setEvents(stream.events);
    });
  }, []);

  const currentFloor = floor?.floors[floorIndex];
  const roleCanSee = role !== "HOSPITAL_ADMIN";
  const rooms = useMemo(() => currentFloor?.rooms.filter((room) => roleCanSee && canSeeRoom(role as never, {
    id: room.id, floor: floorIndex + 1, department: room.dept as never,
  })) ?? [], [currentFloor, floorIndex, role, roleCanSee]);
  const visiblePatients = patients.filter((patient) => rooms.some((room) => room.id === patient.roomId));
  const activeEvent = eventIndex >= 0 ? events[eventIndex] : events[0];

  const roomFor = useCallback((id: string) => rooms.find((room) => room.id === id), [rooms]);
  function patientSeat(room: FloorRoom, patient: Patient, occupants: Patient[]) {
    const index = Math.max(0, occupants.findIndex((item) => item.id === patient.id));
    return seatsForRoom(room, occupants.length)[index];
  }
  const globalSeatPosition = useCallback((room: FloorRoom, patient: Patient, occupants: Patient[]) => {
    const seat = patientSeat(room, patient, occupants);
    return seat ? { x: room.x + seat.x + seat.size / 2, y: room.y + seat.y + seat.size / 2 } : { x: room.x, y: room.y };
  }, []);

  const applyEvent = useCallback((event: EventRecord) => {
    const canonical = event.canonical;
    if (canonical?.patientId && canonical.roomId) {
      setPatients((current) => {
        const patient = current.find((item) => item.id === canonical.patientId);
        const oldRoom = patient && roomFor(patient.roomId);
        if (patient && oldRoom && patient.roomId !== canonical.roomId) {
          const oldOccupants = current.filter((item) => item.roomId === oldRoom.id);
          const from = globalSeatPosition(oldRoom, patient, oldOccupants);
          setMovement({ patientId: patient.id, fromX: from.x, fromY: from.y, token: Date.now() });
        }
        return current.map((item) => item.id === canonical.patientId ? { ...item, roomId: canonical.roomId! } : item);
      });
    }
    if (canonical?.kind === "CLEANING" && canonical.roomId) {
      setRoomFlags((current) => ({ ...current, [canonical.roomId!]: "cleaning" }));
    }
  }, [globalSeatPosition, roomFor]);
  function nextEvent() {
    const next = Math.min(eventIndex + 1, events.length - 1);
    if (next >= 0) { setEventIndex(next); applyEvent(events[next]); }
  }
  function restart() {
    setEventIndex(-1); setPatients(initialPatients); setRoomFlags({ ISOLATION: "exposed" }); setMovement(null);
  }
  useEffect(() => {
    if (!playing || events.length === 0) return undefined;
    const timer = window.setInterval(() => {
      setEventIndex((currentIndex) => {
        const next = Math.min(currentIndex + 1, events.length - 1);
        if (next < 0) return currentIndex;
        applyEvent(events[next]); if (next === events.length - 1) setPlaying(false); return next;
      });
    }, 2200);
    return () => window.clearInterval(timer);
  }, [playing, events, applyEvent]);

  if (!roleCanSee) return <section className="card"><h2>Floor plan unavailable</h2><p className="muted">Hospital admin receives aggregate operations only. Patient locations and JSON inspection are not available.</p></section>;
  if (!floor || !currentFloor) return <section className="card"><p>Loading floor plan.</p></section>;

  const inspectorValue = selected?.kind === "patient" || selected?.kind === "room" ? selected.value : activeEvent;
  const inspectorJson = tab === "Raw message" ? activeEvent?.raw?.payload : tab === "Canonical event" ? activeEvent?.canonical : tab === "Patient state" ? selected?.value : selected?.value;
  const selectedPatient = selected?.kind === "patient" ? selected.value as Patient : null;

  return <section className="floor-shell">
    <div className="floor-toolbar"><div><h2>Floor plan</h2><p className="muted">Patient locations from synthetic device events. The floor is decision support, not a command system.</p></div><div className="controls"><button onClick={() => setPlaying((value) => !value)}>{playing ? "Pause" : "Play"}</button><button onClick={nextEvent}>Next event</button><button onClick={restart}>Restart</button>{floor.floors.length > 1 && <select value={floorIndex} onChange={(event) => setFloorIndex(Number(event.target.value))}>{floor.floors.map((item, index) => <option key={item.id} value={index}>{item.label}</option>)}</select>}</div></div>
    <div className="floor-grid"><div className="floor-map-card">
      <svg className="floor-map" viewBox={currentFloor.viewBox} role="img" aria-label={`${currentFloor.label} floor plan`}>
        <defs><pattern id="cleaning-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="#D98A00" strokeWidth="2" /></pattern></defs>
        {rooms.map((room) => {
          const occupants = visiblePatients.filter((patient) => patient.roomId === room.id);
          const seats = seatsForRoom(room, occupants.length);
          const occupied = Math.min(occupants.length, room.capacity);
          const full = room.capacity > 0 && occupied === room.capacity;
          const over = occupants.length > room.capacity;
          const body = roomBodyBounds(room);
          const changedRoom = movement && occupants.some((patient) => patient.id === movement.patientId);
          return <g key={room.id} className={`floor-room-group ${changedRoom ? "seat-changed" : ""}`} onClick={() => { setSelected({ kind: "room", value: room }); setTab("Room state"); }}>
            <rect x={room.x} y={room.y} width={room.w} height={room.h} className={`floor-room ${room.negativePressure ? "negative-room" : ""} ${roomFlags[room.id] === "cleaning" ? "cleaning-room" : ""} ${over ? "over-capacity" : ""}`} />
            <rect x={room.x + 8} y={room.y + 31} width={Math.max(0, room.w - 16)} height="3" className="occupancy-track" />
            <rect x={room.x + 8} y={room.y + 31} width={room.capacity ? (room.w - 16) * Math.min(1, occupied / room.capacity) : 0} height="3" className={`occupancy-bar ${full ? "full" : ""} ${over ? "over" : ""}`} />
            <text className="floor-label floor-room-title" x={room.x + 8} y={room.y + 16}>{room.label}</text>
            <text className={`floor-label floor-room-count ${over ? "over-text" : ""}`} x={room.x + room.w - 8} y={room.y + 16} textAnchor="end">{room.capacity ? `${occupants.length} of ${room.capacity}` : ""}</text>
            <g className="floor-room-body" transform={`translate(${room.x} ${room.y})`}>
              {seats.map((seat) => {
                const patient = occupants[seat.index];
                const isMoving = patient && movement?.patientId === patient.id && movement.token;
                const from = isMoving ? { x: movement.fromX - (room.x + seat.x + seat.size / 2), y: movement.fromY - (room.y + seat.y + seat.size / 2) } : null;
                return <g key={seat.index} className={`floor-seat ${patient ? "occupied" : "empty"} ${seat.overflow ? "overflow-seat" : ""}`} transform={`translate(${seat.x} ${seat.y})`} role="button" tabIndex={0}
                  aria-label={`${room.label} seat ${seat.index + 1} of ${room.capacity}, ${patient ? `occupied by ${patient.id}, ESI ${patient.esi}` : "empty"}`}
                  onClick={(event) => { event.stopPropagation(); if (patient) { setSelected({ kind: "patient", value: patient }); setTab("Patient state"); } }}
                  onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && patient) { event.preventDefault(); setSelected({ kind: "patient", value: patient }); setTab("Patient state"); } }}>
                  {patient ? <g className={`floor-patient ${patient.exposed ? "patient-exposed" : ""} ${patient.urgent ? "patient-urgent" : ""}`} onClick={(event) => event.stopPropagation()}>
                    {from && <animateTransform attributeName="transform" type="translate" from={`${from.x} ${from.y}`} to="0 0" dur="600ms" calcMode="spline" keySplines=".42 0 .58 1" fill="freeze" />}
                    <rect width={seat.size} height={seat.size} rx="4" className={`esi-fill-${patient.esi}`} />
                    <text x={seat.size / 2} y="13">{patient.esi}</text><title>{patient.alias}, ESI {patient.esi}</title>
                    {patient.urgent && <rect x="-3" y="-3" width={seat.size + 6} height={seat.size + 6} rx="6" className="urgent-ring" />}
                    {patient.exposed && <rect x="-5" y="-5" width={seat.size + 10} height={seat.size + 10} rx="7" className="exposure-ring" />}
                  </g> : <><rect width={seat.size} height={seat.size} rx="4" className="empty-seat" /><text x={seat.size / 2} y="13" className="seat-glyph">–</text></>}
                </g>;
              })}
              {roomFlags[room.id] && <rect x={body.x + 1} y={body.y + body.height - 15} width={room.w - 2} height="15" className="room-note-strip" />}
            </g>
            {room.negativePressure && <text className="floor-label room-subtitle" x={room.x + 8} y={room.y + 26}>negative pressure</text>}
            {roomFlags[room.id] && <text className="floor-label room-footer" x={room.x + room.w / 2} y={room.y + room.h - 5} textAnchor="middle">{roomFlags[room.id] === "cleaning" ? "needs cleaning" : "possible exposure"}</text>}
            {over && <text className="floor-label overflow-label" x={room.x + room.w / 2} y={room.y + room.h + 14} textAnchor="middle">+{occupants.length - room.capacity} over capacity</text>}
          </g>;
        })}
      </svg>
      <div className="floor-legend"><span><i className="legend-square empty-seat" /> empty</span><span><i className="legend-square esi-fill-2" /> occupied, ESI</span><span><i className="legend-square cleaning-sample" /> reserved or cleaning</span><span><i className="legend-square overflow-sample" /> over capacity</span><span><i className="legend-ring urgent-ring" /> urgent</span><span><i className="legend-ring exposure-ring" /> possible exposure</span></div>
    </div>
      <div className="device-pane"><div className="card-heading"><h2>Live device feed</h2><span className="muted">{activeEvent ? `Event ${eventIndex + 1} of ${events.length}` : "Waiting"}</span></div>
        {selectedPatient && <p className="selected-readout">Selected: {selectedPatient.id}, ESI {selectedPatient.esi}, {roomFor(selectedPatient.roomId)?.label ?? selectedPatient.roomId}</p>}
        <div className="device-chips">{devices.map((device) => <button className={activeEvent?.deviceId === device.id ? "device-chip active" : "device-chip"} key={device.id} onClick={() => { const index = events.findIndex((event) => event.deviceId === device.id); if (index >= 0) { setEventIndex(index); applyEvent(events[index]); } }}>{device.label} <small>{device.format}</small></button>)}</div>
        <div className="device-flow"><div><h3>Raw message</h3><pre>{activeEvent?.raw.payload ?? "Waiting for device event"}</pre></div><div><h3>Parsed event</h3><pre>{pretty(activeEvent?.canonical ?? { status: "Waiting" })}</pre><p className="muted">{activeEvent?.parse.protocol} / {activeEvent ? `confidence ${Math.round(activeEvent.parse.confidence * 100)}%` : "no event"}</p>{activeEvent && activeEvent.parse.confidence < .95 && <p className="confirmation-note">Needs confirmation. Sent to a nurse for confirmation.</p>}</div></div>
      </div></div>
    <div className="floor-alert-note">Free text is read by keyword rules in this demo. A clinical NLP model could replace it in production. Infection-control windows and isolation rules are configurable policy set by the hospital infection prevention team.</div>
    {selected && <aside className="inspector-drawer"><div className="card-heading"><h2>JSON inspector</h2><button onClick={() => setSelected(null)}>Close</button></div><p className="muted">Aliases only. Inspector use is recorded in the audit log.</p><div className="inspector-tabs">{(["Raw message", "Canonical event", "Patient state", "Room state"] as InspectorTab[]).map((item) => <button className={tab === item ? "active" : ""} key={item} onClick={() => setTab(item)}>{item}</button>)}</div><pre className="json-inspector">{typeof inspectorJson === "string" ? inspectorJson : pretty(inspectorJson ?? inspectorValue)}</pre><button onClick={() => navigator.clipboard?.writeText(typeof inspectorJson === "string" ? inspectorJson : pretty(inspectorJson))}>Copy JSON</button><button onClick={() => { const blob = new Blob([pretty(events)], { type: "application/json" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "events.json"; link.click(); }}>Download events.json</button></aside>}
  </section>;
}
