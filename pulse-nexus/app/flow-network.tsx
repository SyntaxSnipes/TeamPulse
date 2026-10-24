"use client";

import { useEffect, useMemo, useState } from "react";
import { evaluate } from "../lib/engine/rules";
import { layoutNodes, pathwayLabels, predictPaths, pathStatus, type FlowEvent } from "../lib/engine/flow-network";
import type { LearnedModel, Sop } from "../lib/types";
import FlowGraph from "./flow-graph";

type Mode = "Typical" | "Delayed" | "Unexpected" | "Resource blocked";
const modes: Mode[] = ["Typical", "Delayed", "Unexpected", "Resource blocked"];
const fallbackSop = { pathways: {} } as Sop;

function scenarios(model: LearnedModel, pathway: string): Record<Mode, FlowEvent[]> {
  const edges = model.edges.filter((edge) => ((edge.countByPathway as Record<string, number>)[pathway] ?? 0) > 0);
  const terminals = new Set(["DISCHARGE", "ADMIT", "SURGERY"]);
  const route = (node: string, seen: string[] = []): string[] => {
    if (terminals.has(node)) return [node];
    const choices = edges.filter((edge) => edge.from === node && !seen.includes(edge.to))
      .sort((a, b) => ((b.countByPathway as Record<string, number>)[pathway] ?? 0) - ((a.countByPathway as Record<string, number>)[pathway] ?? 0));
    for (const choice of choices) {
      const rest = route(choice.to, [...seen, node]);
      if (rest.length) return [node, ...rest];
    }
    return [];
  };
  const nodes = route("ARRIVAL");
  const typical = nodes.reduce<FlowEvent[]>((events, node, index) => {
    if (!index) return [{ node, minute: 0 }];
    const edge = edges.find((item) => item.from === nodes[index - 1] && item.to === node);
    return [...events, { node, minute: events.at(-1)!.minute + (edge?.medianMin ?? 10) }];
  }, []);
  const delayed = typical.map((event, index) => ({ ...event, minute: event.minute + (index >= 2 ? 45 : 0) }));
  const unexpected = typical.slice(0, 3).concat({ node: "DISCHARGE", minute: (typical[2]?.minute ?? 30) + 5 });
  const blockedBase = edges.some((edge) => edge.from === "DOCTOR" && edge.to === "CT") ? ["ARRIVAL", "TRIAGE", "DOCTOR", "CT", "RESULTS", "DISCHARGE"] : nodes;
  const blocked = blockedBase.map((node, index) => ({ node, minute: index * 20 + (index === 3 ? 80 : 0) }));
  return { Typical: typical, Delayed: delayed, Unexpected: unexpected, "Resource blocked": blocked };
}

