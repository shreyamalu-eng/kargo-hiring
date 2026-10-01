import "server-only";
import { GoogleGenAI } from "@google/genai";

const clients: Record<string, GoogleGenAI> = {};
const key = () => (process.env.GEMINI_API_KEY ?? "").trim().replace(/\s+/g, "");
/**
 * "AIza..." keys are classic AI Studio keys. Newer "AQ..." keys are Google Cloud keys that some
 * accounts can only use through Vertex AI (express mode). We try the likely mode first and
 * fall back to the other one if Google says the credential type is wrong.
 */
let vertex: boolean | null = null;
function useVertex() {
  if (vertex !== null) return vertex;
  const v = (process.env.GEMINI_USE_VERTEX ?? "").toLowerCase();
  return v === "true" || v === "1";
}
function client(asVertex = useVertex()) {
  const k = key();
  if (!k) throw new Error("GEMINI_API_KEY is not set");
  const id = asVertex ? "vertex" : "studio";
  if (clients[id]) return clients[id];
  clients[id] = new GoogleGenAI({
    apiKey: k,
    ...(asVertex ? { vertexai: true } : {}),
    // Optional override, used only for local testing against a mock server.
    ...(process.env.GEMINI_BASE_URL ? { httpOptions: { baseUrl: process.env.GEMINI_BASE_URL } } : {}),
  });
  return clients[id];
}
const isAuthError = (status: number | undefined, msg: string) =>
  status === 401 || status === 403 && /API_KEY|credential|permission/i.test(msg) || /UNAUTHENTICATED|invalid authentication|ACCESS_TOKEN_TYPE_UNSUPPORTED|API_KEY_INVALID|API key not valid/i.test(msg);
let triedOther = false;

export const MODEL = () => process.env.GEMINI_MODEL || "gemini-3.5-flash";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Calls Gemini and returns parsed JSON matching `schema`. Retries on rate limits / overload
 * (the free tier allows only a few requests per minute) as long as the deadline allows.
 */
export async function generateJson<T>(prompt: string, schema: object, opts: { deadline?: number; temperature?: number } = {}): Promise<T> {
  const deadline = opts.deadline ?? Date.now() + 50_000;
  let attempt = 0;
  for (;;) {
    const left = deadline - Date.now();
    if (left < 4_000) throw new Error("RATE_LIMITED: ran out of time for this request - it will be retried");
    try {
      const res = await client().models.generateContent({
        model: MODEL(),
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: schema,
          temperature: opts.temperature ?? 0,
          // Never let one AI call run past the serverless time limit.
          abortSignal: AbortSignal.timeout(left),
        },
      });
      const text = res.text ?? "";
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new Error(`Gemini returned non-JSON output: ${text.slice(0, 200)}`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const status = (e as { status?: number })?.status;
      if (isAuthError(status, msg)) {
        if (!triedOther) {
          // Switch between AI Studio and Vertex AI once, then keep whichever works.
          triedOther = true;
          vertex = !useVertex();
          continue;
        }
        throw new Error(
          "Google rejected the Gemini key (401). Your key starts with \"" + key().slice(0, 3) + "\" - the app tried both the Gemini API and Vertex AI with it. " +
            "Fix: go to aistudio.google.com/apikey, click Create API key, and paste the new key (it starts with \"AIza\") into GEMINI_API_KEY in Vercel, then redeploy.",
        );
      }
      const retryable = status === 429 || status === 500 || status === 503 || /429|RESOURCE_EXHAUSTED|UNAVAILABLE|overloaded|non-JSON|abort|timeout|timed out/i.test(msg);
      // Free-tier *daily* quota is used up: retrying won't help until it resets.
      if (/PerDay|per day|daily/i.test(msg))
        throw new Error(`DAILY_LIMIT: Gemini's free daily limit for ${MODEL()} is used up. It resets around 12:30 pm India time. To continue now, turn on billing for your Gemini key or set GEMINI_MODEL to another Flash model in Vercel.`);
      if (status === 404 || /not found/i.test(msg))
        throw new Error(`Gemini model "${MODEL()}" not available for this key - set GEMINI_MODEL to a current Flash model. (${msg.slice(0, 160)})`);
      const hinted = Number(msg.match(/retry in ([\d.]+)s/i)?.[1] ?? msg.match(/"retryDelay":\s*"(\d+)s"/)?.[1] ?? 0) * 1000;
      const wait = Math.max(hinted, 2000 * 2 ** attempt);
      attempt++;
      if (!retryable || attempt > 5 || Date.now() + wait > deadline) {
        const err = new Error(retryable ? `RATE_LIMITED: ${msg.slice(0, 200)}` : msg.slice(0, 300));
        throw err;
      }
      await sleep(wait);
    }
  }
}
