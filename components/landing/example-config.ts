import { DESIGN_STYLES, type StyleId } from "@/utils/design/styles";
import type { FormatPresetId } from "@/utils/design/presets";
import type { DesignConfig } from "@/utils/design/types";
import { EPISODE, QUOTES } from "./example-episode";

/** Lines from the example interview used across the landing previews. */
export const SHOWCASE_LINES = [
  QUOTES[0].text,
  QUOTES[1].text,
  "Simple is not the same as easy.",
  "Most of my training is meant to feel easy.",
];

/** A design config for the example interview, used by the landing page previews. */
export function exampleConfig(style: StyleId, text = QUOTES[0].text, format: FormatPresetId = "square"): DesignConfig {
  const s = DESIGN_STYLES[style];
  return {
    format,
    style,
    palette: s.defaultPalette,
    typography: s.defaultTypography,
    content: { type: "quote", text, speakerName: EPISODE.guest, sourceTitle: `${EPISODE.show} (example)` },
    showAttribution: true,
    showSource: false,
    rendererVersion: 1,
  };
}
