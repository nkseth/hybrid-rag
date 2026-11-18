import "server-only";
import { q } from "./db";
import { embed, toVec } from "./embed";
import { ftsQuery, rrf } from "./text";
import type { Trace } from "./trace";

export type Mode = "hybrid" | "vector" | "keyword" | "graph";
export const MODES: Mode[] = ["hybrid", "vector", "keyword", "graph"];
type Hit = { id: number; score: number };

const POOL = 20; // candidates per retriever before fusion
const GRAPH_HOPS = 2;
// Graph is an expansion signal: it surfaces related chunks but its top pick is noisier than vector/BM25.
const WEIGHTS = { vector: 1, keyword: 1, graph: 0.5 };
// RRF k: the classic 60 flattens ranks when pools are short (rank 9 ≈ rank 1); 10 lets top ranks dominate.
const RRF_K = 10;

export async function vectorSearch(query: string, k = POOL): Promise<Hit[]> {
  const [v] = await embed([query], { query: true });
  // Exact k-NN (full scan) — see note in db.ts on why not the ANN index.
  const rows = await q<{ id: number; d: number }>(
    "SELECT id, vector_distance_cos(embedding, vector32(?)) AS d FROM chunks ORDER BY d LIMIT ?",
    [toVec(v), k],
  );
  return rows.map((r) => ({ id: r.id, score: Math.round((1 - r.d) * 1000) / 1000 }));
}

export async function keywordSearch(query: string, k = POOL): Promise<Hit[]> {
  const m = ftsQuery(query);
  if (!m) return [];
  const rows = await q<{ id: number; s: number }>("SELECT rowid AS id, bm25(chunks_fts) AS s FROM chunks_fts WHERE chunks_fts MATCH ? ORDER BY s LIMIT ?", [m, k]);
  return rows.map((r) => ({ id: r.id, score: Math.round(-r.s * 1000) / 1000 }));
}

export type GraphInfo = { seeds: { id: number; name: string; type: string }[]; edges: { src: string; rel: string; dst: string }[]; linkedVia: "query" | "vector" | "none" };

/**
 * Graph retrieval: link query → entities (exact name match, else entities of the top vector hits),
 * walk GRAPH_HOPS hops with a recursive CTE, score chunks by the entities they mention (closer = heavier).
 */
