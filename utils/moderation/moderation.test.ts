import { describe, expect, it } from "vitest";
import {
  MAX_REPORT_DETAILS,
  REPORT_REASONS,
  REPORT_REASON_LABELS,
  reportInputSchema,
  reportReasonLabel,
} from "./reports";
import {
  adminFeedbackSchema,
  adminIdSchema,
  adminReportStatusSchema,
  daysAgoIso,
  isBanned,
  parsePage,
  parseReportStatusFilter,
  parseSearchQuery,
} from "./admin-schemas";
import { isAdminUser } from "@/utils/auth/roles";

const ID = "3f1c2b6e-8a4d-4c1e-9b2f-0a1b2c3d4e5f";

describe("report reasons", () => {
  it("has a plain language label for every reason", () => {
    for (const r of REPORT_REASONS) {
      expect(REPORT_REASON_LABELS[r]).toBeTruthy();
      expect(REPORT_REASON_LABELS[r]).not.toMatch(/\u2014/);
      expect(REPORT_REASON_LABELS[r][0]).toBe(REPORT_REASON_LABELS[r][0].toUpperCase());
    }
  });

  it("matches the database CHECK constraint", () => {
    expect([...REPORT_REASONS].sort()).toEqual(
      ["spam", "harassment", "hate", "sexual", "violence", "misinformation", "copyright", "impersonation", "other"].sort()
    );
  });

  it("falls back for unknown reasons", () => {
    expect(reportReasonLabel("spam")).toBe("Spam or advertising");
    expect(reportReasonLabel("nope")).toBe("Unknown reason");
  });
});

describe("reportInputSchema", () => {
  it("accepts a valid report and trims details", () => {
    const r = reportInputSchema.parse({ targetType: "post", targetId: ID, reason: "spam", details: "  hi  " });
    expect(r).toEqual({ targetType: "post", targetId: ID, reason: "spam", details: "hi" });
  });

  it("turns empty details into undefined", () => {
    expect(reportInputSchema.parse({ targetType: "comment", targetId: ID, reason: "other", details: "   " }).details).toBeUndefined();
    expect(reportInputSchema.parse({ targetType: "comment", targetId: ID, reason: "other" }).details).toBeUndefined();
  });

  it("rejects bad input", () => {
    expect(reportInputSchema.safeParse({ targetType: "user", targetId: ID, reason: "spam" }).success).toBe(false);
    expect(reportInputSchema.safeParse({ targetType: "post", targetId: "x", reason: "spam" }).success).toBe(false);
    expect(reportInputSchema.safeParse({ targetType: "post", targetId: ID, reason: "rude" }).success).toBe(false);
    expect(
      reportInputSchema.safeParse({ targetType: "post", targetId: ID, reason: "spam", details: "a".repeat(MAX_REPORT_DETAILS + 1) })
        .success
    ).toBe(false);
  });
});

describe("admin schemas", () => {
  it("validates ids, statuses and feedback toggles", () => {
    expect(adminIdSchema.safeParse(ID).success).toBe(true);
    expect(adminIdSchema.safeParse("1; drop table").success).toBe(false);
    expect(adminReportStatusSchema.safeParse("dismissed").success).toBe(true);
    expect(adminReportStatusSchema.safeParse("deleted").success).toBe(false);
    expect(adminFeedbackSchema.safeParse({ feedbackId: ID, handled: true }).success).toBe(true);
    expect(adminFeedbackSchema.safeParse({ feedbackId: ID, handled: "yes" }).success).toBe(false);
  });

  it("parses the report status filter", () => {
    expect(parseReportStatusFilter(undefined)).toBe("open");
    expect(parseReportStatusFilter("resolved")).toBe("resolved");
    expect(parseReportStatusFilter(["all", "open"])).toBe("all");
    expect(parseReportStatusFilter("bogus")).toBe("open");
  });

  it("sanitises search queries for PostgREST filters", () => {
    expect(parseSearchQuery("  hello   world ")).toBe("hello world");
    expect(parseSearchQuery("a,b(c)*d%e")).toBe("a b c d e");
    expect(parseSearchQuery("x".repeat(300))).toHaveLength(100);
    expect(parseSearchQuery(undefined)).toBe("");
  });

  it("parses page numbers", () => {
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage("3")).toBe(3);
    expect(parsePage("-2")).toBe(1);
    expect(parsePage("abc")).toBe(1);
    expect(parsePage("99999", 10)).toBe(10);
  });

  it("detects bans", () => {
    const now = new Date("2026-10-17T00:00:00Z");
    expect(isBanned(null, now)).toBe(false);
    expect(isBanned("2126-10-17T00:00:00Z", now)).toBe(true);
    expect(isBanned("2020-01-01T00:00:00Z", now)).toBe(false);
    expect(isBanned("not a date", now)).toBe(false);
  });
});

describe("daysAgoIso", () => {
  it("subtracts whole days", () => {
    expect(daysAgoIso(7, new Date("2026-10-17T12:00:00Z"))).toBe("2026-10-10T12:00:00.000Z");
  });
});

describe("isAdminUser", () => {
  it("is true only for app_metadata.role === 'admin'", () => {
    expect(isAdminUser({ app_metadata: { role: "admin" } })).toBe(true);
    expect(isAdminUser({ app_metadata: { role: "Admin" } })).toBe(false);
    expect(isAdminUser({ app_metadata: {} })).toBe(false);
    expect(isAdminUser({ app_metadata: null })).toBe(false);
    expect(isAdminUser(null)).toBe(false);
    expect(isAdminUser(undefined)).toBe(false);
  });

  it("ignores user_metadata, which users can edit", () => {
    expect(isAdminUser({ app_metadata: {}, user_metadata: { role: "admin" } } as never)).toBe(false);
  });

  it("never treats guests as admins", () => {
    expect(isAdminUser({ app_metadata: { role: "admin" }, is_anonymous: true })).toBe(false);
  });
});
