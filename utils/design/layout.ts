import type { DesignConfig } from "./types";
import { FORMAT_PRESETS, type FormatPreset } from "./presets";
import { DESIGN_STYLES } from "./styles";

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface DesignLayout {
  /** Space between the canvas edge and the text, platform safe areas included. */
  padding: Insets;
  /** Quote or idea text. */
  fontSize: number;
  /** The small label above an idea. */
  labelSize: number;
  /** Speaker and source lines. */
  attributionSize: number;
  /** Width of the text column. */
  textWidth: number;
  lineHeight: number;
}

export const QUOTE_LINE_HEIGHT = 1.3;
const ATTRIBUTION_LINE_HEIGHT = 1.35;
/** Fraction of the padded box the text may fill, leaving slack for the estimate. */
const FILL = 0.9;

/**
 * Areas the platform covers with its own interface. A bottom-left avatar
 * (X, LinkedIn headers) only needs the text kept clear of it sideways, and
 * the same inset goes on the right so the text block stays centred on the
 * image instead of drifting right. Full insets (story UI, YouTube's cropped
 * edges) apply on every side they name.
 */
export function safeInsets(preset: FormatPreset): Insets {
  const s = preset.safeArea;
  if (!s) return { top: 0, right: 0, bottom: 0, left: 0 };
  const avatarCorner = s.left > 0 && s.bottom > 0 && s.top === 0 && s.right === 0;
  return avatarCorner ? { top: 0, right: s.left, bottom: 0, left: s.left } : { top: s.top, right: s.right, bottom: s.bottom, left: s.left };
}

/**
 * Padding and type sizes for a design, in canvas pixels.
 *
 * Padding is proportional to the visible area, so every size keeps the same
 * breathing room, and each style scales it (Minimal and Cinematic airier,
 * Funky tighter inside its border). The font size is the largest that fits the
 * padded box for this text length, so long quotes shrink instead of being
 * clipped by the canvas.
 */
export function computeLayout(config: DesignConfig): DesignLayout {
  const preset = FORMAT_PRESETS[config.format];
  const safe = safeInsets(preset);
  const fitted = fitInBox(config, safe);
  // Text too long for the platform's safe zone at a readable size (say a
  // 700-character idea on a YouTube banner): use the whole canvas instead,
  // which desktop viewers see, rather than letting it spill.
  if (!fitted.readable && (safe.top || safe.right || safe.bottom || safe.left)) {
    return fitInBox(config, { top: 0, right: 0, bottom: 0, left: 0 }).layout;
  }
  return fitted.layout;
}

function fitInBox(config: DesignConfig, safe: Insets): { layout: DesignLayout; readable: boolean } {
  const preset = FORMAT_PRESETS[config.format];
  const style = DESIGN_STYLES[config.style];
  const scale = style.composition.paddingScale;
  const border = style.composition.borderRules?.width ?? 0;

  const visibleW = preset.width - safe.left - safe.right;
  const visibleH = preset.height - safe.top - safe.bottom;
  const padY = Math.round(Math.min(visibleW, visibleH) * 0.12 * scale);
  const padX = Math.round(Math.max(padY, visibleW * 0.09 * scale));
  const padding = {
    top: safe.top + padY,
    right: safe.right + padX,
    bottom: safe.bottom + padY,
    left: safe.left + padX,
  };

  const innerW = preset.width - padding.left - padding.right - 2 * border;
  const innerH = preset.height - padding.top - padding.bottom - 2 * border;
  // Very long lines are hard to read, so wide boxes get a narrower column.
  const textWidth = Math.round(innerW / innerH > 1.6 ? innerW * 0.78 : innerW);

  const minSide = Math.min(preset.width, preset.height);
  const weight = Number(config.typography.weight) || 400;
  const charEm = weight >= 600 ? 0.56 : 0.52; // average glyph width, in em
  const showMarks = config.content.type === "quote" && style.composition.showQuoteMarks;
  const chars = Math.max(1, config.content.text.trim().length + (showMarks ? 2 : 0));
  const hasSpeaker = Boolean(config.showAttribution && config.content.speakerName);
  const hasSource = Boolean(config.showAttribution && config.showSource && config.content.sourceTitle);

  const labelSize = (fs: number) => Math.max(fs * 0.4, minSide * 0.026);
  const attributionSize = (fs: number) => Math.min(fs * 0.6, Math.max(fs * 0.42, minSide * 0.03));

  const heightAt = (fs: number) => {
    // 8% slack per line for words that don't fill it.
    const lines = Math.ceil((chars * charEm * fs * 1.08) / textWidth);
    let h = lines * fs * QUOTE_LINE_HEIGHT;
    if (config.content.type === "insight") h += labelSize(fs) * 1.2 + fs * 0.5;
    if (hasSpeaker || hasSource) {
      const a = attributionSize(fs);
      h += fs * 0.8;
      if (hasSpeaker) h += a * ATTRIBUTION_LINE_HEIGHT;
      if (hasSource) {
        const sourceLines = Math.min(2, Math.ceil(((config.content.sourceTitle?.length ?? 0) * 0.52 * a) / textWidth));
        h += a * ATTRIBUTION_LINE_HEIGHT * sourceLines + a * 0.25;
      }
    }
    return h;
  };
  const fits = (fs: number) => heightAt(fs) <= innerH * FILL;

  // Largest size that fits, capped so a three-word quote doesn't become a poster.
  const readableMin = minSide * 0.018;
  let lo = minSide * 0.008;
  let hi = minSide * 0.085;
  if (fits(hi)) {
    lo = hi;
  } else {
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) lo = mid;
      else hi = mid;
    }
  }
  const fontSize = Math.floor(lo);

  return {
    readable: fontSize >= readableMin,
    layout: {
      padding,
      fontSize,
      labelSize: Math.round(labelSize(fontSize)),
      attributionSize: Math.round(attributionSize(fontSize)),
      textWidth,
      lineHeight: QUOTE_LINE_HEIGHT,
    },
  };
}
