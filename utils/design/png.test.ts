import { describe, expect, it } from "vitest";
import { pngSize } from "./png";

function pngHeader(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const v = new DataView(b.buffer);
  v.setUint32(16, width);
  v.setUint32(20, height);
  return b;
}

describe("pngSize", () => {
  it("reads width and height from a PNG header", () => {
    expect(pngSize(pngHeader(1080, 1350))).toEqual({ width: 1080, height: 1350 });
  });
  it("rejects files that only claim to be PNGs", () => {
    expect(pngSize(new TextEncoder().encode("<html><script>alert(1)</script></html>!!"))).toBeNull();
    const jpeg = new Uint8Array(40); jpeg.set([0xff, 0xd8, 0xff, 0xe0]);
    expect(pngSize(jpeg)).toBeNull();
    expect(pngSize(new Uint8Array(10))).toBeNull();
  });
  it("rejects a PNG signature without an IHDR chunk first", () => {
    const b = pngHeader(10, 10); b.set([0x74, 0x45, 0x58, 0x74], 12); // "tEXt"
    expect(pngSize(b)).toBeNull();
  });
});
