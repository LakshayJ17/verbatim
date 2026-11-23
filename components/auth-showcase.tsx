import Link from "next/link";
import { ScaledRenderer } from "@/components/creator/scaled-renderer";
import { exampleConfig } from "@/components/landing/example-config";
import { PODCAST_QUOTES } from "@/components/landing/podcast-quotes";

const CARDS = [
  { style: "old_school" as const, format: "portrait" as const, quote: PODCAST_QUOTES.pichai, ratio: "4 / 5", label: "Portrait" },
  { style: "cinematic" as const, format: "square" as const, quote: PODCAST_QUOTES.nadella, ratio: "1 / 1", label: "Square" },
  { style: "funky" as const, format: "story" as const, quote: PODCAST_QUOTES.sethi, ratio: "9 / 16", label: "Story" },
];

/** Left panel on the sign-in and sign-up pages: what one link turns into. */
export function AuthShowcase() {
  return (
    <aside className="hidden flex-col bg-ink p-10 text-paper lg:flex">
      <Link href="/" className="font-display text-3xl font-semibold tracking-[-0.03em]">
        Verbatim
      </Link>

      <div className="my-auto pt-10">
        <p className="font-display max-w-[16ch] text-4xl font-semibold leading-tight tracking-[-0.025em]">
          One link in, a set of quote images out
        </p>
        <ul className="mt-8 flex max-w-lg items-end gap-3" aria-label="Example quote images">
          {CARDS.map((card) => (
            <li key={card.label} className="min-w-0 flex-1">
              <div className="overflow-hidden rounded-[var(--radius)]" style={{ aspectRatio: card.ratio }}>
                <ScaledRenderer config={exampleConfig(card.style, card.quote.text, card.format, card.quote.speaker, card.quote.show)} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
