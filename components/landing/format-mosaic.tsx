import { ScaledRenderer } from "@/components/creator/scaled-renderer";
import { FORMAT_PRESETS, type FormatPresetId } from "@/utils/design/presets";
import { DESIGN_STYLES, type StyleId } from "@/utils/design/styles";
import { exampleConfig, SHOWCASE_LINES } from "./example-config";

/*
 * Every size, packed into one rectangle 100 units wide and ~70.97 tall.
 * Each cell has the exact aspect ratio of its format, so the cards tile
 * with no letterboxing:
 *   top row      X header (3:1) + LinkedIn header (4:1), height 14.29
 *   left column  Story (9:16), height 56.68
 *   middle row   Square + Portrait (4:5) + Landscape (1.91:1), height 18.36
 *   bottom       YouTube banner (16:9), height 38.31
 */
const H = 70.97;
const CELLS: { format: FormatPresetId; style: StyleId; line: number; x: number; y: number; w: number; h: number }[] = [
  { format: "x_header", style: "professional", line: 2, x: 0, y: 0, w: 42.86, h: 14.29 },
  { format: "linkedin_header", style: "minimal", line: 3, x: 42.86, y: 0, w: 57.14, h: 14.29 },
  { format: "story", style: "funky", line: 1, x: 0, y: 14.29, w: 31.88, h: 56.68 },
  { format: "square", style: "cinematic", line: 2, x: 31.88, y: 14.29, w: 18.36, h: 18.36 },
  { format: "portrait", style: "old_school", line: 0, x: 50.24, y: 14.29, w: 14.69, h: 18.36 },
  { format: "landscape", style: "minimal", line: 0, x: 64.93, y: 14.29, w: 35.07, h: 18.36 },
  { format: "youtube_banner", style: "old_school", line: 3, x: 31.88, y: 32.65, w: 68.12, h: 38.31 },
];

function Label({ format, style }: { format: FormatPresetId; style: StyleId }) {
  const p = FORMAT_PRESETS[format];
  return (
    <span className="pointer-events-none absolute bottom-2 left-2 rounded-[var(--radius)] bg-paper/95 px-2 py-0.5 text-[13px] leading-5 text-ink">
      {p.label} <span className="tabular-nums text-ink-soft">{p.width}×{p.height}</span>
      <span className="sr-only">, {DESIGN_STYLES[style].label} design</span>
    </span>
  );
}

export function FormatMosaic() {
  return (
    <>
      {/* Desktop and tablet: one packed rectangle */}
      <div className="relative hidden w-full sm:block" style={{ aspectRatio: `100 / ${H}` }} role="list" aria-label="Every size and design">
        {CELLS.map((c) => (
          <div
            key={c.format}
            role="listitem"
            data-reveal
            className="absolute p-1.5"
            style={{ left: `${c.x}%`, top: `${(c.y / H) * 100}%`, width: `${c.w}%`, height: `${(c.h / H) * 100}%` }}
          >
            <div data-ui className="relative size-full overflow-hidden rounded-[var(--radius)]">
              <ScaledRenderer config={exampleConfig(c.style, SHOWCASE_LINES[c.line], c.format)} />
              <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[var(--radius)] ring-1 ring-inset ring-border" />
              <Label format={c.format} style={c.style} />
            </div>
          </div>
        ))}
      </div>

      {/* Phone: the same cards, two to a row */}
      <ul className="grid grid-cols-2 gap-x-3 gap-y-6 sm:hidden" aria-label="Every size and design">
        {CELLS.map((c) => {
          const p = FORMAT_PRESETS[c.format];
          return (
            <li key={c.format} className={p.aspectRatio > 1.5 ? "col-span-2" : undefined}>
              <div data-ui className="relative overflow-hidden rounded-[var(--radius)]" style={{ aspectRatio: `${p.width} / ${p.height}` }}>
                <ScaledRenderer config={exampleConfig(c.style, SHOWCASE_LINES[c.line], c.format)} />
                <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[var(--radius)] ring-1 ring-inset ring-border" />
              </div>
              <p className="mt-1.5 text-[14px]">
                {p.label} <span className="tabular-nums text-ink-soft">{p.width}×{p.height}</span>
              </p>
            </li>
          );
        })}
      </ul>
    </>
  );
}
