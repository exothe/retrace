import { brotliDecompressSync } from "node:zlib";

/**
 * JPEG XL files may store Exif and XMP Brotli-compressed, in "brob" boxes whose payload starts
 * with the original box type. cjxl does this by default, but the exiftool bundled with
 * exiftool-vendored can't decompress them. Returns the file with every "brob" box replaced by
 * its plain box, or undefined if there is nothing to expand (a bare codestream, no "brob"
 * boxes, or a malformed container, which exiftool then reads as best it can).
 */
export function expandJxlBoxes(data: Buffer): Buffer | undefined {
  // ISO BMFF boxes: 32-bit size (1: 64-bit size follows, 0: up to the end) and a 4-byte type.
  const parts: Buffer[] = [];
  let expanded = false;
  let offset = 0;
  while (offset < data.length) {
    if (offset + 8 > data.length) return undefined;
    let size = data.readUInt32BE(offset);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > data.length) return undefined;
      size = Number(data.readBigUInt64BE(offset + 8));
      header = 16;
    } else if (size === 0) {
      size = data.length - offset;
    }
    if (size < header || offset + size > data.length) return undefined;
    const box = data.subarray(offset, offset + size);
    if (box.toString("latin1", 4, 8) === "brob" && size >= header + 4) {
      let payload: Buffer;
      try {
        payload = brotliDecompressSync(box.subarray(header + 4));
      } catch {
        return undefined;
      }
      const plain = Buffer.alloc(8);
      plain.writeUInt32BE(8 + payload.length);
      box.copy(plain, 4, header, header + 4);
      parts.push(plain, payload);
      expanded = true;
    } else {
      parts.push(box);
    }
    offset += size;
  }
  return expanded ? Buffer.concat(parts) : undefined;
}
