import { describe, expect, it } from "vitest";
import { parseBleJson, parseDelimitedVitals, parseDicomStyle, parseFhirObservation, parseFreeText, parseHl7Oru, parseSerialFixed } from "./parsers";

describe("Addendum E parsers", () => {
  it("parses each supported wire format", () => {
    expect(parseSerialFixed("P1,37.2,TEMP").status).toBe("PARSED");
    expect(parseBleJson('{"patientId":"P1","spo2":98}').canonical?.values.spo2).toBe(98);
    expect(parseDelimitedVitals("patientId=P1|hr=88").canonical?.patientId).toBe("P1");
    expect(parseDicomStyle("PatientID=P1;Modality=CT").canonical?.kind).toBe("DICOM");
    expect(parseFhirObservation('{"patientId":"P1","code":{"text":"heart-rate"},"valueQuantity":{"value":80}}').status).toBe("PARSED");
    expect(parseFreeText("Patient P1 in room ED-01; cleaning requested").canonical?.kind).toBe("CLEANING");
    expect(parseHl7Oru("MSH|^~\\&|LAB|H|EHR|H|20250101120000||ORU^R01|1|P|2.5\rPID|||P1\rOBX|1|NM|HR||80||||||F").status).toBe("PARSED");
  });
  it("returns deterministic malformed results and low confidence", () => {
    expect(parseSerialFixed("bad").status).toBe("MALFORMED");
    expect(parseBleJson("{}").confidence).toBe(0);
    expect(parseFreeText("something happened").confidence).toBeLessThan(0.5);
  });
});
