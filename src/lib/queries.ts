import "server-only";
import { one, q } from "./db";

const DAY = 86_400_000;
export const daysAgo = (d: number) => Date.now() - d * DAY;

/** Last `days` calendar days as YYYY-MM-DD (UTC), oldest first — used to zero-fill series. */
export function dayKeys(days = 14) {
  const today = Math.floor(Date.now() / DAY) * DAY;
  return Array.from({ length: days }, (_, i) => new Date(today - (days - 1 - i) * DAY).toISOString().slice(0, 10));
}

const fill = <T extends Record<string, unknown>>(rows: (T & { day: string })[], keys: string[], days = 14) => {
  const by = new Map(rows.map((r) => [r.day, r]));
  return dayKeys(days).map((day) => ({ day, ...Object.fromEntries(keys.map((k) => [k, Number(by.get(day)?.[k] ?? 0)])) }));
};

const percentile = (xs: number[], p: number) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

export async function overview() {
  const since = Date.now() - 14 * DAY;
  const [counts, lat, queries, ingest, guards, recent] = await Promise.all([
    one<Record<string, number>>(`SELECT
      (SELECT COUNT(*) FROM sources) AS sources, (SELECT COUNT(*) FROM chunks) AS chunks,
      (SELECT COUNT(*) FROM nodes) AS nodes, (SELECT COUNT(*) FROM edges) AS edges,
      (SELECT COUNT(*) FROM traces WHERE name='query') AS queries,
      (SELECT COUNT(*) FROM guardrail_events) AS guard_events,
      (SELECT COUNT(*) FROM jobs WHERE status IN ('queued','running')) AS pending,
      (SELECT AVG(json_extract(meta,'$.groundedness')) FROM traces WHERE name='query' AND status='ok') AS groundedness,
      (SELECT COALESCE(SUM(tokens_in + tokens_out),0) FROM traces) AS tokens`),
    q<{ latency_ms: number }>("SELECT latency_ms FROM traces WHERE name='query' AND status='ok' ORDER BY created_at DESC LIMIT 500"),
    q<{ day: string; ok: number; blocked: number; errors: number; avg_ms: number }>(
      `SELECT strftime('%Y-%m-%d', created_at/1000, 'unixepoch') AS day,
        SUM(status='ok') AS ok, SUM(status='blocked') AS blocked, SUM(status='error') AS errors, ROUND(AVG(latency_ms)) AS avg_ms
       FROM traces WHERE name='query' AND created_at >= ? GROUP BY day`, [since]),
    q<{ day: string; done: number; skipped: number; failed: number }>(
      `SELECT strftime('%Y-%m-%d', created_at/1000, 'unixepoch') AS day,
        SUM(status='done') AS done, SUM(status='skipped') AS skipped, SUM(status='failed') AS failed
       FROM jobs WHERE created_at >= ? GROUP BY day`, [since]),
    q<{ rule: string; count: number }>("SELECT rule, COUNT(*) AS count FROM guardrail_events GROUP BY rule ORDER BY count DESC LIMIT 8"),
    q<{ id: string; input: string; status: string; latency_ms: number; created_at: number; meta: string }>(
      "SELECT id, input, status, latency_ms, created_at, meta FROM traces WHERE name='query' ORDER BY created_at DESC LIMIT 8"),
  ]);
  const l = lat.map((r) => r.latency_ms);
  return {
    counts: counts!,
    p50: percentile(l, 50),
    p95: percentile(l, 95),
    queries: fill(queries, ["ok", "blocked", "errors", "avg_ms"]),
    ingest: fill(ingest, ["done", "skipped", "failed"]),
    guards,
    recent,
  };
}
