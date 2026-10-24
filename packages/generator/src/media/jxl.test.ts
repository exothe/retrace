import { brotliCompressSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { expandJxlBoxes } from "./jxl.ts";

function box(type: string, payload: Buffer | string): Buffer {
  const data = Buffer.from(payload);
  const header = Buffer.alloc(8);
  header.writeUInt32BE(8 + data.length);
  header.write(type, 4, "latin1");
  return Buffer.concat([header, data]);
}

const FTYP = box("ftyp", "jxl \0\0\0\0jxl ");
const CODESTREAM = box("jxlc", Buffer.from([0xff, 0x0a, 1, 2, 3]));
const EXIF = "\0\0\0\0MM\0*exif data";

describe("expandJxlBoxes", () => {
  it("replaces Brotli-compressed boxes by their plain version", () => {
    const brob = box("brob", Buffer.concat([Buffer.from("Exif"), brotliCompressSync(EXIF)]));
    expect(expandJxlBoxes(Buffer.concat([FTYP, brob, CODESTREAM]))).toEqual(
      Buffer.concat([FTYP, box("Exif", EXIF), CODESTREAM]),
    );
  });

  it("handles 64-bit box sizes and a last box that extends to the end", () => {
    const payload = Buffer.concat([Buffer.from("xml "), brotliCompressSync("<x:xmpmeta/>")]);
    const large = Buffer.alloc(16);
    large.writeUInt32BE(1);
    large.write("brob", 4, "latin1");
    large.writeBigUInt64BE(BigInt(16 + payload.length), 8);
    const toEnd = Buffer.from(CODESTREAM);
    toEnd.writeUInt32BE(0);
    expect(expandJxlBoxes(Buffer.concat([FTYP, large, payload, toEnd]))).toEqual(
      Buffer.concat([FTYP, box("xml ", "<x:xmpmeta/>"), toEnd]),
    );
  });

  it("returns undefined when there is nothing to expand or the file is malformed", () => {
    expect(expandJxlBoxes(Buffer.concat([FTYP, box("Exif", EXIF), CODESTREAM]))).toBeUndefined();
    // A bare codestream has no boxes.
    expect(expandJxlBoxes(Buffer.from([0xff, 0x0a, 0xfa, 0x01, 0, 0, 0, 0, 0]))).toBeUndefined();
    const truncated = Buffer.concat([FTYP, box("brob", "Exifxxxx")]).subarray(0, -2);
    expect(expandJxlBoxes(truncated)).toBeUndefined();
    const garbage = box("brob", "Exif not brotli at all");
    expect(expandJxlBoxes(Buffer.concat([FTYP, garbage]))).toBeUndefined();
  });
});
