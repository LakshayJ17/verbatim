"use client";

import { toast } from "@/components/ui/toast";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { ScaledRenderer } from "@/components/creator/scaled-renderer";
import { DesignConfig, ContentType } from "@/utils/design/types";
import { FORMAT_PRESETS, FormatPresetId } from "@/utils/design/presets";
import { DESIGN_STYLES, StyleId } from "@/utils/design/styles";
import { exportDesignToPng } from "@/utils/design/export";
import { trackClientEvent } from "@/app/actions/track";
import { publishSavedDesign } from "@/utils/design/publish-client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, DownloadSimple as Download, FloppyDisk as Save, Layout, Palette, GearSix as Settings, CircleNotch as Loader2, PaperPlaneRight as Send } from "@phosphor-icons/react/dist/ssr";
import { saveDesign } from "@/app/actions/design";
import { cn } from "@/lib/utils";

interface CreatorClientProps {
  initialContent: {
    type: ContentType;
    text: string;
    sourceTitle: string;
    speakerName?: string;
    id: string;
  };
  /** Validated style id from the ?style= search param. */
  initialStyle?: StyleId;
  /** Validated size id from the ?format= search param. */
  initialFormat?: FormatPresetId;
  /** Why this content can't be posted publicly, or null when it can. */
  publishBlockedReason?: string | null;
}

