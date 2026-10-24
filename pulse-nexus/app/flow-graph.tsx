"use client";

import { useMemo, useState } from "react";
import type { LearnedModel } from "../lib/types";
import {
  activityLayouts, gridLayout, roundedOrthogonalPath, STAGES,
  type Orientation, type PositionedActivity,
} from "../lib/flow/layoutConfig";
import type { FlowEvent } from "../lib/engine/flow-network";

type Edge = LearnedModel["edges"][number];
type FlowGraphProps = {
  model: LearnedModel;
  pathway: string;
  events: FlowEvent[];
  currentNode?: string;
  selectedNode?: string;
  onSelect: (id: string) => void;
  orientation?: Orientation;
  anomalyNode?: string;
  staleNode?: string;
  ownershipGap?: boolean;
};

function stateFor(edge: Edge, events: FlowEvent[], currentNode?: string, anomalyNode?: string) {
  const taken = events.some((event, index) => index > 0 && events[index - 1].node === edge.from && event.node === edge.to);
  const predicted = currentNode === edge.from && !taken;
  const anomaly = anomalyNode === edge.to && taken;
  return { taken, predicted, anomaly };
}

function textWidth(label: string) {
  return label.length * 7.2;
}

export default function FlowGraph({
  model, pathway, events, currentNode, selectedNode, onSelect, orientation = "horizontal",
  anomalyNode, staleNode, ownershipGap = false,
}: FlowGraphProps) {
  const [hoveredNode, setHoveredNode] = useState<string>();
  const layout = useMemo(() => gridLayout(model, orientation), [model, orientation]);
  const config = useMemo(() => activityLayouts(model), [model]);
  const nodeMap = new Map(layout.nodes.map((node) => [node.id, node]));
  const visibleEdges = model.edges.filter((edge) => {
    const share = (edge.countByPathway[pathway] ?? edge.count) / Math.max(model.sampleSize, 1);
    const state = stateFor(edge, events, currentNode, anomalyNode);
    return share >= 0.03 || state.taken || state.predicted || state.anomaly;
  });
  const focusNode = hoveredNode ?? selectedNode;
  const lanes = [...new Set(config.map((activity) => activity.lane))];
  const markerColors = ["flow", "green", "blue", "red", "amber"];
  const node = (id: string) => nodeMap.get(id);
  const shareOf = (id: string) => (model.nodes.find((item) => item.id === id)?.visitsByPathway[pathway] ?? 0) / Math.max(model.sampleSize, 1);
  const position = (id: string): PositionedActivity | undefined => node(id);
  const elapsed = currentNode ? events.findLast((event) => event.node === currentNode)?.minute ?? 0 : 0;
  return (
    <div className="flow-graph" data-orientation={orientation}>
      <svg className="flow-network-svg" viewBox={`0 0 ${layout.width} ${layout.height}`} role="img" aria-label="Learned emergency department flow network">
        <defs>
          <filter id="flow-selected-shadow"><feDropShadow dx="0" dy="0" stdDeviation="1" floodColor="#1D2B36" /></filter>
          {markerColors.map((color) => <marker key={color} id={`flow-arrow-${color}`} viewBox="0 0 8 8" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" className={`flow-marker-${color}`} /></marker>)}
        </defs>
        {lanes.map((lane, index) => <g key={lane}>
          <rect className="flow-lane-band" x="0" y={16 + (orientation === "horizontal" ? index * 80 : 32)} width={layout.width} height={orientation === "horizontal" ? 80 : 0} />
          {orientation === "horizontal" && <text className="flow-lane-label" x="16" y={16 + index * 80 + 45}>{lane}</text>}
        </g>)}
        {orientation === "vertical" && lanes.map((lane, index) => <text className="flow-lane-label flow-lane-label-top" key={`top-${lane}`} x={16 + 120 + index * 240 + 72} y="26" textAnchor="middle">{lane}</text>)}
        {STAGES.map((stage, index) => orientation === "horizontal"
          ? <text className="flow-stage-label" key={stage} x={16 + 120 + index * 240 + 72} y="27" textAnchor="middle">{stage}</text>
          : <text className="flow-stage-label" key={stage} x="16" y={16 + 32 + index * 80 + 45}>{stage}</text>)}
        {visibleEdges.map((edge, index) => {
          const source = position(edge.from);
          const target = position(edge.to);
          if (!source || !target) return null;
          const state = stateFor(edge, events, currentNode, anomalyNode);
          const handoff = source.lane !== target.lane;
          const color = state.anomaly ? "red" : state.taken ? "green" : state.predicted ? "blue" : "flow";
          const dimmed = Boolean(focusNode) && focusNode !== edge.from && focusNode !== edge.to;
          const label = state.predicted ? `median ${edge.medianMin} min` : state.taken ? `took ${edge.medianMin} min` : `${edge.count} · ${edge.medianMin} / ${edge.p90Min} min`;
          return <g key={`${edge.from}-${edge.to}`} className={`flow-edge-group ${dimmed ? "dimmed" : ""}`}>
            <path d={roundedOrthogonalPath(source, target, orientation, (index % 3 - 1) * 8)} className={`flow-edge ${state.taken ? "taken" : ""} ${state.predicted ? "predicted" : ""} ${state.anomaly ? "anomaly" : ""}`} strokeWidth={state.taken || state.predicted || state.anomaly ? undefined : Math.max(1.25, Math.min(3, ((edge.countByPathway[pathway] ?? edge.count) / Math.max(model.sampleSize, 1)) * 5))} markerEnd={`url(#flow-arrow-${color})`} />
            {(state.taken || state.predicted || state.anomaly || focusNode === edge.from || focusNode === edge.to) && <g className="flow-edge-chip"><rect x={(source.x + target.x) / 2 - 42} y={(source.y + target.y) / 2 - 10} width="84" height="20" rx="10" /><text x={(source.x + target.x) / 2} y={(source.y + target.y) / 2 + 4} textAnchor="middle">{label}</text></g>}
            {handoff && <g className={`flow-handoff ${state.taken && ownershipGap ? "gap" : ""}`} transform={`translate(${(source.x + target.x) / 2}, ${(source.y + target.y) / 2})`}><circle r="8" /><text textAnchor="middle" y="4">{state.taken && ownershipGap ? "!" : "↔"}</text>{state.taken && ownershipGap && <text className="flow-no-owner" x="12" y="4">No owner</text>}</g>}
          </g>;
        })}
        {layout.nodes.map((item) => {
          const share = shareOf(item.id);
          const visited = events.some((event) => event.node === item.id);
          const current = currentNode === item.id;
          const predicted = currentNode && model.edges.some((edge) => edge.from === currentNode && edge.to === item.id);
          const anomaly = anomalyNode === item.id;
          const stale = staleNode === item.id;
          const timing = model.nodes.find((candidate) => candidate.id === item.id);
          const medianMin = timing?.medianMin ?? 0;
          const p90Min = timing?.p90Min ?? Math.max(medianMin, 1);
          const labelFits = textWidth(item.shortLabel) <= item.width - 20;
          const progress = current ? Math.min(1, elapsed / Math.max(p90Min, 1)) : 0;
          return <g key={item.id} className={`flow-node ${visited ? "visited" : ""} ${current ? "current" : ""} ${predicted ? "predicted-next" : ""} ${anomaly ? "anomaly" : ""} ${stale ? "stale" : ""} ${selectedNode === item.id ? "selected" : ""}`} transform={`translate(${item.x},${item.y})`} role="button" tabIndex={0} aria-label={`${item.shortLabel}, ${item.lane}, ${Math.round(share * 100)}% of visits`} onClick={() => onSelect(item.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(item.id); } }} onMouseEnter={() => setHoveredNode(item.id)} onMouseLeave={() => setHoveredNode(undefined)}>
            <title>{item.fullName}{current ? ` — ${elapsed} of ${p90Min} min` : ""}</title>
            <rect className="flow-node-selection" x="-76" y="-28" width="152" height="56" rx="10" />
            <rect className="flow-node-body" x="-72" y="-24" width="144" height="48" rx="8" />
            <rect className="flow-share-bar" x="-72" y="20" width={144 * Math.min(1, share)} height="4" />
            {current && <g className="flow-elapsed"><rect x="-58" y="5" width="116" height="3" rx="1.5" /><rect className="flow-elapsed-median" x="-58" y="5" width={116 * Math.min(1, medianMin / Math.max(p90Min, 1))} height="3" rx="1.5" /><rect className="flow-elapsed-value" x="-58" y="5" width={116 * progress} height="3" rx="1.5" /><title>{elapsed} of {p90Min} min</title></g>}
            <text className="flow-node-label" x="0" y="-6" textAnchor="middle">{labelFits ? item.shortLabel : `${item.shortLabel.slice(0, 10)}…`}</text>
            <text className="flow-node-share" x="0" y="14" textAnchor="middle">{Math.round(share * 100)}% of visits</text>
            {visited && !current && <text className="flow-node-glyph green-glyph" x="60" y="-11">✓</text>}
            {anomaly && <text className="flow-node-glyph red-glyph" x="60" y="-11">!</text>}
            {stale && <text className="flow-node-glyph amber-glyph" x="60" y="-11">◷</text>}
          </g>;
        })}
      </svg>
    </div>
  );
}
