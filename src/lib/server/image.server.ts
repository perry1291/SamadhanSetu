/**
 * Server-only image validation and sanitisation.
 *
 * Three independent gates, in order of cost:
 *
 *  1. Magic bytes — the file's own header decides its type. The filename,
 *     extension and client-supplied MIME type are never trusted, so a `.jpg`
 *     containing a script or a PDF is rejected before any decoding.
 *  2. Full decode — the image must actually be decodable, which rejects a valid
 *     header followed by garbage. Pixel count is capped first to avoid
 *     decompression bombs.
 *  3. Re-encode — the output is written from decoded pixels, so nothing from the
 *     original container survives. This is what removes EXIF, GPS coordinates,
 *     device make/model, software tags, thumbnails, ICC junk and XMP.
 *
 * The re-encode is mandatory, not opportunistic: a phone photograph routinely
 * carries the exact coordinates of a citizen's home, and `/complaint` treats
 * location sharing as an explicit opt-in. Uploading the original file would
 * silently capture what the citizen declined to give.
 */
import "@tanstack/react-start/server-only";

import sharp from "sharp";

import {
  ALLOWED_IMAGE_FORMATS,
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_PIXELS,
  MIN_IMAGE_DIMENSION,
  type ImageFormat,
} from "@/lib/validation/evidence";

export type ImageRejectionReason =
  | "not_an_image"
  | "unsupported_format"
  | "corrupt_image"
  | "too_small"
  | "too_many_pixels"
  | "encode_failed";

export type SanitizedImage = {
  ok: true;
  bytes: Uint8Array;
  format: ImageFormat;
  width: number;
  height: number;
  byteLength: number;
  /** SHA-256 of the sanitised output, not the uploaded original. */
  checksum: string;
};

export type ImageSanitizeResult = SanitizedImage | { ok: false; reason: ImageRejectionReason };

/**
 * Identifies the format from the file header alone.
 *
 * JPEG: FF D8 FF. PNG: the 8-byte signature. Anything else is refused outright
 * rather than handed to the decoder.
 */
export function sniffImageFormat(bytes: Uint8Array): ImageFormat | undefined {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpg";
  }
  const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) {
    return "png";
  }
  return undefined;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Validates and re-encodes an uploaded image.
 *
 * Returns the sanitised bytes ready for upload. Failures are reason codes; no
 * decoder message is propagated, since those can echo file contents.
 */
export async function sanitizeImage(input: Uint8Array): Promise<ImageSanitizeResult> {
  const sniffed = sniffImageFormat(input);
  if (sniffed === undefined) return { ok: false, reason: "not_an_image" };
  if (!ALLOWED_IMAGE_FORMATS.includes(sniffed)) {
    return { ok: false, reason: "unsupported_format" };
  }

  try {
    // `limitInputPixels` makes sharp refuse a decompression bomb before allocating.
    const pipeline = sharp(input, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: "error" });
    const metadata = await pipeline.metadata();

    // The decoder's own verdict must agree with the header.
    const decodedFormat = metadata.format === "jpeg" ? "jpg" : metadata.format;
    if (decodedFormat !== sniffed) return { ok: false, reason: "unsupported_format" };

    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (width === 0 || height === 0) return { ok: false, reason: "corrupt_image" };
    if (width < MIN_IMAGE_DIMENSION || height < MIN_IMAGE_DIMENSION) {
      return { ok: false, reason: "too_small" };
    }

    // `.rotate()` with no argument applies the EXIF orientation and then discards
    // it, so the picture stays upright once the metadata is gone.
    let output = sharp(input, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: "error" }).rotate();

    if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
      output = output.resize({
        width: MAX_IMAGE_DIMENSION,
        height: MAX_IMAGE_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    // Encoding from decoded pixels is what guarantees no original metadata
    // survives. sharp only re-attaches metadata when explicitly asked to.
    const encoded =
      sniffed === "jpg"
        ? await output.jpeg({ quality: 82, mozjpeg: true }).toBuffer()
        : await output.png({ compressionLevel: 9 }).toBuffer();

    const finalMeta = await sharp(encoded).metadata();
    const bytes = new Uint8Array(encoded);

    return {
      ok: true,
      bytes,
      format: sniffed,
      width: finalMeta.width ?? width,
      height: finalMeta.height ?? height,
      byteLength: bytes.byteLength,
      checksum: await sha256Hex(bytes),
    };
  } catch (error: unknown) {
    // Name only — decoder messages can include file content fragments.
    console.error(
      `[image] sanitisation failed: ${error instanceof Error ? error.name : "UnknownError"}`,
    );
    return { ok: false, reason: "corrupt_image" };
  }
}

/**
 * Reduces a citizen-supplied filename to a short, safe display label.
 *
 * Path separators and control characters are removed so the value cannot be
 * mistaken for a path, and it is never used to build a storage key.
 */
export function safeDisplayName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "image";
  const cleaned = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    // `\p{M}` keeps combining marks, without which Devanagari filenames such as
    // `गड्ढा.jpg` would be mangled into unreadable consonant clusters.
    .replace(/[^\p{L}\p{M}\p{N}._ -]/gu, "")
    .trim();
  return (cleaned === "" ? "image" : cleaned).slice(0, 120);
}
