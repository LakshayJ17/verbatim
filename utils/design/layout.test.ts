import { describe, expect, it } from "vitest";
import { computeLayout, safeInsets } from "./layout";
import { FORMAT_PRESETS, type FormatPresetId } from "./presets";
import { DESIGN_STYLES, type StyleId } from "./styles";
import type { DesignConfig } from "./types";

function cfg(style: StyleId, format: FormatPresetId, text: string, type: "quote" | "insight" = "quote"): DesignConfig {
  const sys = DESIGN_STYLES[style];
  return {
    format,
    style,
    palette: sys.defaultPalette,
    typography: sys.defaultTypography,
    content: { type, text, sourceTitle: "A long conversation about work", speakerName: "Speaker" },
    showAttribution: true,
    showSource: true,
    rendererVersion: 1,
  };
}

const STYLES = Object.keys(DESIGN_STYLES) as StyleId[];
const FORMATS = Object.keys(FORMAT_PRESETS) as FormatPresetId[];
const SHORT = "Attention is the new currency.";
const LONG = "word ".repeat(120).trim(); // 599 characters, the longest quote the analysis keeps

describe("computeLayout", () => {
  it("pads every side by at least 10% of the visible short side", () => {
    for (const style of STYLES) {
      for (const format of FORMATS) {
        const { padding } = computeLayout(cfg(style, format, SHORT));
        const preset = FORMAT_PRESETS[format];
        const safe = safeInsets(preset);
        const shortSide = Math.min(preset.width - safe.left - safe.right, preset.height - safe.top - safe.bottom);
        for (const side of ["top", "right", "bottom", "left"] as const) {
          expect(padding[side] - safe[side], `${style}/${format}/${side}`).toBeGreaterThanOrEqual(Math.floor(shortSide * 0.1));
        }
      }
    }
  });

  it("gives a square post at least 100px of padding (was 48-100px)", () => {
    for (const style of STYLES) {
      const { padding } = computeLayout(cfg(style, "square", SHORT));
      expect(Math.min(padding.top, padding.left), style).toBeGreaterThanOrEqual(100);
    }
  });

  it("keeps text out of the story's top and bottom UI zones", () => {
    const { padding } = computeLayout(cfg("minimal", "story", SHORT));
    expect(padding.top).toBeGreaterThan(FORMAT_PRESETS.story.safeArea!.top);
    expect(padding.bottom).toBeGreaterThan(FORMAT_PRESETS.story.safeArea!.bottom);
  });

  it("keeps header text to the right of the profile photo", () => {
    expect(computeLayout(cfg("professional", "linkedin_header", SHORT)).padding.left).toBeGreaterThan(200);
    expect(computeLayout(cfg("professional", "x_header", SHORT)).padding.left).toBeGreaterThan(100);
  });

  it("pads left and right equally, so the text block sits on the image's centre line", () => {
    for (const style of STYLES) {
      for (const format of FORMATS) {
        for (const text of [SHORT, LONG]) {
          const { padding } = computeLayout(cfg(style, format, text));
          expect(padding.left, `${style}/${format}`).toBe(padding.right);
        }
      }
    }
  });

  it("shrinks long text instead of keeping the short-quote size", () => {
    for (const style of STYLES) {
      const short = computeLayout(cfg(style, "square", SHORT)).fontSize;
      const long = computeLayout(cfg(style, "square", LONG)).fontSize;
      expect(long, style).toBeLessThan(short * 0.6);
      expect(long, style).toBeGreaterThan(16);
    }
  });

  it("falls back to the full banner when a long idea can't fit YouTube's safe zone", () => {
    const idea = computeLayout(cfg("minimal", "youtube_banner", "idea ".repeat(140), "insight"));
    expect(idea.padding.top).toBeLessThan(FORMAT_PRESETS.youtube_banner.safeArea!.top);
    const quote = computeLayout(cfg("minimal", "youtube_banner", SHORT));
    expect(quote.padding.top).toBeGreaterThan(FORMAT_PRESETS.youtube_banner.safeArea!.top);
  });
});
