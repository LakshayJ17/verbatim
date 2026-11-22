import { describe, it, expect } from "vitest";
import { QUOTES, checkAgainstExample, formatTimestamp } from "./example-episode";

describe("landing example episode", () => {
  it("labels each example quote the way the real verifier does", () => {
    for (const q of QUOTES) {
      const result = checkAgainstExample(q.text);
      expect(result?.status).toBe(q.status);
      expect(result?.segment?.start).toBe(q.start);
    }
  });

  it("finds an exact line and its timestamp", () => {
    const result = checkAgainstExample("The hard days only work if the easy days stay easy.");
    expect(result?.status).toBe("verified");
    expect(formatTimestamp(result!.segment!.start)).toBe("7:01");
  });

  it("rejects words that are not in the transcript", () => {
    expect(checkAgainstExample("Run fast every single day.")?.status).toBe("rejected");
  });

  it("returns nothing for empty input", () => {
    expect(checkAgainstExample("  ...  ")).toBeNull();
  });
});
