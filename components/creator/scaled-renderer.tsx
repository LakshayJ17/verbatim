"use client";

import { useEffect, useRef, useState } from "react";
import { Renderer } from "./renderer";
import { FORMAT_PRESETS } from "@/utils/design/presets";
import type { DesignConfig } from "@/utils/design/types";

/**
 * Renders a design at its real export size and scales it down to fit the
 * box it sits in, so type and padding keep their true proportions.
 */
export function ScaledRenderer({
  config,
  canvasId = null,
  className,
}: {
  config: DesignConfig;
  canvasId?: string | null;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const preset = FORMAT_PRESETS[config.format];

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => {
      const { width, height } = el.getBoundingClientRect();
      setScale(Math.min(width / preset.width, height / preset.height));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [preset.width, preset.height]);

  return (
    <div ref={box} className={`relative flex size-full items-center justify-center overflow-hidden ${className ?? ""}`}>
      <div
        style={{
          width: preset.width * scale,
          height: preset.height * scale,
          visibility: scale ? "visible" : "hidden",
        }}
      >
        <div style={{ width: preset.width, height: preset.height, transform: `scale(${scale})`, transformOrigin: "top left" }}>
          {/* Mounted once the scale is known: the renderer measures its text on mount. */}
          {scale > 0 && <Renderer config={config} isExporting canvasId={canvasId} />}
        </div>
      </div>
    </div>
  );
}
