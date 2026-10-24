import { describe, expect, it } from "vitest";
import { layoutNodes, predictPaths, pathStatus } from "./flow-network";
import type { LearnedModel } from "../types";

const model: LearnedModel = {
  synthetic: true, generatedAt: "2026-01-01", sampleSize: 100,
  nodes: [
    { id: "A", label: "Arrival", visits: 100, medianMin: 5, p90Min: 10, visitsByPathway: { CHEST_PAIN: 100 } },
    { id: "B", label: "Triage", visits: 100, medianMin: 5, p90Min: 10, visitsByPathway: { CHEST_PAIN: 100 } },
    { id: "C", label: "Doctor", visits: 100, medianMin: 5, p90Min: 10, visitsByPathway: { CHEST_PAIN: 100 } },
  ],
  edges: [
    { from: "A", to: "B", prob: 1, medianMin: 5, p90Min: 10, count: 100, countByPathway: { CHEST_PAIN: 100 } },
    { from: "B", to: "C", prob: .8, medianMin: 5, p90Min: 10, count: 80, countByPathway: { CHEST_PAIN: 80 } },
  ],
};

describe("flow network", () => {
  it("lays out nodes and predicts only paths above two percent", () => {
    expect(layoutNodes(model)).toHaveLength(3);
    expect(predictPaths(model, "A", "CHEST_PAIN")[0].nodes).toEqual(["A", "B"]);
  });

  it("creates a branching layered chest-pain layout", () => {
    const chestModel: LearnedModel = {
      ...model,
      nodes: ["A", "B", "C", "D", "E", "F", "G", "H"].map((id, index) => ({
        id, label: id, visits: 100, medianMin: 5, p90Min: 10,
        visitsByPathway: { CHEST_PAIN: 100 - index * 5 },
      })),
      edges: [
        ["A", "B"], ["B", "C"], ["B", "D"], ["C", "E"], ["D", "E"],
        ["E", "F"], ["E", "G"], ["F", "H"], ["G", "H"],
      ].map(([from, to]) => ({ from, to, prob: .5, medianMin: 5, p90Min: 10, count: 50, countByPathway: { CHEST_PAIN: 50 } })),
    };
    const positioned = layoutNodes(chestModel, "vertical");
    expect(new Set(positioned.map((node) => node.x)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(positioned.map((node) => node.y)).size).toBeGreaterThanOrEqual(4);
    expect(Math.max(...positioned.map((node) => node.width))).toBeLessThanOrEqual(110);
  });

  it("classifies timing and unknown transitions", () => {
    expect(pathStatus(model, [{ node: "A", minute: 0 }, { node: "B", minute: 5 }], 1)).toBe("on-track");
    expect(pathStatus(model, [{ node: "A", minute: 0 }, { node: "C", minute: 20 }], 1)).toBe("unexpected");
  });
});
