import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import type { PaperPosition } from "../types.js";

// Durable paper-trading state — a single JSON file. Mirrors polysharp's
// file-backed ledger: simple, inspectable, no DB dependency.
const LEDGER_PATH = process.env.PAPER_LEDGER_PATH ?? "data/polysharp-paper.json";

interface LedgerFile { positions: PaperPosition[] }

function load(): LedgerFile {
  if (!existsSync(LEDGER_PATH)) return { positions: [] };
  try {
    return JSON.parse(readFileSync(LEDGER_PATH, "utf8")) as LedgerFile;
  } catch {
    console.warn(`[ledger] ${LEDGER_PATH} unreadable — starting empty`);
    return { positions: [] };
  }
}

function save(data: LedgerFile): void {
  mkdirSync(dirname(LEDGER_PATH), { recursive: true });
  writeFileSync(LEDGER_PATH, JSON.stringify(data, null, 2));
}

export function allPositions(): PaperPosition[] {
  return load().positions;
}

export function openPositions(): PaperPosition[] {
  return load().positions.filter((p) => p.status === "open");
}

/** Idempotent insert — skips if a position with the same id already exists. */
export function addPosition(pos: PaperPosition): boolean {
  const data = load();
  if (data.positions.some((p) => p.id === pos.id)) return false;
  data.positions.push(pos);
  save(data);
  return true;
}

export function updatePosition(id: string, patch: Partial<PaperPosition>): void {
  const data = load();
  const i = data.positions.findIndex((p) => p.id === id);
  if (i === -1) return;
  data.positions[i] = { ...data.positions[i]!, ...patch };
  save(data);
}
