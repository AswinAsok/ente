# Image format regression fixtures

`image-samples.json` records download URLs, original byte counts, SHA-256 hashes,
expected outcomes, and decoded preview dimensions. Keep the large files outside
Git. The original 49 files belong in the repository's `image-samples/` directory;
the manifest also includes genuine Epson ERF and intact Canon CR2 fixtures from
rawsamples.ch. Download URLs are test inputs, never runtime conversion services.

The expected result is **45 supported photos from the original set**, plus both
additional RAW fixtures. The filesamples ERF is a network capture and the PES is
an embroidery design. PCD and SVG remain outside this change.

The filesamples CR2 has truncated RAW pixel data but a usable embedded JPEG.
Preserve it as a preview regression case; use `RAW_CANON_1DSM2.CR2` for full RAW
decoding. RAW viewing uses an embedded preview when available, so its dimensions
can be smaller than the original photo's metadata dimensions.

## Automated checks

From `web/`:

```sh
# Ordinary tests use small generated fixtures and mocked worker failures.
npm run test --workspace photos

# Also check the external fixtures, their original hashes, output dimensions,
# thumbnail limits, RAW fallback, and expected unsupported inputs.
ENTE_IMAGE_SAMPLES_DIR="$PWD/../image-samples" npm run test --workspace photos
```

The external XWD test verifies its checksum; its FFmpeg conversion runs in the
browser check below. The tests also cover orientation, transparency, multipage
TIFF selection, misleading extensions, corruption, input/pixel limits, worker
crash, cancellation, watchdog timeouts, and recovery of the next queued job.

## Browser checks

The harness exercises the same type detection, thumbnail generation, and shared
viewing functions used by Photos and public albums. It does not upload to a
server or test encryption round trips. Temporarily expose it in a development
checkout (from `web/`):

```sh
cp apps/photos/tests/fixtures/image-conversion-browser.tsx apps/photos/src/pages/image-conversion-check.tsx
npm exec --workspace photos -- next dev --webpack
```

Open `/image-conversion-check`, select the 51 manifest files, and inspect the JSON
results. Expect 47 `passed` entries and four `file_type_not_supported` failures.
Newly converted thumbnails must be JPEG, no larger than 720 pixels on either
axis or 102400 bytes. Compare display dimensions with the manifest. Remove the
temporary page after checking:

```sh
rm apps/photos/src/pages/image-conversion-check.tsx
```

On 2026-09-17, all 51 outcomes matched in Chrome, Firefox, and Playwright WebKit
on macOS, including HEIC/HEIF baseline checks and real XWD conversion. This is
browser-engine verification, not a claim of testing Safari itself or packaged
Windows, Linux, and macOS Desktop apps. Verify those packaged apps before release.

## Conversion policy

The shared converter lazily loads `@imagemagick/magick-wasm` 0.0.43 in a serialized
worker. XWD uses the existing FFmpeg WASM worker first. Both upload pipelines reuse
a thumbnail prepared during type validation. Conversion never replaces the
original uploaded bytes or original hash. Existing placeholder files are not
repaired; duplicate detection remains unchanged.

Limits: 100 MiB input, 100 megapixels, a 512 MiB ImageMagick pixel-cache budget,
no disk cache, and a 60-second watchdog per worker stage. These are decoder limits,
not a 512 MiB bound on total browser memory. The first frame/page (or merged PSD
image) is used. Tagged colors are transformed to sRGB; thumbnails flatten alpha
on white while viewing keeps transparency. The embedded 480-byte sRGB profile is
CC0 from [Compact ICC Profiles](https://github.com/saucecontrol/Compact-ICC-Profiles).
The bundled WASM asset is about 14.8 MB uncompressed and 5.2 MB gzipped, loaded only
when one of these formats needs conversion.

When a recognized image cannot be converted, the existing placeholder fallback
remains. Unknown formats must pass decoding before admission; arbitrary extensions
do not bypass validation. The new rendering formats do not expand editing support.
