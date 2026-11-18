import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ms, num, PageSkeleton, Panel, Stat, StatusBadge } from "@/components/kit";
import { Badge } from "@/components/ui/badge";
import { one, q } from "@/lib/db";

export default function Page({ params }: PageProps<"/traces/[id]">) {
  return <Suspense fallback={<PageSkeleton />}><Detail params={params} /></Suspense>;
}

const SPAN_COLOR: Record<string, string> = {
  "retrieve.vector": "var(--chart-1)", "retrieve.keyword": "var(--chart-4)", "retrieve.graph": "var(--chart-3)",
  generate: "var(--chart-2)", embed: "var(--chart-1)", graph_extract: "var(--chart-3)",
};

async function Detail({ params }: { params: PageProps<"/traces/[id]">["params"] }) {
  await connection();
  const { id } = await params;
  const t = await one<{ id: string; name: string; input: string; output: string; status: string; latency_ms: number; tokens_in: number; tokens_out: number; meta: string; created_at: number }>("SELECT * FROM traces WHERE id = ?", [id]);
  if (!t) notFound();
  const [spans, guards] = await Promise.all([
    q<{ id: number; name: string; start_ms: number; duration_ms: number; attrs: string }>("SELECT * FROM spans WHERE trace_id = ? ORDER BY start_ms, id", [id]),
    q<{ id: number; stage: string; rule: string; action: string; detail: string }>("SELECT * FROM guardrail_events WHERE trace_id = ? ORDER BY id", [id]),
  ]);
  const total = Math.max(t.latency_ms, ...spans.map((s) => s.start_ms + s.duration_ms), 1);
  const meta = JSON.parse(t.meta || "{}");

  return (
    <div className="space-y-4">
      <div>
        <Link href="/traces" className="text-xs text-muted-foreground hover:text-foreground">← Traces</Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold tracking-tight">{t.input}</h2>
          <StatusBadge status={t.status} />
        </div>
        <div className="mt-1 font-mono text-xs text-muted-foreground">{t.name} · {t.id} · {new Date(t.created_at).toLocaleString()}</div>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Latency" value={ms(t.latency_ms)} />
        <Stat label="Spans" value={spans.length} />
        <Stat label="Tokens in / out" value={`${num(t.tokens_in)} / ${num(t.tokens_out)}`} />
        <Stat label={meta.mode ? "Mode" : "Guardrail events"} value={meta.mode ?? guards.length} hint={meta.groundedness != null ? `groundedness ${Math.round(meta.groundedness * 100)}%` : undefined} />
      </div>

      <Panel title="Waterfall" description="Span start offset and duration relative to the trace">
        <div className="space-y-1.5">
          {spans.map((s) => {
            const attrs = JSON.parse(s.attrs || "{}");
            return (
              <div key={s.id} className="grid grid-cols-[150px_1fr_64px] items-center gap-3 text-xs">
                <span className="truncate font-mono">{s.name}</span>
                <div className="relative h-6 rounded bg-secondary/50">
                  <div className="absolute top-1 h-4 rounded-sm" title={JSON.stringify(attrs)}
                    style={{ left: `${(s.start_ms / total) * 100}%`, width: `max(2px, ${(s.duration_ms / total) * 100}%)`, background: attrs.error ? "var(--destructive)" : SPAN_COLOR[s.name] ?? "var(--chart-5)" }} />
                  <span className="absolute inset-y-0 flex items-center truncate pl-1 font-mono text-[10px] text-muted-foreground" style={{ left: `calc(${((s.start_ms + s.duration_ms) / total) * 100}% + 4px)`, maxWidth: "60%" }}>
                    {Object.entries(attrs).map(([k, v]) => `${k}=${Array.isArray(v) ? v.join("|") : v}`).join(" ")}
                  </span>
                </div>
                <span className="tabular text-right font-mono">{ms(s.duration_ms)}</span>
              </div>
            );
          })}
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Output">
          <pre className="max-h-80 overflow-auto rounded-md bg-secondary/50 p-3 font-mono text-xs whitespace-pre-wrap">{t.output}</pre>
        </Panel>
        <Panel title="Guardrail events" description={`${guards.length} event(s)`}>
          {!guards.length ? <p className="text-sm text-muted-foreground">None.</p> : (
            <div className="space-y-2">
              {guards.map((g) => (
                <div key={g.id} className="rounded-md border p-3 text-xs">
                  <div className="flex items-center gap-2"><Badge variant="outline" className="font-mono text-[10px]">{g.stage}</Badge><StatusBadge status={g.action} /><span className="font-medium">{g.rule}</span></div>
                  <div className="mt-1 text-muted-foreground">{g.detail}</div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
