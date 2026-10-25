import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";

export interface HistoryEntry {
  url: string;
  host: string;
  score: number;
  crawledAt: string;
}

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "history.json");

function load(): HistoryEntry[] {
  if (!existsSync(FILE)) return [];
  try {
    return JSON.parse(readFileSync(FILE, "utf-8"));
  } catch {
    return [];
  }
}

function save(entries: HistoryEntry[]) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(entries, null, 2));
}

export function addEntry(entry: HistoryEntry) {
  const entries = load();
  entries.push(entry);
  save(entries.slice(-500));
}

export function getEntriesForHost(host: string): HistoryEntry[] {
  return load()
    .filter((e) => e.host === host)
    .sort((a, b) => new Date(a.crawledAt).getTime() - new Date(b.crawledAt).getTime());
}
