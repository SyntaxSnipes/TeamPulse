import { z } from "zod";

export const statusSchema = z.enum(["ON_TRACK", "LATE", "UNEXPECTED", "INCONSISTENT", "STALE", "PENDING", "ACKNOWLEDGED", "RESOLVED", "LEGITIMATE_EXCEPTION"]);
export type Status = z.infer<typeof statusSchema>;

export const sopSchema = z.object({
  synthetic: z.literal(true),
  pathways: z.record(z.object({
    allowedTransitions: z.array(z.tuple([z.string(), z.string()])),
    prerequisites: z.record(z.array(z.string())),
    defaultMaxMinutes: z.record(z.number().nonnegative()),
  })),
});
export type Sop = z.infer<typeof sopSchema>;

export const modelSchema = z.object({
  synthetic: z.literal(true),
  generatedAt: z.string(),
  sampleSize: z.number().int().nonnegative(),
  nodes: z.array(z.object({
    id: z.string(), label: z.string(), visits: z.number().nonnegative(),
    medianMin: z.number().nonnegative(), p90Min: z.number().nonnegative(), needs: z.string().optional(),
    visitsByPathway: z.record(z.number().nonnegative()).default({}),
  })),
  edges: z.array(z.object({
    from: z.string(), to: z.string(), prob: z.number().min(0).max(1),
    medianMin: z.number().nonnegative(), p90Min: z.number().nonnegative(),
    count: z.number().nonnegative(), countByPathway: z.record(z.number().nonnegative()).default({}),
  })),
});
export type LearnedModel = z.infer<typeof modelSchema>;

export const feedSchema = z.object({
  source: z.string(),
  outages: z.array(z.object({ fromT: z.number().nonnegative(), toT: z.number().nonnegative() })),
});
export type Feed = z.infer<typeof feedSchema> & {
  department?: Department;
  label?: string;
  lastEventT?: number;
  status?: "LIVE" | "STALE" | "DOWN";
};

export const resourcesSchema = z.object({
  synthetic: z.literal(true),
  feeds: z.array(feedSchema),
  items: z.array(z.object({
    id: z.string(), kind: z.enum(["BED", "EQUIPMENT", "SUPPLY"]), label: z.string(),
    zone: z.string().optional(), total: z.number(), available: z.number(),
    status: z.enum(["OK", "LOW", "DOWN", "STALE"]), source: z.string(),
  })),
  changes: z.array(z.object({ t: z.number(), id: z.string(), available: z.number().optional(), status: z.enum(["OK", "LOW", "DOWN", "STALE"]).optional() })),
});
export type Resources = z.infer<typeof resourcesSchema>;

export type PatientState = {
  id: string; pathway: string; currentStep: string; previousStep?: string;
  lastEventT: number; visitsAtStep?: number; source?: string; orderedSteps?: string[];
};
export type ResourceState = { id: string; status: "OK" | "LOW" | "DOWN" | "STALE"; available: number; source: string; lastUpdateT: number };

/** Addendum B domain vocabulary. These types deliberately contain no UI concerns. */
export type Department = "FRONT_DESK" | "TRIAGE" | "DOCTOR" | "CARDIOLOGY" | "LAB" | "RADIOLOGY" | "THEATRE" | "WARD" | "ED" | "INPATIENTS" | "PHARMACY" | (string & {});
export type Role = "ER_MANAGER" | "FRONT_DESK" | "TRIAGE" | "DOCTOR" | "CARDIOLOGY" | "LAB" | "RADIOLOGY" | "THEATRE" | "WARD" | "HOSPITAL_ADMIN" | "Charge nurse" | "Physician" | "Administrator" | "Nurse" | "Radiologist" | (string & {});
export type HandoffWindow = { opensAt: number; closesAt: number };

export type DomainPatient = PatientState & {
  department?: Department;
  ownerId?: string;
  ownerRole?: Role;
  acuity?: number;
  eta?: number;
  incomingTo?: string[];
  lastDepartmentChangeT?: number;
};

