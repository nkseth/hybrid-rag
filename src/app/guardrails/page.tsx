import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AreaSeries, BarSeries } from "@/components/charts";
import { ago, Empty, PageHeader, PageSkeleton, Panel, Stat, StatusBadge } from "@/components/kit";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { q } from "@/lib/db";
import { dayKeys, daysAgo } from "@/lib/queries";

export default function Page() {
  return (
    <>
      <PageHeader title="Guardrails" description="Input: injection, length, PII redaction. Output: citation validity, groundedness, PII. Ingest: poisoned-document detection." />
      <Suspense fallback={<PageSkeleton />}><Content /></Suspense>
    </>
  );
}

async function Content() {
  await connection();
  const [byAction, byRule, byDay, events] = await Promise.all([
    q<{ action: string; count: number }>("SELECT action, COUNT(*) AS count FROM guardrail_events GROUP BY action"),
    q<{ rule: string; count: number }>("SELECT rule, COUNT(*) AS count FROM guardrail_events GROUP BY rule ORDER BY count DESC"),
    q<{ day: string; block: number; flag: number; redact: number }>(
      `SELECT strftime('%Y-%m-%d', created_at/1000, 'unixepoch') AS day, SUM(action='block') AS block, SUM(action='flag') AS flag, SUM(action='redact') AS redact
       FROM guardrail_events WHERE created_at >= ? GROUP BY day`, [daysAgo(14)]),
    q<{ id: number; trace_id: string; stage: string; rule: string; action: string; detail: string; created_at: number; input: string }>(
      `SELECT g.*, t.input FROM guardrail_events g LEFT JOIN traces t ON t.id = g.trace_id ORDER BY g.id DESC LIMIT 100`),
  ]);
  const count = (a: string) => byAction.find((r) => r.action === a)?.count ?? 0;
  const by = new Map(byDay.map((r) => [r.day, r]));
  const series = dayKeys().map((day) => ({ day, block: by.get(day)?.block ?? 0, flag: by.get(day)?.flag ?? 0, redact: by.get(day)?.redact ?? 0 }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Blocked" value={count("block")} hint="request never reaches the LLM" />
        <Stat label="Flagged" value={count("flag")} hint="answer/doc marked for review" />
        <Stat label="Redacted" value={count("redact")} hint="PII masked in query or answer" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Events per day" description="Last 14 days">
          <AreaSeries data={series} x="day" stacked series={[{ key: "block", label: "Block", color: "var(--chart-5)" }, { key: "flag", label: "Flag", color: "var(--chart-4)" }, { key: "redact", label: "Redact", color: "var(--chart-1)" }]} />
        </Panel>
        <Panel title="By rule">
          {byRule.length ? <BarSeries horizontal data={byRule} x="rule" series={[{ key: "count", label: "Events", color: "var(--chart-4)" }]} /> : <Empty>No events yet. Try a prompt-injection query in the playground.</Empty>}
        </Panel>
      </div>
      <Panel title="Event log" description="Most recent 100">
        {!events.length ? <Empty>No events.</Empty> : (
          <Table>
            <TableHeader><TableRow><TableHead>Stage</TableHead><TableHead>Rule</TableHead><TableHead>Action</TableHead><TableHead>Detail</TableHead><TableHead>Trace</TableHead><TableHead className="text-right">When</TableHead></TableRow></TableHeader>
            <TableBody>
              {events.map((e) => (
                <TableRow key={e.id}>
                  <TableCell><Badge variant="outline" className="font-mono text-[10px]">{e.stage}</Badge></TableCell>
                  <TableCell className="font-mono text-xs">{e.rule}</TableCell>
                  <TableCell><StatusBadge status={e.action} /></TableCell>
                  <TableCell className="max-w-xs truncate text-xs text-muted-foreground" title={e.detail}>{e.detail}</TableCell>
                  <TableCell className="max-w-xs truncate text-xs">{e.trace_id ? <Link href={`/traces/${e.trace_id}`} className="hover:underline">{e.input ?? e.trace_id}</Link> : "—"}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">{ago(e.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}
