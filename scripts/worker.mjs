// Local continuous-ingestion worker:
//  1. watches ./inbox and uploads new/changed files (content-hash dedupe happens server-side)
//  2. calls /api/ingest/tick every 30s so URL sources re-crawl on their refresh interval
// Usage: npm run dev  (one terminal)  +  npm run worker  (another)
import { watch } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.APP_URL ?? "http://localhost:3000";
const INBOX = path.resolve("inbox");
const headers = process.env.CRON_SECRET ? { authorization: `Bearer ${process.env.CRON_SECRET}` } : {};
const timers = new Map();

async function upload(name) {
  if (name.startsWith(".")) return;
  try {
    const form = new FormData();
    form.append("files", new Blob([await readFile(path.join(INBOX, name))]), name);
    const res = await fetch(`${BASE}/api/ingest`, { method: "POST", body: form });
    console.log(`[inbox] ${name} → ${res.status}`, JSON.stringify(await res.json()));
  } catch (e) {
    if (e.code !== "ENOENT") console.error(`[inbox] ${name}:`, e.message);
  }
}

async function tick() {
  try {
    const res = await fetch(`${BASE}/api/ingest/tick`, { headers });
    const j = await res.json();
    if (j.refreshed || j.processed) console.log("[tick]", JSON.stringify(j));
  } catch (e) {
    console.error("[tick] app not reachable:", e.message);
  }
}

for (const f of await readdir(INBOX)) await upload(f);
// Debounce: editors fire several events per save.
watch(INBOX, (_, name) => {
  if (!name) return;
  clearTimeout(timers.get(name));
  timers.set(name, setTimeout(() => upload(name), 500));
});
setInterval(tick, 30_000);
tick();
console.log(`[worker] watching ${INBOX}, ticking ${BASE}/api/ingest/tick every 30s`);
