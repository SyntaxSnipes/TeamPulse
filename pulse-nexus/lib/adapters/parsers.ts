import type { CanonicalStreamEvent, Device, EnrichedStreamEvent, StreamParse } from "../types";
import { convertHl7 } from "./hl7";

const malformed = (protocol: Device["protocol"], ...errors: string[]): StreamParse =>
  ({ status: "MALFORMED", confidence: 0, errors, protocol });
const numberOrString = (value: string): string | number =>
  value.trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : value.trim();
const result = (protocol: Device["protocol"], canonical: CanonicalStreamEvent, confidence = 1): StreamParse =>
  ({ status: "PARSED", confidence, errors: [], protocol, canonical });
const json = (raw: string): Record<string, unknown> => {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("expected JSON object");
  return value as Record<string, unknown>;
};
const text = (value: unknown) => typeof value === "string" || typeof value === "number" ? value : undefined;
const timestamp = (value: unknown, fallback: number) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

export function parsePayload(protocol: Device["protocol"], raw: string, t: number, deviceId?: string): StreamParse {
  try {
    if (protocol === "BLE_JSON") {
      const o = json(raw), values: Record<string, string | number> = {};
      for (const [key, value] of Object.entries(o)) if (text(value) !== undefined && !["patientId", "timestamp", "roomId", "kind"].includes(key)) values[key] = text(value)!;
      if (!Object.keys(values).length) return malformed(protocol, "BLE JSON has no measurements");
      return result(protocol, { deviceId, patientId: text(o.patientId)?.toString(), roomId: text(o.roomId)?.toString(), timestamp: timestamp(o.timestamp, t), kind: text(o.kind)?.toString() ?? "VITAL", values }, .95);
    }
    if (protocol === "FHIR_OBSERVATION") {
      const o = json(raw), value = (o.valueQuantity as { value?: unknown } | undefined)?.value ?? o.value;
      const code = (o.code as { coding?: { code?: string }[] } | undefined)?.coding?.[0]?.code ?? (o.code as { text?: string } | undefined)?.text;
      if (text(value) === undefined || !code) return malformed(protocol, "FHIR Observation requires code and value");
      return result(protocol, { deviceId, patientId: typeof o.subject === "object" && o.subject ? text((o.subject as Record<string, unknown>).reference)?.toString() : text(o.patientId)?.toString(), timestamp: timestamp(o.effectiveDateTime, t), kind: "OBSERVATION", values: { [code]: text(value)! } });
    }
    if (protocol === "SERIAL_FIXED") {
      const parts = raw.trim().split(/[|,]/);
      if (parts.length < 3) return malformed(protocol, "SERIAL_FIXED requires patient,value,unit");
      const [patient, first, second] = parts.map((part) => part.trim());
      const valueFirst = Number.isFinite(Number(first));
      const value = valueFirst ? first : second;
      const unit = valueFirst ? second : first;
      if (!patient || value === undefined || !unit) return malformed(protocol, "SERIAL_FIXED has missing fields");
      return result(protocol, { deviceId, patientId: patient, timestamp: t, kind: unit || "MEASUREMENT", values: { value: numberOrString(value), unit } }, .9);
    }
    if (protocol === "DELIMITED_VITALS") {
      const values: Record<string, string | number> = {};
      for (const part of raw.trim().split(/[|,;]/)) { const [key, value] = part.split("=", 2); if (!key || value === undefined) return malformed(protocol, "invalid key=value field"); values[key.trim()] = numberOrString(value); }
      if (!Object.keys(values).length) return malformed(protocol, "no vital fields");
      const patientId = typeof values.patientId === "string" ? values.patientId : undefined; delete values.patientId;
      return result(protocol, { deviceId, patientId, timestamp: t, kind: "VITALS", values }, .9);
    }
    if (protocol === "HL7_ORU") {
      const events = convertHl7(raw); if (!events.length) return malformed(protocol, "ORU contains no observations");
      const event = events[0];
      return result(protocol, { deviceId, patientId: event.patientId, timestamp: event.timestamp, kind: event.activity, values: event.value === undefined ? {} : { [event.observationCode ?? "value"]: event.value }, text: event.status }, .98);
    }
    if (protocol === "DICOM_STYLE") {
      const values: Record<string, string | number> = {};
      for (const part of raw.trim().split(/[;|]/)) { const [key, value] = part.split(/[=:]/, 2); if (!key || value === undefined) return malformed(protocol, "invalid DICOM tag"); values[key.trim()] = numberOrString(value); }
      const patientId = typeof values.PatientID === "string" ? values.PatientID : undefined;
      if (!patientId) return malformed(protocol, "DICOM requires PatientID");
      return result(protocol, { deviceId, patientId, timestamp: t, kind: "DICOM", values }, .9);
    }
    if (protocol === "FREE_TEXT") {
      if (!raw.trim()) return malformed(protocol, "free text is empty");
      const patient = raw.match(/\b(?:patient|pt|mrn)[\s:#-]*([A-Za-z0-9-]+)/i)?.[1];
      const roomId = raw.match(/\b(?:room|bay)[\s:#-]*([A-Za-z0-9-]+)/i)?.[1];
      const kind = /\b(clean|disinfect)/i.test(raw) ? "CLEANING" : /\b(infection|fever|cough)/i.test(raw) ? "INFECTION_SIGNAL" : "NOTE";
      return result(protocol, { deviceId, patientId: patient, roomId, timestamp: t, kind, values: {}, text: raw.trim() }, patient ? .75 : .45);
    }
    return malformed(protocol, "unsupported protocol");
  } catch (error) { return malformed(protocol, error instanceof Error ? error.message : "malformed payload"); }
}

export function enrichStreamEvent(raw: EnrichedStreamEvent["raw"], device?: Device): EnrichedStreamEvent {
  const parse = parsePayload(device?.protocol ?? "FREE_TEXT", raw.payload, raw.t, raw.deviceId);
  return { raw, device, parse, canonical: parse.canonical };
}
export const parseSerialFixed = (raw: string, t = 0, deviceId?: string) => parsePayload("SERIAL_FIXED", raw, t, deviceId);
export const parseBleJson = (raw: string, t = 0, deviceId?: string) => parsePayload("BLE_JSON", raw, t, deviceId);
export const parseDelimitedVitals = (raw: string, t = 0, deviceId?: string) => parsePayload("DELIMITED_VITALS", raw, t, deviceId);
export const parseHl7Oru = (raw: string, t = 0, deviceId?: string) => parsePayload("HL7_ORU", raw, t, deviceId);
export const parseFhirObservation = (raw: string, t = 0, deviceId?: string) => parsePayload("FHIR_OBSERVATION", raw, t, deviceId);
export const parseDicomStyle = (raw: string, t = 0, deviceId?: string) => parsePayload("DICOM_STYLE", raw, t, deviceId);
export const parseFreeText = (raw: string, t = 0, deviceId?: string) => parsePayload("FREE_TEXT", raw, t, deviceId);
