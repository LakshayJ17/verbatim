"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, CircleNotch, DownloadSimple, Play, ShareNetwork, UsersThree } from "@phosphor-icons/react/dist/ssr";
import { QuoteStatus } from "@/components/quote-status";
import { ScaledRenderer } from "@/components/creator/scaled-renderer";
import SplitText from "@/components/reactbits/split-text";
import { cn } from "@/lib/utils";
import { DESIGN_STYLES } from "@/utils/design/styles";
import { EPISODE, QUOTES, formatTimestamp } from "./example-episode";
import { exampleConfig, SHOWCASE_LINES } from "./example-config";

const STEPS = [
  {
    title: "Paste a YouTube link.",
    detail: "Podcasts, interviews and lectures up to two hours long.",
  },
  {
    title: "Verbatim picks the best quotes.",
    detail:
      "It goes through the whole conversation and pulls out the lines worth sharing, each one checked against the transcript.",
  },
  {
    title: "Choose a design and share it.",
    detail: "Download the image, send it to a friend, or post it to Commonplace, where everyone on Verbatim shares the lines they love.",
  },
];


/**
 * Hero and "How it works" as one split stage: the reading column scrolls on
 * the left while the product fragment on the right stays in place and
 * crossfades to the state that matches the step in view.
 */
export function StageSplit() {
  const [active, setActive] = useState(0);
  const blocks = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.step));
        }
      },
      // A thin line across the middle of the viewport decides the active block.
      { rootMargin: "-50% 0px -50% 0px" }
    );
    blocks.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <>
      {/* Phone: the wordmark row sits above the sticky stage */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center px-4 py-3 lg:hidden">
        <a href="#how" className="t-small justify-self-start underline-offset-4 hover:underline">
          How it works
        </a>
        <span className="font-display text-[1.75rem] font-semibold tracking-[-0.03em]">Verbatim</span>
        <Link href="/login" className="t-small justify-self-end underline-offset-4 hover:underline">
          Sign in
        </Link>
      </div>

      <section className="grid gap-3 px-3 lg:grid-cols-2 lg:p-3">
        {/* Reading column */}
        <div className="order-2 lg:order-1">
          <header
            ref={(el) => {
              blocks.current[0] = el;
            }}
            data-step={0}
            className="flex flex-col items-center px-2 pb-16 pt-10 text-center lg:min-h-[calc(100svh-24px)] lg:px-10 lg:pb-10 lg:pt-5"
          >
            <nav className="hidden w-full grid-cols-[1fr_auto_1fr] items-center lg:grid" aria-label="Main">
              <a href="#how" className="t-small justify-self-start underline-offset-4 hover:underline">
                How it works
              </a>
              <span className="t-head">Verbatim</span>
              <Link href="/login" className="t-small justify-self-end underline-offset-4 hover:underline">
                Sign in
              </Link>
            </nav>

            <div className="flex flex-1 flex-col items-center justify-center">
              <SplitText
                tag="h1"
                text="Quote images from any video"
                className="t-head max-w-[16ch] text-balance"
                splitType="words"
                mask
                trigger="load"
                delay={70}
                duration={0.9}
              />
              <p data-rise className="t-body mt-8 max-w-[42ch] text-pretty">
                Paste a YouTube link. Verbatim finds the best quotes and lays each one out in several designs. Pick
                the one you like, download it, send it to a friend or post it to Commonplace.
              </p>
              <Link
                href="/signup"
                data-rise
                className="press mt-10 inline-flex h-12 items-center rounded-[var(--radius)] bg-ink px-6 font-medium text-paper outline-none hover:bg-ink-hover focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-paper max-lg:w-full max-lg:justify-center"
              >
                Make quote images
              </Link>
            </div>
          </header>

          <div id="how" className="scroll-mt-4 px-2 pb-12 lg:px-10 lg:pb-[12vh]">
            <h2 className="t-lead pt-4 font-semibold">How it works</h2>
            {STEPS.map((step, i) => (
              <div
                key={step.title}
                ref={(el) => {
                  blocks.current[i + 1] = el;
                }}
                data-step={i + 1}
                className="flex min-h-[28svh] max-w-[30ch] flex-col justify-center lg:min-h-[36vh] lg:max-w-[34ch]"
              >
                <p
                  className={cn(
                    "t-lead font-semibold transition-colors duration-300",
                    active === i + 1 ? "text-ink" : "text-ink-soft"
                  )}
                >
                  {step.title}
                </p>
                <p className="t-body mt-4">{step.detail}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Fixed stage */}
        <div className="sticky top-0 z-20 order-1 h-[52svh] self-start overflow-hidden rounded-[var(--radius)] bg-ink lg:top-3 lg:order-2 lg:h-[calc(100svh-24px)]">
          <div className="absolute inset-x-0 top-0 bottom-11 flex items-start justify-center px-4 pt-4 lg:bottom-14 lg:items-center lg:px-6 lg:pt-0">
            <div data-ui className="grid w-full max-w-[460px]">
              <StageState
                show={active === 0}
                caption="One 52-minute interview in. A set of ready images out, each a different quote, design and size."
              >
                <StackState />
              </StageState>
              <StageState show={active === 1} caption="You paste the link. Verbatim checks the video and fetches its transcript.">
                <IngestState />
              </StageState>
              <StageState show={active === 2} caption="It picks the lines worth sharing and checks each one against the transcript.">
                <QuotesState />
              </StageState>
              <StageState show={active === 3} caption="Pick a design, then download it, share it or post it to Commonplace.">
                <ShareState />
              </StageState>
            </div>
          </div>
          <div className="t-small absolute inset-x-0 bottom-0 flex h-11 items-center justify-between gap-4 bg-mark px-4 lg:h-14 lg:px-5">
            <span className="truncate">Example: an invented interview, not a real episode</span>
          </div>
        </div>
      </section>
    </>
  );
}

function StageState({ show, caption, children }: { show: boolean; caption: string; children: React.ReactNode }) {
  return (
    <div
      aria-hidden={!show}
      className={cn(
        "transition-opacity duration-[900ms] ease-[var(--ease-in-out)] motion-reduce:transition-none",
        "[grid-area:1/1] self-center",
        show ? "opacity-100" : "pointer-events-none opacity-0"
      )}
    >
      <p className="t-body mb-4 max-w-[38ch] text-paper">{caption}</p>
      {children}
    </div>
  );
}

function Sheet({ title, meta, children }: { title: string; meta: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius)] bg-white p-5 text-[17px] leading-snug text-ink">
      <div className="mb-4 flex items-baseline justify-between gap-4 border-b border-border pb-3">
        <span className="font-semibold">{title}</span>
        <span className="truncate text-[15px] text-muted-foreground">{meta}</span>
      </div>
      {children}
    </div>
  );
}

