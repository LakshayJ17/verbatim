/**
 * Pure helpers shared by the publish server actions, the publish client helper,
 * the quote gallery and the creator. No browser or server APIs in here, so it
 * is safe to import anywhere and easy to unit test.
 */
import { FORMAT_PRESETS, type FormatPresetId } from "./presets";
import { DESIGN_STYLES, type StyleId } from "./styles";

export const GRAPHICS_BUCKET = "public_graphics";

/** Message shown when someone tries to post a quote that is not verified. */
export const NEEDS_REVIEW_MESSAGE = "Check this quote against the video before posting it publicly.";
export const UNCHECKED_MESSAGE =
  "This quote could not be checked against a transcript, so it can't be posted publicly. You can still download or share it.";
export const REJECTED_MESSAGE = "This quote was not found in the transcript, so it can't be used.";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * Storage path for a published graphic. Always generated on the server from
 * the authenticated user id and the design id, never taken from the client.
 */
export function buildGraphicPath(userId: string, designId: string, nonce: string): string {
  return `posts/${userId}/${designId}-${nonce}.png`;
}

/** True when `path` is exactly a path `buildGraphicPath` could have produced for this user and design. */
export function isGraphicPathFor(path: string, userId: string, designId: string): boolean {
  if (!isUuid(userId) || !isUuid(designId)) return false;
  const re = new RegExp(`^posts/${userId}/${designId}-[0-9a-f-]{36}\\.png$`, "i");
  return re.test(path);
}

/**
 * Extracts the storage object path from a public URL, but only when it points
 * inside this user's own folder of the graphics bucket. Returns null otherwise,
 * so a tampered URL can never make us delete someone else's file.
 */
export function ownedPathFromPublicUrl(url: string | null | undefined, userId: string): string | null {
  if (!url || !isUuid(userId)) return null;
  const marker = `/storage/v1/object/public/${GRAPHICS_BUCKET}/`;
  const at = url.indexOf(marker);
  if (at === -1) return null;
  const path = decodeURIComponent(url.slice(at + marker.length).split(/[?#]/)[0]);
  if (!path.startsWith(`posts/${userId}/`)) return null;
  const rest = path.slice(`posts/${userId}/`.length);
  if (!rest || rest.includes("/") || rest.includes("..")) return null;
  return path;
}

export function parseStyleParam(value: unknown): StyleId | null {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(DESIGN_STYLES, value)
    ? (value as StyleId)
    : null;
}

export function parseFormatParam(value: unknown): FormatPresetId | null {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(FORMAT_PRESETS, value)
    ? (value as FormatPresetId)
    : null;
}

export type VerificationStatus = "verified" | "needs_review" | "rejected" | "source_derived" | null | undefined;

/** Why a quote cannot be posted publicly, or null when it can. */
export function publicPostBlockReason(status: VerificationStatus): string | null {
  if (status === "verified") return null;
  if (status === "needs_review") return NEEDS_REVIEW_MESSAGE;
  if (status === "rejected") return REJECTED_MESSAGE;
  return UNCHECKED_MESSAGE;
}

export interface RankableQuote {
  id: string;
  verification_status?: VerificationStatus;
  confidence?: number | string | null;
}

const STATUS_RANK: Record<string, number> = { verified: 0, needs_review: 1, source_derived: 2 };

/**
 * The best quotes to turn into images: verified first, then needs review, then
 * unchecked; never rejected. Within a group, higher confidence first. Capped.
 */
export function selectBestQuotes<T extends RankableQuote>(quotes: T[] | null | undefined, cap = 6): T[] {
  if (!quotes) return [];
  const rank = (q: T) => STATUS_RANK[q.verification_status ?? "source_derived"] ?? 3;
  const conf = (q: T) => {
    const n = typeof q.confidence === "string" ? Number(q.confidence) : q.confidence;
    return typeof n === "number" && Number.isFinite(n) ? n : -1;
  };
  return quotes
    .filter((q) => q.verification_status !== "rejected")
    .map((q, i) => ({ q, i }))
    .sort((a, b) => rank(a.q) - rank(b.q) || conf(b.q) - conf(a.q) || a.i - b.i)
    .slice(0, cap)
    .map(({ q }) => q);
}
