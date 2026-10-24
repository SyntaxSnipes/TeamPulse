import type { LearnedModel } from "../types";

export type FlowNode = LearnedModel["nodes"][number] & { x: number; y: number; width: number; height: number };
export type FlowEdge = LearnedModel["edges"][number];
export type FlowEvent = { node: string; minute: number };
export type FlowScenario = { label: "Typical" | "Delayed" | "Unexpected" | "Resource blocked"; events: FlowEvent[] };

export const pathwayLabels = [
  { id: "CHEST_PAIN", label: "Chest pain" },
  { id: "TRAUMA", label: "Trauma" },
  { id: "STROKE", label: "Stroke" },
  { id: "MINOR_INJURY", label: "Minor injury" },
];

export function layoutNodes(model: LearnedModel, orientation: "horizontal" | "vertical" = "horizontal"): FlowNode[] {
  const incoming = new Map(model.nodes.map((node) => [node.id, 0]));
  model.edges.forEach((edge) => incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1));
  const entry = model.nodes.find((node) => node.id === "ARRIVAL")?.id ?? model.nodes.find((node) => (incoming.get(node.id) ?? 0) === 0)?.id;
  const layer = new Map<string, number>();
  const visit = (nodeId: string, seen: Set<string> = new Set()) => {
    if (seen.has(nodeId)) return layer.get(nodeId) ?? 0;
    const parents = model.edges.filter((edge) => edge.to === nodeId).map((edge) => edge.from);
    const nextSeen = new Set(seen).add(nodeId);
    const value = parents.length ? Math.max(...parents.map((parent) => visit(parent, nextSeen))) + 1 : 0;
    layer.set(nodeId, Math.max(layer.get(nodeId) ?? 0, value));
    return layer.get(nodeId)!;
  };
  model.nodes.forEach((node) => visit(node.id));
  if (entry) layer.set(entry, 0);
  const groups = new Map<number, string[]>();
  model.nodes.forEach((node) => groups.set(layer.get(node.id) ?? 0, [...(groups.get(layer.get(node.id) ?? 0) ?? []), node.id]));
  const positions = new Map<string, { x: number; y: number }>();
  [...groups.entries()].sort(([a], [b]) => a - b).forEach(([level, ids]) => {
    ids.sort((a, b) => {
      const aTarget = model.edges.filter((edge) => edge.from === a).reduce((sum, edge) => sum + (groups.get(layer.get(edge.to) ?? 0)?.indexOf(edge.to) ?? 0), 0);
      const bTarget = model.edges.filter((edge) => edge.from === b).reduce((sum, edge) => sum + (groups.get(layer.get(edge.to) ?? 0)?.indexOf(edge.to) ?? 0), 0);
      return aTarget - bTarget;
    });
    ids.forEach((id, index) => {
      const cross = (index - (ids.length - 1) / 2) * 135;
      positions.set(id, orientation === "vertical"
        ? { x: 250 + cross, y: 40 + level * 78 }
        : { x: 80 + level * 135, y: 220 + cross });
    });
  });
  return model.nodes.map((node) => ({ ...node, ...(positions.get(node.id) ?? { x: 250, y: 40 }), width: 100, height: 38 }));
}

export function predictPaths(model: LearnedModel, currentNode: string, pathwayId: string) {
  const result: { nodes: string[]; probability: number; extraMinutes: number }[] = [];
  function visit(node: string, nodes: string[], probability: number, minutes: number) {
    if (nodes.length > 1) result.push({ nodes, probability, extraMinutes: minutes });
    if (nodes.length >= 6) return;
    model.edges.filter((edge) => edge.from === node && ((edge.countByPathway as Record<string, number>)[pathwayId] ?? 0) > 0).forEach((edge) => {
      if (nodes.includes(edge.to)) return;
      const nextProbability = probability * edge.prob;
      if (nextProbability >= 0.02) visit(edge.to, [...nodes, edge.to], nextProbability, minutes + edge.medianMin);
    });
  }
  visit(currentNode, [currentNode], 1, 0);
  return result.sort((a, b) => b.probability - a.probability).slice(0, 3);
}

export function edgeFor(model: LearnedModel, from: string, to: string) {
  return model.edges.find((edge) => edge.from === from && edge.to === to);
}

export function pathStatus(model: LearnedModel, events: FlowEvent[], index: number): "on-track" | "late" | "unexpected" {
  if (index === 0) return "on-track";
  const edge = edgeFor(model, events[index - 1].node, events[index].node);
  return !edge ? "unexpected" : events[index].minute - events[index - 1].minute > edge.p90Min ? "late" : "on-track";
}