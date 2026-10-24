"use client";

import { useMemo } from "react";
import type { LearnedModel } from "../lib/types";
import type { FlowEvent } from "../lib/engine/flow-network";

type Edge = LearnedModel["edges"][number];
type FlowGraphProps = {
  model: LearnedModel;
  pathway: string;
  events: FlowEvent[];
  currentNode?: string;
  selectedNode?: string;
  onSelect: (id: string) => void;
  /** Accepted so existing callers still compile. The graph has one fixed layout. */
  orientation?: "horizontal" | "vertical";
  anomalyNode?: string;
  staleNode?: string;
  ownershipGap?: boolean;
};

type Pt = { x: number; y: number };

/* Hand-placed layout: every node sits at its own angle, so the graph reads as a network, not a column. */
const WIDTH = 460;
const MIN_HEIGHT = 590;
const NODE_W = 104;
const NODE_H = 40;
const POSITIONS: Record<string, Pt> = {
  ARRIVAL: { x: 213, y: 52 },
  TRIAGE: { x: 197, y: 114 },
  DOCTOR: { x: 122, y: 177 },
  XRAY: { x: 358, y: 223 },
  ECG: { x: 219, y: 290 },
  BLOOD_TEST: { x: 65, y: 333 },
  CT: { x: 396, y: 336 },
  SURGERY: { x: 390, y: 411 },
  RESULTS: { x: 186, y: 431 },
  ADMIT: { x: 354, y: 528 },
  DISCHARGE: { x: 119, y: 560 },
};
const LABELS: Record<string, string> = {
  ARRIVAL: "Arrival", TRIAGE: "Triage", DOCTOR: "Doctor", ECG: "ECG", BLOOD_TEST: "Blood test", XRAY: "X-ray",
  CT: "CT", RESULTS: "Results", SURGERY: "Surgery", ADMIT: "Admit", DISCHARGE: "Discharge",
};
const labelFor = (id: string) => LABELS[id] ?? id.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** Point on a node's border, on the line towards `to`, pushed `margin` px outwards. */
function clip(from: Pt, to: Pt, margin: number): Pt {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const t = Math.min((NODE_W / 2) / Math.max(Math.abs(dx), 1e-6), (NODE_H / 2) / Math.max(Math.abs(dy), 1e-6));
  const k = t + margin / length;
  return { x: from.x + dx * k, y: from.y + dy * k };
}

