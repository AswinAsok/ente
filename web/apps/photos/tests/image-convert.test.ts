import {
    ImageMagick,
    MagickFormat,
    MagickImage,
    MagickImageCollection,
    Orientation,
} from "@imagemagick/magick-wasm";
import {
    checkImageDimensions,
    decodeImage,
    initializeImageDecoder,
} from "ente-gallery/services/image-convert-magick";
import { detectFileTypeInfoFromChunk } from "ente-gallery/utils/detect-type";
import { imageConversionFormat } from "ente-media/image-formats";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { beforeAll, describe, expect, test, vi } from "vitest";
import samples from "./fixtures/image-samples.json";

const require = createRequire(import.meta.url);
beforeAll(async () => {
    await initializeImageDecoder(
        readFileSync(require.resolve("@imagemagick/magick-wasm/magick.wasm")),
    );
});

const ppm = new TextEncoder().encode("P3\n2 1\n255\n255 0 0 0 255 0\n");
const hash = (data: Uint8Array) =>
    createHash("sha256").update(data).digest("hex");
const pixels = async (blob: Blob) =>
    ImageMagick.read(new Uint8Array(await blob.arrayBuffer()), (image) => ({
        width: image.width,
        height: image.height,
        alpha: image.hasAlpha,
        format: image.format,
    }));

test("validates a signatureless image and never changes its bytes", async () => {
    const original = hash(ppm);
    let thumbnail: Blob | undefined;
    const validate = vi.fn(() => {
        thumbnail = decodeImage(
            ppm,
            imageConversionFormat("test.ppm")!,
            "thumbnail",
        ).blob;
        return Promise.resolve();
    });
    const detected = await detectFileTypeInfoFromChunk(
        () => Promise.resolve(ppm),
        "test.ppm",
        validate,
    );
    expect(detected.extension).toBe("ppm");
    expect(validate).toHaveBeenCalledOnce();
    expect(await pixels(thumbnail!)).toMatchObject({
        width: 2,
        height: 1,
        format: MagickFormat.Jpeg,
    });
    expect(hash(ppm)).toBe(original);
});

test("does not accept arbitrary bytes just because the extension is supported", async () => {
    const bytes = new TextEncoder().encode("This is not an image");
    await expect(
        detectFileTypeInfoFromChunk(
            () => Promise.resolve(bytes),
            "test.ppm",
            () =>
                Promise.resolve(
                    void decodeImage(
                        bytes,
                        imageConversionFormat("test.ppm")!,
                        "thumbnail",
                    ),
                ),
        ),
    ).rejects.toHaveProperty("name", "file_type_not_supported");
});

test("recognized JPEG bytes win over a misleading extension", async () => {
    const jpeg = new Uint8Array(
        await decodeImage(
            ppm,
            imageConversionFormat("test.ppm")!,
            "thumbnail",
        ).blob.arrayBuffer(),
    );
    for (const name of ["test.ppm", "test.tga", "test.nef"]) {
        const validate = vi.fn();
        const detected = await detectFileTypeInfoFromChunk(
            () => Promise.resolve(jpeg),
            name,
            validate,
        );
        expect(detected.extension).toBe("jpg");
        expect(validate).not.toHaveBeenCalled();
        expect(imageConversionFormat(name, detected.extension)).toBeUndefined();
    }
});

test("conversion eligibility stays separate from the filename object prototype", () => {
    expect(imageConversionFormat("test.PPM")?.decoder).toBe("PPM");
    expect(imageConversionFormat("test.constructor")).toBeUndefined();
    expect(imageConversionFormat("test.svg")).toBeUndefined();
    expect(imageConversionFormat("test.pes")).toBeUndefined();
});

test("rejects invalid or oversized dimensions before decoding pixels", () => {
    expect(() => checkImageDimensions(0, 1)).toThrow();
    expect(() => checkImageDimensions(10_001, 10_000)).toThrow();
    expect(() => checkImageDimensions(10_000, 10_000)).not.toThrow();
    const oversized = new TextEncoder().encode("P3\n10001 10000\n255\n0 0 0\n");
    expect(() =>
        decodeImage(oversized, imageConversionFormat("test.ppm")!, "thumbnail"),
    ).toThrow();
});

test("preserves transparency for viewing and flattens it for JPEG thumbnails", async () => {
    const xpm = new TextEncoder().encode(
        '/* XPM */\nstatic char *image[] = {\n"2 1 2 1",\n". c None",\n"X c #ff0000",\n".X"};\n',
    );
    const format = imageConversionFormat("test.xpm")!;
    expect(await pixels(decodeImage(xpm, format, "view").blob)).toMatchObject({
        width: 2,
        height: 1,
        alpha: true,
        format: MagickFormat.Png,
    });
    expect(
        await pixels(decodeImage(xpm, format, "thumbnail").blob),
    ).toMatchObject({
        width: 2,
        height: 1,
        alpha: false,
        format: MagickFormat.Jpeg,
    });
});

