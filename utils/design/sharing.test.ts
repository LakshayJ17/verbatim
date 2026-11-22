import { describe, it, expect } from "vitest";
import {
  buildGraphicPath,
  isGraphicPathFor,
  ownedPathFromPublicUrl,
  parseFormatParam,
  parseStyleParam,
  publicPostBlockReason,
  selectBestQuotes,
  NEEDS_REVIEW_MESSAGE,
} from "./sharing";

const USER = "6f1c2b9e-3a4d-4e5f-8a7b-1c2d3e4f5a6b";
const OTHER = "0a1b2c3d-4e5f-4a6b-9c8d-7e6f5a4b3c2d";
const DESIGN = "11111111-2222-4333-8444-555555555555";
const NONCE = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("graphic paths", () => {
  it("accepts only paths built for this user and design", () => {
    const path = buildGraphicPath(USER, DESIGN, NONCE);
    expect(path).toBe(`posts/${USER}/${DESIGN}-${NONCE}.png`);
    expect(isGraphicPathFor(path, USER, DESIGN)).toBe(true);
    expect(isGraphicPathFor(path, OTHER, DESIGN)).toBe(false);
    expect(isGraphicPathFor(buildGraphicPath(OTHER, DESIGN, NONCE), USER, DESIGN)).toBe(false);
    expect(isGraphicPathFor(`posts/${USER}/../${OTHER}/${DESIGN}-${NONCE}.png`, USER, DESIGN)).toBe(false);
    expect(isGraphicPathFor(`posts/${USER}/${DESIGN}-${NONCE}.svg`, USER, DESIGN)).toBe(false);
    expect(isGraphicPathFor(path, "not-a-uuid", DESIGN)).toBe(false);
  });

  it("only extracts storage paths inside the user's own folder", () => {
    const base = "https://abc.supabase.co/storage/v1/object/public/public_graphics/";
    const path = buildGraphicPath(USER, DESIGN, NONCE);
    expect(ownedPathFromPublicUrl(base + path, USER)).toBe(path);
    expect(ownedPathFromPublicUrl(`${base}${path}?v=1`, USER)).toBe(path);
    expect(ownedPathFromPublicUrl(base + path, OTHER)).toBeNull();
    expect(ownedPathFromPublicUrl(`${base}posts/${USER}/../${OTHER}/x.png`, USER)).toBeNull();
    expect(ownedPathFromPublicUrl(`${base}posts/${USER}/a/b.png`, USER)).toBeNull();
    expect(ownedPathFromPublicUrl("https://evil.example/x.png", USER)).toBeNull();
    expect(ownedPathFromPublicUrl(null, USER)).toBeNull();
  });
});

describe("search params", () => {
  it("honours only known style and format ids", () => {
    expect(parseStyleParam("cinematic")).toBe("cinematic");
    expect(parseStyleParam("toString")).toBeNull();
    expect(parseStyleParam(["minimal"])).toBeNull();
    expect(parseFormatParam("story")).toBe("story");
    expect(parseFormatParam("__proto__")).toBeNull();
    expect(parseFormatParam(undefined)).toBeNull();
  });
});

describe("publish rule", () => {
  it("allows only verified quotes publicly", () => {
    expect(publicPostBlockReason("verified")).toBeNull();
    expect(publicPostBlockReason("needs_review")).toBe(NEEDS_REVIEW_MESSAGE);
    expect(publicPostBlockReason("rejected")).not.toBeNull();
    expect(publicPostBlockReason("source_derived")).not.toBeNull();
    expect(publicPostBlockReason(null)).not.toBeNull();
  });
});

describe("selectBestQuotes", () => {
  it("orders verified, then needs review, then unchecked, by confidence, never rejected, capped", () => {
    const quotes = [
      { id: "a", verification_status: "needs_review" as const, confidence: 0.99 },
      { id: "b", verification_status: "verified" as const, confidence: 0.5 },
      { id: "c", verification_status: "rejected" as const, confidence: 1 },
      { id: "d", verification_status: "verified" as const, confidence: "0.9" },
      { id: "e", verification_status: "source_derived" as const, confidence: null },
      { id: "f", verification_status: "verified" as const },
    ];
    expect(selectBestQuotes(quotes).map((q) => q.id)).toEqual(["d", "b", "f", "a", "e"]);
    expect(selectBestQuotes(quotes, 2).map((q) => q.id)).toEqual(["d", "b"]);
    expect(selectBestQuotes(null)).toEqual([]);
  });

  it("caps at six by default", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ id: String(i), verification_status: "verified" as const }));
    expect(selectBestQuotes(many)).toHaveLength(6);
  });
});
