import Link from "next/link";

const rows = [
  ["HL7 v2 (ADT, ORU)", "Interoperability with existing hospital records", "Source adapter contract", "Implemented in demo"],
  ["HL7 FHIR R4", "Portable clinical exchange", "Encounter and Observation mappings plus source toggle", "Implemented in demo"],
  ["SNOMED CT / LOINC", "Standard clinical displays and observations", "Terminology boundary in UI", "Designed for production"],
  ["ESI triage", "Urgency context for prioritization", "ESI 1–5 labels and sort order", "Implemented in demo"],
  ["ISO 9241-210", "Human-centred workflow design", "Role views, low cognitive load", "Designed for production"],
  ["WCAG 2.2", "Accessible, high-contrast operation", "Text labels, focusable controls", "Implemented in demo"],
  ["HIPAA Security Rule", "Access, audit, and transmission controls", "Role boundary and audit surface", "Designed for production"],
  ["NIST SP 800-66", "Healthcare security implementation guidance", "Security checklist for deployment", "Designed for production"],
  ["ISO/IEC 27001", "Information security management", "Organizational controls", "Out of scope"],
  ["UAE PDPL / Federal Law No. 2 of 2019", "Local privacy and health information obligations", "Data residency and retention plan", "Designed for production"],
  ["ADHICS", "Abu Dhabi healthcare cyber security", "Threat model and controls plan", "Designed for production"],
  ["Minimum necessary / role-based access", "HIPAA Privacy and Security Rules; ISO/IEC 27001 access control", "Department-scoped selectors, break-glass, audit log", "Implemented in demo; production uses OIDC or SMART on FHIR"],
  ["Hand-off communication", "Joint Commission Sentinel Event Alert 58", "Replay-derived pending handoff, acknowledgement, ownership-gap flag", "Implemented in demo"],
  ["Content-Security-Policy and HSTS", "Browser and transport hardening", "Not enabled in this demo configuration", "Designed for production"],
  ["Device and message formats", "HL7 v2 ORU, FHIR Observation, DICOM, serial, and BLE feeds", "Deterministic simulated device parsers", "Implemented in demo (simulated devices)"],
];

const alertRows = [
  ["Valid transition", "Update silently", "No alert"],
  ["Missing event past threshold", "LATE", "Staff review"],
  ["Conflicting sources", "INCONSISTENT", "Flag for reconciliation"],
  ["Unexpected transition", "UNEXPECTED", "Flagged for staff review"],
  ["Source feed lost", "STALE", "Technical notice"],
  ["Urgent authorized condition", "Approved escalation policy", "Simulated and audit logged"],
];

const accessRows = [
  ["ER Manager", "All patients, departments, resources, alerts, handoffs", "Nothing in the demo"],
  ["Station role", "Own station, one-hop incoming and just-left handoffs, local resources", "Waiting-room patients and other departments"],
  ["Hospital Admin", "Aggregates and resources", "All patient rows and clinical journey detail"],
];

export default function CompliancePage() {
  return <main className="simple-page"><header className="topbar"><Link href="/" className="back">Dashboard</Link><div className="brand"><div><strong>ER flow</strong><small>Compliance matrix</small></div></div><span className="synthetic"><span className="dot" /> Synthetic data</span></header><div className="simple-content"><h1>Compliance matrix</h1><p className="lead">This matrix describes design intent and demo scope. ER flow does not claim certification, clinical validation, or regulatory approval.</p><section className="simple-table compliance-table"><div className="table-head"><span>Standard or regulation</span><span>Why it applies</span><span>Where in design</span><span>Status</span></div>{rows.map((r) => <div className="table-row" key={r[0]}><b>{r[0]}</b><span>{r[1]}</span><span>{r[2]}</span><span className={r[3].startsWith("Implemented") ? "status-good" : "status-plan"}>{r[3]}</span></div>)}</section><section className="alert-table"><h2>Alert handling</h2><div className="table-head"><span>Condition</span><span>System state</span><span>Handling</span></div>{alertRows.map((r) => <div className="table-row" key={r[0]}><b>{r[0]}</b><span>{r[1]}</span><span>{r[2]}</span></div>)}</section><section className="alert-table"><h2>Who sees what</h2><div className="table-head"><span>Role</span><span>Sees</span><span>Does not see</span></div>{accessRows.map((r) => <div className="table-row" key={r[0]}><b>{r[0]}</b><span>{r[1]}</span><span>{r[2]}</span></div>)}</section><p className="page-note">Infection-control exposure windows and isolation rules are configurable policy settings to be set by the hospital infection prevention team.</p><div className="info-columns"><section className="info-box"><h2>What we do not claim</h2><p>No certification. No clinical validation yet. No real patient data. No savings figures without site data. The HL7 connector and ingest endpoint are read-only and never write back to hospital systems. Production deployment requires security, privacy, retention, and clinical governance review.</p></section><section className="info-box"><h2>Demo audit storage</h2><p>Audit entries are stored in browser localStorage when available, with an in-memory fallback. This is demo storage only. Production would use an append-only audit store with controlled retention. The ingest rate limit is per serverless instance, not a distributed production control.</p></section></div></div></main>;
}
