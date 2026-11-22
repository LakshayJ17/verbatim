#!/usr/bin/env node
/**
 * Checks that the configured Gemini key can actually generate with AI_MODEL
 * (and AI_FALLBACK_MODELS). Uses plain REST with a short timeout, because the
 * SDK can wait forever on some error responses.
 *
 *   node --env-file=.env.local scripts/check-ai.mjs
 *
 * Sends one tiny prompt per model (a fraction of a cent). Never prints the key.
 */
const key = process.env.AI_API_KEY;
if (!key) {
  console.error("AI_API_KEY is not set. Run with: node --env-file=.env.local scripts/check-ai.mjs");
  process.exit(1);
}
const primary = process.env.AI_MODEL || "gemini-flash-latest";
const fallbacks = (process.env.AI_FALLBACK_MODELS || "").split(",").map((m) => m.trim()).filter(Boolean);
const models = [...new Set([primary, ...fallbacks, ...process.argv.slice(2)])];

let ok = 0;
for (const model of models) {
  const started = Date.now();
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ parts: [{ text: "Reply with the single word OK." }] }], generationConfig: { maxOutputTokens: 256 } }),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch { /* empty or non-JSON */ }
    const ms = Date.now() - started;
    if (res.ok) {
      ok++;
      console.log(`OK    ${model}  (${ms} ms, served by ${body?.modelVersion ?? "?"})`);
    } else {
      const msg = body?.error?.message ?? (text ? text.slice(0, 160) : "empty response body");
      console.log(`FAIL  ${model}  HTTP ${res.status} (${ms} ms): ${msg}`);
      if (res.status === 404 && !text) console.log("      Empty 404: this key cannot use this model. Create a new key in Google AI Studio for a project with the Gemini API enabled, or pick a model the key can use.");
    }
  } catch (e) {
    console.log(`FAIL  ${model}  ${e?.name === "TimeoutError" ? "no response in 30 s" : e?.message}`);
  }
}
console.log(ok ? `\n${ok}/${models.length} model(s) usable.` : "\nNo usable model: analyses will fail until AI_API_KEY / AI_MODEL are fixed.");
process.exit(ok ? 0 : 1);
