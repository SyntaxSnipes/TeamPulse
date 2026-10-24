import type { LearnedModel } from "../types";
import { ACTIVITY_OWNER_DEPARTMENT } from "../engine/handoff";

export const STAGES = ["Arrival", "Triage", "Assessment", "Diagnostics", "Review", "Disposition"] as const;
export const LANES = ["Front desk", "Nursing", "Physician", "Imaging", "Laboratory", "Disposition", "Other"] as const;
export type StageName = typeof STAGES[number];
export type LaneName = typeof LANES[number];
export type Orientation = "horizontal" | "vertical";

export type ActivityLayout = {
  id: string;
  shortLabel: string;
  fullName: string;
  stageIndex: number;
  lane: LaneName;
};

const activities: ActivityLayout[] = [
  { id: "ARRIVAL", shortLabel: "Arrival", fullName: "Arrival", stageIndex: 0, lane: "Front desk" },
  { id: "TRIAGE", shortLabel: "Triage", fullName: "Triage", stageIndex: 1, lane: "Nursing" },
  { id: "DOCTOR", shortLabel: "Doctor", fullName: "Doctor", stageIndex: 2, lane: "Physician" },
  { id: "ECG", shortLabel: "ECG", fullName: "Electrocardiography", stageIndex: 3, lane: "Nursing" },
  { id: "BLOOD_TEST", shortLabel: "Blood test", fullName: "Blood test", stageIndex: 3, lane: "Laboratory" },
  { id: "XRAY", shortLabel: "X-ray", fullName: "X-ray", stageIndex: 4, lane: "Imaging" },
  { id: "CT", shortLabel: "CT", fullName: "Computed tomography", stageIndex: 4, lane: "Imaging" },
  { id: "RESULTS", shortLabel: "Results", fullName: "Results", stageIndex: 4, lane: "Physician" },
  { id: "SURGERY", shortLabel: "Surgery", fullName: "Surgery", stageIndex: 4, lane: "Physician" },
  { id: "ADMIT", shortLabel: "Admit", fullName: "Admit", stageIndex: 5, lane: "Disposition" },
  { id: "DISCHARGE", shortLabel: "Discharge", fullName: "Discharge", stageIndex: 5, lane: "Disposition" },
];

const byId = new Map(activities.map((activity) => [activity.id, activity]));
const laneByDepartment: Record<string, LaneName> = {
  FRONT_DESK: "Front desk", TRIAGE: "Nursing", DOCTOR: "Physician", CARDIOLOGY: "Nursing",
  LAB: "Laboratory", RADIOLOGY: "Imaging", THEATRE: "Physician", WARD: "Disposition",
};

export function activityLayout(node: Pick<LearnedModel["nodes"][number], "id" | "label"> & { stage?: number; dept?: string }): ActivityLayout {
  const known = byId.get(node.id);
  if (known) return known;
  const stageIndex = Math.max(0, Math.min(STAGES.length - 1, Math.round(node.stage ?? 0)));
  return {
    id: node.id,
    shortLabel: node.label.length > 13 ? `${node.label.slice(0, 12)}…` : node.label,
    fullName: node.label,
    stageIndex,
    lane: laneByDepartment[node.dept ?? ACTIVITY_OWNER_DEPARTMENT[node.id] ?? ""] ?? "Other",
  };
}

export function activityLayouts(model: LearnedModel): ActivityLayout[] {
  return model.nodes.map(activityLayout);
}

export const NODE_WIDTH = 144;
export const NODE_HEIGHT = 48;
export const COLUMN_GAP = 96;
export const LANE_HEIGHT = 80;
export const LABEL_GUTTER = 120;
export const STAGE_HEADER = 32;
export const GRID_PADDING = 16;

export type PositionedActivity = ActivityLayout & { x: number; y: number; width: number; height: number };
export type GridLayout = { nodes: PositionedActivity[]; width: number; height: number };

export function gridLayout(model: LearnedModel, orientation: Orientation = "horizontal"): GridLayout {
  const layouts = activityLayouts(model);
  const lanes = [...new Set(layouts.map((activity) => activity.lane))];
  const laneCount = Math.max(lanes.length, 1);
  const stageCount = STAGES.length;
  const wide = orientation === "horizontal";
  const width = GRID_PADDING * 2 + LABEL_GUTTER + (wide ? stageCount * NODE_WIDTH + (stageCount - 1) * COLUMN_GAP : laneCount * NODE_WIDTH + (laneCount - 1) * COLUMN_GAP);
  const height = GRID_PADDING * 2 + STAGE_HEADER + (wide ? laneCount * LANE_HEIGHT : stageCount * LANE_HEIGHT);
  const nodes = layouts.map((activity) => {
    const laneIndex = lanes.indexOf(activity.lane);
    return {
      ...activity,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      x: GRID_PADDING + LABEL_GUTTER + (wide ? activity.stageIndex * (NODE_WIDTH + COLUMN_GAP) : laneIndex * (NODE_WIDTH + COLUMN_GAP)) + NODE_WIDTH / 2,
      y: GRID_PADDING + STAGE_HEADER + (wide ? laneIndex * LANE_HEIGHT : activity.stageIndex * LANE_HEIGHT) + LANE_HEIGHT / 2,
    };
  });
  return { nodes, width, height };
}

export function roundedOrthogonalPath(source: PositionedActivity, target: PositionedActivity, orientation: Orientation, offset = 0): string {
  const radius = 8;
  if (orientation === "horizontal") {
    const sx = source.x + source.width / 2;
    const tx = target.x - target.width / 2;
    const gutter = (sx + tx) / 2 + offset;
    const sy = source.y;
    const ty = target.y;
    return `M ${sx} ${sy} H ${gutter - radius} Q ${gutter} ${sy} ${gutter} ${sy + Math.sign(ty - sy) * radius} V ${ty - Math.sign(ty - sy) * radius} Q ${gutter} ${ty} ${gutter + radius} ${ty} H ${tx}`;
  }
  const sy = source.y + source.height / 2;
  const ty = target.y - target.height / 2;
  const gutter = (sy + ty) / 2 + offset;
  const sx = source.x;
  const tx = target.x;
  return `M ${sx} ${sy} V ${gutter - radius} Q ${sx} ${gutter} ${sx + Math.sign(tx - sx) * radius} ${gutter} H ${tx - Math.sign(tx - sx) * radius} Q ${tx} ${gutter} ${tx} ${gutter + radius} V ${ty}`;
}
