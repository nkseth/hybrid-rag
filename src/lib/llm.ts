import { createOpenRouter } from "@openrouter/ai-sdk-provider";

// Free OpenRouter models that support structured outputs (needed for graph extraction + eval judge).
// `openrouter/free` auto-routes to any available free model and is the fallback when the primary is rate-limited.
export const ANSWER_MODEL = process.env.ANSWER_MODEL ?? "nvidia/nemotron-3.5-super-vl:free";
export const FAST_MODEL = process.env.FAST_MODEL ?? "nvidia/nemotron-3.5-super-vl:free";
const FALLBACK = "openrouter/free";

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY, appName: "hybrid-rag" });

const withFallback = (id: string) => openrouter(id, { extraBody: { models: id === FALLBACK ? [id] : [id, FALLBACK] } });

export const answerModel = () => withFallback(ANSWER_MODEL);
export const fastModel = () => withFallback(FAST_MODEL);

export const hasLLM = () => !!process.env.OPENROUTER_API_KEY;
