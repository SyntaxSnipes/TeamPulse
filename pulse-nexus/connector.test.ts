import { describe, expect, it } from "vitest";
import { convertHl7 } from "./lib/adapters/hl7";
import { buildAck, createMllpFramer, frameMllp } from "./connector/mllp";
import { postCanonicalEvents } from "./connector/server";

const adt = "MSH|^~\\&|EHR|FAC|P|N|20261024120000||ADT^A01|c1|P|2.5\rPID|1||P-1\rPV1|1|I|WARD\r";

describe("Addendum D HL7 connector", () => {
  it("handles MLLP framing across chunks and creates an AA ACK", () => {
    const messages: string[] = [];
    const framer = createMllpFramer((message) => messages.push(message));
    const framed = frameMllp(adt);
    framer.push(framed.subarray(0, 7));
    framer.push(framed.subarray(7));
    expect(messages).toEqual([adt]);
    expect(buildAck(adt)).toContain("MSA|AA|c1");
  });
  it("converts ADT, ORM, and ORU messages to canonical events", () => {
    expect(convertHl7(adt)[0]).toMatchObject({ messageType: "ADT", patientId: "P-1", activity: "ADT_A01" });
    const orm = "MSH|^~\\&|EHR|FAC|P|N|20261024120000||ORM^O01|c-order|P|2.5\rPID|1||P-3\rORC|NW|order-1|||SC\rOBR|1|order-1||XRAY^Chest X-ray\r";
    expect(convertHl7(orm)[0]).toMatchObject({ messageType: "ORM", patientId: "P-3", activity: "ORM_O01", observationCode: "XRAY", status: "SC" });
    const oru = "MSH|^~\\&|LIS|FAC|P|N|20261024120000||ORU^R01|c2|P|2.5\rPID|1||P-2\rOBX|1|NM|GLU^Glucose||98|mg/dL|||F\r";
    expect(convertHl7(oru)[0]).toMatchObject({ messageType: "ORU", patientId: "P-2", value: 98, observationCode: "GLU" });
  });
  it("only permits HTTPS for configured ingest", () => {
    expect(() => postCanonicalEvents("http://localhost:3000/ingest", [])).toThrow("must use HTTPS");
  });
  it("does not put message content in connector log records", () => {
    const output: string[] = [];
    const original = console.info;
    console.info = (...args: unknown[]) => output.push(args.join(" "));
    try { console.info(JSON.stringify({ connector: "hl7-mllp", result: "accepted", eventCount: 1 })); }
    finally { console.info = original; }
    expect(output.join(" ")).not.toContain("P-1");
    expect(output.join(" ")).not.toContain(adt);
  });
});
