export type FormatPresetId =
  | "square"
  | "portrait"
  | "landscape"
  | "story"
  | "x_header"
  | "linkedin_header"
  | "youtube_banner";

export interface SafeArea {
  top: number;
  right: number;
  bottom: number;
  left: number;
  description: string;
}

export interface FormatPreset {
  id: FormatPresetId;
  label: string;
  width: number;
  height: number;
  aspectRatio: number;
  category: "post" | "story" | "header";
  safeArea?: SafeArea;
  description?: string;
}

export const FORMAT_PRESETS: Record<FormatPresetId, FormatPreset> = {
  square: {
    id: "square",
    label: "Square",
    width: 1080,
    height: 1080,
    aspectRatio: 1,
    category: "post",
    description: "Ideal for Instagram feed and standard social posts.",
  },
  portrait: {
    id: "portrait",
    label: "Portrait",
    width: 1080,
    height: 1350,
    aspectRatio: 1080 / 1350,
    category: "post",
    description: "Maximum vertical screen real estate for feeds.",
  },
  landscape: {
    id: "landscape",
    label: "Landscape",
    width: 1200,
    height: 627,
    aspectRatio: 1200 / 627,
    category: "post",
    description: "Standard wide format for X, LinkedIn, and OpenGraph.",
  },
  story: {
    id: "story",
    label: "Story / Reel",
    width: 1080,
    height: 1920,
    aspectRatio: 1080 / 1920,
    category: "story",
    safeArea: {
      top: 250, // Leave room for app UI
      bottom: 250, // Leave room for swipe UI
      left: 0,
      right: 0,
      description: "Keep important text within the center to avoid UI overlap.",
    },
    description: "Full vertical video format.",
  },
  x_header: {
    id: "x_header",
    label: "X Header",
    width: 1500,
    height: 500,
    aspectRatio: 1500 / 500,
    category: "header",
    safeArea: {
      top: 0,
      bottom: 80, // Avatar overlaps bottom left
      left: 100,
      right: 0,
      description: "Avoid bottom-left corner where profile picture appears.",
    },
  },
  linkedin_header: {
    id: "linkedin_header",
    label: "LinkedIn Header",
    width: 1584,
    height: 396,
    aspectRatio: 1584 / 396,
    category: "header",
    safeArea: {
      top: 0,
      bottom: 150, // Avatar overlaps bottom left heavily
      left: 200,
      right: 0,
      description: "Avoid bottom-left quadrant entirely.",
    },
  },
  youtube_banner: {
    id: "youtube_banner",
    label: "YouTube Banner",
    width: 2560,
    height: 1440,
    aspectRatio: 2560 / 1440,
    category: "header",
    safeArea: {
      // 1546 x 423 is the safe area in the center
      top: 508.5,
      bottom: 508.5,
      left: 507,
      right: 507,
      description: "Keep all text strictly within the center box for mobile visibility.",
    },
  },
};