export default function FlowNetwork() {
  const [model, setModel] = useState<LearnedModel>();
  const [sop, setSop] = useState<Sop>(fallbackSop);
  const [pathway, setPathway] = useState(pathwayLabels[0].id);
  const [mode, setMode] = useState<Mode>("Typical");
  const [eventIndex, setEventIndex] = useState(0);
  const [selectedNode, setSelectedNode] = useState("ARRIVAL");
  const [orientation, setOrientation] = useState<"horizontal" | "vertical">("horizontal");
  const [inspectorTab, setInspectorTab] = useState<"response" | "analytics">("response");
  const [playing, setPlaying] = useState(false);
  const [evaluationMs, setEvaluationMs] = useState(0);

  useEffect(() => {
    void Promise.all([fetch("/data/model.json").then((response) => response.json()), fetch("/data/sop.json").then((response) => response.json())]).then(([nextModel, nextSop]) => {
      setModel(nextModel);
      setSop(nextSop);
    });
  }, []);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 699px)");
    const update = () => setOrientation(media.matches ? "vertical" : "horizontal");
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const currentModel = model;
  const eventSet = useMemo(() => currentModel ? scenarios(currentModel, pathway) : { Typical: [], Delayed: [], Unexpected: [], "Resource blocked": [] }, [currentModel, pathway]);
  const events = eventSet[mode];
  const visibleEvents = events.slice(0, eventIndex + 1);
  const current = visibleEvents.at(-1);
  const pathwayModel = useMemo(() => {
    if (!currentModel) return undefined;
    const pathwayEdges = currentModel.edges.filter((edge) => ((edge.countByPathway as Record<string, number>)[pathway] ?? 0) > 0);
    const nodeIds = new Set(pathwayEdges.flatMap((edge) => [edge.from, edge.to]));
    return { ...currentModel, nodes: currentModel.nodes.filter((node) => nodeIds.has(node.id)), edges: pathwayEdges };
  }, [currentModel, pathway]);
  const nodes = useMemo(() => pathwayModel ? layoutNodes(pathwayModel, orientation) : [], [pathwayModel, orientation]);
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const predictions = useMemo(() => currentModel ? predictPaths(currentModel, current?.node ?? "ARRIVAL", pathway) : [], [currentModel, current?.node, pathway]);
  const currentFlag = useMemo(() => {
    if (!currentModel || !current) return undefined;
    return evaluate(currentModel, sop, { id: "flow-demo", pathway, currentStep: current.node, previousStep: visibleEvents.at(-2)?.node, lastEventT: visibleEvents.at(-2)?.minute ?? current.minute, orderedSteps: visibleEvents.map((event) => event.node) }, mode === "Resource blocked" ? [{ id: "CT", status: "DOWN", available: 0, source: "RIS", lastUpdateT: current.minute }] : [], current.minute);
  }, [currentModel, current, visibleEvents, pathway, mode, sop]);
  const flagStatus = currentFlag?.status as string | undefined;
  const selected = pathwayModel?.nodes.find((node) => node.id === selectedNode) ?? pathwayModel?.nodes[0];
  const selectedEdges = currentModel?.edges.filter((edge) => edge.from === selected?.id) ?? [];
  const selectedShare = selected && currentModel ? ((selected.visitsByPathway as Record<string, number>)[pathway] ?? 0) / currentModel.sampleSize : 0;
  const response = useMemo(() => {
    if (!currentModel || !selected) return null;
    const patient = { id: "flow-demo", pathway, currentStep: selected.id, previousStep: visibleEvents.at(-2)?.node, lastEventT: visibleEvents.at(-2)?.minute ?? current?.minute ?? 0, orderedSteps: visibleEvents.map((event) => event.node) };
    const result = evaluate(currentModel, sop, patient, [], current?.minute ?? 0);
    return { currentNode: selected.id, elapsedMinutes: current?.minute ?? 0, history: visibleEvents, nextSteps: predictions.map((path) => ({ node: path.nodes[1], probability: path.probability, eta: path.extraMinutes, p90: currentModel.edges.find((edge) => edge.from === path.nodes[0] && edge.to === path.nodes[1])?.p90Min })), flag: result };
  }, [currentModel, selected, current, visibleEvents, pathway, sop, predictions]);
  useEffect(() => {
    if (!currentModel || !selected) return;
    const timer = window.setTimeout(() => {
      const start = performance.now();
      evaluate(currentModel, sop, { id: "flow-demo", pathway, currentStep: selected.id, lastEventT: visibleEvents.at(-2)?.minute ?? current?.minute ?? 0 }, [], current?.minute ?? 0);
      setEvaluationMs(performance.now() - start);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [currentModel, selected, pathway, current, visibleEvents, sop]);
  useEffect(() => {
    if (!playing) return;
    if (eventIndex >= events.length - 1) return;
    const timer = window.setTimeout(() => setEventIndex((value) => value + 1), 1500);
    return () => window.clearTimeout(timer);
  }, [playing, eventIndex, events.length]);
  if (!currentModel) return <section className="card"><p>Loading learned flow data.</p></section>;
  return <section className="flow-network">
    <div className="flow-network-heading"><div><h2>Learned pathway graph</h2><p className="muted">Learned from {currentModel.sampleSize.toLocaleString()} generated visits.</p></div><span className="muted">{visibleEvents.length} of {events.length} events</span></div>
    <div className="flow-controls">
      <label htmlFor="flow-pathway">Symptoms <select id="flow-pathway" value={pathway} onChange={(event) => { setPathway(event.target.value); setEventIndex(0); }}>{pathwayLabels.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
      <div className="flow-mode-tabs" role="tablist" aria-label="Scenario"><span className="sr-only">Scenario</span>{modes.map((item) => <button role="tab" aria-selected={mode === item} className={mode === item ? "active" : ""} key={item} onClick={() => { setMode(item); setEventIndex(0); }} onKeyDown={(event) => { if (event.key === "ArrowRight") setMode(modes[(modes.indexOf(item) + 1) % modes.length]); if (event.key === "ArrowLeft") setMode(modes[(modes.indexOf(item) + modes.length - 1) % modes.length]); }}>{item}</button>)}</div>
    </div>
    <div className="flow-network-grid">
      <section className="card flow-graph-card">
        <div className="flow-actions"><button className="primary" onClick={() => setEventIndex((value) => Math.min(value + 1, events.length - 1))}>Next event</button><button onClick={() => { setEventIndex(0); setPlaying(false); }}>Reset</button><button onClick={() => setPlaying((value) => !value)}>{playing ? "Pause auto-play" : "Auto-play"}</button></div>
        <FlowGraph model={pathwayModel ?? currentModel} pathway={pathway} events={visibleEvents} currentNode={current?.node} selectedNode={selected?.id} onSelect={setSelectedNode} orientation={orientation} anomalyNode={flagStatus === "UNEXPECTED" ? current?.node : mode === "Resource blocked" ? "CT" : undefined} staleNode={flagStatus === "STALE" ? current?.node : undefined} ownershipGap={flagStatus === "INCONSISTENT"} />
        <p className="flow-legend"><span className="legend-flow">learned flow</span><span className="legend-taken">path taken</span><span className="legend-predicted">predicted next</span><span className="legend-anomaly">anomaly</span><span className="legend-handoff">handoff</span></p>
        <p className="muted">Select a node to see its request, response and analytics.</p>
      </section>
      <div className="flow-network-side">
        <section className="card"><h2>Predicted pathways</h2>{predictions.map((prediction, index) => <div className="flow-path-row" key={prediction.nodes.join("-")}><b>{index === 0 ? "Most likely" : "Alternative"}</b><span>{prediction.nodes.map((id) => nodeMap.get(id)?.label ?? id).join(" then ")}. {Math.round(prediction.probability * 100)}%; about {prediction.extraMinutes} minutes.</span></div>)}{currentFlag && <p className={`flow-status-pill ${currentFlag.status.toLowerCase()}`}><b>{currentFlag.status === "LATE" ? "!" : currentFlag.status === "UNEXPECTED" ? "!" : "✓"}</b> {currentFlag.status === "ON_TRACK" ? "On track" : currentFlag.status === "LATE" ? "Late" : "Unexpected"}: {currentFlag.reason}</p>}</section>
        <section className="card"><div className="inspector-tabs" role="tablist">{[["response", "Request and response"], ["analytics", "Analytics"]].map(([id, label]) => <button role="tab" aria-selected={inspectorTab === id} className={inspectorTab === id ? "active" : ""} key={id} onClick={() => setInspectorTab(id as typeof inspectorTab)}>{label}</button>)}</div><h2>{selected?.label}</h2>{inspectorTab === "response" ? <><pre className="flow-json">{JSON.stringify(response, null, 2)}</pre><p className="muted">Measured evaluation: {evaluationMs.toFixed(2)} ms.</p></> : <div className="flow-analytics"><p>Historical visits: <b>{((selected?.visitsByPathway as Record<string, number>)?.[pathway]) ?? 0}</b>.</p><p>Share of all visits: <b>{(selectedShare * 100).toFixed(1)}%</b>.</p><p>Typical time to next step: <b>{selected?.medianMin} minutes</b>; p90 <b>{selected?.p90Min} minutes</b>.</p><p>Rare exits: calculated from learned edges below 3%.</p><p>Confidence: <b>{Math.round((selectedEdges.sort((a, b) => b.prob - a.prob)[0]?.prob ?? 0) * 100)}%</b>.</p></div>}</section>
        <section className="card"><h2>Patient timeline</h2>{visibleEvents.slice().reverse().map((event, index) => { const originalIndex = visibleEvents.length - index - 1; return <button className="flow-timeline-row" key={`${event.node}-${event.minute}`} onClick={() => { setSelectedNode(event.node); setEventIndex(originalIndex); }}><b>{event.minute} min</b><span>{nodeMap.get(event.node)?.label}</span><strong>{pathStatus(currentModel, visibleEvents, originalIndex)}</strong></button>; })}</section>
      </div>
    </div>
  </section>;
}