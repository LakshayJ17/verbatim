import { describe, it, expect } from "vitest";
import { verifyQuote } from "./verification";
import type { NormalizedSegment } from "../parsers";

const q = (text: string) => ({ text, whyItMatters: "", confidence: 1 });

const hindi: NormalizedSegment[] = [
  { start: 10, end: 15, text: "लगवा दे मैया लाटरी दस करोड़ की," },
  { start: 15, end: 20, text: "मैया तेरे दर पे आया हूँ।" },
];

describe("verifyQuote across scripts", () => {
  it("verifies an exact Hindi quote, ignoring punctuation", () => {
    expect(verifyQuote(q("लगवा दे मैया लाटरी दस करोड़ की"), hindi).verificationStatus).toBe("verified");
  });

  it("rejects a Hindi line that is not in the transcript", () => {
    expect(verifyQuote(q("यह पंक्ति गाने में नहीं है"), hindi).verificationStatus).toBe("rejected");
  });

  it("never verifies an empty or punctuation-only quote", () => {
    expect(verifyQuote(q(""), hindi).verificationStatus).toBe("rejected");
    expect(verifyQuote(q("...!?"), hindi).verificationStatus).toBe("rejected");
  });

  it("keeps accented letters when comparing", () => {
    const fr: NormalizedSegment[] = [{ start: 0, end: 3, text: "Un café, s'il vous plaît." }];
    expect(verifyQuote(q("un café sil vous plaît"), fr).verificationStatus).toBe("verified");
    expect(verifyQuote(q("un cafe sil vous plait"), fr).verificationStatus).not.toBe("verified");
  });

  it("still verifies English as before", () => {
    const en: NormalizedSegment[] = [{ start: 0, end: 4, text: "Showing up tired still counts as showing up." }];
    expect(verifyQuote(q("showing up tired still counts as showing up"), en).verificationStatus).toBe("verified");
  });
});
