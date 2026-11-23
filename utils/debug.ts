/**
 * Step-by-step pipeline logging, off unless VERBATIM_DEBUG=1.
 *
 *   const log = debugRun("analysis", sourceId);
 *   log("transcript", { segments: 120 });
 *   // [debug analysis 3fa1c2 src=6b0f...] +412ms transcript {"segments":120}
 *
 * Every line of one run shares a short run id, so concurrent runs can be told
 * apart in the server log. Never pass secrets or full transcripts.
 */
const enabled = () => process.env.VERBATIM_DEBUG === "1" || process.env.VERBATIM_DEBUG === "true";

export function debugRun(scope: string, subject?: string) {
  const started = Date.now();
  const runId = Math.random().toString(16).slice(2, 8);
  const tag = `[debug ${scope} ${runId}${subject ? ` ${subject.slice(0, 8)}` : ""}]`;
  return (step: string, data?: Record<string, unknown>) => {
    if (!enabled()) return;
    let extra = "";
    if (data) {
      try {
        extra = ` ${JSON.stringify(data).slice(0, 1000)}`;
      } catch {
        extra = " [unserializable]";
      }
    }
    console.log(`${tag} +${Date.now() - started}ms ${step}${extra}`);
  };
}
