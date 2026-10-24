import { z } from "zod";

export const canonicalClinicalEventSchema = z.object({
  source: z.literal("HL7"),
  messageType: z.enum(["ADT", "ORU", "ORM"]),
  trigger: z.string().min(1),
  patientId: z.string().min(1),
  timestamp: z.number().int().nonnegative(),
  activity: z.string().min(1),
  value: z.union([z.string(), z.number()]).optional(),
  location: z.string().optional(),
  observationCode: z.string().optional(),
  status: z.string().optional(),
});
export type CanonicalClinicalEvent = z.infer<typeof canonicalClinicalEventSchema>;

export type Hl7Message = {
  segments: string[][];
  rawSegmentNames: string[];
};

const field = (segment: string[] | undefined, index: number): string =>
  segment?.[index] ?? "";
const mshField = (segment: string[] | undefined, number: number): string =>
  field(segment, number - 1);

function timestamp(value: string): number {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length < 8) return Date.now();
  const date = new Date(Date.UTC(
    Number(digits.slice(0, 4)), Number(digits.slice(4, 6)) - 1,
    Number(digits.slice(6, 8)), Number(digits.slice(8, 10) || "0"),
    Number(digits.slice(10, 12) || "0"), Number(digits.slice(12, 14) || "0"),
  ));
  return Number.isNaN(date.getTime()) ? Date.now() : date.getTime();
}

export function parseHl7(message: string): Hl7Message {
  const normalized = message.replace(/^\u000b|\u001c\u000d?$/g, "");
  const segments = normalized.split(/\r\n?|\n/).filter(Boolean).map((line) => line.split("|"));
  if (segments.length === 0 || segments[0]?.[0] !== "MSH") {
    throw new Error("HL7 message must start with MSH");
  }
  return { segments, rawSegmentNames: segments.map((segment) => segment[0] ?? "") };
}

export function convertHl7(message: string | Hl7Message): CanonicalClinicalEvent[] {
  const parsed = typeof message === "string" ? parseHl7(message) : message;
  const msh = parsed.segments.find((segment) => segment[0] === "MSH");
  const type = mshField(msh, 9).split("^");
  const messageType = type[0];
  if (messageType !== "ADT" && messageType !== "ORU" && messageType !== "ORM") {
    throw new Error(`Unsupported HL7 message type: ${messageType || "unknown"}`);
  }
  const trigger = type[1] || "UNKNOWN";
  const pid = parsed.segments.find((segment) => segment[0] === "PID");
  const patientId = field(pid, 3).split("^")[0];
  if (!patientId) throw new Error("HL7 message is missing PID-3 patient identifier");
  const eventTimestamp = timestamp(mshField(msh, 7) || field(parsed.segments.find((s) => s[0] === "EVN"), 2));
  const location = field(parsed.segments.find((s) => s[0] === "PV1"), 3);

  if (messageType === "ADT") {
    return [canonicalClinicalEventSchema.parse({
      source: "HL7", messageType, trigger, patientId, timestamp: eventTimestamp,
      activity: `ADT_${trigger}`, location: location || undefined,
    })];
  }

  if (messageType === "ORM") {
    const orc = parsed.segments.find((segment) => segment[0] === "ORC");
    const obr = parsed.segments.find((segment) => segment[0] === "OBR");
    const orderCode = field(obr, 4).split("^")[0] || field(orc, 4).split("^")[0];
    return [canonicalClinicalEventSchema.parse({
      source: "HL7", messageType, trigger, patientId, timestamp: eventTimestamp,
      activity: `ORM_${trigger}`, observationCode: orderCode || undefined,
      status: field(orc, 5) || undefined, location: location || undefined,
    })];
  }

  const observations = parsed.segments.filter((segment) => segment[0] === "OBX");
  return observations.map((obx) => {
    const code = field(obx, 3).split("^");
    const rawValue = field(obx, 5);
    const numeric = rawValue !== "" && Number.isFinite(Number(rawValue)) ? Number(rawValue) : undefined;
    return canonicalClinicalEventSchema.parse({
      source: "HL7", messageType, trigger, patientId, timestamp: eventTimestamp,
      activity: `ORU_${field(obx, 11) || "RESULT"}`, value: numeric ?? rawValue,
      observationCode: code[0] || undefined, status: field(obx, 11) || undefined,
      location: location || undefined,
    });
  });
}

/** Compatibility name for adapters that use the word "canonical". */
export const toCanonicalEvents = convertHl7;
