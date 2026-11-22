import { describe, it, expect } from "vitest";
import { baseUsername, isValidUsername, usernameCandidate } from "./username";
import { pickAnalysis, isStaleProcessing, asArray } from "@/utils/analysis/pick";

describe("usernames", () => {
  it("slugs names, emails and accents", () => {
    expect(baseUsername("Jane Doe")).toBe("jane_doe");
    expect(baseUsername("josé.garcía@example.com")).toBe("jose_garcia");
    expect(baseUsername("  --Ann--  ")).toBe("ann");
  });

  it("never returns an empty or digits-only base for non-Latin names", () => {
    expect(baseUsername("राहुल")).toBe("user");
    expect(baseUsername("李")).toBe("user");
    expect(baseUsername("")).toBe("user");
    expect(baseUsername("al")).toBe("user_al");
  });

  it("always produces a valid username", () => {
    for (const name of ["Jane Doe", "राहुल", "a".repeat(80), "x"]) {
      for (let attempt = 0; attempt < 6; attempt++) {
        expect(isValidUsername(usernameCandidate(baseUsername(name), attempt))).toBe(true);
      }
    }
  });
});

describe("pickAnalysis", () => {
  it("handles object and array shapes", () => {
    expect(asArray(null)).toEqual([]);
    expect(asArray({ a: 1 })).toEqual([{ a: 1 }]);
    expect(pickAnalysis({ status: "completed" })?.status).toBe("completed");
  });

  it("prefers completed, then processing, then the most recent", () => {
    const picked = pickAnalysis([
      { status: "failed", updated_at: "2026-11-20T10:00:00Z" },
      { status: "completed", updated_at: "2026-11-01T10:00:00Z" },
      { status: "processing", updated_at: "2026-11-21T10:00:00Z" },
    ]);
    expect(picked?.status).toBe("completed");
    expect(
      pickAnalysis([
        { status: "failed", updated_at: "2026-11-01T10:00:00Z" },
        { status: "failed", updated_at: "2026-11-20T10:00:00Z" },
      ])?.updated_at
    ).toBe("2026-11-20T10:00:00Z");
  });

  it("detects stale processing runs", () => {
    const now = Date.parse("2026-11-21T10:30:00Z");
    expect(isStaleProcessing({ status: "processing", updated_at: "2026-11-21T10:00:00Z" }, now)).toBe(true);
    expect(isStaleProcessing({ status: "processing", updated_at: "2026-11-21T10:25:00Z" }, now)).toBe(false);
    expect(isStaleProcessing({ status: "failed", updated_at: "2026-11-21T10:00:00Z" }, now)).toBe(false);
  });
});
