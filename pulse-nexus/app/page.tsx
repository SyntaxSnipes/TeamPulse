"use client";

import { useEffect, useState } from "react";
import FloorPlan from "./floor-plan";
import { recordAudit } from "../lib/audit";
import { detectSurge } from "../lib/engine/surge";
import { esiLabel, clinicalTerms } from "../lib/terminology";
import { deriveHandoffs, deriveParallelPaths, type ReplayEvent } from "../lib/engine/replay";
import FlowNetwork from "./flow-network";

type View = "ER_MANAGER" | "FRONT_DESK" | "TRIAGE" | "DOCTOR" | "CARDIOLOGY" | "LAB" | "RADIOLOGY" | "THEATRE" | "WARD" | "HOSPITAL_ADMIN";
type Flag = "LATE" | "UNEXPECTED" | "INCONSISTENT" | "OWNERSHIP_GAP" | "STALE";
type AlertState = "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "LEGITIMATE_EXCEPTION";
type Patient = { id?: string; alias: string; esi: number; pathway: string; step: string; dept: string; owner: string; previous: string; wait: number; status: Flag | "ON_TRACK"; reason: string; next: string; probability: number; condition: string; activeSteps?: string[]; };

const views: [View, string][] = [
  ["ER_MANAGER", "ER Manager"], ["FRONT_DESK", "Front desk"], ["TRIAGE", "Triage"], ["DOCTOR", "Doctor"],
  ["CARDIOLOGY", "Cardiology"], ["LAB", "Laboratory"], ["RADIOLOGY", "Radiology"], ["THEATRE", "Theatre"],
  ["WARD", "Ward"], ["HOSPITAL_ADMIN", "Hospital admin"],
];
const departmentLabels: Record<string, string> = { FRONT_DESK: "Front desk", TRIAGE: "Triage", DOCTOR: "Doctor", CARDIOLOGY: "Cardiology", LAB: "Laboratory", RADIOLOGY: "Radiology", THEATRE: "Theatre", WARD: "Ward" };
const patients: Patient[] = [
  { alias: "Patient K-104", esi: 1, pathway: "TRAUMA", step: "CT", dept: "RADIOLOGY", owner: "RADIOLOGY", previous: "XRAY", wait: 62, status: "LATE", reason: "slower than usual: 62 min, normal under 35", next: "RESULTS", probability: .86, condition: "Blunt trauma" },
  { alias: "Patient M-227", esi: 2, pathway: "STROKE", step: "CT", dept: "RADIOLOGY", owner: "RADIOLOGY", previous: "DOCTOR", wait: 48, status: "LATE", reason: "CT scanner unavailable", next: "BLOOD_TEST", probability: .71, condition: "Suspected stroke" },
  { alias: "Patient R-318", esi: 2, pathway: "CHEST_PAIN", step: "RESULTS", dept: "DOCTOR", owner: "DOCTOR", previous: "ARRIVAL", wait: 11, status: "UNEXPECTED", reason: "Not in SOP: arrival before results. Flagged for staff review.", next: "DISCHARGE", probability: .54, condition: "Chest pain" },
  { alias: "Patient S-203", esi: 2, pathway: "STROKE", step: "CT", dept: "RADIOLOGY", owner: "RADIOLOGY", previous: "DOCTOR", wait: 19, status: "INCONSISTENT", reason: "RIS says complete. The pathway says waiting. Flagged for reconciliation.", next: "BLOOD_TEST", probability: .71, condition: "Suspected stroke" },
  { alias: "Patient T-091", esi: 3, pathway: "TRAUMA", step: "XRAY", dept: "RADIOLOGY", owner: "RADIOLOGY", previous: "DOCTOR", wait: 38, status: "OWNERSHIP_GAP", reason: "No confirmed owner: left Triage 12 min ago, Radiology has not acknowledged", next: "CT", probability: .68, condition: "Trauma" },
  { alias: "Patient A-442", esi: 4, pathway: "MINOR_INJURY", step: "TRIAGE", dept: "TRIAGE", owner: "TRIAGE", previous: "ARRIVAL", wait: 6, status: "ON_TRACK", reason: "within expected pathway", next: "DOCTOR", probability: .91, condition: "Minor injury" },
  { alias: "Patient J-512", esi: 3, pathway: "CHEST_PAIN", step: "ECG", dept: "CARDIOLOGY", owner: "CARDIOLOGY", previous: "DOCTOR", wait: 9, status: "ON_TRACK", reason: "within expected pathway", next: "BLOOD_TEST", probability: .74, condition: "Chest pain" },
];
const path = ["ARRIVAL", "TRIAGE", "DOCTOR", "ECG", "BLOOD_TEST", "XRAY", "CT", "RESULTS", "SURGERY", "ADMIT", "DISCHARGE"];
const display: Record<string, string> = { ARRIVAL: "Arrival", TRIAGE: "Triage", DOCTOR: "Doctor", ECG: "ECG", BLOOD_TEST: "Blood test", XRAY: "X-ray", CT: "CT", RESULTS: "Results", SURGERY: "Surgery", ADMIT: "Admit", DISCHARGE: "Discharge" };
const stationNodes: Record<string, string[]> = { FRONT_DESK: ["ARRIVAL"], TRIAGE: ["TRIAGE"], DOCTOR: ["DOCTOR"], CARDIOLOGY: ["ECG"], LAB: ["BLOOD_TEST"], RADIOLOGY: ["XRAY", "CT"], THEATRE: ["SURGERY"], WARD: ["ADMIT", "DISCHARGE"] };
const replayEvents: ReplayEvent[] = [
  { id: "move-1", t: 108, patientId: "T-091", fromDepartment: "TRIAGE", toDepartment: "RADIOLOGY", step: "XRAY" },
  { id: "parallel-1", t: 110, patientId: "J-512", step: "ECG", activeSteps: ["ECG", "BLOOD_TEST"] },
  { id: "parallel-2", t: 111, patientId: "K-104", step: "CT", activeSteps: ["CT", "RESULTS"] },
];

