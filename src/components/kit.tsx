import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function PageHeader({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <Card className="gap-1 py-4 shadow-none">
      <CardHeader className="px-4"><CardDescription className="text-xs">{label}</CardDescription></CardHeader>
      <CardContent className="px-4">
        <div className="tabular text-2xl font-semibold tracking-tight">{value}</div>
        {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

export function Panel({ title, description, action, children, className }: { title: string; description?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn("gap-4 shadow-none", className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="space-y-1">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          {description && <CardDescription className="text-xs">{description}</CardDescription>}
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

const TONE: Record<string, string> = {
  ok: "text-success", done: "text-success", ready: "text-success",
  running: "text-info", queued: "text-muted-foreground", skipped: "text-muted-foreground",
  error: "text-destructive", failed: "text-destructive", blocked: "text-destructive", block: "text-destructive",
  flag: "text-warning", redact: "text-info",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className="gap-1.5 font-mono text-[11px] font-normal">
      <span className={cn("size-1.5 rounded-full bg-current", TONE[status] ?? "text-muted-foreground", status === "running" && "animate-pulse")} />
      {status}
    </Badge>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">{children}</div>;
}

export function PageSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      <Skeleton className="h-72" />
    </div>
  );
}

export const ms = (n: number | null | undefined) => (n == null ? "—" : n >= 1000 ? `${(n / 1000).toFixed(2)}s` : `${Math.round(n)}ms`);
export const num = (n: number | null | undefined) => (n == null ? "—" : Intl.NumberFormat("en", { notation: n >= 10000 ? "compact" : "standard" }).format(n));
export const pct = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n * 100)}%`);

export function ago(ts: number | null | undefined) {
  if (!ts) return "—";
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
