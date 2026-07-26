import fs from "fs";
import path from "path";
import os from "os";

interface RepoRecord {
  id: string;
  name: string;
  path: string;
  addedAt: number;
}

const STORE_PATH = path.join(
  process.env.APPDATA || path.join(os.homedir(), ".esource"),
  "repo-store.json",
);

export function loadStore(): RepoRecord[] {
  try {
    if (fs.existsSync(STORE_PATH))
      return JSON.parse(fs.readFileSync(STORE_PATH, "utf-8"));
  } catch {}
  return [];
}

export function saveStore(records: RepoRecord[]): void {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(records, null, 2), "utf-8");
}

export type { RepoRecord };