import { createServer, type Server, type Socket } from "node:net";
import { request } from "node:https";
import { URL } from "node:url";
import { convertHl7 } from "../lib/adapters/hl7";
import type { CanonicalClinicalEvent } from "../lib/adapters/hl7";
import { buildAck, createMllpFramer, frameMllp } from "./mllp";
import { loadSiteConfig } from "../lib/config";

export type ConnectorOptions = {
  host?: string;
  port?: number;
  ingestUrl?: string;
  onEvents?: (events: CanonicalClinicalEvent[]) => void | Promise<void>;
};

export function postCanonicalEvents(ingestUrl: string, events: CanonicalClinicalEvent[]): Promise<void> {
  const url = new URL(ingestUrl);
  if (url.protocol !== "https:") throw new Error("CONNECTOR_INGEST_URL must use HTTPS");
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(events);
    const req = request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || 443,
      path: `${url.pathname}${url.search}`,
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
      },
    }, (response) => {
      response.resume();
      response.on("end", () => {
        const status = response.statusCode ?? 0;
        if (status >= 200 && status < 300) resolve();
        else reject(new Error(`ingest returned HTTP ${status}`));
      });
    });
    req.on("error", reject);
    req.end(body);
  });
}

export function createConnector(options: ConnectorOptions = {}): Server {
  const ingestUrl = options.ingestUrl ?? process.env.CONNECTOR_INGEST_URL;
  const server = createServer((socket: Socket) => {
    const framer = createMllpFramer((message) => {
      let ack: string;
      try {
        const events = convertHl7(message);
        const onEvents = options.onEvents ?? (ingestUrl
          ? (canonicalEvents: CanonicalClinicalEvent[]) => postCanonicalEvents(ingestUrl, canonicalEvents)
          : undefined);
        void Promise.resolve().then(() => onEvents?.(events)).catch(() => {
          console.warn(JSON.stringify({
            connector: "hl7-mllp", result: "ingest_failed",
            error: "ingest request failed",
          }));
        });
        ack = buildAck(message, "AA");
        console.info(JSON.stringify({ connector: "hl7-mllp", result: "accepted", eventCount: events.length }));
      } catch {
        ack = buildAck(message, "AE");
        console.warn(JSON.stringify({ connector: "hl7-mllp", result: "rejected", error: "invalid message" }));
      }
      socket.write(frameMllp(ack));
    });
    socket.on("data", (chunk: Buffer) => framer.push(chunk));
    socket.on("error", () => undefined);
  });
  return server;
}

export function startConnector(options: ConnectorOptions = {}): Server {
  const config = loadSiteConfig();
  const host = options.host ?? process.env.CONNECTOR_HOST ?? "0.0.0.0";
  const port = options.port ?? Number(process.env.CONNECTOR_PORT ?? config.connector.port);
  const ingestUrl = options.ingestUrl ?? process.env.CONNECTOR_INGEST_URL ?? config.connector.ingestUrl;
  const server = createConnector({ ...options, ingestUrl });
  server.listen(port, host, () => console.info(JSON.stringify({ connector: "hl7-mllp", host, port })));
  return server;
}

if (process.argv[1]?.endsWith("server.ts") || process.argv[1]?.endsWith("server.js")) startConnector();
