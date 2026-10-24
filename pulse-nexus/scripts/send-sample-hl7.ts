import { connect } from "node:net";
import { frameMllp } from "../connector/mllp";

const message = [
  "MSH|^~\\&|SAMPLE_EHR|DEMO|PULSE|NEXUS|20261024120000||ADT^A01|demo-1|P|2.5",
  "EVN|A01|20261024120000",
  "PID|1||PATIENT-001^^^DEMO||SAMPLE^PATIENT",
  "PV1|1|I|WARD-3^ROOM-12",
  "",
].join("\r");
const host = process.env.CONNECTOR_HOST ?? "127.0.0.1";
const port = Number(process.env.CONNECTOR_PORT ?? 2575);
const socket = connect(port, host, () => socket.write(frameMllp(message)));
socket.on("data", (data) => {
  const text = data.toString("utf8");
  console.info(JSON.stringify({ connector: "hl7-demo", received: text.includes("MSA|AA") ? "AA" : "non-AA" }));
  socket.end();
});
socket.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
