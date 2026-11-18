import "server-only";
import { batch, now } from "./db";
import type { GuardEvent } from "./guardrails";

type Span = { name: string; start_ms: number; duration_ms: number; attrs?: Record<string, unknown> };

/** Minimal tracer: spans collect in memory, flushed to SQLite in one batch on end(). */
export class Trace {
  readonly id = crypto.randomUUID();
  private t0 = performance.now();
  private createdAt = now();
  private spans: Span[] = [];
  private guards: (GuardEvent & { stage: string })[] = [];
  tokensIn = 0;
  tokensOut = 0;

  constructor(readonly name: string, readonly input: string) {}

  async span<T>(name: string, fn: () => Promise<T>, attrs?: (r: T) => Record<string, unknown>): Promise<T> {
    const start = performance.now();
    try {
      const r = await fn();
      this.spans.push({ name, start_ms: Math.round(start - this.t0), duration_ms: Math.round(performance.now() - start), attrs: attrs?.(r) });
      return r;
    } catch (e) {
      this.spans.push({ name, start_ms: Math.round(start - this.t0), duration_ms: Math.round(performance.now() - start), attrs: { error: String(e) } });
      throw e;
    }
  }

  guard(stage: string, events: GuardEvent[]) {
    this.guards.push(...events.map((e) => ({ ...e, stage })));
  }

  async end(status: "ok" | "error" | "blocked", output: string, meta?: Record<string, unknown>) {
    const latency = Math.round(performance.now() - this.t0);
    await batch([
      {
        sql: "INSERT INTO traces (id,name,input,output,status,latency_ms,tokens_in,tokens_out,meta,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
        args: [this.id, this.name, this.input, output, status, latency, this.tokensIn, this.tokensOut, JSON.stringify(meta ?? {}), this.createdAt],
      },
      ...this.spans.map((s) => ({
        sql: "INSERT INTO spans (trace_id,name,start_ms,duration_ms,attrs) VALUES (?,?,?,?,?)",
        args: [this.id, s.name, s.start_ms, s.duration_ms, JSON.stringify(s.attrs ?? {})],
      })),
      ...this.guards.map((g) => ({
        sql: "INSERT INTO guardrail_events (trace_id,stage,rule,action,detail,created_at) VALUES (?,?,?,?,?,?)",
        args: [this.id, g.stage, g.rule, g.action, g.detail, this.createdAt],
      })),
    ]);
    return latency;
  }
}
