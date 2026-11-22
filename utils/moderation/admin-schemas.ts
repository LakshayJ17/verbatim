/**
 * Pure input schemas and search param parsers for the admin area. No server
 * APIs here so they can be unit tested.
 */
import { z } from "zod";
import { REPORT_STATUSES, type ReportStatus } from "./reports";

export const adminIdSchema = z.uuid();
export const adminReportStatusSchema = z.enum(REPORT_STATUSES);
export const adminFeedbackSchema = z.object({ feedbackId: z.uuid(), handled: z.boolean() });

type Param = string | string[] | undefined;

function first(value: Param): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Report status filter from ?status=. Defaults to 'open'; 'all' shows everything. */
export function parseReportStatusFilter(value: Param): ReportStatus | "all" {
  const v = first(value);
  if (v === "all") return "all";
  const parsed = adminReportStatusSchema.safeParse(v);
  return parsed.success ? parsed.data : "open";
}

/** Free-text search from ?q=, trimmed, max 100 chars, with PostgREST filter syntax characters removed. */
export function parseSearchQuery(value: Param): string {
  const v = first(value) ?? "";
  return v.replace(/[,()*%\\:"']/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}

/** 1-based page number from ?page=, clamped to 1..max. */
export function parsePage(value: Param, max = 1000): number {
  const n = Number.parseInt(first(value) ?? "", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, max);
}

/** True when a Supabase auth user's banned_until is in the future. */
export function isBanned(bannedUntil: string | null | undefined, now: Date = new Date()): boolean {
  if (!bannedUntil) return false;
  const t = Date.parse(bannedUntil);
  return Number.isFinite(t) && t > now.getTime();
}

/** ISO timestamp `days` days before `now`. */
export function daysAgoIso(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}
