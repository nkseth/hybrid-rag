import { connection } from "next/server";
import { Suspense } from "react";
import { AreaSeries, BarSeries } from "@/components/charts";
import { Empty, ms, PageHeader, PageSkeleton, Panel, pct, Stat } from "@/components/kit";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { q } from "@/lib/db";
import { EVAL_SET } from "@/lib/evals";
import { cn } from "@/lib/utils";
import { RunEvalButton } from "./run-button";

const MODES = ["hybrid", "vector", "keyword", "graph"] as const;
type M = { hit_at_k: number | null; mrr: number | null; latency_ms: number | null; faithfulness: number | null; relevance: number | null };

export default function Page() {
  return (
    <>
      <PageHeader title="Evals" description={`${EVAL_SET.length} golden questions. Retrieval: hit@5 and MRR per retriever. Generation (with an LLM): faithfulness and relevance by an LLM judge.`}>
        <RunEvalButton />
      </PageHeader>
      <Suspense fallback={<PageSkeleton />}><Content /></Suspense>
    </>
  );
}

async function Content() {
  await connection();
  const runs = await q<{ id: number; created_at: number; metrics: string; judged: number }>("SELECT * FROM eval_runs ORDER BY id DESC LIMIT 30");
  if (!runs.length) return <Empty>No eval runs yet. Load the sample docs on the Sources page, then click “Run evals”.</Empty>;

  const latest = runs[0];
  const m = JSON.parse(latest.metrics) as Record<(typeof MODES)[number], M> & { k: number };
  const results = await q<{ question: string; retriever: string; hit: number; rr: number; faithfulness: number | null; relevance: number | null }>("SELECT * FROM eval_results WHERE run_id = ?", [latest.id]);
  const questions = [...new Set(results.map((r) => r.question))];
  const cell = (qn: string, mode: string) => results.find((r) => r.question === qn && r.retriever === mode);

  const compare = MODES.map((mode) => ({ retriever: mode, hit: m[mode].hit_at_k ?? 0, mrr: m[mode].mrr ?? 0 }));
  const history = [...runs].reverse().map((r) => {
    const x = JSON.parse(r.metrics);
    return { run: `#${r.id}`, hybrid_mrr: x.hybrid.mrr, vector_mrr: x.vector.mrr, faithfulness: x.hybrid.faithfulness };
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Hybrid hit@5" value={pct(m.hybrid.hit_at_k)} hint={`vector-only ${pct(m.vector.hit_at_k)}`} />
        <Stat label="Hybrid MRR" value={m.hybrid.mrr?.toFixed(3) ?? "—"} hint={`vector-only ${m.vector.mrr?.toFixed(3)}`} />
        <Stat label="Faithfulness" value={pct(m.hybrid.faithfulness)} hint={latest.judged ? "LLM judge" : "needs OPENROUTER_API_KEY"} />
        <Stat label="Relevance" value={pct(m.hybrid.relevance)} hint={`retrieval ${ms(m.hybrid.latency_ms)} avg`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Retrievers compared" description={`Run #${latest.id} · ${new Date(latest.created_at).toLocaleString()}`}>
          <BarSeries data={compare} x="retriever" series={[{ key: "hit", label: "hit@5" }, { key: "mrr", label: "MRR", color: "var(--chart-3)" }]} />
        </Panel>
        <Panel title="Across runs" description="Track regressions as the corpus and pipeline change">
          <AreaSeries data={history} x="run" series={[{ key: "hybrid_mrr", label: "Hybrid MRR" }, { key: "vector_mrr", label: "Vector MRR", color: "var(--chart-2)" }, { key: "faithfulness", label: "Faithfulness", color: "var(--chart-3)" }]} />
        </Panel>
      </div>
      <Panel title="Per question" description="Rank of the first chunk from the expected source (— = missed in top 5)">
        <Table>
          <TableHeader><TableRow><TableHead>Question</TableHead>{MODES.map((x) => <TableHead key={x} className="text-center font-mono text-xs">{x}</TableHead>)}<TableHead className="text-right">Faithful</TableHead></TableRow></TableHeader>
          <TableBody>
            {questions.map((qn) => (
              <TableRow key={qn}>
                <TableCell className="max-w-sm truncate">{qn}</TableCell>
                {MODES.map((x) => {
                  const c = cell(qn, x);
                  return <TableCell key={x} className={cn("text-center font-mono text-xs", c?.hit ? "text-success" : "text-destructive")}>{c?.hit ? `#${Math.round(1 / c.rr)}` : "—"}</TableCell>;
                })}
                <TableCell className="text-right font-mono text-xs">{pct(cell(qn, "hybrid")?.faithfulness)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}
