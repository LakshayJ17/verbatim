/**
 * Pure report helpers shared by the report form, the reportContent server
 * action and the admin area. Values must match the CHECK constraints on
 * public.reports (supabase/migrations/20261018100000_admin_and_account_deletion.sql).
 */
import { z } from "zod";

export const REPORT_TARGET_TYPES = ["post", "comment"] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export const REPORT_REASONS = [
  "spam",
  "harassment",
  "hate",
  "sexual",
  "violence",
  "misinformation",
  "copyright",
  "impersonation",
  "other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** Plain language labels, in the order shown in the form. */
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  spam: "Spam or advertising",
  harassment: "Bullying or harassment",
  hate: "Hate speech",
  sexual: "Sexual content",
  violence: "Violence or threats",
  misinformation: "False or misleading quote",
  copyright: "Copyright problem",
  impersonation: "Pretending to be someone else",
  other: "Something else",
};

export const REPORT_STATUSES = ["open", "resolved", "dismissed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const MAX_REPORT_DETAILS = 1000;

export function reportReasonLabel(reason: string): string {
  return (REPORT_REASON_LABELS as Record<string, string>)[reason] ?? "Unknown reason";
}

export const reportInputSchema = z.object({
  targetType: z.enum(REPORT_TARGET_TYPES, { error: "Choose what to report." }),
  targetId: z.uuid({ error: "That content was not found." }),
  reason: z.enum(REPORT_REASONS, { error: "Choose a reason." }),
  details: z
    .string()
    .trim()
    .max(MAX_REPORT_DETAILS, `Keep details under ${MAX_REPORT_DETAILS} characters.`)
    .optional()
    .transform((v) => (v ? v : undefined)),
});

export type ReportInput = z.infer<typeof reportInputSchema>;

export const REPORT_MESSAGES = {
  thanks: "Thanks, we'll review it.",
  duplicate: "You already reported this.",
  signIn: "Sign in with an account to report content.",
  notFound: "That content was not found.",
  own: "You can't report your own content.",
  failed: "Could not send the report. Try again.",
} as const;
