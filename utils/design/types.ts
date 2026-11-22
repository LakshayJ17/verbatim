import { FormatPresetId } from "./presets";
import { StyleId, DesignPalette, DesignTypography } from "./styles";

export type ContentType = "quote" | "insight";

export interface DesignContent {
  type: ContentType;
  text: string;
  sourceTitle: string;
  speakerName?: string;
}

export interface DesignConfig {
  format: FormatPresetId;
  style: StyleId;
  palette: DesignPalette;
  typography: DesignTypography;
  content: DesignContent;
  showAttribution: boolean;
  showSource: boolean;
  rendererVersion: number;
}
