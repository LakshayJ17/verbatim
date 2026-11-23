import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: () => ({}) }));
import { sanitizeSegments, splitLongText } from "./store";

describe("long transcript segments", () => {
  it("are split into pieces, never cut short", () => {
    const words = Array.from({ length: 2_000 }, (_, i) => `word${i}`).join(" ");
    const out = sanitizeSegments([{ start: 0, end: 0, text: words }]);
    expect(out.length).toBeGreaterThan(1);
    expect(out.every((s) => s.text.length <= 2_000)).toBe(true);
    expect(out.map((s) => s.text).join(" ")).toBe(words);
  });

  it("split at spaces, or hard when a word is longer than the limit", () => {
    expect(splitLongText("aaa bbb ccc", 7)).toEqual(["aaa bbb", "ccc"]);
    expect(splitLongText("x".repeat(10), 4)).toEqual(["xxxx", "xxxx", "xx"]);
    expect(splitLongText("   ", 4)).toEqual([]);
  });
});
