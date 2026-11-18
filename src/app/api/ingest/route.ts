import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { after } from "next/server";
import { assertFetchableUrl, enqueue, pdfToText, processPending } from "@/lib/ingest";
import { htmlToText } from "@/lib/text";

export const maxDuration = 300;

const MAX_FILE = 4 * 1024 * 1024; // Vercel request bodies cap at 4.5MB
const TEXT_EXT = /\.(md|mdx|txt|csv|json|html?)$/i;

/** Accepts multipart: files[], url (+refresh minutes), text (+title); or JSON { seed: true }. */
export async function POST(req: Request) {
  const queued: number[] = [];
  const errors: string[] = [];

  if (req.headers.get("content-type")?.includes("application/json")) {
    const body = await req.json().catch(() => ({}));
    if (!body?.seed) return Response.json({ error: "Unknown JSON body" }, { status: 400 });
    const dir = path.join(process.cwd(), "data/seed");
    for (const f of (await readdir(dir)).filter((f) => f.endsWith(".md"))) {
      const text = await readFile(path.join(dir, f), "utf8");
      const title = text.match(/^#\s+(.+)/m)?.[1] ?? f;
      queued.push(await enqueue({ kind: "seed", uri: `seed://${f}`, title, payload: text }));
    }
  } else {
    const form = await req.formData();
    for (const file of form.getAll("files")) {
      if (!(file instanceof File)) continue;
      if (file.size > MAX_FILE) { errors.push(`${file.name}: larger than 4MB`); continue; }
      let text: string;
      if (/\.pdf$/i.test(file.name)) text = await pdfToText(new Uint8Array(await file.arrayBuffer()));
      else if (TEXT_EXT.test(file.name)) text = await file.text();
      else { errors.push(`${file.name}: unsupported type (pdf, md, txt, html, csv, json)`); continue; }
      if (/\.html?$/i.test(file.name)) text = htmlToText(text).text;
      queued.push(await enqueue({ kind: "upload", uri: `upload://${file.name}`, title: file.name, payload: text }));
    }
    const url = String(form.get("url") ?? "").trim();
    if (url) {
      try {
        assertFetchableUrl(url);
        const refresh = Number(form.get("refresh")) || undefined;
        queued.push(await enqueue({ kind: "url", uri: url, title: new URL(url).hostname + new URL(url).pathname, refreshMinutes: refresh }));
      } catch (e) {
        errors.push(`${url}: ${e instanceof Error ? e.message : e}`);
      }
    }
    const text = String(form.get("text") ?? "").trim();
    if (text) {
      const title = String(form.get("title") ?? "").trim() || text.slice(0, 40);
      queued.push(await enqueue({ kind: "text", uri: `text://${title}`, title, payload: text }));
    }
  }

  // Process right after responding; the cron/worker tick is the safety net.
  if (queued.length) after(() => processPending());
  return Response.json({ queued: queued.length, errors }, { status: queued.length || !errors.length ? 200 : 400 });
}
