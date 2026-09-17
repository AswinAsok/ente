# RAW regression fixtures

`image-samples.json` covers CR2, CR3 (RAW and C-RAW), DNG, ORF, RW2, NEF, RAF,
and ARW. Download the listed sources into `image-samples/` at the repository root;
keep these large files outside Git. SHA-256 hashes verify the original bytes.

From `web/`, run the regular tests with `npm run test --workspace photos`.
To include the real RAW fixtures:

```sh
ENTE_IMAGE_SAMPLES_DIR="$PWD/../image-samples" npm run test --workspace photos
```

The filesamples CR2 has truncated RAW pixels but a usable embedded JPEG. The
intact `RAW_CANON_1DSM2.CR2` also exercises full RAW decoding when the preview is
missing or corrupt. The portrait NEF catches accidental double rotation.

Fresh-upload thumbnails and viewing prefer embedded previews, which can be
smaller than the original. Original uploads and existing placeholders are
unchanged. Limits are 100 MiB input, 100 megapixels, a 512 MiB decoder pixel-cache
budget, and a 60-second worker timeout. The lazy ImageMagick WASM asset remains
about 14.8 MB (5.2 MB gzipped); restricting extensions does not shrink that binary.

On 2026-09-17, all 11 RAW fixtures rendered in Chrome, Firefox, and WebKit through
both Photos and public-album thumbnails and shared viewing. The 13 baseline
formats also rendered; the existing WebKit HEIC canvas thumbnail exceeds 100 KiB.
These checks do not exercise server uploads or packaged Desktop apps.
