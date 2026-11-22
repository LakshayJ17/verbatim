import { Footer } from "@/components/footer";
import { StageSplit } from "@/components/landing/stage-split";
import { DesignTry } from "@/components/landing/design-try";
import { StartDialog } from "@/components/landing/start-dialog";
import { LandingMotion } from "@/components/landing/landing-motion";
import { Anatomy } from "@/components/landing/anatomy";
import { FormatMosaic } from "@/components/landing/format-mosaic";
import ScrollReveal from "@/components/reactbits/scroll-reveal";
import { FORMAT_PRESETS } from "@/utils/design/presets";
import { DESIGN_STYLES, type StyleId } from "@/utils/design/styles";

// Section headings rise word by word once as they enter. No scrub, no blur.
const HEADING_REVEAL = {
  mode: "enter" as const,
  effect: "rise" as const,
  baseRotation: 0,
  enableBlur: false,
  stagger: 0.06,
  duration: 0.6,
  containerClassName: "t-head max-w-[18ch]",
  textClassName: "t-head",
};

export default function Home() {
  const formats = Object.values(FORMAT_PRESETS);
  const styleIds = Object.keys(DESIGN_STYLES) as StyleId[];

  return (
    <main id="main" tabIndex={-1} className="landing w-full max-w-full flex-1 overflow-x-clip bg-paper outline-none">
      <LandingMotion />
      <StageSplit />
      <DesignTry />

      <Anatomy />

      {/* Every design, every size: one packed mosaic */}
      <section aria-label="Every design, every size" className="px-5 py-28 md:px-[8%] md:py-40">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-8 md:grid-cols-2 md:items-end">
            <ScrollReveal {...HEADING_REVEAL} containerClassName="t-head max-w-[14ch]">
              Every design, every size
            </ScrollReveal>
            <p className="max-w-[46ch]">
              {styleIds.length} designs and {formats.length} sizes, from a square post to a story or a channel banner. Pick
              any pair for any quote.
            </p>
          </div>
          <div className="mt-16 md:mt-20">
            <FormatMosaic />
          </div>
        </div>
      </section>

      {/* Closing step: the same link field the app starts with */}
      <section aria-labelledby="start-title" className="bg-surface px-5 py-28 md:px-[8%] md:py-36">
        <div className="mx-auto max-w-3xl">
          <h2 id="start-title" className="t-head max-w-[20ch]">
            Which video do you keep quoting?
          </h2>
          <p className="mt-5 max-w-[52ch]">
            Paste its link and create an account. The link will already be in the form when you get there.
          </p>
          <div className="mt-10">
            <StartDialog />
          </div>
          <p className="t-small mt-4 text-ink-soft">Podcasts, interviews and lectures up to two hours long.</p>
        </div>
      </section>

      <Footer />
    </main>
  );
}