export default function FlowGraph({ model, pathway, events, currentNode, selectedNode, onSelect, anomalyNode }: FlowGraphProps) {
  const layout = useMemo(() => {
    // Nodes without a hand-placed slot go in a grid underneath, so a new activity never disappears.
    let extra = 0;
    const nodes = model.nodes.map((node) => {
      const placed = POSITIONS[node.id];
      if (placed) return { id: node.id, ...placed };
      const slot = extra;
      extra += 1;
      return { id: node.id, x: 80 + (slot % 3) * 150, y: MIN_HEIGHT + 20 + Math.floor(slot / 3) * 62 };
    });
    const height = Math.max(MIN_HEIGHT, ...nodes.map((node) => node.y + NODE_H / 2 + 16));
    return { nodes, height, byId: new Map(nodes.map((node) => [node.id, node])) };
  }, [model.nodes]);

  const count = (edge: Edge) => edge.countByPathway[pathway] ?? 0;
  const key = (edge: Edge) => `${edge.from}>${edge.to}`;
  const pathwayTotal = Math.max(1, ...model.nodes.map((node) => node.visitsByPathway[pathway] ?? 0));
  const maxCount = Math.max(1, ...model.edges.map(count));

  const takenKeys = useMemo(() => {
    const taken = new Set<string>();
    events.forEach((event, index) => { if (index > 0) taken.add(`${events[index - 1].node}>${event.node}`); });
    return taken;
  }, [events]);

  // Most likely route from the current step onwards: follow the busiest unvisited edge each time.
  const predictedKeys = useMemo(() => {
    const keys = new Set<string>();
    if (!currentNode) return keys;
    const seen = new Set(events.map((event) => event.node));
    seen.add(currentNode);
    let node = currentNode;
    for (let step = 0; step < 6; step += 1) {
      const next = model.edges
        .filter((edge) => edge.from === node && !seen.has(edge.to) && (edge.countByPathway[pathway] ?? 0) > 0)
        .sort((a, b) => (b.countByPathway[pathway] ?? 0) - (a.countByPathway[pathway] ?? 0))[0];
      if (!next) break;
      keys.add(`${next.from}>${next.to}`);
      seen.add(next.to);
      node = next.to;
    }
    return keys;
  }, [model.edges, events, currentNode, pathway]);

  const edgeState = (edge: Edge) => {
    const taken = takenKeys.has(key(edge));
    return { taken, predicted: !taken && predictedKeys.has(key(edge)), anomaly: taken && anomalyNode === edge.to };
  };
  const visibleEdges = model.edges.filter((edge) => {
    const state = edgeState(edge);
    return state.taken || state.predicted || state.anomaly || count(edge) / pathwayTotal >= 0.03;
  });
  // Draw quiet edges first so the path and prediction sit on top.
  const rank = (edge: Edge) => { const s = edgeState(edge); return s.anomaly ? 3 : s.taken ? 2 : s.predicted ? 1 : 0; };
  const orderedEdges = [...visibleEdges].sort((a, b) => rank(a) - rank(b));

  return (
    <div className="flow-graph">
      <svg className="flow-network-svg" viewBox={`0 0 ${WIDTH} ${layout.height}`} role="img" aria-label="Learned emergency department flow network"
        style={{ width: "100%", maxWidth: 560, height: "auto", maxHeight: "none", display: "block", margin: "0 auto" }}>
        <defs>
          {["flow", "green", "blue", "red"].map((color) => (
            <marker key={color} id={`flow-arrow-${color}`} viewBox="0 0 10 10" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" className={`flow-marker-${color}`} />
            </marker>
          ))}
        </defs>
        {orderedEdges.map((edge) => {
          const source = layout.byId.get(edge.from);
          const target = layout.byId.get(edge.to);
          if (!source || !target) return null;
          const state = edgeState(edge);
          const color = state.anomaly ? "red" : state.taken ? "green" : state.predicted ? "blue" : "flow";
          const a = clip(source, target, 0);
          const b = clip(target, source, 2);
          return <path key={key(edge)} d={`M${a.x},${a.y} L${b.x},${b.y}`}
            className={`flow-edge ${state.taken ? "taken" : ""} ${state.predicted ? "predicted" : ""} ${state.anomaly ? "anomaly" : ""}`}
            strokeWidth={state.taken || state.predicted || state.anomaly ? undefined : 1 + 4 * (count(edge) / maxCount)}
            markerEnd={`url(#flow-arrow-${color})`} />;
        })}
        {layout.nodes.map((item) => {
          const visits = model.nodes.find((node) => node.id === item.id)?.visitsByPathway[pathway] ?? 0;
          const percent = Math.round((visits / pathwayTotal) * 100);
          const visited = events.some((event) => event.node === item.id);
          const current = currentNode === item.id;
          const anomaly = anomalyNode === item.id;
          return <g key={item.id} className={`flow-node ${visited ? "visited" : ""} ${current ? "current" : ""} ${anomaly ? "anomaly" : ""} ${selectedNode === item.id ? "selected" : ""}`}
            transform={`translate(${item.x},${item.y})`} role="button" tabIndex={0} aria-label={`${labelFor(item.id)}, ${percent}% of visits`}
            onClick={() => onSelect(item.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(item.id); } }}>
            <title>{`${labelFor(item.id)}, ${percent}% of visits`}</title>
            {selectedNode === item.id && <rect className="flow-node-selection" x={-NODE_W / 2 - 4} y={-NODE_H / 2 - 4} width={NODE_W + 8} height={NODE_H + 8} rx="11" style={{ fill: "none", stroke: "#1D2B36", strokeWidth: 1.5, strokeDasharray: "4 3" }} />}
            <rect className="flow-node-body" x={-NODE_W / 2} y={-NODE_H / 2} width={NODE_W} height={NODE_H} rx="9" />
            <text className="flow-node-label" x="0" y="-2" textAnchor="middle">{labelFor(item.id)}</text>
            <text className="flow-node-share" x="0" y="13" textAnchor="middle">{percent}% of visits</text>
          </g>;
        })}
      </svg>
    </div>
  );
}