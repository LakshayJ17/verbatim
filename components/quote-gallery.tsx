"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type RefObject } from "react";
import {
  CircleNotch,
  DownloadSimple,
  ShareNetwork,
  Globe,
  LinkSimple,
  SlidersHorizontal,
  ArrowSquareOut,
} from "@phosphor-icons/react/dist/ssr";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/skeleton";
import { QuoteStatus, type QuoteVerificationStatus } from "@/components/quote-status";
import { ScaledRenderer } from "@/components/creator/scaled-renderer";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { FORMAT_PRESETS, type FormatPresetId } from "@/utils/design/presets";
import { DESIGN_STYLES, type StyleId } from "@/utils/design/styles";
import type { ContentType, DesignConfig } from "@/utils/design/types";
import { publicPostBlockReason, selectBestQuotes, type VerificationStatus } from "@/utils/design/sharing";
import {
  downloadBlob,
  postUrl,
  renderDesignBlob,
  saveAndPublishDesign,
  type PublishVisibility,
} from "@/utils/design/publish-client";
import { trackClientEvent } from "@/app/actions/track";

export interface GalleryQuote {
  id: string;
  text: string;
  speaker_name?: string | null;
  verification_status?: VerificationStatus;
  confidence?: number | string | null;
}

export interface GalleryInsight {
  id: string;
  title?: string | null;
  summary?: string | null;
}

interface GalleryItem {
  kind: ContentType;
  id: string;
  text: string;
  label: string;
  speaker?: string;
  status?: VerificationStatus;
}

const STYLE_IDS = Object.keys(DESIGN_STYLES) as StyleId[];
const FORMAT_IDS = Object.keys(FORMAT_PRESETS) as FormatPresetId[];
const MAX_IDEAS = 6;
/** The one design the action bar downloads, shares and posts. */
const CANVAS_ID = "gallery-canvas";

const SIZE_LABELS: Record<FormatPresetId, string> = {
  square: "Square",
  portrait: "Portrait",
  landscape: "Landscape",
  story: "Story",
  x_header: "X header",
  linkedin_header: "LinkedIn",
  youtube_banner: "YouTube",
};

/** A small outline in the size's proportions, so the options read at a glance. */
function SizeGlyph({ id }: { id: FormatPresetId }) {
  const { width, height } = FORMAT_PRESETS[id];
  const max = 22;
  const w = width >= height ? max : Math.max(7, Math.round((max * width) / height));
  const h = height >= width ? max : Math.max(6, Math.round((max * height) / width));
  return (
    <span aria-hidden="true" className="flex size-[22px] shrink-0 items-center justify-center">
      <span className="block rounded-[2px] border-[1.5px] border-current" style={{ width: w, height: h }} />
    </span>
  );
}

const noopSubscribe = () => () => {};

function buildConfig(item: GalleryItem, style: StyleId, format: FormatPresetId, sourceTitle: string): DesignConfig {
  const sys = DESIGN_STYLES[style];
  return {
    format,
    style,
    palette: sys.defaultPalette,
    typography: sys.defaultTypography,
    content: { type: item.kind, text: item.text, sourceTitle, speakerName: item.speaker },
    showAttribution: true,
    showSource: true,
    rendererVersion: 1,
  };
}

