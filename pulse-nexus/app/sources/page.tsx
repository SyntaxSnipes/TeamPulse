"use client";

import Link from "next/link";
import { useState } from "react";
import { encounterToCanonical, observationToCanonical } from "../../lib/adapters/fhir";

const sources = [
  ["ADT", "Arrival, transfer, discharge", "ADT^A01 / A04", "caseId / activity / timestamp / location"],
  ["LIS", "Laboratory results", "ORU^R01", "caseId / activity / timestamp / sourceSystem"],
  ["RIS", "Radiology workflow", "FHIR / Observation", "caseId / activity / timestamp / resource"],
  ["RTLS", "Optional location signals", "Wristband + ceiling sensor", "caseId / location / timestamp"],
  ["NURSE_TAP", "Manual milestone", "Secure tap action", "caseId / activity / timestamp"],
  ["BED_SENSOR", "Bed availability", "Sensor heartbeat", "resource / available / status"],
];

export default function SourcesPage() {
  const [asFhir, setAsFhir] = useState(false);
  const encounter = encounterToCanonical({ resourceType: "Encounter", id: "enc-1", status: "in-progress", subject: { reference: "Patient/K-104" }, location: [{ location: { display: "Triage" } }] }, 120);
  const observation = observationToCanonical({ resourceType: "Observation", id: "obs-1", status: "final", subject: { reference: "Patient/K-104" }, code: { coding: [{ code: "8867-4", display: "Heart rate" }] }, valueQuantity: { value: 86, unit: "beats/min" } }, 120);
  const canonical = asFhir ? { Encounter: encounter, Observation: observation } : { caseId: "K-104", activity: "OBSERVATION", timestamp: 120, location: "Triage", sourceSystem: "FHIR" };
  return <main className="simple-page"><header className="topbar"><Link href="/" className="back">Dashboard</Link><div className="brand"><div><strong>ER flow</strong><small>Data integration</small></div></div><span className="synthetic"><span className="dot" /> Synthetic data</span></header><div className="simple-content"><h1>How data gets in</h1><p className="lead">Every source is normalized into one small, auditable event contract before pathway evaluation. This demo replays synthetic files; the connector receives a read-only copy and never writes back. <Link href="/?view=floor">Open the floor plan live feed</Link>.</p><label className="toggle-row"><input type="checkbox" checked={asFhir} onChange={(event) => setAsFhir(event.target.checked)} /> View as FHIR</label><section className="simple-table"><div className="table-head"><span>Source</span><span>Collected as</span><span>Sample</span><span>Canonical row</span></div>{sources.map((s) => <div className="table-row" key={s[0]}><b>{s[0]}</b><span>{s[1]}</span><code>{s[2]}</code><span>{s[3]}</span></div>)}</section><div className="info-columns"><section className="info-box"><h2>{asFhir ? "FHIR Encounter and Observation" : "Canonical row"}</h2><pre>{JSON.stringify(canonical, null, 2)}</pre></section><section className="info-box"><h2>Honest limits</h2><p>Synthetic data only. A flag means “worth a look”, never that a mistake was made. Location tracking is optional and intended for on-duty work zones only. Same-zone presence does not prove care was given.</p></section></div><p className="page-note">Designed for HL7 v2 and FHIR R4 adapters. Authentication, TLS, retention, and site-specific validation are production requirements.</p></div></main>;
}