export type Alert = {
  id: string;
  patientId?: string;
  kind: "LATE" | "UNEXPECTED" | "INCONSISTENT" | "STALE" | "OWNERSHIP_GAP" | "PENDING_RESULT" | (string & {});
  message: string;
  createdAt: number;
  severity?: "INFO" | "WARNING" | "CRITICAL";
  status?: "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "LEGITIMATE_EXCEPTION";
  resolutionNote?: string;
};

export type FeedEvent = { feed: string; t: number; patientId?: string; value: string | number };

export type HandoffItem = {
  patient: DomainPatient;
  summary?: string;
  window: HandoffWindow;
  owner?: string;
  next?: string;
  pendingResults?: string[];
  alerts?: Alert[];
};

export type ParallelTask = {
  id: string;
  label?: string;
  department?: Department;
  order?: number;
  startedAt?: number;
  completedAt?: number;
  dependsOn?: string[];
  status?: "PENDING" | "IN_PROGRESS" | "DONE" | "BLOCKED";
};

export type ParallelGroup = {
  id: string;
  patientId?: string;
  tasks: ParallelTask[];
};

/** Addendum E: physical telemetry and normalized clinical stream contracts. */
export const floorRoomSchema = z.object({
  id: z.string().min(1), label: z.string().min(1),
  type: z.enum(["WAITING", "TRIAGE", "RESUS", "BAY", "ISOLATION", "IMAGING", "THEATRE", "WARD", "CORRIDOR"]),
  dept: z.string().min(1), x: z.number(), y: z.number(), w: z.number(), h: z.number(),
  capacity: z.number().int().nonnegative(), negativePressure: z.boolean().optional(),
});
export const floorSchema = z.object({
  synthetic: z.literal(true),
  floors: z.array(z.object({ id: z.string(), label: z.string(), viewBox: z.string(), rooms: z.array(floorRoomSchema) })),
});
export type FloorRoom = z.infer<typeof floorRoomSchema>;
export type Floor = z.infer<typeof floorSchema>;
export type Room = FloorRoom;

export const deviceSchema = z.object({
  id: z.string().min(1), label: z.string().min(1),
  format: z.enum(["SERIAL_FIXED", "BLE_JSON", "DELIMITED_VITALS", "HL7_V2", "FHIR_JSON", "DICOM", "FREE_TEXT"]),
  source: z.string(), lastSeen: z.number(), status: z.enum(["OK", "STALE", "OFFLINE"]),
  protocol: z.enum(["SERIAL_FIXED", "BLE_JSON", "DELIMITED_VITALS", "HL7_ORU", "FHIR_OBSERVATION", "DICOM_STYLE", "FREE_TEXT"]).optional(),
  roomId: z.string().optional(), unit: z.string().optional(),
});
export const devicesSchema = z.object({ synthetic: z.literal(true), devices: z.array(deviceSchema) });
export type Device = z.infer<typeof deviceSchema>;
export type Devices = z.infer<typeof devicesSchema>;
export type DeviceParse = { method: "RULE" | "TEXT_RULES"; confidence: number };
export type DeviceEvent = FeedEvent & { raw: string; format: Device["format"]; device: Pick<Device, "id" | "label">; parse: DeviceParse; canonical: Record<string, unknown> };

export type ParseStatus = "PARSED" | "MALFORMED";
export type CanonicalStreamEvent = {
  patientId?: string; deviceId?: string; roomId?: string; timestamp: number;
  kind: string; values: Record<string, string | number>; text?: string;
};
export type StreamParse = {
  status: ParseStatus; confidence: number; errors: string[]; protocol: Device["protocol"];
  canonical?: CanonicalStreamEvent;
};
export type EnrichedStreamEvent = {
  raw: { id: string; t: number; deviceId: string; payload: string };
  device?: Device;
  parse: StreamParse;
  canonical?: CanonicalStreamEvent;
};
