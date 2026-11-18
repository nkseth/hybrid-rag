import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AreaSeries, BarSeries } from "@/components/charts";
import { ago, Empty, ms, num, PageHeader, PageSkeleton, Panel, pct, Stat, StatusBadge } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { overview } from "@/lib/queries";

export default function Page() {
  return (
    <>
      <PageHeader title="Overview" description="Health of the ingestion pipeline, retrieval and generation over the last 14 days.">
        <Button asChild size="sm"><Link href="/playground">Open playground</Link></Button>
      </PageHeader>
      <Suspense fallback={<PageSkeleton />}><Dashboard /></Suspense>
    </>
  );
}

async function Dashboard() {
  await connection();
  const d = await overview();
  const c = d.counts;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Sources" value={num(c.sources)} hint={c.pending ? `${c.pending} job(s) pending` : "queue empty"} />
        <Stat label="Chunks" value={num(c.chunks)} hint="384-d vectors + FTS5" />
        <Stat label="Graph" value={num(c.nodes)} hint={`${num(c.edges)} relations`} />
        <Stat label="Queries" value={num(c.queries)} hint={`${num(c.tokens)} tokens total`} />
        <Stat label="Latency p50 / p95" value={<span>{ms(d.p50)} <span className="text-muted-foreground">/</span> {ms(d.p95)}</span>} hint="end-to-end, incl. generation" />
        <Stat label="Groundedness" value={pct(c.groundedness)} hint={`${num(c.guard_events)} guardrail events`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Queries" description="Answered vs. blocked by guardrails vs. errored">
          <AreaSeries data={d.queries} x="day" stacked series={[{ key: "ok", label: "Answered" }, { key: "blocked", label: "Blocked", color: "var(--chart-5)" }, { key: "errors", label: "Errors", color: "var(--chart-4)" }]} />
        </Panel>
        <Panel title="Average latency" description="Mean end-to-end query latency per day (ms)">
          <BarSeries data={d.queries} x="day" series={[{ key: "avg_ms", label: "Avg ms" }]} />
        </Panel>
        <Panel title="Ingestion jobs" description="Done, skipped (unchanged content hash) and failed">
          <BarSeries data={d.ingest} x="day" stacked series={[{ key: "done", label: "Done", color: "var(--chart-3)" }, { key: "skipped", label: "Skipped", color: "var(--chart-2)" }, { key: "failed", label: "Failed", color: "var(--chart-5)" }]} />
        </Panel>
        <Panel title="Guardrail events" description="By rule, all time">
          {d.guards.length ? <BarSeries horizontal data={d.guards} x="rule" series={[{ key: "count", label: "Events", color: "var(--chart-4)" }]} /> : <Empty>No guardrail events yet.</Empty>}
        </Panel>
      </div>

      <Panel title="Recent queries" action={<Button asChild variant="outline" size="sm"><Link href="/traces">All traces</Link></Button>}>
        {d.recent.length ? (
          <Table>
            <TableHeader><TableRow><TableHead>Query</TableHead><TableHead>Mode</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Latency</TableHead><TableHead className="text-right">When</TableHead></TableRow></TableHeader>
            <TableBody>
              {d.recent.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="max-w-md truncate"><Link className="hover:underline" href={`/traces/${t.id}`}>{t.input}</Link></TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{JSON.parse(t.meta || "{}").mode ?? "—"}</TableCell>
                  <TableCell><StatusBadge status={t.status} /></TableCell>
                  <TableCell className="tabular text-right font-mono text-xs">{ms(t.latency_ms)}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">{ago(t.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : <Empty>No queries yet. <Link href="/sources" className="underline">Ingest the sample docs</Link>, then ask something in the playground.</Empty>}
      </Panel>
    </div>
  );
}
