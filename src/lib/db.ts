import "server-only";
import { createClient, type InArgs } from "@libsql/client";

export const EMBED_DIM = 384;

// Local: file:./data/rag.db. Vercel: libsql://<db>.turso.io + DATABASE_AUTH_TOKEN.
const client = createClient({
  url: process.env.DATABASE_URL ?? "file:./data/rag.db",
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS sources (
    id INTEGER PRIMARY KEY, kind TEXT NOT NULL, uri TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
    content_hash TEXT, status TEXT NOT NULL DEFAULT 'queued', error TEXT,
    chunk_count INTEGER NOT NULL DEFAULT 0, refresh_minutes INTEGER,
    last_ingested_at INTEGER, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY, source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'queued', payload TEXT, error TEXT, detail TEXT,
    created_at INTEGER NOT NULL, started_at INTEGER, finished_at INTEGER, duration_ms INTEGER)`,
  `CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status, id)`,
  `CREATE TABLE IF NOT EXISTS chunks (
    id INTEGER PRIMARY KEY, source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    idx INTEGER NOT NULL, text TEXT NOT NULL, embedding F32_BLOB(${EMBED_DIM}))`,
  // ponytail: exact cosine scan (see retrieve.ts). The libSQL DiskANN index lost recall after delete+reinsert in testing;
  // re-add `CREATE INDEX chunks_vec ON chunks(libsql_vector_idx(embedding))` + vector_top_k past ~50k chunks.
  `DROP INDEX IF EXISTS chunks_vec`,
  `CREATE INDEX IF NOT EXISTS chunks_source ON chunks(source_id)`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(text)`,
  `CREATE TABLE IF NOT EXISTS nodes (id INTEGER PRIMARY KEY, key TEXT NOT NULL UNIQUE, name TEXT NOT NULL, type TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS edges (
    id INTEGER PRIMARY KEY, src INTEGER NOT NULL, dst INTEGER NOT NULL, rel TEXT NOT NULL,
    chunk_id INTEGER NOT NULL REFERENCES chunks(id) ON DELETE CASCADE)`,
  `CREATE INDEX IF NOT EXISTS edges_src ON edges(src)`,
  `CREATE INDEX IF NOT EXISTS edges_dst ON edges(dst)`,
  `CREATE TABLE IF NOT EXISTS mentions (
    node_id INTEGER NOT NULL, chunk_id INTEGER NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
    PRIMARY KEY (node_id, chunk_id))`,
  `CREATE INDEX IF NOT EXISTS mentions_chunk ON mentions(chunk_id)`,
  `CREATE TABLE IF NOT EXISTS traces (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, input TEXT, output TEXT, status TEXT NOT NULL,
    latency_ms INTEGER, tokens_in INTEGER, tokens_out INTEGER, meta TEXT, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS traces_created ON traces(created_at)`,
  `CREATE TABLE IF NOT EXISTS spans (
    id INTEGER PRIMARY KEY, trace_id TEXT NOT NULL REFERENCES traces(id) ON DELETE CASCADE,
    name TEXT NOT NULL, start_ms INTEGER NOT NULL, duration_ms INTEGER NOT NULL, attrs TEXT)`,
  `CREATE INDEX IF NOT EXISTS spans_trace ON spans(trace_id)`,
  `CREATE TABLE IF NOT EXISTS guardrail_events (
    id INTEGER PRIMARY KEY, trace_id TEXT, stage TEXT NOT NULL, rule TEXT NOT NULL,
    action TEXT NOT NULL, detail TEXT, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS eval_runs (id INTEGER PRIMARY KEY, created_at INTEGER NOT NULL, metrics TEXT NOT NULL, judged INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS eval_results (
    id INTEGER PRIMARY KEY, run_id INTEGER NOT NULL REFERENCES eval_runs(id) ON DELETE CASCADE,
    question TEXT NOT NULL, retriever TEXT NOT NULL, hit INTEGER NOT NULL, rr REAL NOT NULL,
    latency_ms INTEGER NOT NULL, faithfulness REAL, relevance REAL, answer TEXT)`,
];

let ready: Promise<void> | null = null;
function init() {
  ready ??= (async () => {
    if (!process.env.DATABASE_URL) (await import("node:fs")).mkdirSync("./data", { recursive: true });
    await client.execute("PRAGMA foreign_keys = ON");
    await client.batch(SCHEMA, "write");
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

export async function q<T = Record<string, unknown>>(sql: string, args: InArgs = []) {
  await init();
  const r = await client.execute({ sql, args });
  // libSQL Row objects aren't plain objects (React can't pass them to client components) — copy them.
  return r.rows.map((row) => Object.fromEntries(r.columns.map((c, i) => [c, row[i]]))) as T[];
}

export async function one<T = Record<string, unknown>>(sql: string, args: InArgs = []) {
  return (await q<T>(sql, args))[0] as T | undefined;
}

export async function batch(stmts: { sql: string; args: InArgs }[]) {
  await init();
  return client.batch(stmts, "write");
}

export const now = () => Date.now();
