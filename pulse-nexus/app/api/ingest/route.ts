import { NextResponse } from "next/server";
import { z } from "zod";

export type IngestEvent = {
  id: number;
  receivedAt: string;
  source: string;
  eventType?: string;
  patientId?: string;
  patientAlias?: string;
  step?: string;
  department?: string;
  value?: string | number;
  t?: number;
};

const MAX_EVENTS = 500;
const events: IngestEvent[] = [];
let nextId = 1;
const requestLog = new Map<string, number[]>();
const ingestRow = z.object({
  source: z.string().min(1).max(80),
  activity: z.string().max(80).optional(),
  observationCode: z.string().max(80).optional(),
  patientId: z.string().max(80).optional(),
  patientAlias: z.string().max(80).optional(),
  department: z.string().max(80).optional(),
  value: z.union([z.string().max(200), z.number()]).optional(),
  timestamp: z.number().finite().optional(),
}).strict();
const ingestRows = z.array(ingestRow);

export async function POST(request: Request) {
  const address = request.headers.get("x-forwarded-for") ?? "local";
  const now = Date.now();
  const recent = (requestLog.get(address) ?? []).filter((time) => now - time < 60_000);
  if (recent.length >= 60) return NextResponse.json({ error: "rate limit exceeded" }, { status: 429 });
  recent.push(now);
  requestLog.set(address, recent);
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 64 * 1024) return NextResponse.json({ error: "request too large" }, { status: 413 });
  const body = await request.json().catch(() => null) as unknown;
  const rows = (Array.isArray(body) ? body : body ? [body] : []);
  if (!rows.length || rows.length > 50) return NextResponse.json({ error: "one to fifty events are required" }, { status: 400 });
  const parsed = ingestRows.safeParse(rows);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid event contract" }, { status: 400 });
  }
  const accepted = parsed.data.map((row) => {
    const activity = typeof row.activity === "string" ? row.activity : "";
    const order = typeof row.observationCode === "string" ? row.observationCode : "";
    const step = activity.startsWith("ADT_") ? "ARRIVAL"
      : activity.startsWith("ORU_") ? "RESULTS"
      : order.includes("CT") ? "CT"
      : order.includes("XRAY") || order.includes("X-RAY") ? "XRAY"
      : order.includes("ECG") ? "ECG"
      : order.includes("BLOOD") ? "BLOOD_TEST"
      : undefined;
    const event: IngestEvent = {
      id: nextId++,
      receivedAt: new Date().toISOString(),
      source: String(row.source),
      eventType: activity || undefined,
      patientId: typeof row.patientId === "string" ? row.patientId : undefined,
      patientAlias: typeof row.patientAlias === "string" ? row.patientAlias : undefined,
      step,
      department: typeof row.department === "string" ? row.department : undefined,
      value: typeof row.value === "string" || typeof row.value === "number" ? row.value : undefined,
      t: typeof row.timestamp === "number" ? row.timestamp : undefined,
    };
    events.push(event);
    return event;
  });
  while (events.length > MAX_EVENTS) events.shift();
  return NextResponse.json({ accepted: true, ids: accepted.map((event) => event.id) }, { status: 202 });
}

export async function GET(request: Request) {
  const since = Number(new URL(request.url).searchParams.get("since") ?? 0);
  return NextResponse.json({ events: events.filter((event) => event.id > since) });
}