export async function graphSearch(query: string, vectorIds: number[], k = POOL): Promise<{ hits: Hit[]; info: GraphInfo }> {
  const padded = ` ${query.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  // ponytail: scans all node keys per query; fine to ~50k nodes, then add an FTS index on node names.
  const matched = await q<{ id: number; name: string; type: string }>(
    "SELECT id, name, type FROM nodes WHERE length(key) >= 3 AND instr(?, ' ' || replace(key, '-', ' ') || ' ') > 0 LIMIT 40",
    [padded],
  );
  // Entity linking precision: multi-word names match case-insensitively; a single word only counts as a
  // proper-noun mention (case-sensitive) of a non-generic entity — so "get access" doesn't link to "Access".
  const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let seeds = matched
    .filter((s) => /\s/.test(s.name.trim()) || (s.type !== "concept" && new RegExp(`\\b${escapeRe(s.name.trim())}\\b`).test(query)))
    .slice(0, 12);
  let linkedVia: GraphInfo["linkedVia"] = seeds.length ? "query" : "none";
  if (!seeds.length && vectorIds.length) {
    seeds = await q(
      `SELECT n.id, n.name, n.type FROM mentions m JOIN nodes n ON n.id = m.node_id
       WHERE m.chunk_id IN (${vectorIds.slice(0, 2).map(() => "?").join(",")}) LIMIT 8`,
      vectorIds.slice(0, 2),
    );
    if (seeds.length) linkedVia = "vector";
  }
  if (!seeds.length) return { hits: [], info: { seeds: [], edges: [], linkedVia } };

  const seedJson = JSON.stringify(seeds.map((s) => s.id));
  const walk = `WITH RECURSIVE walk(node, depth) AS (
      SELECT value, 0 FROM json_each(?1)
      UNION
      SELECT CASE WHEN e.src = w.node THEN e.dst ELSE e.src END, w.depth + 1
      FROM edges e JOIN walk w ON e.src = w.node OR e.dst = w.node WHERE w.depth < ${GRAPH_HOPS}
    ), reach AS (SELECT node, MIN(depth) AS depth FROM walk GROUP BY node)`;

  const [hits, edges] = await Promise.all([
    q<{ id: number; score: number }>(
      `${walk} SELECT m.chunk_id AS id, ROUND(SUM(CASE r.depth WHEN 0 THEN 1.0 WHEN 1 THEN 0.4 ELSE 0.15 END), 3) AS score
       FROM mentions m JOIN reach r ON r.node = m.node_id GROUP BY m.chunk_id ORDER BY score DESC LIMIT ?2`,
      [seedJson, k],
    ),
    q<{ src: string; rel: string; dst: string }>(
      `SELECT DISTINCT a.name AS src, e.rel, b.name AS dst FROM edges e
       JOIN nodes a ON a.id = e.src JOIN nodes b ON b.id = e.dst
       WHERE e.src IN (SELECT value FROM json_each(?1)) OR e.dst IN (SELECT value FROM json_each(?1)) LIMIT 30`,
      [seedJson],
    ),
  ]);
  return { hits, info: { seeds, edges, linkedVia } };
}

export type Context = { n: number; id: number; text: string; source: string; sourceId: number; score: number; ranks: Partial<Record<Mode, number>> };

export async function retrieve(query: string, mode: Mode = "hybrid", topK = 6, trace?: Trace) {
  const span = <T,>(name: string, fn: () => Promise<T>, attrs?: (r: T) => Record<string, unknown>) => (trace ? trace.span(name, fn, attrs) : fn());
  const count = (h: Hit[]) => ({ results: h.length });

  const needVector = mode === "vector" || mode === "hybrid" || mode === "graph";
  const [vector, keyword] = await Promise.all([
    needVector ? span("retrieve.vector", () => vectorSearch(query), count) : Promise.resolve([]),
    mode === "keyword" || mode === "hybrid" ? span("retrieve.keyword", () => keywordSearch(query), count) : Promise.resolve([]),
  ]);
  const graph =
    mode === "graph" || mode === "hybrid"
      ? await span("retrieve.graph", () => graphSearch(query, vector.map((h) => h.id)), (g) => ({ results: g.hits.length, seeds: g.info.seeds.map((s) => s.name), linkedVia: g.info.linkedVia }))
      : { hits: [], info: { seeds: [], edges: [], linkedVia: "none" as const } };

  const lists: Partial<Record<Mode, Hit[]>> = mode === "hybrid" ? { vector, keyword, graph: graph.hits } : { [mode]: mode === "graph" ? graph.hits : mode === "vector" ? vector : keyword };
  const fused = await span("fuse.rrf", async () =>
    rrf(Object.fromEntries(Object.entries(lists).map(([k, v]) => [k, v!.map((h) => h.id)])), RRF_K, WEIGHTS).slice(0, topK),
    (f) => ({ kept: f.length }),
  );

  const rows = fused.length
    ? await q<{ id: number; text: string; source: string; source_id: number }>(
        `SELECT c.id, c.text, s.title AS source, s.id AS source_id FROM chunks c JOIN sources s ON s.id = c.source_id WHERE c.id IN (${fused.map(() => "?").join(",")})`,
        fused.map((f) => f.id),
      )
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const contexts: Context[] = fused
    .filter((f) => byId.has(f.id))
    .map((f, i) => ({ n: i + 1, id: f.id, text: byId.get(f.id)!.text, source: byId.get(f.id)!.source, sourceId: byId.get(f.id)!.source_id, score: Math.round(f.score * 10000) / 10000, ranks: f.ranks }));

  return { contexts, candidates: { vector: vector.length, keyword: keyword.length, graph: graph.hits.length }, graph: graph.info };
}