function shorten(text: string, max = 110) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 3).trimEnd()}...` : clean;
}

/** Arrow keys move a radio group's selection and focus, as native radios do. */
function rovingKeys<T extends string>(ids: readonly T[], current: T, pick: (id: T) => void, attr: string) {
  return (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = ids[(ids.indexOf(current) + step + ids.length) % ids.length];
    pick(next);
    e.currentTarget.querySelector<HTMLButtonElement>(`[${attr}="${next}"]`)?.focus();
  };
}

/**
 * Turns an analysis into finished images: pick a quote, a size and a style,
 * see it large, then download, share or post that one image.
 */
export function QuoteGallery({
  quotes,
  insights,
  sourceTitle,
}: {
  quotes?: GalleryQuote[] | null;
  insights?: GalleryInsight[] | null;
  sourceTitle: string;
}) {
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);

  const quoteItems = useMemo<GalleryItem[]>(
    () =>
      selectBestQuotes((quotes ?? []).filter((q) => q.text?.trim())).map((q) => ({
        kind: "quote",
        id: q.id,
        text: q.text,
        label: shorten(q.text),
        speaker: q.speaker_name || undefined,
        status: q.verification_status,
      })),
    [quotes]
  );
  const ideaItems = useMemo<GalleryItem[]>(
    () =>
      (insights ?? [])
        .filter((i) => i.summary?.trim())
        .slice(0, MAX_IDEAS)
        .map((i) => ({ kind: "insight", id: i.id, text: i.summary as string, label: i.title?.trim() || shorten(i.summary as string) })),
    [insights]
  );

  const [tab, setTab] = useState<ContentType>("quote");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [format, setFormat] = useState<FormatPresetId>("square");
  const [styleId, setStyleId] = useState<StyleId>(STYLE_IDS[0]);
  // Saved design ids per image and visibility, so posting twice reuses the same design and post.
  const designCache = useRef(new Map<string, string>());

  const items = tab === "quote" ? quoteItems : ideaItems;
  const selected = items.find((i) => i.id === selectedId) ?? items[0];
  const blockReason = selected?.kind === "quote" ? publicPostBlockReason(selected.status) : null;
  const preset = FORMAT_PRESETS[format];

  if (quoteItems.length === 0 && ideaItems.length === 0) {
    return (
      <section aria-labelledby="quote-gallery-title">
        <h2 id="quote-gallery-title" className="heading-display text-3xl">
          Your quote images
        </h2>
        <p className="mt-3 max-w-[60ch] text-base text-muted-foreground">
          There are no quotes to turn into images yet. Quotes that could not be found in the transcript are left out.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="quote-gallery-title">
      <h2 id="quote-gallery-title" className="heading-display text-3xl">
        Your quote images
      </h2>
      <p className="mt-2 max-w-[60ch] text-base text-muted-foreground">
        Pick a quote, a size and a style, then download, share or post it.
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start lg:gap-10">
        {/* Quote picker. On phones the quotes scroll sideways so the preview
            stays near the top of the page; from lg they stack in a sticky column. */}
        <div className="min-w-0 space-y-4 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto lg:pb-2">
          {ideaItems.length > 0 && (
            <div role="tablist" aria-label="Content" className="grid grid-cols-2 gap-1 rounded-[var(--radius)] bg-muted p-1">
              {(["quote", "insight"] as const).map((key) => {
                const count = key === "quote" ? quoteItems.length : ideaItems.length;
                return (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={tab === key}
                    onClick={() => {
                      setTab(key);
                      setSelectedId(null);
                    }}
                    className={cn(
                      "flex h-10 items-center justify-center gap-2 rounded-[calc(var(--radius)-1px)] px-3 text-base font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                      tab === key ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {key === "quote" ? "Quotes" : "Ideas"}
                    <span className="text-sm tabular-nums text-muted-foreground">{count}</span>
                  </button>
                );
              })}
            </div>
          )}

          {items.length === 0 ? (
            <p className="text-base text-muted-foreground">
              There are no quotes to turn into images. Quotes that could not be found in the transcript are left out.
            </p>
          ) : (
            <fieldset className="min-w-0">
              <legend className="mb-2 text-sm font-medium text-muted-foreground">
                {tab === "quote" ? "Best quotes" : "Ideas"}
              </legend>
              <ul className="no-scrollbar -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-2 overflow-x-auto px-4 sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:mx-0 lg:grid lg:snap-none lg:overflow-visible lg:px-0">
                {items.map((item) => {
                  const active = item.id === selected?.id;
                  const plainStatus = item.status === "rejected" || item.status === "source_derived";
                  return (
                    <li key={item.id} className="w-[82%] shrink-0 snap-start sm:w-[45%] lg:w-auto">
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() => setSelectedId(item.id)}
                        className={cn(
                          "relative flex size-full flex-col justify-between gap-3 overflow-hidden rounded-[var(--radius)] py-3 pl-4 pr-3 text-left text-base text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                          active ? "bg-card font-medium" : "bg-muted hover:bg-surface-hover"
                        )}
                      >
                        {active && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-ink" />}
                        {/* The chosen quote is highlighted, like a line marked on a printed transcript. */}
                        <span className="min-w-0">
                          <span className={cn(active && "box-decoration-clone bg-mark px-0.5")}>
                            {item.kind === "quote" ? <>&ldquo;{item.label}&rdquo;</> : item.label}
                          </span>
                        </span>
                        {(item.speaker || (item.kind === "quote" && item.status)) && (
                          <span className="flex flex-wrap items-center justify-between gap-2 text-sm font-normal">
                            <span className="text-muted-foreground">{item.speaker}</span>
                            {item.kind === "quote" && item.status && (
                              <QuoteStatus
                                status={item.status as QuoteVerificationStatus}
                                className={plainStatus && !active ? "bg-card" : undefined}
                              />
                            )}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          )}
        </div>

        {items.length > 0 && (
          <div className="min-w-0 space-y-5">
            <div>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p id="quote-gallery-size" className="text-sm font-medium text-muted-foreground">
                  Size
                </p>
                <p className="text-sm tabular-nums text-muted-foreground">
                  {preset.label}, {preset.width} x {preset.height} px
                </p>
              </div>
              <div
                role="radiogroup"
                aria-labelledby="quote-gallery-size"
                onKeyDown={rovingKeys(FORMAT_IDS, format, setFormat, "data-size")}
                className="no-scrollbar flex gap-1 overflow-x-auto rounded-[var(--radius)] bg-muted p-1 sm:grid sm:grid-cols-7 sm:overflow-visible"
              >
                {FORMAT_IDS.map((id) => {
                  const on = id === format;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      tabIndex={on ? 0 : -1}
                      data-size={id}
                      onClick={() => setFormat(id)}
                      className={cn(
                        "flex h-16 w-[5.25rem] shrink-0 flex-col items-center justify-center gap-1.5 rounded-[calc(var(--radius)-1px)] px-1 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring sm:w-auto",
                        on ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <SizeGlyph id={id} />
                      {SIZE_LABELS[id]}
                    </button>
                  );
                })}
              </div>
            </div>

            {mounted && selected ? (
              <Studio
                item={selected}
                styleId={styleId}
                onStyle={setStyleId}
                format={format}
                sourceTitle={sourceTitle}
                blockReason={blockReason}
                designCache={designCache}
              />
            ) : (
              <div className="rounded-[var(--radius)] bg-muted p-4 sm:p-8">
                <div className="mx-auto w-full max-w-[34rem]" style={{ aspectRatio: `${preset.width} / ${preset.height}` }}>
                  <Skeleton className="size-full" />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

type BusyAction = "download" | "share" | PublishVisibility | null;

/** The large preview of the chosen design, the style strip and the one action bar. */
function Studio({
  item,
  styleId,
  onStyle,
  format,
  sourceTitle,
  blockReason,
  designCache,
}: {
  item: GalleryItem;
  styleId: StyleId;
  onStyle: (id: StyleId) => void;
  format: FormatPresetId;
  sourceTitle: string;
  blockReason: string | null;
  designCache: RefObject<Map<string, string>>;
}) {
  const [busy, setBusy] = useState<BusyAction>(null);
  // Links are keyed by the exact image they belong to, so changing quote, size or style hides stale links.
  const [links, setLinks] = useState<Record<string, string>>({});
  const style = DESIGN_STYLES[styleId];
  const preset = FORMAT_PRESETS[format];
  const config = useMemo(() => buildConfig(item, styleId, format, sourceTitle), [item, styleId, format, sourceTitle]);
  const imageKey = `${item.kind}:${item.id}:${styleId}:${format}`;
  const fileName = `verbatim-${item.kind}-${styleId}-${format}.png`;
  const publicLink = links[`${imageKey}:public`];
  const privateLink = links[`${imageKey}:unlisted`];
  const label = item.kind === "quote" ? "quote" : "idea";

  const run = async (action: Exclude<BusyAction, null>, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(action);
    try {
      await fn();
    } catch (e) {
      console.error(e);
      toast(e instanceof Error && e.message ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const handleDownload = () =>
    run("download", async () => {
      const blob = await renderDesignBlob(CANVAS_ID, config);
      downloadBlob(blob, fileName);
      void trackClientEvent("image_downloaded", { kind: item.kind, style: styleId, format, surface: "gallery" }).catch(() => {});
    });

  const handleShare = () =>
    run("share", async () => {
      const blob = await renderDesignBlob(CANVAS_ID, config);
      const file = new File([blob], fileName, { type: "image/png" });
      const canShareFiles = typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
      if (!canShareFiles || typeof navigator.share !== "function") {
        downloadBlob(blob, fileName);
        toast("Sharing isn't supported in this browser, so the image was downloaded instead.");
        return;
      }
      const text = item.kind === "quote" ? `“${item.text}”${item.speaker ? ` by ${item.speaker}` : ""}` : item.text;
      try {
        await navigator.share({
          files: [file],
          title: `${item.kind === "quote" ? "Quote" : "Idea"} from ${sourceTitle}`,
          text,
        });
        void trackClientEvent("image_shared", { kind: item.kind, style: styleId, format, surface: "gallery" }).catch(() => {});
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return; // closed the share sheet
        // NotAllowedError: the browser decided the click was too long ago while the image was rendering.
        downloadBlob(blob, fileName);
        toast("Your browser blocked sharing, so the image was downloaded instead.");
      }
    });

  const handlePublish = (visibility: PublishVisibility) => {
    if (blockReason) {
      toast(blockReason);
      return;
    }
    return run(visibility, async () => {
      const cacheKey = `${imageKey}:${visibility}`;
      const { designId, postId } = await saveAndPublishDesign({
        content: { type: item.kind, id: item.id },
        config,
        canvasId: CANVAS_ID,
        visibility,
        designId: designCache.current.get(cacheKey),
      });
      designCache.current.set(cacheKey, designId);
      const url = postUrl(postId);
      setLinks((prev) => ({ ...prev, [cacheKey]: url }));

      if (visibility === "public") {
        toast("Posted to Commonplace.");
        return;
      }
      try {
        await navigator.clipboard.writeText(url);
        toast("Private link copied. Anyone with a Verbatim account and this link can view it.");
      } catch {
        toast("Private link ready. Copy it below.");
      }
    });
  };

  const customizeHref = `/create/${item.kind}/${item.id}?style=${encodeURIComponent(styleId)}&format=${encodeURIComponent(format)}`;
  const ratio = preset.width / preset.height;

  return (
    <div className="space-y-5">
      {/* Large preview, capped by height so tall sizes (story) still fit on screen. */}
      <div className="rounded-[var(--radius)] bg-muted p-4 sm:p-8">
        <div
          role="img"
          aria-label={`${style.label} design of the ${label}, ${preset.label.toLowerCase()} size`}
          className="relative mx-auto w-full overflow-hidden rounded-[var(--radius)]"
          style={{ aspectRatio: `${preset.width} / ${preset.height}`, maxWidth: `calc(min(34rem, 62svh) * ${ratio})` }}
        >
          <ScaledRenderer config={config} canvasId={CANVAS_ID} />
        </div>
      </div>

      <div>
        <p id="quote-gallery-style" className="mb-2 text-sm font-medium text-muted-foreground">
          Style
        </p>
        <div
          role="radiogroup"
          aria-labelledby="quote-gallery-style"
          onKeyDown={rovingKeys(STYLE_IDS, styleId, onStyle, "data-style")}
          className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-5 sm:gap-3 sm:overflow-visible sm:px-0"
        >
          {STYLE_IDS.map((id) => {
            const on = id === styleId;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                data-style={id}
                onClick={() => onStyle(id)}
                className="group w-24 min-w-0 shrink-0 rounded-[var(--radius)] text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:w-auto"
              >
                <span
                  className={cn(
                    "block h-20 rounded-[var(--radius)] p-1.5 transition-colors sm:h-24 sm:p-2",
                    on ? "bg-ink" : "bg-muted group-hover:bg-surface-hover"
                  )}
                >
                  <ScaledRenderer config={buildConfig(item, id, format, sourceTitle)} />
                </span>
                <span
                  className={cn(
                    "mt-1.5 block truncate text-xs sm:text-sm",
                    on ? "font-semibold text-foreground" : "text-muted-foreground group-hover:text-foreground"
                  )}
                >
                  {DESIGN_STYLES[id].label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {blockReason && (
        <p id="quote-gallery-block" className="rounded-[var(--radius)] bg-mark p-4 text-base text-ink">
          {blockReason} Download and share still work.
        </p>
      )}

      {/* One action bar for the image on screen. On phones Download takes the
          first row and the rest pair up beneath it. */}
      <div className="flex flex-wrap gap-2">
        <Button className="h-11 basis-full px-5 text-base sm:basis-auto" onClick={handleDownload} disabled={busy !== null}>
          {busy === "download" ? <CircleNotch className="size-4 animate-spin" aria-hidden="true" /> : <DownloadSimple className="size-4" aria-hidden="true" />}
          Download {style.label}
        </Button>
        <Button variant="outline" className="h-11 flex-1 sm:flex-none" onClick={handleShare} disabled={busy !== null}>
          {busy === "share" ? <CircleNotch className="size-4 animate-spin" aria-hidden="true" /> : <ShareNetwork className="size-4" aria-hidden="true" />}
          Share
        </Button>
        <Button
          variant="outline"
          className="h-11 flex-1 sm:flex-none"
          onClick={() => handlePublish("public")}
          disabled={busy !== null}
          aria-describedby={blockReason ? "quote-gallery-block" : undefined}
        >
          {busy === "public" ? <CircleNotch className="size-4 animate-spin" aria-hidden="true" /> : <Globe className="size-4" aria-hidden="true" />}
          Post to Commonplace
        </Button>
        <Button
          variant="ghost"
          className="h-11 flex-1 hover:bg-surface-hover sm:flex-none"
          onClick={() => handlePublish("unlisted")}
          disabled={busy !== null}
          aria-describedby={blockReason ? "quote-gallery-block" : undefined}
        >
          {busy === "unlisted" ? <CircleNotch className="size-4 animate-spin" aria-hidden="true" /> : <LinkSimple className="size-4" aria-hidden="true" />}
          Copy private link
        </Button>
        <Link href={customizeHref} className={cn(buttonVariants({ variant: "ghost" }), "h-11 flex-1 hover:bg-surface-hover sm:flex-none")}>
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          Customize
        </Link>
      </div>

      {(publicLink || privateLink) && (
        <div className="space-y-2 text-base">
          {publicLink && (
            <a href={publicLink} className="inline-flex min-h-10 items-center gap-1.5 text-foreground underline underline-offset-4">
              View your post
              <ArrowSquareOut className="size-4" aria-hidden="true" />
            </a>
          )}
          {privateLink && (
            <div className="max-w-xl">
              <label htmlFor={`${CANVAS_ID}-link`} className="text-sm text-muted-foreground">
                Private link
              </label>
              <input
                id={`${CANVAS_ID}-link`}
                readOnly
                value={privateLink}
                onFocus={(e) => e.currentTarget.select()}
                className="mt-1 h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
