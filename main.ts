/**
 * news-image-20261125 — front-page publisher.
 *
 * The finished 1024x1024 front page is stored next to this file as one long
 * line of base64 text (entry.png.b64), because the channel that carries the
 * snapshot only transports text. This program turns that text back into the
 * PNG and places it where the harness expects it.
 *
 * Run it with Node 22:
 *   node main.ts
 * The picture lands in $MAKEFUN_OUTPUT_DIR/entry.png (or /output/entry.png
 * when that variable is unset). Run it twice and the two files are identical.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The first eight bytes of every PNG file, fixed by the format itself.
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

// The chunk that must follow the signature in a well-formed PNG.
const IHDR_TAG = "IHDR";

const SOURCE_FILE = "entry.png.b64";
const TARGET_FILE = "entry.png";
const DEFAULT_OUTPUT_DIR = "/output";

/** Folder holding this script, so the base64 file is found wherever we run from. */
function scriptFolder(): string {
  return dirname(fileURLToPath(import.meta.url));
}

/** Where the finished PNG goes: the harness variable, or /output as a fallback. */
function outputFolder(): string {
  const fromEnv = process.env.MAKEFUN_OUTPUT_DIR?.trim();
  return fromEnv ? fromEnv : DEFAULT_OUTPUT_DIR;
}

/**
 * Turn the stored text into bytes. Blank lines and stray spaces are ignored,
 * and anything outside the base64 alphabet is rejected instead of silently
 * decoded into garbage.
 */
function decodeStoredText(text: string): Buffer {
  const compact = text.replace(/\s+/g, "");
  if (compact.length === 0) {
    throw new Error(`${SOURCE_FILE} is empty`);
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) {
    throw new Error(`${SOURCE_FILE} contains characters outside the base64 alphabet`);
  }
  return Buffer.from(compact, "base64");
}

/** Confirm the bytes really are a PNG: signature first, then an IHDR chunk. */
function assertPng(bytes: Buffer): void {
  if (bytes.length < PNG_SIGNATURE.length + 8) {
    throw new Error(`decoded payload is only ${bytes.length} bytes, too small for a PNG`);
  }
  if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error("decoded payload does not start with the PNG signature");
  }
  const firstChunk = bytes.toString("ascii", PNG_SIGNATURE.length + 4, PNG_SIGNATURE.length + 8);
  if (firstChunk !== IHDR_TAG) {
    throw new Error(`first PNG chunk is ${firstChunk}, expected ${IHDR_TAG}`);
  }
  // The IHDR chunk also carries the picture's size; the front page must be
  // 1024x1024, so refuse anything else rather than publishing a wrong size.
  const width = bytes.readUInt32BE(PNG_SIGNATURE.length + 8);
  const height = bytes.readUInt32BE(PNG_SIGNATURE.length + 12);
  if (width !== 1024 || height !== 1024) {
    throw new Error(`decoded image is ${width}x${height}, expected 1024x1024`);
  }
}

async function publish(): Promise<void> {
  const sourcePath = join(scriptFolder(), SOURCE_FILE);
  const destinationDir = outputFolder();
  const destinationPath = join(destinationDir, TARGET_FILE);

  const storedText = await readFile(sourcePath, "utf8");
  const pngBytes = decodeStoredText(storedText);
  assertPng(pngBytes);

  await mkdir(destinationDir, { recursive: true });
  await writeFile(destinationPath, pngBytes);

  // Read the file back and make sure what landed on disk is exactly what
  // we decoded — a short write or a stray byte would fail the harness.
  const writtenBack = await readFile(destinationPath);
  if (!writtenBack.equals(pngBytes)) {
    throw new Error(`${destinationPath} does not match the decoded image`);
  }

  console.log(`Wrote ${TARGET_FILE} (${pngBytes.length} bytes) to ${destinationDir}`);
}

publish().catch((error: unknown) => {
  console.error(`Failed to publish ${TARGET_FILE}:`, error instanceof Error ? error.message : error);
  process.exit(1);
});
