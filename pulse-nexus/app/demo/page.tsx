"use client";

import Link from "next/link";
import { useState } from "react";
import { evaluate } from "../../lib/engine/rules";

const model = { synthetic: true as const, generatedAt: "demo", sampleSize: 80, nodes: [{ id: "CT", label: "CT", medianMin: 20, p90Min: 35, visits: 80, visitsByPathway: { DEMO: 80 } }], edges: [{ from: "DOCTOR", to: "CT", prob: .7, medianMin: 20, p90Min: 35, count: 56, countByPathway: { DEMO: 56 } }] };
const sop = { pathways: { DEMO: { allowedTransitions: [["DOCTOR", "CT"] as ["DOCTOR", "CT"]], prerequisites: {}, defaultMaxMinutes: { CT: 30 } } } } as never;
const scenarios = {
  Typical: { previousStep: "DOCTOR", currentStep: "CT", lastEventT: 100 },
  Delayed: { previousStep: "DOCTOR", currentStep: "CT", lastEventT: 50 },
  Unexpected: { previousStep: "ARRIVAL", currentStep: "CT", lastEventT: 100 },
  "Resource blocked": { previousStep: "DOCTOR", currentStep: "CT", lastEventT: 100 },
};

export default function DemoPage() {
  const [scenario, setScenario] = useState<keyof typeof scenarios>("Typical");
  const base = scenarios[scenario];
  const result = evaluate(model, sop, { id: "demo", pathway: "DEMO", ...base }, scenario === "Resource blocked" ? [{ id: "CT", status: "DOWN", available: 0, source: "RIS", lastUpdateT: 120 }] : [], 120);
  return <main className="simple-page"><header className="topbar"><Link href="/" className="back">Dashboard</Link><div className="brand"><div><strong>ER flow</strong><small>Guided demo</small></div></div></header><div className="simple-content"><h1>Guided scenarios</h1><p className="lead">Each scenario uses the same pathway evaluator that produces the dashboard flags.</p><div className="scenario-tabs" role="tablist">{Object.keys(scenarios).map((item) => <button className={scenario === item ? "active" : ""} key={item} onClick={() => setScenario(item as keyof typeof scenarios)}>{item}</button>)}</div><section className="card demo-result"><h2>{scenario}</h2><p className="summary-line">Current step: <strong>CT</strong>. Result: <strong>{result.status}</strong>.</p><p>{result.reason}</p><p className="muted">Predicted next: {result.predictedNext[0]?.to ?? "none"}.</p></section></div></main>;
}
