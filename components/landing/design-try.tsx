"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { Check } from "@phosphor-icons/react/dist/ssr";
import { ScaledRenderer } from "@/components/creator/scaled-renderer";
import { cn } from "@/lib/utils";
import { DESIGN_STYLES, type StyleId } from "@/utils/design/styles";
import { FORMAT_PRESETS, type FormatPresetId } from "@/utils/design/presets";
import { exampleConfig, SHOWCASE_LINES } from "./example-config";

const STYLE_IDS = Object.keys(DESIGN_STYLES) as StyleId[];
const FORMAT_IDS = Object.keys(FORMAT_PRESETS) as FormatPresetId[];
const LINES = SHOWCASE_LINES.slice(0, 3);

/**
 * The live thing: pick a line from the example interview, a design and a
 * size, and see the real Verbatim renderer lay it out.
 */
export function DesignTry() {
  const id = useId();
  const [line, setLine] = useState(0);
  const [style, setStyle] = useState<StyleId>("old_school");
  const [format, setFormat] = useState<FormatPresetId>("square");
  const preset = FORMAT_PRESETS[format];

  return (
    <section aria-labelledby={`${id}-title`} className="grid lg:grid-cols-[5fr_6fr]">
      {/* Controls */}
      <div className="relative flex flex-col bg-ink px-5 pb-40 pt-20 text-paper lg:min-h-[92svh] lg:px-[8%] lg:pt-28">
        <h2 id={`${id}-title`} className="sr-only">
          Try a design
        </h2>

        <fieldset>
          <legend className="text-[15px] font-medium text-paper/80">Pick a line</legend>
          <div className="mt-4 grid gap-3">
            {LINES.map((text, i) => {
              const on = line === i;
              return (
                <button
                  key={text}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setLine(i)}
                  className={cn(
                    "press flex items-start gap-3 rounded-[var(--radius)] p-3.5 text-left text-[17px] leading-snug outline-none focus-visible:ring-2 focus-visible:ring-paper",
                    on ? "bg-paper text-ink" : "bg-white/[0.08] text-paper hover:bg-white/[0.14]"
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2",
                      on ? "border-ink bg-ink text-paper" : "border-paper/50"
                    )}
                  >
                    {on && <Check className="size-3" weight="bold" />}
                  </span>
                  <span className="font-display text-[18px]">&ldquo;{text}&rdquo;</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="mt-12">
          <legend className="text-[15px] font-medium text-paper/80">Design</legend>
          <div className="mt-4 grid grid-cols-5 gap-3">
            {STYLE_IDS.map((s) => {
              const sys = DESIGN_STYLES[s];
              const on = style === s;
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setStyle(s)}
                  className="group flex flex-col items-center gap-1.5 rounded-[var(--radius)] outline-none focus-visible:ring-2 focus-visible:ring-paper"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex aspect-square w-full items-center justify-center rounded-[var(--radius)] text-2xl transition-transform duration-150",
                      on ? "ring-2 ring-paper ring-offset-2 ring-offset-ink" : "group-hover:scale-[1.04]"
                    )}
                    style={{
                      backgroundColor: sys.defaultPalette.background,
                      color: sys.defaultPalette.text,
                      fontFamily: sys.defaultTypography.quoteFont,
                      boxShadow: "inset 0 0 0 1px rgb(255 255 255 / 0.12)",
                    }}
                  >
                    Aa
                  </span>
                  <span className={cn("text-[14px]", on ? "font-semibold text-paper" : "text-paper/80")}>{sys.label}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="mt-12">
          <legend className="text-[15px] font-medium text-paper/80">Size</legend>
          <div className="mt-4 flex flex-wrap gap-2.5">
            {FORMAT_IDS.map((f) => {
              const p = FORMAT_PRESETS[f];
              const on = format === f;
              const landscape = p.aspectRatio >= 1;
              return (
                <button
                  key={f}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setFormat(f)}
                  title={`${p.width} × ${p.height}`}
                  className={cn(
                    "press flex h-11 items-center gap-2 rounded-[var(--radius)] px-3 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-paper",
                    on ? "bg-paper font-semibold text-ink" : "bg-white/[0.08] text-paper hover:bg-white/[0.14]"
                  )}
                >
                  <span aria-hidden="true" className="flex size-5 items-center justify-center">
                    <span
                      className="block rounded-[2px] border-[1.5px] border-current"
                      style={{
                        width: landscape ? "100%" : `${p.aspectRatio * 100}%`,
                        height: landscape ? `${Math.max(100 / p.aspectRatio, 22)}%` : "100%",
                      }}
                    />
                  </span>
                  {p.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <span aria-hidden="true" className="t-display absolute bottom-10 left-5 text-paper lg:left-[8%]">
          Pick a
        </span>
      </div>

      {/* Preview */}
      <div className="relative flex flex-col bg-white px-5 pb-40 pt-16 lg:min-h-[92svh] lg:px-[8%] lg:pt-28">
        <div
          data-ui
          aria-live="polite"
          className="flex h-[min(56vh,520px)] w-full items-center justify-center rounded-[var(--radius)] bg-surface p-6 [background-image:radial-gradient(var(--border)_1px,transparent_1px)] [background-size:16px_16px]"
        >
          <div className="flex size-full items-center justify-center drop-shadow-[0_18px_30px_rgb(6_82_92/0.18)]">
            <ScaledRenderer config={exampleConfig(style, LINES[line], format)} />
          </div>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <p className="text-[16px] text-muted-foreground">
            <span className="font-semibold text-foreground">{DESIGN_STYLES[style].label}</span>, {preset.label.toLowerCase()} ·{" "}
            <span className="tabular-nums">
              {preset.width} × {preset.height}
            </span>
          </p>
          <Link
            href="/signup"
            className="press inline-flex h-11 items-center rounded-[var(--radius)] bg-ink px-4 text-[16px] font-medium text-paper outline-none hover:bg-ink-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Make your own
          </Link>
        </div>
        <span aria-hidden="true" className="t-display absolute bottom-10 right-5 lg:right-[8%]">
          design
        </span>
      </div>
    </section>
  );
}
