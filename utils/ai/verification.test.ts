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
    expect(verifyQuote(q("un café s’il vous plaît"), fr).verificationStatus).toBe("verified");
    expect(verifyQuote(q("un cafe s'il vous plait"), fr).verificationStatus).not.toBe("verified");
  });
});

describe("verifyQuote never calls a changed quote word for word", () => {
  const seg = (text: string): NormalizedSegment[] => [{ start: 0, end: 5, text }];

  it("keeps apostrophes: \"were\" is not \"we're\", \"hell\" is not \"he'll\"", () => {
    expect(verifyQuote(q("we're going to win this"), seg("We’re going to win this.")).verificationStatus).toBe("verified");
    expect(verifyQuote(q("were going to win this"), seg("We're going to win this.")).verificationStatus).not.toBe("verified");
    expect(verifyQuote(q("hell be there tomorrow"), seg("He'll be there tomorrow.")).verificationStatus).not.toBe("verified");
  });

  it("keeps separators inside numbers: 1.5 is not 15, $10.00 is not $1000", () => {
    expect(verifyQuote(q("growth was 1.5 percent"), seg("Growth was 1.5 percent.")).verificationStatus).toBe("verified");
    expect(verifyQuote(q("growth was 15 percent"), seg("Growth was 1.5 percent.")).verificationStatus).not.toBe("verified");
    expect(verifyQuote(q("it cost $1000 back then"), seg("It cost $10.00 back then.")).verificationStatus).not.toBe("verified");
  });

  it("still ignores ordinary punctuation and quote marks", () => {
    expect(verifyQuote(q("\"Simple, is not the same as easy!\""), seg("Simple is not the same as easy.")).verificationStatus).toBe("verified");
  });

  it("does not verify quotes carrying emoji or symbol letters the transcript lacks", () => {
    expect(verifyQuote(q("we will win this country Ⓘⓝⓥⓐⓓⓔ"), seg("We will win this country.")).verificationStatus).not.toBe("verified");
    expect(verifyQuote(q("we will win this country 🚀"), seg("We will win this country.")).verificationStatus).not.toBe("verified");
  });

  it("still verifies English as before", () => {
    const en: NormalizedSegment[] = [{ start: 0, end: 4, text: "Showing up tired still counts as showing up." }];
    expect(verifyQuote(q("showing up tired still counts as showing up"), en).verificationStatus).toBe("verified");
  });
});
