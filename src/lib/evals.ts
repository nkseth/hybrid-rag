import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import evalSet from "../../data/eval.json";
import { buildPrompt, SYSTEM } from "./answer";
import { batch, now, one } from "./db";
import { answerModel, fastModel, hasLLM } from "./llm";
import { MODES, retrieve, type Context } from "./retrieve";

type Item = { question: string; expected_source: string; reference: string };
export const EVAL_SET = evalSet as Item[];

const K = 5;
/** Rank (1-based) of the first chunk from the expected source, or 0. */
const firstHit = (ctx: Context[], expected: string) => ctx.findIndex((c) => c.source.toLowerCase().includes(expected.toLowerCase())) + 1;

const judgeSchema = z.object({
  faithfulness: z.number().min(0).max(1).describe("1 = every claim is supported by the context; 0 = unsupported"),
  relevance: z.number().min(0).max(1).describe("1 = fully answers the question consistent with the reference answer"),
});

async function judge(question: string, reference: string, answer: string, contexts: Context[]) {
  const { output } = await generateText({
    model: fastModel(),
    output: Output.object({ schema: judgeSchema }),
    system: "You are a strict RAG evaluator. Score the ANSWER. Return numbers between 0 and 1.",
    prompt: `QUESTION: ${question}\nREFERENCE ANSWER: ${reference}\nCONTEXT:\n${contexts.map((c) => `[${c.n}] ${c.text}`).join("\n\n")}\n\nANSWER: ${answer}`,
  });
  return output;
}

/** Runs every question through every retriever; with an LLM, also answers + judges the hybrid path. */
export async function runEval() {
  const judged = hasLLM();
  // Vercel caps the function at 300s and free models are slow: stop judging at 240s, keep retrieval metrics.
  const judgeDeadline = Date.now() + 240_000;
  const rows: { question: string; retriever: string; hit: number; rr: number; latency_ms: number; faithfulness: number | null; relevance: number | null; answer: string | null }[] = [];

  for (const item of EVAL_SET) {
    for (const mode of MODES) {
      const t = performance.now();
      const r = await retrieve(item.question, mode, K);
      const latency = Math.round(performance.now() - t);
      const rank = firstHit(r.contexts, item.expected_source);
      let faithfulness = null, relevance = null, answer = null;
      if (judged && mode === "hybrid" && r.contexts.length && Date.now() < judgeDeadline) {
        try {
          answer = (await generateText({ model: answerModel(), system: SYSTEM, prompt: buildPrompt(item.question, r.contexts) })).text;
          ({ faithfulness, relevance } = await judge(item.question, item.reference, answer, r.contexts));
        } catch (e) {
          // Free-tier rate limits: keep the retrieval metrics, leave this question unjudged.
          console.warn("[evals] judge skipped:", e instanceof Error ? e.message : e);
        }
      }
      rows.push({ question: item.question, retriever: mode, hit: rank ? 1 : 0, rr: rank ? 1 / rank : 0, latency_ms: latency, faithfulness, relevance, answer });
    }
  }

  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 1000) / 1000 : null);
  const metrics = Object.fromEntries(MODES.map((m) => {
    const rs = rows.filter((r) => r.retriever === m);
    return [m, {
      hit_at_k: avg(rs.map((r) => r.hit)), mrr: avg(rs.map((r) => r.rr)), latency_ms: avg(rs.map((r) => r.latency_ms)),
      faithfulness: avg(rs.flatMap((r) => (r.faithfulness == null ? [] : [r.faithfulness]))),
      relevance: avg(rs.flatMap((r) => (r.relevance == null ? [] : [r.relevance]))),
    }];
  }));

  const run = (await one<{ id: number }>("INSERT INTO eval_runs (created_at, metrics, judged) VALUES (?,?,?) RETURNING id", [now(), JSON.stringify({ k: K, ...metrics }), judged ? 1 : 0]))!;
  await batch(rows.map((r) => ({
    sql: "INSERT INTO eval_results (run_id, question, retriever, hit, rr, latency_ms, faithfulness, relevance, answer) VALUES (?,?,?,?,?,?,?,?,?)",
    args: [run.id, r.question, r.retriever, r.hit, r.rr, r.latency_ms, r.faithfulness, r.relevance, r.answer],
  })));
  return { runId: run.id, metrics };
}
