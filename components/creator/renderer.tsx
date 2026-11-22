"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { DesignConfig } from "@/utils/design/types";
import { FORMAT_PRESETS } from "@/utils/design/presets";
import { DESIGN_STYLES } from "@/utils/design/styles";
import { computeLayout } from "@/utils/design/layout";
import { cn } from "@/lib/utils";

interface RendererProps {
  config: DesignConfig;
  className?: string;
  isExporting?: boolean;
  /** DOM id the PNG export looks up. Pass null for decorative previews. */
  canvasId?: string | null;
}

/**
 * Text of up to this many lines gets evenly balanced lines. Browsers stop
 * balancing past about six lines, so longer text uses "pretty" wrapping,
 * which at least keeps a lone word off the last line.
 */
const BALANCE_MAX_LINES = 5;

export function Renderer({ config, className, isExporting = false, canvasId = "render-canvas" }: RendererProps) {
  const preset = FORMAT_PRESETS[config.format];
  const styleSys = DESIGN_STYLES[config.style];
  // Padding, safe areas and a font size that fits this text: see utils/design/layout.ts.
  const layout = computeLayout(config);
  const { padding } = layout;
  const align = config.typography.alignment;
  const text = config.content.text.trim();
  const showMarks = config.content.type === "quote" && styleSys.composition.showQuoteMarks;
  // On left-aligned text the opening mark hangs in the margin, so the first
  // line starts on the same edge as the others.
  const hangMark = showMarks && align === "left";

  // The text block is as wide as its longest line and always centred on the
  // image; lines inside it follow the style's alignment. Without this a short
  // left-aligned quote hugged one side of a wide column and looked unplaced.
  // The longest line is measured after layout (fonts differ per device), so
  // the first layout pass uses the full column width.
  const rootRef = useRef<HTMLDivElement>(null);
  const [fontEpoch, setFontEpoch] = useState(0);
  const [fitted, setFitted] = useState<{ key: string; width: number } | null>(null);
  const fitKey = [
    text,
    config.content.type,
    config.content.speakerName ?? "",
    config.showAttribution,
    layout.fontSize,
    layout.labelSize,
    layout.attributionSize,
    layout.textWidth,
    config.typography.quoteFont,
    config.typography.sourceFont,
    config.typography.weight,
    showMarks,
    fontEpoch,
  ].join("\u0000");
  const columnWidth = fitted?.key === fitKey ? fitted.width : layout.textWidth;

  useEffect(() => {
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    if (!fonts) return;
    const remeasure = () => setFontEpoch((n) => n + 1);
    fonts.addEventListener("loadingdone", remeasure);
    return () => fonts.removeEventListener("loadingdone", remeasure);
  }, []);

  // Measures once per text, type size or font change. The canvas must be laid
  // out at a real size by then; ScaledRenderer mounts it only after it knows
  // its scale.
  useLayoutEffect(() => {
    if (fitted?.key === fitKey) return;
    const root = rootRef.current;
    if (!root || !root.offsetWidth) return;
    const scale = root.getBoundingClientRect().width / root.offsetWidth;
    if (!(scale > 0)) return;
    // A line can come back as several boxes (the closing quote mark is its
    // own span), so boxes are grouped into lines by their vertical position.
    let widest = 0;
    for (const el of root.querySelectorAll<HTMLElement>("[data-measure]")) {
      const lines = new Map<number, { left: number; right: number }>();
      for (const box of el.getClientRects()) {
        if (!box.width) continue;
        const key = Math.round(box.top / scale / 4);
        const line = lines.get(key);
        lines.set(key, line ? { left: Math.min(line.left, box.left), right: Math.max(line.right, box.right) } : { left: box.left, right: box.right });
      }
      for (const line of lines.values()) widest = Math.max(widest, line.right - line.left);
    }
    if (widest <= 0) return;
    const width = Math.min(layout.textWidth, Math.ceil(widest / scale) + 2);
    setFitted({ key: fitKey, width });
  }, [fitKey, fitted?.key, layout.textWidth]);

  // Background rules
  const bgType = styleSys.composition.backgroundRules?.type || "solid";
  const bgStyle: React.CSSProperties = {
    backgroundColor: config.palette.background,
    color: config.palette.text,
  };

  if (bgType === "vignette") {
    bgStyle.backgroundImage = `radial-gradient(circle at center, ${config.palette.background} 0%, #000000 100%)`; // taste-skill-ignore: part of the exported image, not the app UI
  } else if (bgType === "gradient") {
    bgStyle.backgroundImage = `linear-gradient(135deg, ${config.palette.background} 0%, ${config.palette.muted} 100%)`; // taste-skill-ignore: part of the exported image, not the app UI
  }

  // Determine borders
  const borders = styleSys.composition.borderRules;
  const borderStyles: React.CSSProperties = borders ? {
    border: `${borders.width}px solid ${borders.color}`,
    borderRadius: `${borders.radius}px`,
  } : {};

  // For export, we must enforce exact pixel dimensions.
  // For preview, it uses `width: 100%, height: 100%` of its container,
  // but internally uses `preset.width` / `preset.height` for relative scaling using aspect-ratio.
  const containerStyle: React.CSSProperties = {
    width: isExporting ? preset.width : "100%",
    height: isExporting ? preset.height : "100%",
    aspectRatio: `${preset.width} / ${preset.height}`,
    position: "relative",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    padding: `${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px`,
    fontFamily: config.typography.quoteFont,
    textAlign: align,
    overflow: "hidden",
    boxSizing: "border-box",
    ...bgStyle,
    ...borderStyles,
  };

  // Every part of the block shares one width and one centre line.
  const column: React.CSSProperties = { width: `${columnWidth}px`, maxWidth: "100%", marginLeft: "auto", marginRight: "auto" };

  // Add noise if required
  const showNoise = bgType === "noise";

  return (
    <div
      ref={rootRef}
      className={cn("renderer-canvas", className)}
      style={containerStyle}
      id={canvasId ?? undefined}
    >
      {showNoise && (
        <div
          className="pointer-events-none absolute inset-0 opacity-10"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
          }}
        />
      )}

      {/* Optional Safe Area Display (not in export) */}
      {!isExporting && preset.safeArea && (
        <div
          className="pointer-events-none absolute border border-dashed border-red-500/30 bg-red-500/5 z-50 transition-opacity"
          style={{
            top: preset.safeArea.top,
            bottom: preset.safeArea.bottom,
            left: preset.safeArea.left,
            right: preset.safeArea.right,
          }}
          title={preset.safeArea.description}
        />
      )}

      <div className="z-10 flex h-full flex-col justify-center" data-design-content>
        {/* Insight Header */}
        {config.content.type === "insight" && (
          <div
            style={{
              ...column,
              color: config.palette.accent,
              fontSize: `${layout.labelSize}px`,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              paddingBottom: `${layout.fontSize * 0.5}px`,
            }}
          >
            <span data-measure>Verbatim Insight</span>
          </div>
        )}

        {/* Content */}
        <div
          style={{
            ...column,
            position: "relative",
            fontSize: `${layout.fontSize}px`,
            fontWeight: config.typography.weight,
            lineHeight: layout.lineHeight,
            // Rough line count (half an em per character); erring high only means "pretty".
            textWrap: Math.ceil((text.length * 0.5 * layout.fontSize) / layout.textWidth) <= BALANCE_MAX_LINES ? "balance" : "pretty",
            overflowWrap: "break-word",
          }}
        >
          {hangMark && (
            <span style={{ position: "absolute", transform: "translateX(-100%)", color: config.palette.accent }}>{"“"}</span>
          )}
          <span data-measure>
            {showMarks && !hangMark && <span style={{ color: config.palette.accent }}>{"“"}</span>}
            {text}
            {showMarks && <span style={{ color: config.palette.accent }}>{"”"}</span>}
          </span>
        </div>

        {/* Attribution */}
        {config.showAttribution && (
          <div
            style={{
              ...column,
              marginTop: `${Math.round(layout.fontSize * 0.8)}px`,
              fontSize: `${layout.attributionSize}px`,
              lineHeight: 1.35,
              fontFamily: config.typography.sourceFont,
              color: config.palette.muted,
              display: "flex",
              flexDirection: "column",
              gap: `${layout.attributionSize * 0.25}px`,
            }}
          >
            {config.content.speakerName && (
              <span style={{ fontWeight: 600, color: config.palette.text }}>
                <span data-measure>{config.content.speakerName}</span>
              </span>
            )}
            {config.showSource && config.content.sourceTitle && (
              <span
                style={{
                  opacity: 0.8,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {config.content.sourceTitle}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
