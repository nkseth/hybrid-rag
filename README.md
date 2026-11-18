# hybrid-rag

A full-stack **hybrid RAG system** in a single Next.js app: continuous ingestion, **graph + vector + keyword** retrieval fused with Reciprocal Rank Fusion, input/output guardrails, request tracing, and an eval harness. Everything (documents, embeddings, full-text index, knowledge graph, traces, eval runs) lives in **one SQLite/libSQL database**, a local file in development and Turso when deployed to Vercel.

```
 Sources ─ upload · URL (re-crawled) · pasted text · ./inbox watcher
    │
    ▼
 jobs queue (SQLite) ──► parse ─► chunk ─► embed (bge-small, in-process) ─► chunks + vectors
    │  atomic claim,                                   └► FTS5 index (BM25)
    │  content-hash dedupe                             └► LLM entity/relation extraction ─► nodes · edges · mentions
    ▼
 Query ─► input guardrails ─► ┌ vector  (exact cosine k-NN)       ┐
                              ├ keyword (FTS5 BM25)               ├─► RRF fusion ─► LLM answer w/ [citations]
                              └ graph   (entity link → 2-hop walk │      │
                                         via recursive CTE)       ┘      ▼
                                                     output guardrails (citations, groundedness, PII)
 Every step → spans in SQLite → Traces · Guardrails · Overview dashboards
```

## Features

| Area | What it does |
|---|---|
| **Continuous ingestion** | One job queue fed by uploads (PDF/MD/TXT/HTML/CSV/JSON), URLs with a re-crawl interval, pasted text, and a local `./inbox` folder watcher. Jobs are claimed atomically, so concurrent workers are safe. Unchanged content is skipped by hash; changed docs are re-chunked and re-indexed in one transaction. Processing starts right after upload via `after()`, and a cron tick handles re-crawls and recovers stuck jobs. |
| **Embeddings** | `bge-small-en-v1.5` (384-d, int8) runs **inside the Next.js function** via Transformers.js/ONNX, with no embeddings API. |
| **Graph RAG** | At ingest, an LLM extracts typed entities and relations per chunk into `nodes`/`edges`/`mentions` tables. At query time, entities are linked from the query (or from the top vector hits), the graph is walked 2 hops with a **recursive CTE**, and chunks are scored by how close their entities are. |
| **Hybrid retrieval** | Vector, BM25 and graph retrievers run in parallel and are fused with RRF. The playground shows each passage's rank in each retriever. |
| **Guardrails** | *Input:* prompt-injection patterns (blocked before any LLM call), length limit, PII redaction (email, phone, card, SSN). *Output:* invalid-citation check, lexical groundedness score, PII scrub. *Ingest:* flags documents carrying injection payloads (RAG poisoning). |
| **Observability** | Each query and ingestion job is a trace with timed spans (embed, each retriever, fusion, generation, guardrails) and token counts. The trace view has a waterfall per request. |
| **Evals** | A golden question set scored per retriever (hit@5, MRR), plus LLM-judge faithfulness and relevance for generated answers. Runs are stored and charted over time to catch regressions. |
| **UI** | shadcn/ui + shadcn charts, Geist, Vercel-style dark/light theme. |

Sample eval on the bundled dataset (Turso, free OpenRouter model): **hybrid MRR 1.000** vs vector-only 0.944, keyword 0.958, graph-only 0.683; LLM-judge faithfulness 1.00, relevance 1.00. The set is small (12 questions), so treat these as a demo, not a benchmark.

## Stack

Next.js 16 (App Router, Cache Components) · TypeScript · libSQL (`@libsql/client`) with native vectors (`F32_BLOB`) and FTS5 · Transformers.js · Vercel AI SDK 7 + OpenRouter (free models) · shadcn/ui · Recharts · react-force-graph

## Run locally

```bash
npm install
cp .env.example .env.local     # optional: add OPENROUTER_API_KEY
npm run dev                    # http://localhost:3000
```

Open **Sources**, click **Load sample docs**, then try the **Playground** and **Evals**.

- **No API key?** It still works: graph extraction falls back to a heuristic and answers are extractive. Add a free `OPENROUTER_API_KEY` (openrouter.ai/keys) for LLM graph extraction, generated answers and LLM-judge evals. The default model is `nvidia/nemotron-3.5-super-vl:free`, which supports structured output, with `openrouter/free` as an automatic fallback.
- **Continuous ingestion locally:** run `npm run worker` in a second terminal. It uploads anything dropped into `./inbox` and calls the tick endpoint every 30s, which re-crawls due URLs.
- `npm run check` runs the self-checks for chunking, RRF, FTS query building and guardrails.

## Deploy to Vercel

1. Create a free Turso database: `turso db create rag && turso db show rag --url && turso db tokens create rag`.
2. Import this repo in Vercel and set `DATABASE_URL` (`libsql://…`) and `DATABASE_AUTH_TOKEN`. The schema is created on first request.
3. Set `OPENROUTER_API_KEY` and, optionally, `ANSWER_MODEL` and `FAST_MODEL`.
4. Optional: set `CRON_SECRET`. `vercel.json` schedules `/api/ingest/tick` daily, which is the Hobby plan limit; tighten it on Pro.

Notes: the embedding model (~34 MB) downloads to `/tmp` on cold start. Only the linux-x64 ONNX runtime is bundled (~66 MB per function).

## Design decisions

- **One database for everything.** Vectors, BM25 and the graph sit next to the relational data, so re-indexing a document is a single transaction and there's no cross-store consistency problem. libSQL runs as a local file or on Turso with the same code.
- **Exact vector search.** libSQL's DiskANN index lost recall after delete-and-reinsert cycles in testing. An exact cosine scan is correct and fast at demo scale; the ANN index is the upgrade path past about 50k chunks (noted in `src/lib/db.ts`).
- **Graph in SQL, not a graph DB.** Two-hop walks are a recursive CTE over an `edges` table, which is enough for local-neighbourhood retrieval and avoids running Neo4j.
- **Weighted RRF, k=10.** With short candidate pools the classic k=60 makes rank 9 worth almost as much as rank 1. The graph is weighted at 0.5 because it's an expansion signal: it finds related chunks, but its top pick is noisier.
- **Precise entity linking.** Multi-word entity names match case-insensitively. A single word links only as a proper-noun mention of a non-generic entity, so "get access" doesn't seed the graph with an "Access" node. Before this fix, hybrid trailed vector-only (MRR 0.917 vs 0.944).
- **Free-tier resilience.** If a chunk's LLM extraction fails (rate limit or malformed JSON), that chunk falls back to the heuristic instead of failing the job. Eval judging stops at 240s so the run fits in Vercel's 300s limit, and the retrieval metrics are always complete.
- **Pipeline version in the content hash.** Changing the chunker or embedder re-indexes documents instead of skipping them as "unchanged".

## Layout

```
src/lib/        db · ingest · embed · graph · retrieve · answer · guardrails · trace · evals · text
src/app/api/    ingest · ingest/tick · query (NDJSON stream) · sources · graph · evals
src/app/        overview · playground · sources · graph · traces · evals · guardrails
data/seed/      sample corpus      data/eval.json   golden questions
scripts/        worker.mjs (inbox watcher + tick) · check.ts (self-checks)
```

## Known limits

Mutating endpoints have no auth, so add an admin token before sharing a public URL that has an LLM key attached. The SSRF guard is hostname-based. Lexical groundedness is a cheap proxy; the eval page runs the LLM judge for real faithfulness.
