import { ImageResponse } from "next/og";

export const alt =
  "Verbatim: Quotes, checked word for word. Paste a YouTube link. Every quote is checked against the transcript.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PAPER = "#fbfbfa";
const INK = "#2f3437";
const MUTED = "#6b6f72";
const RULE = "#e7e6e3";
const VERIFIED_BG = "#edf3ec";
const VERIFIED_INK = "#346538";

const HEADLINE = "Quotes, checked word for word";
const SUBLINE = "Paste a YouTube link. Every quote is checked against the transcript.";
const WORDMARK = "Verbatim";
const CHIP = "Verified";

/**
 * Loads a TrueType subset of a Google font containing only `text`.
 * ImageResponse cannot use next/font and does not support woff2; the CSS API
 * returns truetype URLs when no browser user agent is sent. Returns null on any
 * failure so the image still renders with the default font.
 */
async function loadGoogleFont(family: string, weight: number, text: string) {
  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=${family}:wght@${weight}&text=${encodeURIComponent(text)}`;
    const css = await (await fetch(cssUrl)).text();
    const match = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/);
    if (!match) return null;
    const res = await fetch(match[1]);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

export default async function OpengraphImage() {
  const [serif, sans] = await Promise.all([
    loadGoogleFont("Newsreader", 500, HEADLINE + WORDMARK),
    loadGoogleFont("Geist", 500, SUBLINE + CHIP),
  ]);

  const fonts = [
    ...(serif ? [{ name: "Newsreader", data: serif, weight: 500 as const, style: "normal" as const }] : []),
    ...(sans ? [{ name: "Geist", data: sans, weight: 500 as const, style: "normal" as const }] : []),
  ];

  const serifFamily = serif ? "Newsreader" : "serif";
  const sansFamily = sans ? "Geist" : "sans-serif";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: PAPER,
          color: INK,
          padding: "72px 80px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingBottom: 28,
            borderBottom: `2px solid ${RULE}`,
          }}
        >
          <div style={{ fontFamily: serifFamily, fontSize: 44, letterSpacing: "-0.02em" }}>{WORDMARK}</div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              fontFamily: sansFamily,
              fontSize: 26,
              color: VERIFIED_INK,
              background: VERIFIED_BG,
              borderRadius: 999,
              padding: "8px 22px",
            }}
          >
            {CHIP}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            fontFamily: serifFamily,
            fontSize: 104,
            lineHeight: 1.02,
            letterSpacing: "-0.03em",
            maxWidth: 980,
          }}
        >
          {HEADLINE}
        </div>

        <div style={{ display: "flex", fontFamily: sansFamily, fontSize: 32, color: MUTED, maxWidth: 900 }}>
          {SUBLINE}
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined }
  );
}