test("applies orientation once and reads only the first TIFF page", async () => {
    const first = MagickImage.create();
    const second = MagickImage.create();
    const images = MagickImageCollection.create();
    try {
        first.read(ppm);
        first.orientation = Orientation.RightTop;
        second.read(new TextEncoder().encode("P3\n1 1\n255\n0 0 255\n"));
        images.push(first, second);
        const tiff = images.write(MagickFormat.Tiff, (bytes) =>
            Uint8Array.from(bytes),
        );
        const format = imageConversionFormat("two-pages.tiff")!;
        for (const mode of ["thumbnail", "view"] as const) {
            const result = decodeImage(tiff, format, mode);
            expect(result.sourceWidth).toBe(1);
            expect(result.sourceHeight).toBe(2);
            expect(await pixels(result.blob)).toMatchObject({
                width: 1,
                height: 2,
            });
        }
    } finally {
        images.dispose();
    }
});

test("keeps noisy thumbnails within both dimension and byte limits", async () => {
    const header = new TextEncoder().encode("P6\n720 720\n255\n");
    const noisy = new Uint8Array(header.length + 720 * 720 * 3);
    noisy.set(header);
    let seed = 12345;
    for (let i = header.length; i < noisy.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
        noisy[i] = seed >>> 24;
    }
    const result = decodeImage(
        noisy,
        imageConversionFormat("noise.ppm")!,
        "thumbnail",
    );
    expect(result.blob.size).toBeLessThanOrEqual(100 * 1024);
    const size = await pixels(result.blob);
    expect(size.width).toBeLessThanOrEqual(720);
    expect(size.height).toBeLessThanOrEqual(720);
});

// Large external fixtures are opt-in; never commit the 237 MB download set.
const sampleDirectory = process.env.ENTE_IMAGE_SAMPLES_DIR;
describe.skipIf(!sampleDirectory)("downloaded image samples", () => {
    for (const sample of samples) {
        test(
            sample.filename,
            async () => {
                const bytes = new Uint8Array(
                    readFileSync(join(sampleDirectory!, sample.filename)),
                );
                expect(hash(bytes)).toBe(sample.sha256);
                if (sample.expected == "unchanged") {
                    const detected = await detectFileTypeInfoFromChunk(
                        () => Promise.resolve(bytes.slice(0, 4100)),
                        sample.filename,
                    );
                    expect(
                        imageConversionFormat(
                            sample.filename,
                            detected.extension,
                        ),
                    ).toBeUndefined();
                } else if (sample.expected == "unsupported") {
                    await expect(
                        detectFileTypeInfoFromChunk(
                            () => Promise.resolve(bytes.slice(0, 4100)),
                            sample.filename,
                            () =>
                                Promise.resolve(
                                    void decodeImage(
                                        bytes,
                                        imageConversionFormat(sample.filename)!,
                                        "thumbnail",
                                    ),
                                ),
                        ),
                    ).rejects.toHaveProperty("name", "file_type_not_supported");
                } else if (sample.extension != "xwd") {
                    const format = imageConversionFormat(sample.filename)!;
                    await detectFileTypeInfoFromChunk(
                        () => Promise.resolve(bytes.slice(0, 4100)),
                        sample.filename,
                        () =>
                            Promise.resolve(
                                void decodeImage(bytes, format, "thumbnail"),
                            ),
                    );
                    const thumbnail = decodeImage(bytes, format, "thumbnail");
                    expect(thumbnail.blob.size).toBeLessThanOrEqual(100 * 1024);
                    const dimensions = await pixels(thumbnail.blob);
                    expect(
                        Math.max(dimensions.width, dimensions.height),
                    ).toBeLessThanOrEqual(720);
                    expect(dimensions.format).toBe(MagickFormat.Jpeg);
                    const view = decodeImage(bytes, format, "view");
                    const displayed = await pixels(view.blob);
                    expect([displayed.width, displayed.height]).toEqual(
                        sample.previewDimensions,
                    );
                    if (sample.filename == "sample1.nef")
                        expect(displayed).toMatchObject({
                            width: 2832,
                            height: 4256,
                        });
                    if (sample.filename.startsWith("RAW_")) {
                        // Omitting preview extraction exercises the full RAW decode
                        // used when a camera has no usable embedded JPEG.
                        const full = decodeImage(
                            bytes,
                            { ...format, raw: false },
                            "thumbnail",
                        );
                        expect((await pixels(full.blob)).width).toBeGreaterThan(
                            0,
                        );
                    }
                }
                expect(hash(bytes)).toBe(sample.sha256);
            },
            60_000,
        );
    }
});
