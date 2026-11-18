"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FlaskConical, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function RunEvalButton() {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <Button size="sm" disabled={busy} onClick={async () => {
      setBusy(true);
      try {
        const r = await fetch("/api/evals", { method: "POST" });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        toast.success(`Eval run #${j.runId} done — hybrid MRR ${j.metrics.hybrid.mrr}`);
        router.refresh();
      } catch (e) {
        toast.error(`Eval failed: ${e instanceof Error ? e.message : e}`);
      } finally {
        setBusy(false);
      }
    }}>
      {busy ? <Loader2 className="animate-spin" /> : <FlaskConical />}{busy ? "Running…" : "Run evals"}
    </Button>
  );
}
