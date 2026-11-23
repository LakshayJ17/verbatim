/**
 * Spots a model that is stuck repeating itself, so the stream can be stopped
 * early instead of running to the output cap. Gemini 3 sometimes does this:
 * a number that never ends ("0.950000000..."), a whitespace run, or one phrase
 * over and over. Seen on a 6-minute transcript that should have produced
 * about 1,000 output tokens and produced 16,368 instead.
 */

/** Longest repeating unit looked for, in characters. */
const MAX_UNIT = 120;
/** A repeat must cover at least this many characters before it counts. */
const MIN_SPAN = 240;
/** And at least this many copies of the unit. */
const MIN_COPIES = 5;

/**
 * True when the end of `text` is one short unit repeated, exactly, over at
 * least MIN_SPAN characters. Real JSON answers never do this: quotes are at
 * most about 60 words, and numbers and indentation are short.
 */
export function endsInLoop(text: string): boolean {
  const n = text.length;
  for (let unit = 1; unit <= MAX_UNIT; unit++) {
    const span = Math.max(MIN_SPAN, unit * MIN_COPIES);
    if (span > n) break;
    let i = n - 1;
    const stop = n - span + unit;
    while (i >= stop && text.charCodeAt(i) === text.charCodeAt(i - unit)) i--;
    if (i < stop) return true;
  }
  return false;
}
