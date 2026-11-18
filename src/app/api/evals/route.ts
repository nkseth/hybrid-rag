import { runEval } from "@/lib/evals";

export const maxDuration = 300;

export async function POST() {
  try {
    return Response.json(await runEval());
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
