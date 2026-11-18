// Pure text utilities (no server deps) so they can be unit-checked with plain node.

/** Paragraph-aware chunking: pack paragraphs up to `size` chars, carry `overlap` chars forward. */
export function chunkText(text: string, size = 600, overlap = 100): string[] {
  const paras = text.replace(/\r/g, "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let cur = "";
  const push = () => {
    if (cur.trim()) chunks.push(cur.trim());
    // Carry the tail forward, starting at a sentence (else word) boundary so chunks don't open mid-word.
    const tail = cur.length > overlap ? cur.slice(-overlap) : "";
    const s = tail.search(/[.!?]\s+\S/);
    cur = s >= 0 ? tail.slice(s + 1).trimStart() : tail.slice(tail.indexOf(" ") + 1);
  };
  for (const p of paras) {
    if (p.length > size) {
      // Long paragraph: hard-split on sentence-ish boundaries.
      for (const s of p.match(new RegExp(`[\\s\\S]{1,${size}}(?=\\s|$)`, "g")) ?? [p]) {
        if (cur.length + s.length > size) push();
        cur += (cur ? " " : "") + s.trim();
      }
      continue;
    }
    if (cur.length + p.length + 2 > size) push();
    cur += (cur ? "\n\n" : "") + p;
  }
  push();
  // The overlap tail of the last chunk can produce a near-duplicate final chunk; drop it.
  return chunks.filter((c, i) => i === 0 || c.length > overlap + 20);
}

export function htmlToText(html: string): { title: string; text: string } {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "";
  const text = html
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article|br)>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*(\n\s*)+/g, "\n\n")
    .trim();
  return { title, text };
}

export async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Buffer.from(buf).toString("hex");
}

const STOP = new Set(
  "the a an and or but if then of to in on at by for with from as is are was were be been it its this that these those we you they he she our your their not no can will would should could may might do does did has have had into over under about after before also than so such which who whom what when where why how all any each more most other some only own same very just".split(" "),
);

export const contentWords = (s: string) =>
  (s.toLowerCase().match(/[a-z0-9][a-z0-9-]{2,}/g) ?? []).filter((w) => !STOP.has(w));

/** FTS5 MATCH expression: OR of quoted content words (quoting neutralises FTS syntax). */
export function ftsQuery(s: string) {
  const words = [...new Set(contentWords(s))].slice(0, 16);
  return words.length ? words.map((w) => `"${w.replace(/"/g, "")}"`).join(" OR ") : null;
}

/** Weighted Reciprocal Rank Fusion over several ranked id lists (missing weight = 1). */
export function rrf(lists: Record<string, number[]>, k = 60, weights: Record<string, number> = {}) {
  const scores = new Map<number, { score: number; ranks: Record<string, number> }>();
  for (const [name, ids] of Object.entries(lists)) {
    ids.forEach((id, i) => {
      const e = scores.get(id) ?? { score: 0, ranks: {} };
      e.score += (weights[name] ?? 1) / (k + i + 1);
      e.ranks[name] = i + 1;
      scores.set(id, e);
    });
  }
  return [...scores.entries()].sort((a, b) => b[1].score - a[1].score).map(([id, v]) => ({ id, ...v }));
}

/**
 * Offline entity extraction: capitalised phrases (incl. CamelCase/acronyms), co-occurrence edges.
 * ponytail: naive heuristic, used only when no LLM is configured; LLM extraction is the real path.
 */
export function heuristicEntities(text: string) {
  const COMMON = new Set("The A An This That These Those We You It Our In On At For If When Each All Any No Yes And But Or Note See Use Step Q".split(" "));
  const found = new Map<string, string>();
  for (const m of text.matchAll(/\b([A-Z][a-zA-Z0-9]*(?:[ -][A-Z][a-zA-Z0-9]*){0,3})\b/g)) {
    const name = m[1].split(/[ -]/).filter((w, i) => !(i === 0 && COMMON.has(w))).join(" ");
    if (name.length < 3 || COMMON.has(name)) continue;
    found.set(name.toLowerCase(), name);
    if (found.size >= 12) break;
  }
  const entities = [...found.values()].map((name) => ({ name, type: "concept" }));
  const relations = entities.slice(0, 6).flatMap((a, i) =>
    entities.slice(i + 1, 6).map((b) => ({ source: a.name, target: b.name, relation: "co_occurs_with" })),
  );
  return { entities, relations };
}
