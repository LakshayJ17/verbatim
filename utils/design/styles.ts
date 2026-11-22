/* eslint-disable @typescript-eslint/no-explicit-any */
export type StyleId =
  | "minimal"
  | "professional"
  | "funky"
  | "old_school"
  | "cinematic";

export interface DesignPalette {
  background: string;
  text: string;
  accent: string;
  muted: string;
}

export interface DesignTypography {
  quoteFont: string;
  sourceFont: string;
  weight: number | string;
  alignment: "left" | "center" | "right";
}

export interface DesignComposition {
  /** Multiplies the base padding (12% of the visible short side): above 1 is airier. */
  paddingScale: number;
  showQuoteMarks: boolean;
  borderRules?: {
    width: number;
    color: string;
    radius: number;
  };
  backgroundRules?: {
    type: "solid" | "gradient" | "noise" | "vignette";
    params?: any;
  };
}

export interface DesignStyle {
  id: StyleId;
  label: string;
  description: string;
  defaultPalette: DesignPalette;
  defaultTypography: DesignTypography;
  composition: DesignComposition;
}

export const DESIGN_STYLES: Record<StyleId, DesignStyle> = {
  minimal: {
    id: "minimal",
    label: "Minimal",
    description: "Generous whitespace, typography-first, restrained.",
    defaultPalette: {
      background: "#ffffff",
      text: "#111111",
      accent: "#666666",
      muted: "#999999",
    },
    defaultTypography: {
      quoteFont: "system-ui, -apple-system, sans-serif",
      sourceFont: "system-ui, -apple-system, sans-serif",
      weight: 400,
      alignment: "center",
    },
    composition: {
      paddingScale: 1.15,
      showQuoteMarks: false,
      backgroundRules: { type: "solid" }
    },
  },
  professional: {
    id: "professional",
    label: "Professional",
    description: "Polished editorial appearance with structured grid.",
    defaultPalette: {
      background: "#0f172a", // slate-900
      text: "#f8fafc",
      accent: "#3b82f6", // blue-500
      muted: "#94a3b8",
    },
    defaultTypography: {
      quoteFont: "Inter, system-ui, sans-serif",
      sourceFont: "Inter, system-ui, sans-serif",
      weight: 600,
      alignment: "left",
    },
    composition: {
      paddingScale: 1,
      showQuoteMarks: true,
      borderRules: {
        width: 0,
        color: "transparent",
        radius: 0,
      },
      backgroundRules: { type: "solid" }
    },
  },
  funky: {
    id: "funky",
    label: "Funky",
    description: "Expressive, bold accent colors, playful but intentional.",
    defaultPalette: {
      background: "#fdfbd4", // light yellow
      text: "#000000",
      accent: "#ff3e00",
      muted: "#444444",
    },
    defaultTypography: {
      quoteFont: "Space Grotesk, system-ui, sans-serif",
      sourceFont: "Space Grotesk, system-ui, sans-serif",
      weight: 700,
      alignment: "left",
    },
    composition: {
      paddingScale: 0.85,
      showQuoteMarks: true,
      borderRules: {
        width: 8,
        color: "#000000",
        radius: 24,
      },
      backgroundRules: { type: "solid" }
    },
  },
  old_school: {
    id: "old_school",
    label: "Old School",
    description: "Print/editorial inspiration, serif typography, classic composition.",
    defaultPalette: {
      background: "#f4f1ea", // paper
      text: "#222222",
      accent: "#8b0000", // dark red
      muted: "#666666",
    },
    defaultTypography: {
      quoteFont: "Georgia, serif",
      sourceFont: "system-ui, sans-serif",
      weight: 400,
      alignment: "center",
    },
    composition: {
      paddingScale: 1.05,
      showQuoteMarks: false,
      borderRules: {
        width: 1,
        color: "#cccccc",
        radius: 0,
      },
      backgroundRules: { type: "noise" }
    },
  },
  cinematic: {
    id: "cinematic",
    label: "Cinematic",
    description: "Dramatic typography, strong contrast, depth.",
    defaultPalette: {
      background: "#000000",
      text: "#ffffff",
      accent: "#ffffff",
      muted: "#888888",
    },
    defaultTypography: {
      quoteFont: "Didot, Bodoni MT, serif",
      sourceFont: "system-ui, sans-serif",
      weight: 400,
      alignment: "center",
    },
    composition: {
      paddingScale: 1.25,
      showQuoteMarks: false,
      backgroundRules: { type: "vignette" }
    },
  },
};