export function CreatorClient({ initialContent, initialStyle, initialFormat, publishBlockedReason = null }: CreatorClientProps) {
  const router = useRouter();
  
  const [config, setConfig] = useState<DesignConfig>(() => {
    const style: StyleId = initialStyle && DESIGN_STYLES[initialStyle] ? initialStyle : "minimal";
    const format: FormatPresetId = initialFormat && FORMAT_PRESETS[initialFormat] ? initialFormat : "square";
    return {
    format,
    style,
    palette: DESIGN_STYLES[style].defaultPalette,
    typography: DESIGN_STYLES[style].defaultTypography,
    content: {
      type: initialContent.type,
      text: initialContent.text,
      sourceTitle: initialContent.sourceTitle,
      speakerName: initialContent.speakerName,
    },
    showAttribution: true,
    showSource: true,
    rendererVersion: 1,
    };
  });

  const [activeTab, setActiveTab] = useState<"format" | "style" | "customize">("style");
  const [previewMode, setPreviewMode] = useState<"canvas" | "phone" | "laptop">("canvas");
  const [isExporting, setIsExporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [savedDesignId, setSavedDesignId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Instantly updates style
  const handleStyleChange = (styleId: StyleId) => {
    const styleSys = DESIGN_STYLES[styleId];
    setConfig(prev => ({
      ...prev,
      style: styleId,
      palette: styleSys.defaultPalette,
      typography: styleSys.defaultTypography,
    }));
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const preset = FORMAT_PRESETS[config.format];
      const dataUrl = await exportDesignToPng("render-canvas", preset.width, preset.height);
      
      // Trigger download
      const link = document.createElement("a");
      link.download = `verbatim-${initialContent.type}-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
      void trackClientEvent("image_downloaded", {
        kind: initialContent.type,
        style: config.style,
        format: config.format,
        surface: "creator",
      }).catch(() => {});
    } catch (e) {
      console.error(e);
      toast("Failed to export image. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const result = await saveDesign({
        quote_id: initialContent.type === "quote" ? initialContent.id : undefined,
        insight_id: initialContent.type === "insight" ? initialContent.id : undefined,
        configuration: config,
      });
      if (result.error || !result.id) {
        toast(result.error ?? "Could not save the design.");
        return;
      }
      setSavedDesignId(result.id);
      toast(publishBlockedReason ? "Design saved." : "Design saved. You can publish it now.");
    } catch (e) {
      console.error(e);
      toast("Could not save the design. Try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!savedDesignId) return;
    if (publishBlockedReason) {
      toast(publishBlockedReason);
      return;
    }
    setIsPublishing(true);
    try {
      toast("Preparing your image...");
      await publishSavedDesign({ designId: savedDesignId, canvasId: "render-canvas", config, visibility: "public" });
      toast("Posted to Commonplace.");
      router.push("/discover");
    } catch (e: unknown) {
      console.error(e);
      toast(e instanceof Error ? e.message : "Failed to publish");
    } finally {
      setIsPublishing(false);
    }
  };

  const tabClass = (active: boolean) =>
    cn(
      "flex h-11 flex-1 items-center justify-center gap-2 rounded-md text-base font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
      active ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground"
    );
  const optionClass = (active: boolean) =>
    cn(
      "w-full rounded-md border-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
      active ? "border-foreground" : "border-transparent hover:border-input"
    );

  return (
    <div className="flex min-h-dvh flex-col bg-background md:h-dvh md:flex-row">
      {/* Preview */}
      <div className="relative flex min-h-[60svh] flex-1 items-center justify-center overflow-hidden bg-muted p-4 md:min-h-0">
        <div ref={containerRef} className="flex size-full items-center justify-center p-4 pb-20 md:p-10 md:pb-24">
          {previewMode === "canvas" && <ScaledRenderer config={config} canvasId="render-canvas" />}
          {previewMode === "phone" && (
            <div className="flex h-full max-h-[800px] items-center justify-center overflow-hidden rounded-[2.5rem] border-[12px] border-ink bg-ink" style={{ aspectRatio: "9/19.5" }}>
              <ScaledRenderer config={config} canvasId="render-canvas" />
            </div>
          )}
          {previewMode === "laptop" && (
            <div className="flex w-full max-w-[1000px] flex-col overflow-hidden rounded-md border-[10px] border-ink bg-ink" style={{ aspectRatio: "16/10" }}>
              <div className="flex-1 bg-black">
                <ScaledRenderer config={config} canvasId="render-canvas" />
              </div>
            </div>
          )}
        </div>

        {/* Preview context */}
        <div role="radiogroup" aria-label="Preview" className="absolute bottom-5 left-1/2 z-40 flex -translate-x-1/2 gap-1 rounded-md bg-background p-1">
          {(["canvas", "phone", "laptop"] as const).map((mode) => (
            <button
              key={mode}
              role="radio"
              aria-checked={previewMode === mode}
              onClick={() => setPreviewMode(mode)}
              className={cn(
                "h-10 rounded-md px-4 text-base font-medium capitalize outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                previewMode === mode ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {mode}
            </button>
          ))}
        </div>

        {isExporting && (
          <div role="status" className="absolute inset-0 z-50 flex items-center justify-center bg-background/70">
            <div className="flex items-center gap-3 rounded-md bg-background p-4 text-base shadow-[0_12px_40px_rgb(6_82_92/0.18)]">
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
              <span className="font-medium">Preparing a full-size image...</span>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex w-full flex-col bg-background md:h-full md:w-96 md:overflow-y-auto">
        <div className="flex items-center justify-between gap-2 p-4">
          <Button variant="ghost" onClick={() => router.back()} className="gap-1.5">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back
          </Button>
          <div className="flex gap-2">
            {!savedDesignId ? (
              <Button variant="outline" onClick={handleSave} disabled={isSaving || isExporting} className="gap-1.5">
                {isSaving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
                Save
              </Button>
            ) : (
              <Button onClick={handlePublish} disabled={isPublishing} className="gap-1.5">
                {isPublishing ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
                Publish
              </Button>
            )}
            <Button variant={savedDesignId ? "outline" : "default"} onClick={handleExport} disabled={isExporting} className="gap-1.5">
              <Download className="size-4" aria-hidden="true" />
              Download
            </Button>
          </div>
        </div>

        <div role="tablist" aria-label="Design options" className="mx-4 flex gap-1 rounded-md bg-muted p-1">
          <button role="tab" aria-selected={activeTab === "format"} onClick={() => setActiveTab("format")} className={tabClass(activeTab === "format")}>
            <Layout className="size-4" aria-hidden="true" />
            Size
          </button>
          <button role="tab" aria-selected={activeTab === "style"} onClick={() => setActiveTab("style")} className={tabClass(activeTab === "style")}>
            <Palette className="size-4" aria-hidden="true" />
            Style
          </button>
          <button role="tab" aria-selected={activeTab === "customize"} onClick={() => setActiveTab("customize")} className={tabClass(activeTab === "customize")}>
            <Settings className="size-4" aria-hidden="true" />
            Details
          </button>
        </div>

        <div className="flex-1 space-y-6 p-4">
          {activeTab === "format" && (
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(FORMAT_PRESETS) as FormatPresetId[]).map((key) => {
                const preset = FORMAT_PRESETS[key];
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={config.format === key}
                    onClick={() => setConfig((prev) => ({ ...prev, format: key }))}
                    className={cn(optionClass(config.format === key), "bg-muted p-3")}
                  >
                    <span className="block text-base font-medium">{preset.label}</span>
                    <span className="mt-0.5 block text-sm tabular-nums text-muted-foreground">
                      {preset.width} x {preset.height}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {activeTab === "style" && (
            <div className="grid gap-2">
              {(Object.keys(DESIGN_STYLES) as StyleId[]).map((key) => {
                const styleSys = DESIGN_STYLES[key];
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={config.style === key}
                    onClick={() => handleStyleChange(key)}
                    className={cn(optionClass(config.style === key), "flex items-center justify-between p-4")}
                    style={{ backgroundColor: styleSys.defaultPalette.background, color: styleSys.defaultPalette.text }}
                  >
                    <span className="text-lg font-medium" style={{ fontFamily: styleSys.defaultTypography.quoteFont }}>
                      {styleSys.label}
                    </span>
                    <span className="flex gap-1" aria-hidden="true">
                      {[styleSys.defaultPalette.background, styleSys.defaultPalette.text, styleSys.defaultPalette.accent].map((c, i) => (
                        <span key={i} className="size-4 rounded-sm" style={{ backgroundColor: c, boxShadow: "inset 0 0 0 1px rgb(0 0 0 / 0.15)" }} />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {activeTab === "customize" && (
            <div className="space-y-6">
              <p className="rounded-md bg-muted p-4 text-base">
                You are designing {initialContent.type === "quote" ? "a quote" : "a key insight"} from{" "}
                <span className="font-medium">{initialContent.sourceTitle}</span>.
              </p>

              <fieldset className="space-y-3">
                <legend className="text-lg font-semibold">Attribution</legend>
                <label className="flex cursor-pointer items-center gap-3 text-base">
                  <input
                    type="checkbox"
                    className="size-5 accent-[var(--ink)]"
                    checked={config.showAttribution}
                    onChange={(e) => setConfig((prev) => ({ ...prev, showAttribution: e.target.checked }))}
                  />
                  Show the speaker
                </label>
                {config.showAttribution && (
                  <label className="ml-8 flex cursor-pointer items-center gap-3 text-base">
                    <input
                      type="checkbox"
                      className="size-5 accent-[var(--ink)]"
                      checked={config.showSource}
                      onChange={(e) => setConfig((prev) => ({ ...prev, showSource: e.target.checked }))}
                    />
                    Show the source title
                  </label>
                )}
              </fieldset>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
