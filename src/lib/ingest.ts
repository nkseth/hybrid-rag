import "server-only";
import { batch, now, one, q } from "./db";
import { embed, toVec } from "./embed";
import { extractGraph, storeGraph } from "./graph";
import { detectInjection } from "./guardrails";
import { hasLLM } from "./llm";
import { chunkText, htmlToText, sha256 } from "./text";
import { Trace } from "./trace";

export type SourceKind = "upload" | "url" | "text" | "seed";

// Bump when chunking/embedding/extraction changes so unchanged docs still get re-indexed.
const PIPELINE_VERSION = "bge-small-q8|chunk-600-100b|graph-v2";

type Job = { id: number; source_id: number; payload: string | null };
type Source = { id: number; kind: SourceKind; uri: string; title: string; content_hash: string | null; chunk_count: number };

/** Queue a source for (re-)ingestion. One queued job per source; a newer payload replaces the old one. */
export async function enqueue(s: { kind: SourceKind; uri: string; title: string; payload?: string; refreshMinutes?: number }) {
  const src = await one<{ id: number }>(
    `INSERT INTO sources (kind, uri, title, refresh_minutes, status, created_at) VALUES (?,?,?,?,'queued',?)
     ON CONFLICT(uri) DO UPDATE SET title = excluded.title, status = 'queued',
       refresh_minutes = COALESCE(excluded.refresh_minutes, sources.refresh_minutes)
     RETURNING id`,
    [s.kind, s.uri, s.title, s.refreshMinutes ?? null, now()],
  );
  const pending = await one<{ id: number }>("SELECT id FROM jobs WHERE source_id = ? AND status = 'queued'", [src!.id]);
  if (pending) await q("UPDATE jobs SET payload = ? WHERE id = ?", [s.payload ?? null, pending.id]);
  else await q("INSERT INTO jobs (source_id, payload, created_at) VALUES (?,?,?)", [src!.id, s.payload ?? null, now()]);
  return src!.id;
}

/** Re-queue URL sources whose refresh interval has elapsed — this is what makes ingestion continuous. */
export async function enqueueDueRefreshes() {
  const due = await q<{ id: number }>(
    `SELECT s.id FROM sources s WHERE s.kind = 'url' AND s.refresh_minutes IS NOT NULL
       AND COALESCE(s.last_ingested_at, 0) + s.refresh_minutes * 60000 < ?
       AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.source_id = s.id AND j.status IN ('queued','running'))`,
    [now()],
  );
  for (const s of due) await q("INSERT INTO jobs (source_id, created_at) VALUES (?,?)", [s.id, now()]);
  return due.length;
}

/** Drain the queue until empty or the time budget is used. Safe to call concurrently (atomic claim). */
export async function processPending(budgetMs = 240_000) {
  const deadline = Date.now() + budgetMs;
  // Jobs stuck in 'running' (crashed / timed-out function) go back to the queue.
  await q("UPDATE jobs SET status = 'queued' WHERE status = 'running' AND started_at < ?", [now() - 15 * 60_000]);
  let done = 0;
  while (Date.now() < deadline) {
    const job = await one<Job>(
      `UPDATE jobs SET status = 'running', started_at = ?
       WHERE id = (SELECT id FROM jobs WHERE status = 'queued' ORDER BY id LIMIT 1) AND status = 'queued'
       RETURNING id, source_id, payload`,
      [now()],
    );
    if (!job) break;
    await processJob(job);
    done++;
  }
  return done;
}

const BLOCKED_HOST = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[::1?\]|.*\.internal$|.*\.local$)/i;

export function assertFetchableUrl(raw: string) {
  const u = new URL(raw);
  if (!/^https?:$/.test(u.protocol)) throw new Error("Only http(s) URLs are allowed");
  // ponytail: hostname-pattern SSRF guard; resolve DNS + check IPs if this ever faces untrusted users.
  if (BLOCKED_HOST.test(u.hostname)) throw new Error("Private/internal hosts are not allowed");
  return u;
}

async function fetchUrl(uri: string) {
  const res = await fetch(assertFetchableUrl(uri), { headers: { "user-agent": "rag-pipeline-demo/1.0" }, signal: AbortSignal.timeout(20_000), redirect: "follow" });
  if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  if (type.includes("pdf")) return { title: "", text: await pdfToText(new Uint8Array(await res.arrayBuffer())) };
  const body = await res.text();
  return type.includes("html") ? htmlToText(body) : { title: "", text: body };
}

export async function pdfToText(bytes: Uint8Array) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const { text } = await extractText(await getDocumentProxy(bytes), { mergePages: true });
  return text;
}

