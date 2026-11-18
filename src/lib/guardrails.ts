// Pure guardrail checks (no server deps). Logging happens in the caller.
import { contentWords } from "./text.ts";

export type GuardEvent = { rule: string; action: "block" | "redact" | "flag"; detail: string };

const INJECTION = [
  /ignore\s+(all\s+|any\s+|the\s+)?(previous|prior|above|earlier)\s+(instructions|prompts?|rules)/i,
  /disregard\s+(all\s+|the\s+|your\s+)?(previous|prior|above)?\s*(instructions|rules|guidelines)/i,
  /(reveal|print|show|repeat)\s+(me\s+)?(your|the)\s+(system\s+prompt|instructions|hidden)/i,
  /you\s+are\s+now\s+(a|an|in)\b/i,
  /\b(jailbreak|DAN mode|developer mode)\b/i,
  /<\s*\/?\s*(system|assistant)\s*>/i,
];

const PII: [string, RegExp, string][] = [
  ["email", /[\w.+-]+@[\w-]+\.[\w.-]+/g, "[EMAIL]"],
  ["credit_card", /\b(?:\d[ -]?){13,16}\b/g, "[CARD]"],
  ["ssn", /\b\d{3}-\d{2}-\d{4}\b/g, "[SSN]"],
  ["phone", /(?<!\w)(?:\+?\d{1,3}[ .-]?)?\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}(?!\w)/g, "[PHONE]"],
];

export const MAX_QUERY_CHARS = 2000;

export function detectInjection(text: string) {
  return INJECTION.find((r) => r.test(text))?.source ?? null;
}

export function redactPII(text: string) {
  const events: GuardEvent[] = [];
  let out = text;
  for (const [rule, re, repl] of PII) {
    const n = out.match(re)?.length ?? 0;
    if (n) {
      out = out.replace(re, repl);
      events.push({ rule: `pii_${rule}`, action: "redact", detail: `${n} match(es) redacted` });
    }
  }
  return { text: out, events };
}

export function checkInput(raw: string): { text: string; blocked: boolean; events: GuardEvent[] } {
  const events: GuardEvent[] = [];
  if (!raw.trim()) return { text: raw, blocked: true, events: [{ rule: "empty", action: "block", detail: "Empty query" }] };
  if (raw.length > MAX_QUERY_CHARS)
    return { text: raw, blocked: true, events: [{ rule: "max_length", action: "block", detail: `${raw.length} > ${MAX_QUERY_CHARS} chars` }] };
  const inj = detectInjection(raw);
  if (inj) return { text: raw, blocked: true, events: [{ rule: "prompt_injection", action: "block", detail: `Matched /${inj}/` }] };
  const pii = redactPII(raw);
  return { text: pii.text, blocked: false, events: [...events, ...pii.events] };
}

const IDK = /\b(i don'?t know|not (in|covered by) the (provided )?(context|documents)|no relevant information)\b/i;

/**
 * Output checks: citations must point at retrieved contexts, and the answer's content words
 * must mostly appear in the cited contexts (lexical groundedness).
 * ponytail: lexical overlap is a cheap proxy; the eval page runs an LLM judge for real faithfulness.
 */
export function checkOutput(answer: string, contexts: string[]) {
  const events: GuardEvent[] = [];
  const cited = [...answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
  const invalid = [...new Set(cited.filter((n) => n < 1 || n > contexts.length))];
  if (invalid.length) events.push({ rule: "invalid_citation", action: "flag", detail: `Cites missing source(s): ${invalid.join(", ")}` });

  const idk = IDK.test(answer);
  if (!cited.length && !idk) events.push({ rule: "no_citations", action: "flag", detail: "Answer has no citations" });

  const valid = [...new Set(cited.filter((n) => n >= 1 && n <= contexts.length))];
  const ctxWords = new Set(contentWords((valid.length ? valid.map((n) => contexts[n - 1]) : contexts).join(" ")));
  const ans = contentWords(answer.replace(/\[\d+\]/g, ""));
  const groundedness = ans.length ? ans.filter((w) => ctxWords.has(w)).length / ans.length : 1;
  if (!idk && groundedness < 0.5)
    events.push({ rule: "low_groundedness", action: "flag", detail: `Only ${Math.round(groundedness * 100)}% of answer terms found in sources` });

  const pii = redactPII(answer);
  return { text: pii.text, groundedness: Math.round(groundedness * 100) / 100, events: [...events, ...pii.events] };
}
