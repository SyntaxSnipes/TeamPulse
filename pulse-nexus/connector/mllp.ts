const START_BLOCK = 0x0b;
const END_BLOCK = 0x1c;
const CARRIAGE_RETURN = 0x0d;

export function frameMllp(message: string): Buffer {
  return Buffer.concat([Buffer.from([START_BLOCK]), Buffer.from(message, "utf8"), Buffer.from([END_BLOCK, CARRIAGE_RETURN])]);
}

export function createMllpFramer(onMessage: (message: string) => void): {
  push(chunk: Buffer): void;
  reset(): void;
} {
  let buffer = Buffer.alloc(0);
  return {
    push(chunk) {
      buffer = Buffer.concat([buffer, chunk]);
      let start = buffer.indexOf(START_BLOCK);
      while (start >= 0) {
        const end = buffer.indexOf(END_BLOCK, start + 1);
        if (end < 0) {
          buffer = buffer.subarray(start);
          return;
        }
        onMessage(buffer.subarray(start + 1, end).toString("utf8"));
        buffer = buffer.subarray(end + 1);
        if (buffer[0] === CARRIAGE_RETURN) buffer = buffer.subarray(1);
        start = buffer.indexOf(START_BLOCK);
      }
      buffer = Buffer.alloc(0);
    },
    reset() { buffer = Buffer.alloc(0); },
  };
}

export function buildAck(message: string, acknowledgmentCode = "AA"): string {
  const msh = message.replace(/^\u000b/, "").split(/\r\n?|\n/).find((segment) => segment.startsWith("MSH|"))?.split("|");
  // MSH-1 is the field separator, so MSH fields are shifted by one array index.
  const mshField = (number: number) => msh?.[number - 1] ?? "";
  const sendingApplication = mshField(3);
  const sendingFacility = mshField(4);
  const controlId = mshField(10);
  const version = mshField(12) || "2.5";
  const timestamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  return `MSH|^~\\&|PULSE_NEXUS|PULSE_NEXUS|${sendingApplication}|${sendingFacility}|${timestamp}||ACK^${mshField(9).split("^")[1] ?? "UNKNOWN"}|${controlId}|P|${version}\rMSA|${acknowledgmentCode}|${controlId}\r`;
}
