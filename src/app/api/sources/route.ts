import { connection } from "next/server";
import { q } from "@/lib/db";
import { deleteSource, enqueue } from "@/lib/ingest";
import { after } from "next/server";
import { processPending } from "@/lib/ingest";

/** Polled by the Sources page. */
export async function GET() {
  await connection();
  const [sources, jobs] = await Promise.all([
    q("SELECT id, kind, uri, title, status, error, chunk_count, refresh_minutes, last_ingested_at, created_at FROM sources ORDER BY id DESC"),
    q(`SELECT j.id, j.status, j.error, j.detail, j.created_at, j.started_at, j.finished_at, j.duration_ms, s.title
       FROM jobs j JOIN sources s ON s.id = j.source_id ORDER BY j.id DESC LIMIT 50`),
  ]);
  return Response.json({ sources, jobs });
}

export async function DELETE(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  await deleteSource(id);
  return Response.json({ ok: true });
}

/** Re-ingest a URL source now. */
export async function PATCH(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  const [s] = await q<{ kind: "url"; uri: string; title: string }>("SELECT kind, uri, title FROM sources WHERE id = ?", [id]);
  if (!s || s.kind !== "url") return Response.json({ error: "Only URL sources can be refreshed" }, { status: 400 });
  await enqueue(s);
  after(() => processPending());
  return Response.json({ ok: true });
}
