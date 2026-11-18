import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ago, Empty, ms, num, PageHeader, PageSkeleton, Panel, StatusBadge } from "@/components/kit";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { q } from "@/lib/db";
import { cn } from "@/lib/utils";

export default function Page({ searchParams }: PageProps<"/traces">) {
  return (
    <>
      <PageHeader title="Traces" description="Every query and ingestion job is recorded as a trace with timed spans — stored in the same SQLite database." />
      <Suspense fallback={<PageSkeleton />}><List searchParams={searchParams} /></Suspense>
    </>
  );
}

const FILTERS = [["all", "All"], ["query", "Queries"], ["ingest", "Ingestion"]] as const;

async function List({ searchParams }: { searchParams: PageProps<"/traces">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const name = typeof sp.name === "string" && sp.name !== "all" ? sp.name : null;
  const rows = await q<{ id: string; name: string; input: string; status: string; latency_ms: number; tokens_in: number; tokens_out: number; created_at: number; spans: number }>(
    `SELECT t.id, t.name, t.input, t.status, t.latency_ms, t.tokens_in, t.tokens_out, t.created_at, (SELECT COUNT(*) FROM spans s WHERE s.trace_id = t.id) AS spans
     FROM traces t ${name ? "WHERE t.name = ?" : ""} ORDER BY t.created_at DESC LIMIT 200`,
    name ? [name] : [],
  );
  return (
    <Panel title={`${rows.length} trace(s)`} description="Most recent 200"
      action={
        <div className="flex gap-1 rounded-md border p-0.5">
          {FILTERS.map(([v, l]) => (
            <Link key={v} href={v === "all" ? "/traces" : `/traces?name=${v}`} className={cn("rounded px-2 py-1 text-xs", (name ?? "all") === v ? "bg-secondary" : "text-muted-foreground hover:text-foreground")}>{l}</Link>
          ))}
        </div>
      }>
      {!rows.length ? <Empty>No traces yet.</Empty> : (
        <Table>
          <TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Input</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Spans</TableHead><TableHead className="text-right">Tokens</TableHead><TableHead className="text-right">Latency</TableHead><TableHead className="text-right">When</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-mono text-xs">{t.name}</TableCell>
                <TableCell className="max-w-md truncate"><Link href={`/traces/${t.id}`} className="hover:underline">{t.input}</Link></TableCell>
                <TableCell><StatusBadge status={t.status} /></TableCell>
                <TableCell className="tabular text-right font-mono text-xs">{t.spans}</TableCell>
                <TableCell className="tabular text-right font-mono text-xs">{num(t.tokens_in + t.tokens_out)}</TableCell>
                <TableCell className="tabular text-right font-mono text-xs">{ms(t.latency_ms)}</TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">{ago(t.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Panel>
  );
}
