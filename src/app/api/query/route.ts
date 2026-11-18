import { streamText } from "ai";
import { z } from "zod";
import { buildPrompt, extractiveAnswer, SYSTEM } from "@/lib/answer";
import { checkInput, checkOutput } from "@/lib/guardrails";
import { ANSWER_MODEL, answerModel, hasLLM } from "@/lib/llm";
import { MODES, retrieve } from "@/lib/retrieve";
import { Trace } from "@/lib/trace";

export const maxDuration = 60;

const Body = z.object({ query: z.string().max(10_000), mode: z.enum(MODES as [string, ...string[]]).default("hybrid") });

/** Streams NDJSON events: retrieval → text deltas → done (guardrail verdicts). */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
  const { query, mode } = parsed.data as { query: string; mode: (typeof MODES)[number] };

  const trace = new Trace("query", query);
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(ctl) {
      const send = (o: object) => ctl.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      let answer = "";
      try {
        const input = checkInput(query);
        trace.guard("input", input.events);
        if (input.blocked) {
          send({ type: "blocked", traceId: trace.id, events: input.events });
          await trace.end("blocked", input.events[0]?.detail ?? "blocked", { mode });
          return;
        }

        const r = await retrieve(input.text, mode, 6, trace);
        send({ type: "retrieval", traceId: trace.id, query: input.text, redacted: input.text !== query, ...r });

        await trace.span("generate", async () => {
          if (!hasLLM() || !r.contexts.length) {
            answer = extractiveAnswer(input.text, r.contexts);
            send({ type: "text", delta: answer });
            return;
          }
          const result = streamText({
            model: answerModel(),
            system: SYSTEM,
            prompt: buildPrompt(input.text, r.contexts),
            onError: ({ error }) => console.error("[generate]", error),
          });
          for await (const delta of result.textStream) {
            answer += delta;
            send({ type: "text", delta });
          }
          const usage = await result.usage;
          trace.tokensIn += usage.inputTokens ?? 0;
          trace.tokensOut += usage.outputTokens ?? 0;
        }, () => ({ model: hasLLM() ? ANSWER_MODEL : "extractive", chars: answer.length }));

        const out = await trace.span("guardrails.output", async () => checkOutput(answer, r.contexts.map((c) => c.text)), (o) => ({ groundedness: o.groundedness, events: o.events.length }));
        trace.guard("output", out.events);
        const latency = await trace.end("ok", out.text, { mode, contexts: r.contexts.length, groundedness: out.groundedness });
        send({ type: "done", traceId: trace.id, latency, groundedness: out.groundedness, events: [...input.events, ...out.events], answer: out.text !== answer ? out.text : undefined, tokens: { in: trace.tokensIn, out: trace.tokensOut } });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        send({ type: "error", traceId: trace.id, error: msg });
        await trace.end("error", msg, { mode }).catch(() => {});
      } finally {
        ctl.close();
      }
    },
  });

  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