function badge(flag: Flag | "ON_TRACK") {
  const labels: Record<string, string> = { ON_TRACK: "On track", LATE: "Late", UNEXPECTED: "Unexpected", INCONSISTENT: "Inconsistent", OWNERSHIP_GAP: "Ownership gap", STALE: "Stale" };
  return <span className="badge"><b>{flag === "ON_TRACK" ? "✓" : flag === "OWNERSHIP_GAP" ? "?" : "!"}</b>{labels[flag]}</span>;
}
function Header({ view, setView, liveFeed, setLiveFeed }: { view: View; setView: (view: View) => void; liveFeed: boolean; setLiveFeed: (value: boolean) => void }) {
  return <header className="topbar"><div className="brand"><div><strong>ER flow</strong><small>Emergency department tracking</small></div></div><div className="header-actions"><span className="synthetic">Synthetic data</span><label><input type="checkbox" checked={liveFeed} onChange={(event) => setLiveFeed(event.target.checked)} /> Live feed</label><label className="role-select">View as <select value={view} onChange={(event) => setView(event.target.value as View)}>{views.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></div></header>;
}
function PatientJourney({ patient, scoped }: { patient: Patient; scoped: boolean }) {
  const active = patient.activeSteps ?? (scoped ? [patient.previous, patient.step, patient.next] : path);
  return <section className="card patient-pathway"><div className="card-heading"><div><p className="section-label">Patient journey</p><h2>{patient.alias} <span title={esiLabel(patient.esi)} className="esi">{`ESI ${patient.esi}`}</span></h2><p className="muted">{patient.condition} / Current owner: {departmentLabels[patient.owner] ?? patient.owner} / updated 1m ago</p></div><span>{badge(patient.status)}</span></div><div className="patient-graph">{active.map((step, index) => <div className={`patient-step ${step === patient.step ? "current" : index < active.indexOf(patient.step) ? "complete" : ""}`} key={`${step}-${index}`}><strong>{clinicalTerms[step] ?? step}</strong>{index < active.length - 1 && <i />}</div>)}</div><div className="patient-summary"><span>{badge(patient.status)}</span><span>{patient.reason}</span><span>Next: <b>{clinicalTerms[patient.next] ?? patient.next}</b> / probable {Math.round(patient.probability * 100)}%</span></div></section>;
}
function PatientRow({ patient, onOpen, onAcknowledge }: { patient: Patient; onOpen: () => void; onAcknowledge?: () => void }) {
  return <div className="patient-row" onClick={onOpen} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onOpen(); }} role="button" tabIndex={0}><div className="patient-row-top"><strong>{patient.alias}</strong><span title={esiLabel(patient.esi)} className={`esi esi-${patient.esi}`}>ESI {patient.esi}</span>{badge(patient.status)}</div><div className="patient-detail"><b>{clinicalTerms[patient.step] ?? patient.step}</b><span>/ {patient.pathway.replace("_", " ")}</span><span>/ {patient.wait} min here</span><span>/ Current owner: {departmentLabels[patient.owner]}</span></div><p>{patient.reason}</p><div className="prediction">Next likely: <b>{display[patient.next]}</b> <span>{Math.round(patient.probability * 100)}%</span>{onAcknowledge && <button onClick={(event) => { event.stopPropagation(); onAcknowledge(); }}>Acknowledge handoff</button>}</div></div>;
}
function StationView({ view, patients, handoffs, onOpen, onAcknowledge, onBreakGlass }: { view: View; patients: Patient[]; handoffs: ReturnType<typeof deriveHandoffs>; onOpen: (patient: Patient) => void; onAcknowledge: (subject: string) => void; onBreakGlass: () => void }) {
  const nodes = stationNodes[view] ?? [];
  const here = patients.filter((patient) => nodes.includes(patient.step));
  const incoming = patients.filter((patient) => patient.dept === view && !nodes.includes(patient.step));
  const justLeft = patients.filter((patient) => patient.owner === view && !nodes.includes(patient.step));
  const graph = [...new Set([...nodes.map((node) => path[Math.max(0, path.indexOf(node) - 1)]), ...nodes, ...nodes.map((node) => path[Math.min(path.length - 1, path.indexOf(node) + 1)])])];
  const stationHandoffs = handoffs.filter((handoff) => handoff.fromDepartment === view || handoff.toDepartment === view);
  return <><div className="station-heading"><div><p className="section-label">Station view / {departmentLabels[view]}</p><h1>{departmentLabels[view]}</h1><p className="muted">Patients at this station, probable arrivals, and open handoffs. Waiting-room rows are not included.</p></div><button className="controls-button" onClick={onBreakGlass}>Need wider access?</button></div><section className="station-layout"><div className="card station-graph"><div className="card-heading"><h2>Local pathway</h2><span className="muted">One hop before and after</span></div><div className="patient-graph">{graph.map((node, index) => <div className={`patient-step ${nodes.includes(node) ? "current" : ""}`} key={`${node}-${index}`}><strong>{display[node]}</strong>{index < graph.length - 1 && <i />}</div>)}</div><div className="station-resources"><b>Local resources</b><span>{view === "RADIOLOGY" ? "CT scanner: down. X-ray: OK." : view === "CARDIOLOGY" ? "ECG cart: OK." : "Beds and station capacity: OK."}</span></div></div><div className="station-lists"><section className="card"><div className="card-heading"><h2>Incoming <span>{incoming.length}</span></h2><span className="muted">Probable ≥30%</span></div>{incoming.length ? incoming.map((patient) => <PatientRow key={patient.alias} patient={patient} onOpen={() => onOpen(patient)} onAcknowledge={() => onAcknowledge(patient.alias)} />) : <p className="empty-state">No probable arrivals in the current replay window.</p>}</section><section className="card"><div className="card-heading"><h2>Here now <span>{here.length}</span></h2><span className="muted">Next after me</span></div>{here.map((patient) => <PatientRow key={patient.alias} patient={patient} onOpen={() => onOpen(patient)} />)}</section><section className="card"><div className="card-heading"><h2>Just left <span>{justLeft.length}</span></h2><span className="muted">Handoff window</span></div>{justLeft.map((patient) => <PatientRow key={patient.alias} patient={patient} onOpen={() => onOpen(patient)} onAcknowledge={() => onAcknowledge(patient.alias)} />)}</section>{stationHandoffs.length > 0 && <section className="card"><div className="card-heading"><h2>Handoffs</h2><span className="muted">Sender and receiver see the same record</span></div>{stationHandoffs.map((handoff) => <div className="handoff-row" key={handoff.id}><b>{handoff.patientId}</b><span>{handoff.summary}</span><strong>{handoff.ownershipGap ? "Ownership gap" : handoff.status}</strong>{handoff.toDepartment === view && handoff.status === "PENDING" && <button onClick={() => onAcknowledge(handoff.patientId)}>Acknowledge handoff</button>}</div>)}</section>}</div></section></>;
}
export default function Home() {
  const [view, setViewState] = useState<View>("ER_MANAGER");
  const [selected, setSelected] = useState<Patient | null>(null);
  const [alertStates, setAlertStates] = useState<Record<string, AlertState>>({});
  const [acknowledgedHandoffs, setAcknowledgedHandoffs] = useState<Set<string>>(new Set());
  const [breakGlass, setBreakGlass] = useState(false);
  const [projector, setProjector] = useState(false);
  const [liveFeed, setLiveFeed] = useState(false);
  const [floorPlan, setFloorPlan] = useState(false);
  const [flowNetwork, setFlowNetwork] = useState(false);
  const [livePatients, setLivePatients] = useState<Patient[]>(patients);
  const [lastEventId, setLastEventId] = useState(0);
  const [simTime, setSimTime] = useState(120);
  const [influxCount, setInfluxCount] = useState(0);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const rawQuery = new URLSearchParams(window.location.search).get("view")?.toUpperCase();
      if (rawQuery === "FLOOR") {
        setFloorPlan(true);
        return;
      }
      if (rawQuery === "FLOW") {
        setFlowNetwork(true);
        return;
      }
      const query = rawQuery as View | undefined;
      if (query && views.some(([value]) => value === query)) setViewState(query);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!liveFeed) return;
    const poll = async () => {
      const response = await fetch(`/api/events?since=${lastEventId}`);
      if (!response.ok) return;
      const payload = await response.json() as { events: Array<{ id: number; patientAlias?: string; patientId?: string; step?: string; department?: string; value?: string | number; eventType?: string }> };
      if (!payload.events.length) return;
      setLastEventId(payload.events[payload.events.length - 1].id);
      setLivePatients((current) => payload.events.reduce((next, event) => {
        const index = next.findIndex((patient) => patient.alias === event.patientAlias || patient.id === event.patientId);
        if (index >= 0) {
          const updated = { ...next[index], previous: next[index].step, step: event.step ?? next[index].step, dept: event.department ?? next[index].dept, owner: event.department ?? next[index].owner, wait: 0, status: "ON_TRACK" as const, reason: "Updated from the live feed." };
          return next.with(index, updated);
        }
        if (event.eventType === "ADT_A01" || event.eventType === "ADT_A04") {
          return [...next, { id: event.patientId, alias: event.patientAlias ?? `Live patient ${event.patientId ?? "new"}`, esi: 3, pathway: "LIVE", step: event.step ?? "ARRIVAL", dept: event.department ?? "FRONT_DESK", owner: event.department ?? "FRONT_DESK", previous: "ARRIVAL", wait: 0, status: "ON_TRACK", reason: "New arrival from the live feed.", next: "TRIAGE", probability: .5, condition: "Presentation not supplied" }];
        }
        return next;
      }, current));
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 2000);
    return () => window.clearInterval(timer);
  }, [lastEventId, liveFeed]);
  const setView = (next: View) => {
    setViewState(next);
    window.history.replaceState(null, "", `/?view=${next.toLowerCase()}`);
    setSelected(null);
    setBreakGlass(false);
    setFloorPlan(false);
    setFlowNetwork(false);
  };
  const setFloorMode = (next: boolean) => {
    setFloorPlan(next);
    window.history.replaceState(null, "", next ? "/?view=floor" : "/?view=er_manager");
    setFlowNetwork(false);
  };
  const setFlowMode = (next: boolean) => {
    setFlowNetwork(next);
    setFloorPlan(false);
    window.history.replaceState(null, "", next ? "/?view=flow" : "/?view=er_manager");
  };
  const requestBreakGlass = () => {
    const reason = window.prompt("Reason for wider access (minimum 10 characters):", "");
    if (reason?.trim() && reason.trim().length >= 10) {
      setBreakGlass(true);
      recordAudit("BREAK_GLASS_GRANTED", { reason: reason.trim() });
    }
  };
  const updateAlert = (alias: string, status: AlertState) => {
    if (status === "LEGITIMATE_EXCEPTION") {
      const note = window.prompt("Required exception note:", "");
      if (!note?.trim()) return;
      recordAudit("ALERT_LEGITIMATE_EXCEPTION", { subject: alias, reason: note.trim() });
    } else {
      recordAudit(`ALERT_${status}`, { subject: alias });
    }
    setAlertStates((current) => ({ ...current, [alias]: status }));
  };
  const simulateInflux = () => {
    const newPatients: Patient[] = [1, 2, 3, 2, 3].map((esi, index) => ({
      id: `influx-${influxCount + index + 1}`, alias: `Incoming ${influxCount + index + 1}`, esi,
      pathway: "INFLUX", step: "ARRIVAL", dept: "FRONT_DESK", owner: "FRONT_DESK", previous: "ARRIVAL",
      wait: 0, status: "ON_TRACK", reason: "Synthetic arrival added through the replay pipeline.", next: "TRIAGE", probability: .5, condition: "Presentation not supplied",
    }));
    setInfluxCount((count) => count + 5);
    setLivePatients((current) => [...current, ...newPatients]);
    setSimTime((time) => time + 1);
    recordAudit("SIMULATE_INFLUX", { reason: "Five synthetic arrivals" });
  };
  const restart = () => {
    setLivePatients(patients);
    setAlertStates({});
    setInfluxCount(0);
    setSimTime(120);
    setAcknowledgedHandoffs(new Set());
    recordAudit("REPLAY_RESTARTED");
  };
  const scoped = view !== "ER_MANAGER" && view !== "HOSPITAL_ADMIN" && !breakGlass;
  const parallelPaths = deriveParallelPaths(replayEvents);
  const displayPatients = livePatients.map((patient) => ({ ...patient, activeSteps: parallelPaths.find((pathItem) => pathItem.patientId === patient.alias.replace("Patient ", ""))?.activeSteps }));
  const handoffs = deriveHandoffs(replayEvents, simTime, acknowledgedHandoffs);
  const visible = view === "HOSPITAL_ADMIN" ? [] : scoped ? displayPatients.filter((patient) => patient.dept === view || patient.owner === view || patient.previous === (stationNodes[view] ?? [])[0]) : displayPatients;
  const alerts = visible.filter((patient) => patient.status !== "ON_TRACK" && alertStates[patient.alias] !== "RESOLVED" && alertStates[patient.alias] !== "LEGITIMATE_EXCEPTION").slice(0, 5);
  const isManager = view === "ER_MANAGER" || breakGlass;
  const acknowledgeHandoff = (subject: string) => {
    const handoff = handoffs.find((item) => item.patientId === subject || `Patient ${item.patientId}` === subject);
    if (!handoff) return;
    setAcknowledgedHandoffs((current) => new Set([...current, handoff.id]));
    recordAudit("HANDOFF_ACKNOWLEDGED", { subject: handoff.patientId });
  };
  const surge = detectSurge({ arrivals: [112, 113, 114, 115, 116, 117, 118, 119, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, ...Array(influxCount).fill(simTime)], now: simTime });
  return <main className={`app-shell ${projector ? "projector" : ""}`}>
    <Header view={view} setView={setView} liveFeed={liveFeed} setLiveFeed={setLiveFeed} />
    <div className="dashboard">
      {breakGlass && <div className="break-glass" role="status">Break-glass active. Full ER view for 10 sim minutes. Access reason recorded in audit log.</div>}
      {isManager ? <><div className="title-row"><div><p className="section-label">Hospital overview / replay {String(simTime).padStart(3, "0")}</p><h1>Emergency department overview</h1><p className="muted">Every active encounter, resource constraint, ownership gap, and open alert.</p></div><div className="controls"><button className="primary" onClick={() => setSimTime((time) => time + 1)}>Ⅱ Pause</button><button onClick={restart}>Restart</button><button onClick={simulateInflux}>Simulate 5 arrivals</button><button onClick={() => setProjector(!projector)}>{projector ? "Normal size" : "Projector size"}</button><a href="/metrics">Metrics</a></div></div>
        <div className="view-tabs" role="tablist"><button className={!floorPlan && !flowNetwork ? "active" : ""} onClick={() => { setFloorMode(false); setFlowNetwork(false); }}>Pathway graph</button><button className={flowNetwork ? "active" : ""} onClick={() => setFlowMode(true)}>Flow network</button><button className={floorPlan ? "active" : ""} onClick={() => setFloorMode(true)}>Floor plan</button></div>
        {floorPlan ? <FloorPlan role={view} /> : flowNetwork ? <FlowNetwork /> : <>
        {surge.active && <section className="surge" role="status"><div className="surge-icon">!</div><div><strong>Surge detected. {surge.count} arrivals in {surge.windowMinutes} minutes.</strong><span>Arrival rate {surge.rate.toFixed(1)}/min. Decision support only.</span></div><button onClick={() => recordAudit("SURGE_REVIEWED")}>Consider overflow area</button></section>}
        <p className="summary-line"><strong>60</strong> active encounters. <strong>12 of 34</strong> beds free. <strong>{alerts.length}</strong> need attention. <strong>1</strong> handoff is unconfirmed.</p>
        <section className="card graph-card"><div className="card-heading"><div><p className="section-label">Whole hospital</p><h2>All patient pathways</h2></div><span className="muted">Click a patient alert for journey detail</span></div><div className="hospital-lanes">{["FRONT_DESK", "TRIAGE", "DOCTOR", "CARDIOLOGY", "LAB", "RADIOLOGY", "THEATRE", "WARD"].map((dept) => <div className="hospital-lane" key={dept}><b>{departmentLabels[dept]}</b><span>{livePatients.filter((patient) => patient.dept === dept).length} active</span><i /><span>{livePatients.filter((patient) => patient.owner === dept).length} owned</span></div>)}</div></section>
        <section className="resource-table"><h2>Resources</h2>{[["Beds", "12 of 34", "OK"], ["Imaging", "1 of 2", "CT down"], ["Laboratory", "11 tests active", "OK"], ["Operating theatre", "Ready", "OK"]].map(([name, free, status]) => <div className="resource-row" key={name}><b>{name}</b><span>{free}</span><i><em style={{ width: status === "CT down" ? "35%" : "72%" }} /></i><strong className={status === "CT down" ? "resource-alert" : ""}>● {status}</strong></div>)}</section>
        <section className="content-grid"><section className="card"><div className="card-heading"><h2>Open alerts</h2><span className="muted">Type / owner / last confirmed event</span></div>{alerts.map((patient) => <PatientRow key={patient.alias} patient={patient} onOpen={() => setSelected(patient)} onAcknowledge={() => updateAlert(patient.alias, "ACKNOWLEDGED")} />)}{alerts.map((patient) => <div className="alert-actions" key={`actions-${patient.alias}`}><span>{patient.alias}: {alertStates[patient.alias] ?? "OPEN"}</span><button onClick={() => updateAlert(patient.alias, "RESOLVED")}>Resolve alert</button><button onClick={() => updateAlert(patient.alias, "LEGITIMATE_EXCEPTION")}>Record exception</button></div>)}</section><section className="card"><div className="card-heading"><h2>Feed health</h2><a href="/metrics">View metrics</a></div>{["ADT", "LIS", "RIS", "OR_LOG", "RTLS", "NURSE_TAP", "BED_SENSOR", "INVENTORY", "DEVICE_HEARTBEAT"].map((feed) => <div className="feed-row" key={feed}><b>{feed}</b><span>Last successful update 1m ago</span><strong>OK</strong></div>)}</section></section>
        <section className="card parallel-panel"><div className="card-heading"><h2>Parallel work</h2><span className="muted">Active steps from replay events</span></div>{parallelPaths.map((parallel) => <p key={parallel.patientId}>Patient {parallel.patientId}: {parallel.activeSteps.map((step) => clinicalTerms[step] ?? step).join(", ")} are active in parallel.</p>)}</section>
        <section className="card handoff-panel"><div className="card-heading"><h2>Handoffs</h2><span className="muted">Pending records are visible to sender, receiver, and ER Manager</span></div>{handoffs.map((handoff) => <div className="handoff-row" key={handoff.id}><b>Patient {handoff.patientId}</b><span>{handoff.summary}</span><strong>{handoff.ownershipGap ? "Ownership gap" : handoff.status}</strong>{handoff.status === "PENDING" && <button onClick={() => acknowledgeHandoff(handoff.patientId)}>Acknowledge handoff</button>}</div>)}</section>
        </>}
      </> : view === "HOSPITAL_ADMIN" ? <><div className="title-row"><div><p className="section-label">Hospital admin</p><h1>Aggregate operations</h1><p className="muted">Minimum necessary access: patient rows are not available in this view.</p></div></div><p className="summary-line"><strong>60</strong> active encounters. <strong>12 of 34</strong> beds free. <strong>8</strong> patients in imaging. <strong>5</strong> open alerts.</p></> : <StationView view={view} patients={displayPatients} handoffs={handoffs} onOpen={setSelected} onAcknowledge={acknowledgeHandoff} onBreakGlass={requestBreakGlass} />}
      {selected && <PatientJourney patient={selected} scoped={scoped} />}
      <footer><span>ER flow / synthetic data / flags are decision support, not verdicts</span><nav><a href="/sources">Sources</a><a href="/integration">Integration</a><a href="/compliance">Compliance</a><a href="/metrics">Metrics</a></nav></footer>
    </div>
  </main>;
}
