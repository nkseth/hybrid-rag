"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Suspense } from "react";
import { Activity, Database, FlaskConical, LayoutDashboard, MessageSquare, Moon, ShieldCheck, Sun, Waypoints } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

const NAV = [
  { group: "Pipeline", items: [
    { href: "/", label: "Overview", icon: LayoutDashboard },
    { href: "/playground", label: "Playground", icon: MessageSquare },
    { href: "/sources", label: "Sources", icon: Database },
    { href: "/graph", label: "Knowledge Graph", icon: Waypoints },
  ] },
  { group: "Observability", items: [
    { href: "/traces", label: "Traces", icon: Activity },
    { href: "/evals", label: "Evals", icon: FlaskConical },
    { href: "/guardrails", label: "Guardrails", icon: ShieldCheck },
  ] },
];

const active = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

export function AppShell({ children, llm, db }: { children: React.ReactNode; llm: string; db: string }) {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <Link href="/" className="flex h-10 items-center gap-2 px-2 font-semibold tracking-tight">
            <svg viewBox="0 0 24 24" className="size-5 shrink-0 fill-current" aria-hidden><path d="M12 2 22 20H2z" /></svg>
            <span className="truncate group-data-[collapsible=icon]:hidden">hybrid-rag</span>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          {/* usePathname is request data: keep it inside Suspense so routes can still prerender */}
          <Suspense fallback={<NavItems path="" />}><ActiveNav /></Suspense>
        </SidebarContent>
        <SidebarFooter className="group-data-[collapsible=icon]:hidden">
          <div className="space-y-1.5 rounded-md border p-3 text-xs">
            <Status label="Database" value={db} />
            <Status label="LLM" value={llm} warn={llm === "offline"} />
            <Status label="Embeddings" value="bge-small · local" />
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <div className="mr-2 h-4 w-px bg-border" />
          <h1 className="text-sm font-medium"><Suspense><Title /></Suspense></h1>
          <Button variant="ghost" size="icon" className="ml-auto size-8" aria-label="Toggle theme" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
            <Sun className="hidden dark:block" /><Moon className="dark:hidden" />
          </Button>
        </header>
        <div className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function Status({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1.5 truncate font-mono">
        <span className={`size-1.5 rounded-full ${warn ? "bg-warning" : "bg-success"}`} />
        {value}
      </span>
    </div>
  );
}

function ActiveNav() {
  return <NavItems path={usePathname()} />;
}

function Title() {
  const path = usePathname();
  return NAV.flatMap((g) => g.items).find((i) => active(path, i.href))?.label ?? "";
}

function NavItems({ path }: { path: string }) {
  return NAV.map((g) => (
    <SidebarGroup key={g.group}>
      <SidebarGroupLabel>{g.group}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {g.items.map((i) => (
            <SidebarMenuItem key={i.href}>
              <SidebarMenuButton asChild isActive={active(path, i.href)} tooltip={i.label}>
                <Link href={i.href}><i.icon /><span>{i.label}</span></Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  ));
}
