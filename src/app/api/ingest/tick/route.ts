import { enqueueDueRefreshes, processPending } from "@/lib/ingest";

export const maxDuration = 300;

/** Called by Vercel Cron (see vercel.json) and by `npm run worker` locally. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  const refreshed = await enqueueDueRefreshes();
  const processed = await processPending();
  return Response.json({ refreshed, processed });
}
