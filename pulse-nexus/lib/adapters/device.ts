import type { Device, EnrichedStreamEvent, StreamParse } from "../types";
import {
  enrichStreamEvent,
  parseBleJson,
  parseDelimitedVitals,
  parseDicomStyle,
  parseFhirObservation,
  parseFreeText,
  parseHl7Oru,
  parsePayload,
  parseSerialFixed,
} from "./parsers";

/** Stable Addendum E adapter entry point; wire formats are deliberately pure functions. */
export function parseDevicePayload(
  protocol: Device["protocol"],
  payload: string,
  timestamp = 0,
  deviceId?: string,
): StreamParse {
  return parsePayload(protocol, payload, timestamp, deviceId);
}

export function parseDeviceEvent(
  event: EnrichedStreamEvent["raw"],
  device?: Device,
): EnrichedStreamEvent {
  return enrichStreamEvent(event, device);
}

export {
  parseSerialFixed,
  parseBleJson,
  parseDelimitedVitals,
  parseHl7Oru,
  parseFhirObservation,
  parseDicomStyle,
  parseFreeText,
};