async function processJob(job: Job) {
  const src = (await one<Source>("SELECT * FROM sources WHERE id = ?", [job.source_id]))!;
  const trace = new Trace("ingest", src.title);
  const t0 = now();
  const finish = async (status: "done" | "skipped" | "failed", detail: Record<string, unknown>, error?: string) => {
    await batch([
      { sql: "UPDATE jobs SET status=?, detail=?, error=?, payload=NULL, finished_at=?, duration_ms=? WHERE id=?", args: [status, JSON.stringify(detail), error ?? null, now(), now() - t0, job.id] },
      { sql: "UPDATE sources SET status=?, error=? WHERE id=?", args: [status === "failed" ? "failed" : "ready", error ?? null, src.id] },
    ]);
    await trace.end(status === "failed" ? "error" : "ok", error ?? JSON.stringify(detail), { job: job.id, source: src.id }).catch(() => {});
  };

  try {
    const doc = await trace.span("load", async () => (job.payload != null ? { title: "", text: job.payload } : fetchUrl(src.uri)), (d) => ({ chars: d.text.length }));
    if (!doc.text.trim()) throw new Error("Document has no extractable text");
    const hash = await sha256(`${PIPELINE_VERSION}\n${doc.text}`);
    if (hash === src.content_hash && src.chunk_count > 0) return finish("skipped", { reason: "unchanged (same content hash)" });
    if (src.kind === "url" && doc.title) await q("UPDATE sources SET title = ? WHERE id = ?", [doc.title.slice(0, 200), src.id]);

    const chunks = await trace.span("chunk", async () => chunkText(doc.text), (c) => ({ chunks: c.length }));
    const vectors = await trace.span("embed", () => embed(chunks), (v) => ({ vectors: v.length, dim: v[0]?.length }));

    // Replace previous version of this source atomically.
    const ids = await trace.span("index", async () => {
      await batch([
        { sql: "DELETE FROM chunks_fts WHERE rowid IN (SELECT id FROM chunks WHERE source_id = ?)", args: [src.id] },
        { sql: "DELETE FROM mentions WHERE chunk_id IN (SELECT id FROM chunks WHERE source_id = ?)", args: [src.id] },
        { sql: "DELETE FROM edges WHERE chunk_id IN (SELECT id FROM chunks WHERE source_id = ?)", args: [src.id] },
        { sql: "DELETE FROM chunks WHERE source_id = ?", args: [src.id] },
        ...chunks.flatMap((text, i) => [
          { sql: "INSERT INTO chunks (source_id, idx, text, embedding) VALUES (?,?,?,vector32(?))", args: [src.id, i, text, toVec(vectors[i])] },
          { sql: "INSERT INTO chunks_fts (rowid, text) VALUES (last_insert_rowid(), ?)", args: [text] },
        ]),
      ]);
      return (await q<{ id: number }>("SELECT id FROM chunks WHERE source_id = ? ORDER BY idx", [src.id])).map((r) => r.id);
    });

    // Knowledge graph: extract per chunk, 2 at a time (free-tier rate limits).
    const graph = await trace.span("graph_extract", async () => {
      let entities = 0, relations = 0, llmChunks = 0;
      for (let i = 0; i < ids.length; i += 2) {
        await Promise.all(ids.slice(i, i + 2).map(async (id, j) => {
          const ex = await extractGraph(chunks[i + j]);
          trace.tokensIn += ex.tokensIn;
          trace.tokensOut += ex.tokensOut;
          if (ex.mode === "llm") llmChunks++;
          const r = await storeGraph(id, ex.data);
          entities += r.entities;
          relations += r.relations;
        }));
      }
      await q("DELETE FROM nodes WHERE id NOT IN (SELECT node_id FROM mentions)");
      return { entities, relations, mode: hasLLM() ? `llm ${llmChunks}/${ids.length}` : "heuristic" };
    }, (g) => g);

    // Ingest-time guardrail: flag documents that carry prompt-injection payloads (RAG poisoning).
    const poisoned = chunks.map((c, i) => [i, detectInjection(c)] as const).filter(([, r]) => r);
    trace.guard("ingest", poisoned.map(([i, r]) => ({ rule: "poisoned_document", action: "flag" as const, detail: `chunk ${i}: /${r}/` })));

    await q("UPDATE sources SET content_hash=?, chunk_count=?, last_ingested_at=? WHERE id=?", [hash, chunks.length, now(), src.id]);
    await finish("done", { chunks: chunks.length, ...graph, flagged: poisoned.length });
  } catch (e) {
    await finish("failed", {}, e instanceof Error ? e.message : String(e));
  }
}

export async function deleteSource(id: number) {
  await batch([
    { sql: "DELETE FROM chunks_fts WHERE rowid IN (SELECT id FROM chunks WHERE source_id = ?)", args: [id] },
    { sql: "DELETE FROM mentions WHERE chunk_id IN (SELECT id FROM chunks WHERE source_id = ?)", args: [id] },
    { sql: "DELETE FROM edges WHERE chunk_id IN (SELECT id FROM chunks WHERE source_id = ?)", args: [id] },
    { sql: "DELETE FROM chunks WHERE source_id = ?", args: [id] },
    { sql: "DELETE FROM jobs WHERE source_id = ?", args: [id] },
    { sql: "DELETE FROM sources WHERE id = ?", args: [id] },
    { sql: "DELETE FROM nodes WHERE id NOT IN (SELECT node_id FROM mentions)", args: [] },
  ]);
}