function StackState() {
  const items = [
    { style: "old_school" as const, format: "portrait" as const, text: SHOWCASE_LINES[0], ratio: "4 / 5", label: "Portrait" },
    { style: "cinematic" as const, format: "square" as const, text: SHOWCASE_LINES[2], ratio: "1 / 1", label: "Square" },
    { style: "funky" as const, format: "story" as const, text: SHOWCASE_LINES[1], ratio: "9 / 16", label: "Story" },
  ];
  return (
    <div className="rounded-[var(--radius)] bg-white p-5 text-[17px] leading-snug text-ink">
      <div className="flex items-center gap-3 rounded-[var(--radius)] bg-surface p-3">
        <span className="flex h-10 w-14 shrink-0 items-center justify-center rounded-[var(--radius)] bg-ink text-paper" aria-hidden="true">
          <Play className="size-4" weight="fill" />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-semibold">
            {EPISODE.show}, {EPISODE.episode.toLowerCase()}
          </span>
          <span className="block text-[15px] text-muted-foreground">YouTube · 52 min</span>
        </span>
      </div>
      <div className="mt-4 flex items-end gap-2">
        {items.map((item) => (
          <figure key={item.label} className="m-0 min-w-0 flex-1">
            <div className="overflow-hidden rounded-[var(--radius)]" style={{ aspectRatio: item.ratio }}>
              <ScaledRenderer config={exampleConfig(item.style, item.text, item.format)} />
            </div>
            <figcaption className="mt-1.5 text-[14px] text-muted-foreground">
              {item.label}, {DESIGN_STYLES[item.style].label}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

function IngestState() {
  const steps = ["Checking source", "Source recognized", "Finding transcript"];
  return (
    <Sheet title="Make quote images" meta="YouTube link">
      <ul className="space-y-3">
        {steps.map((label) => (
          <li key={label} className="flex items-center gap-3">
            <Check className="size-4" aria-hidden="true" />
            <span>{label}</span>
          </li>
        ))}
        <li className="ml-7 bg-surface p-3 text-[15px] text-muted-foreground">
          <span className="block text-[17px] font-medium text-ink">
            {EPISODE.show}, {EPISODE.episode.toLowerCase()}
          </span>
          Duration: 52m
        </li>
        <li className="flex items-center gap-3 font-medium">
          <CircleNotch className="size-4 motion-safe:animate-spin" aria-hidden="true" />
          <span>Finding the best quotes</span>
        </li>
      </ul>
    </Sheet>
  );
}

function QuotesState() {
  return (
    <Sheet title="Best quotes" meta={`${QUOTES.length} found`}>
      <ul className="space-y-4">
        {QUOTES.map((quote) => (
          <li key={quote.text}>
            <p>&ldquo;{quote.text}&rdquo;</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <QuoteStatus status={quote.status} />
              <span className="text-[15px] tabular-nums text-muted-foreground">
                {EPISODE.guest}, {formatTimestamp(quote.start)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

function ShareState() {
  const actions = [
    { icon: DownloadSimple, label: "Download" },
    { icon: ShareNetwork, label: "Send" },
    { icon: UsersThree, label: "Commonplace" },
  ];
  return (
    <Sheet title="Share" meta="Square, 1080 × 1080">
      <div className="mx-auto aspect-square w-3/5 overflow-hidden rounded-[var(--radius)]">
        <ScaledRenderer config={exampleConfig("old_school", QUOTES[1].text)} />
      </div>
      <ul className="mt-4 grid grid-cols-3 gap-2" aria-hidden="true">
        {actions.map(({ icon: Icon, label }, i) => (
          <li
            key={label}
            className={cn(
              "flex h-11 items-center justify-center gap-1.5 rounded-[var(--radius)] text-[15px] font-medium",
              i === 0 ? "bg-ink text-paper" : "bg-surface text-ink"
            )}
          >
            <Icon className="size-4" />
            {label}
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
