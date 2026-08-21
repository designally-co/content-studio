/**
 * Image dimensions, read from the file header.
 *
 * sharp can do this, and did — but sharp is a native module, and on Vercel it
 * cannot load: the file tracer ships its `.node` binding and leaves behind the
 * libvips shared object it links against, so every request that touched it
 * died with `ERR_DLOPEN_FAILED: libvips-cpp.so`. Next's documented remedy,
 * `outputFileTracingIncludes`, is silently ignored in a Turbopack build —
 * measured, not assumed: a plain `./README.md` added through it never reached
 * the trace either.
 *
 * Reading width and height is the whole of what the generation path needed
 * from sharp, and it is a few bytes at a known offset. This has no
 * dependencies and no binary, so it works everywhere. sharp remains where it
 * is genuinely required: compositing the brand logo.
 */
export type ImageSize = { width: number; height: number };

/** PNG: an 8-byte signature, then an IHDR chunk whose first 8 bytes are the size. */
function png(buffer: Buffer): ImageSize | null {
  if (buffer.length < 24) return null;
  const signature = buffer.readUInt32BE(0) === 0x89504e47 && buffer.readUInt32BE(4) === 0x0d0a1a0a;
  if (!signature) return null;
  if (buffer.toString("ascii", 12, 16) !== "IHDR") return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/**
 * JPEG: a chain of segments. Walk it to a Start-Of-Frame marker, which carries
 * the size. Everything between is skipped by its own declared length, which is
 * why this cannot be a fixed offset the way PNG can.
 */
function jpeg(buffer: Buffer): ImageSize | null {
  if (buffer.length < 4 || buffer.readUInt16BE(0) !== 0xffd8) return null;

  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset++; // resync past padding rather than giving up
      continue;
    }
    const marker = buffer[offset + 1];

    // SOF0-SOF15 carry the frame size. C4, C8 and CC are not frame headers
    // (Huffman table, JPEG extension, arithmetic coding) and must be skipped.
    const isFrameHeader =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrameHeader) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }

    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) return null;
    offset += 2 + length;
  }
  return null;
}

/** WebP: a RIFF container, with three sub-formats that store the size differently. */
function webp(buffer: Buffer): ImageSize | null {
  if (buffer.length < 30) return null;
  if (buffer.toString("ascii", 0, 4) !== "RIFF") return null;
  if (buffer.toString("ascii", 8, 12) !== "WEBP") return null;

  const format = buffer.toString("ascii", 12, 16);
  if (format === "VP8 ") {
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  if (format === "VP8L") {
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (format === "VP8X") {
    const width = 1 + (buffer.readUIntLE(24, 3) & 0xffffff);
    const height = 1 + (buffer.readUIntLE(27, 3) & 0xffffff);
    return { width, height };
  }
  return null;
}

/** Width and height, or null if the bytes are not a format this understands. */
export function imageSize(buffer: Buffer): ImageSize | null {
  const size = png(buffer) ?? jpeg(buffer) ?? webp(buffer);
  if (!size || !size.width || !size.height) return null;
  return size;
}
