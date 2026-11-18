import "server-only";
import { pipeline, env, type FeatureExtractionPipeline } from "@huggingface/transformers";

export const EMBED_MODEL = "Xenova/bge-small-en-v1.5";
// bge models want this prefix on queries (not on documents).
const QUERY_PREFIX = "Represent this sentence for searching relevant passages: ";

// Vercel's filesystem is read-only except /tmp; the model (~34MB) downloads there on cold start.
env.cacheDir = process.env.VERCEL ? "/tmp/models" : "./.cache/models";

let extractor: Promise<FeatureExtractionPipeline> | null = null;

export async function embed(texts: string[], opts: { query?: boolean } = {}): Promise<number[][]> {
  extractor ??= pipeline("feature-extraction", EMBED_MODEL, { dtype: "q8" });
  const fe = await extractor;
  const input = opts.query ? texts.map((t) => QUERY_PREFIX + t) : texts;
  const out: number[][] = [];
  for (let i = 0; i < input.length; i += 16) {
    const t = await fe(input.slice(i, i + 16), { pooling: "cls", normalize: true });
    out.push(...(t.tolist() as number[][]));
  }
  return out;
}

export const toVec = (v: number[]) => JSON.stringify(v);
