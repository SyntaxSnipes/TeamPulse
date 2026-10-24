export type AuditEntry = { action: string; reason?: string; at: string; subject?: string };
const entries: AuditEntry[] = [];
const storageKey = "er-flow-audit";

function loadStored(): void {
  if (typeof window === "undefined") return;
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored) entries.push(...JSON.parse(stored) as AuditEntry[]);
  } catch {
    // Demo storage is optional; the in-memory log remains available.
  }
}

let loaded = false;

export function recordAudit(action: string, details: Omit<AuditEntry, "action" | "at"> = {}) {
  if (!loaded) {
    loadStored();
    loaded = true;
  }
  entries.push({ action, ...details, at: new Date().toISOString() });
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(entries));
    } catch {
      // Fall back to the in-memory demo log when browser storage is unavailable.
    }
  }
}

export function auditEntries(): AuditEntry[] {
  if (!loaded) {
    loadStored();
    loaded = true;
  }
  return [...entries];
}
