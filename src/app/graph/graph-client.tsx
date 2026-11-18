"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { Empty, Stat } from "@/components/kit";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

// The lib's generics don't carry custom node fields through its accessor types; type the props we use.
type FGProps = {
  width: number; height: number; graphData: { nodes: N[]; links: L[] }; nodeId: string; backgroundColor: string;
  nodeVal: (n: N) => number; linkColor: () => string; linkWidth: (l: L) => number;
  linkDirectionalArrowLength: number; linkDirectionalArrowRelPos: number; onNodeClick: (n: N) => void;
  nodeCanvasObject: (n: N, ctx: CanvasRenderingContext2D, scale: number) => void;
};
const ForceGraph2D = dynamic(() => import("react-force-graph-2d") as unknown as Promise<{ default: React.ComponentType<FGProps> }>, { ssr: false, loading: () => <Skeleton className="size-full" /> });

type N = { id: number; name: string; type: string; mentions: number; x?: number; y?: number };
type L = { source: number | N; target: number | N; rel: string; weight: number };

const TYPE_COLOR: Record<string, string> = {
  person: "var(--chart-1)", team: "var(--chart-2)", organization: "var(--chart-2)", service: "var(--chart-3)", product: "var(--chart-3)",
  technology: "var(--chart-4)", event: "var(--chart-5)", location: "var(--chart-5)", concept: "var(--muted-foreground)",
};
const idOf = (x: number | N) => (typeof x === "object" ? x.id : x);

export function GraphExplorer() {
  const [data, setData] = useState<{ nodes: N[]; links: L[] } | null>(null);
  const [sel, setSel] = useState<N | null>(null);
  const [filter, setFilter] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 560 });
  const { resolvedTheme } = useTheme();

  useEffect(() => { fetch("/api/graph").then((r) => r.json()).then(setData); }, []);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [data]);

  // Canvas can't read CSS vars; resolve them once per theme.
  const colors = useMemo(() => {
    if (typeof window === "undefined") return {} as Record<string, string>;
    const cs = getComputedStyle(document.documentElement);
    const resolve = (v: string) => cs.getPropertyValue(v.slice(4, -1)).trim() || "#888";
    return { ...Object.fromEntries(Object.entries(TYPE_COLOR).map(([k, v]) => [k, resolve(v)])), fg: resolve("var(--foreground)"), border: resolve("var(--border)"), muted: resolve("var(--muted-foreground)") };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedTheme, data]);

  const match = filter.trim().toLowerCase();
  const neighbors = useMemo(() => {
    if (!sel || !data) return [];
    return data.links.filter((l) => idOf(l.source) === sel.id || idOf(l.target) === sel.id).map((l) => {
      const out = idOf(l.source) === sel.id;
      const other = data.nodes.find((n) => n.id === (out ? idOf(l.target) : idOf(l.source)));
      return { rel: l.rel, out, other: other?.name ?? "?", weight: l.weight };
    });
  }, [sel, data]);

  if (!data) return <Skeleton className="h-[560px]" />;
  if (!data.nodes.length) return <Empty>The graph is empty. Ingest some documents on the Sources page.</Empty>;

  const types = [...new Set(data.nodes.map((n) => n.type))];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Entities" value={data.nodes.length} hint="top 300 by mentions" />
        <Stat label="Relations" value={data.links.length} />
        <Stat label="Entity types" value={types.length} />
        <Stat label="Most connected" value={<span className="truncate text-base">{data.nodes[0]?.name}</span>} hint={`${data.nodes[0]?.mentions} chunk mentions`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Card className="relative h-[560px] gap-0 overflow-hidden py-0 shadow-none">
          <div className="absolute top-3 left-3 z-10 flex flex-wrap gap-1.5">
            {types.map((t) => <Badge key={t} variant="outline" className="bg-background/80 font-normal backdrop-blur"><span className="size-1.5 rounded-full" style={{ background: TYPE_COLOR[t] ?? TYPE_COLOR.concept }} />{t}</Badge>)}
          </div>
          <div ref={box} className="size-full">
            <ForceGraph2D
              width={size.w} height={size.h} graphData={data} nodeId="id" backgroundColor="rgba(0,0,0,0)"
              nodeVal={(n: N) => 1 + Math.sqrt(n.mentions)}
              linkColor={() => colors.border} linkWidth={(l: L) => Math.min(3, 0.5 + l.weight * 0.5)}
              linkDirectionalArrowLength={3} linkDirectionalArrowRelPos={1}
              onNodeClick={(n: N) => setSel(n)}
              nodeCanvasObject={(n: N, ctx, scale) => {
                const r = 2 + Math.sqrt(n.mentions) * 1.6;
                const dim = match && !n.name.toLowerCase().includes(match);
                ctx.globalAlpha = dim ? 0.15 : 1;
                ctx.beginPath(); ctx.arc(n.x!, n.y!, r, 0, 2 * Math.PI);
                ctx.fillStyle = colors[n.type] ?? colors.concept; ctx.fill();
                if (sel?.id === n.id) { ctx.lineWidth = 1.5; ctx.strokeStyle = colors.fg; ctx.stroke(); }
                if (scale > 1.4 || n.mentions >= 3 || sel?.id === n.id || (match && !dim)) {
                  ctx.font = `${11 / scale}px var(--font-geist-sans), sans-serif`;
                  ctx.fillStyle = colors.fg; ctx.textAlign = "center"; ctx.fillText(n.name, n.x!, n.y! + r + 9 / scale);
                }
                ctx.globalAlpha = 1;
              }}
            />
          </div>
        </Card>
        <Card className="gap-3 p-4 shadow-none">
          <Input placeholder="Highlight entities…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          {!sel ? <p className="text-sm text-muted-foreground">Click a node to inspect its relations.</p> : (
            <div className="space-y-3 text-sm">
              <div>
                <div className="font-medium">{sel.name}</div>
                <div className="text-xs text-muted-foreground">{sel.type} · mentioned in {sel.mentions} chunk(s)</div>
              </div>
              <div className="space-y-1 font-mono text-xs">
                {neighbors.length ? neighbors.map((n, i) => (
                  <div key={i} className="rounded border px-2 py-1">{n.out ? <>→ <span className="text-chart-3">{n.rel}</span> {n.other}</> : <>{n.other} <span className="text-chart-3">{n.rel}</span> →</>}</div>
                )) : <span className="text-muted-foreground">No relations among the displayed nodes.</span>}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
