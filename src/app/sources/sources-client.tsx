"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileUp, Globe, Loader2, RefreshCw, Sparkles, Trash2, Type } from "lucide-react";
import { toast } from "sonner";
import { ago, Empty, ms, Panel, StatusBadge } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type Source = { id: number; kind: string; uri: string; title: string; status: string; error: string | null; chunk_count: number; refresh_minutes: number | null; last_ingested_at: number | null };
type Job = { id: number; status: string; error: string | null; detail: string | null; title: string; created_at: number; duration_ms: number | null };

export function SourcesClient() {
  const [data, setData] = useState<{ sources: Source[]; jobs: Job[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/sources", { cache: "no-store" });
    if (r.ok) setData(await r.json());
  }, []);

  const active = data?.jobs.some((j) => j.status === "queued" || j.status === "running");
  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, active ? 1500 : 8000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [load, active]);

  async function submit(body: FormData | object) {
    setBusy(true);
    try {
      const r = await fetch("/api/ingest", body instanceof FormData ? { method: "POST", body } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (j.queued) toast.success(`Queued ${j.queued} source(s) for ingestion`);
      for (const e of j.errors ?? []) toast.error(e);
      load();
      return r.ok;
    } finally {
      setBusy(false);
    }
  }

  const form = (entries: Record<string, string | File[]>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(entries)) (Array.isArray(v) ? v : [v]).forEach((x) => f.append(k, x));
    return f;
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Panel title="Add a source" description="Everything lands in one queue: parse → chunk → embed → index → extract graph.">
          <Tabs defaultValue="file">
            <TabsList>
              <TabsTrigger value="file"><FileUp />Files</TabsTrigger>
              <TabsTrigger value="url"><Globe />URL</TabsTrigger>
              <TabsTrigger value="text"><Type />Text</TabsTrigger>
            </TabsList>
            <TabsContent value="file" className="pt-3">
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground transition-colors hover:bg-accent/50">
                <FileUp className="size-5" />
                <span>Drop or choose PDF, Markdown, TXT, HTML, CSV or JSON (max 4MB each)</span>
                <input ref={fileRef} type="file" multiple className="sr-only" accept=".pdf,.md,.mdx,.txt,.html,.htm,.csv,.json"
                  onChange={async (e) => { const files = [...(e.target.files ?? [])]; if (files.length) await submit(form({ files })); if (fileRef.current) fileRef.current.value = ""; }} />
              </label>
            </TabsContent>
            <TabsContent value="url" className="pt-3">
              <form className="flex flex-col gap-2 sm:flex-row" onSubmit={async (e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); if (await submit(fd)) e.currentTarget?.reset(); }}>
                <Input name="url" type="url" required placeholder="https://example.com/docs/page" className="flex-1" />
                <Select name="refresh" defaultValue="60">
                  <SelectTrigger className="sm:w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Ingest once</SelectItem>
                    <SelectItem value="15">Re-crawl 15 min</SelectItem>
                    <SelectItem value="60">Re-crawl hourly</SelectItem>
                    <SelectItem value="1440">Re-crawl daily</SelectItem>
                  </SelectContent>
                </Select>
                <Button disabled={busy}>{busy && <Loader2 className="animate-spin" />}Add URL</Button>
              </form>
              <p className="mt-2 text-xs text-muted-foreground">Re-crawls are queued by the tick endpoint; unchanged pages are skipped by content hash.</p>
            </TabsContent>
            <TabsContent value="text" className="pt-3">
              <form className="space-y-2" onSubmit={async (e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); if (await submit(fd)) e.currentTarget?.reset(); }}>
                <Input name="title" placeholder="Title" />
                <Textarea name="text" required rows={5} placeholder="Paste text or markdown…" />
                <Button disabled={busy}>{busy && <Loader2 className="animate-spin" />}Ingest text</Button>
              </form>
            </TabsContent>
          </Tabs>
        </Panel>
        <Panel title="Sample dataset" description="7 docs about a fictional company, built for multi-hop graph questions, plus a 12-question eval set.">
          <Button className="w-full" variant="outline" disabled={busy} onClick={() => submit({ seed: true })}>
            <Sparkles />Load sample docs
          </Button>
        </Panel>
      </div>

      <Panel title="Sources" description={data ? `${data.sources.length} source(s)` : "Loading…"}>
        {!data ? null : data.sources.length ? (
          <Table>
            <TableHeader><TableRow><TableHead>Title</TableHead><TableHead>Kind</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Chunks</TableHead><TableHead>Refresh</TableHead><TableHead>Ingested</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {data.sources.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="max-w-xs"><div className="truncate font-medium">{s.title}</div><div className="truncate font-mono text-[11px] text-muted-foreground">{s.uri}</div></TableCell>
                  <TableCell className="font-mono text-xs">{s.kind}</TableCell>
                  <TableCell><StatusBadge status={s.status} />{s.error && <div className="mt-1 max-w-48 truncate text-xs text-destructive" title={s.error}>{s.error}</div>}</TableCell>
                  <TableCell className="tabular text-right font-mono text-xs">{s.chunk_count}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{s.refresh_minutes ? `${s.refresh_minutes}m` : "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{ago(s.last_ingested_at)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {s.kind === "url" && <Button size="icon" variant="ghost" className="size-7" aria-label="Re-crawl now" onClick={async () => { await fetch(`/api/sources?id=${s.id}`, { method: "PATCH" }); load(); }}><RefreshCw /></Button>}
                    <Button size="icon" variant="ghost" className="size-7" aria-label="Delete source" onClick={async () => { if (!confirm(`Delete "${s.title}" and its chunks/graph?`)) return; await fetch(`/api/sources?id=${s.id}`, { method: "DELETE" }); load(); }}><Trash2 /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : <Empty>No sources yet — load the sample docs or add your own.</Empty>}
      </Panel>

      <Panel title="Job queue" description="Live — polls every 1.5s while jobs are running">
        {!data?.jobs.length ? <Empty>No jobs yet.</Empty> : (
          <Table>
            <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Source</TableHead><TableHead>Status</TableHead><TableHead>Result</TableHead><TableHead className="text-right">Duration</TableHead><TableHead className="text-right">Queued</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.jobs.map((j) => {
                const d = j.detail ? JSON.parse(j.detail) : null;
                return (
                  <TableRow key={j.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{j.id}</TableCell>
                    <TableCell className="max-w-xs truncate">{j.title}</TableCell>
                    <TableCell><StatusBadge status={j.status} /></TableCell>
                    <TableCell className="max-w-sm truncate font-mono text-xs text-muted-foreground">
                      {j.error ? <span className="text-destructive">{j.error}</span> : d?.reason ?? (d ? `${d.chunks} chunks · ${d.entities} entities · ${d.relations} rels · ${d.mode}${d.flagged ? ` · ⚠ ${d.flagged} flagged` : ""}` : "—")}
                    </TableCell>
                    <TableCell className="tabular text-right font-mono text-xs">{ms(j.duration_ms)}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{ago(j.created_at)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}
