import {
    ImageMagick,
    MagickFormat,
    MagickImage,
} from "@imagemagick/magick-wasm";
import {
    checkImageDimensions,
    decodeImage,
    initializeImageDecoder,
} from "ente-gallery/services/image-convert-magick";
import { detectFileTypeInfoFromChunk } from "ente-gallery/utils/detect-type";
import { rawImageFormat } from "ente-media/image-formats";
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

const hash = (data: Uint8Array) =>
    createHash("sha256").update(data).digest("hex");
const dimensions = async (blob: Blob) =>
    ImageMagick.read(new Uint8Array(await blob.arrayBuffer()), (image) => {
        expect(image.format).toBe(MagickFormat.Jpeg);
        return [image.width, image.height];
    });

test("limits new conversion support to the eight requested RAW extensions", () => {
    for (const extension of [
        "cr2",
        "cr3",
        "dng",
        "orf",
        "rw2",
        "nef",
        "raf",
        "arw",
    ])
        expect(rawImageFormat(`photo.${extension.toUpperCase()}`)).toBe(
            extension.toUpperCase(),
        );
    for (const extension of [
        "erf",
        "nrw",
        "pef",
        "tiff",
        "jp2",
        "psd",
        "ppm",
        "xwd",
        "svg",
        "constructor",
    ])
        expect(rawImageFormat(`photo.${extension}`)).toBeUndefined();
    expect(rawImageFormat("photo.nef", "tif")).toBe("NEF");
    expect(rawImageFormat("photo.jpg", "cr2")).toBe("CR2");
});

test("recognized JPEG content wins over a misleading RAW extension", async () => {
    const jpeg = ImageMagick.read(
        new TextEncoder().encode("P3\n1 1\n255\n255 0 0\n"),
        (image) =>
            image.write(MagickFormat.Jpeg, (bytes) => Uint8Array.from(bytes)),
    );
    const detected = await detectFileTypeInfoFromChunk(
        () => Promise.resolve(jpeg),
        "photo.nef",
    );
    expect(detected.extension).toBe("jpg");
    expect(rawImageFormat("photo.nef", detected.extension)).toBeUndefined();
});

test("rejects corrupt RAW data and invalid or oversized dimensions", () => {
    expect(() => decodeImage(new Uint8Array(100), "CR2", "thumbnail")).toThrow(
        expect.objectContaining({ name: "file_type_not_supported" }),
    );
    expect(() => checkImageDimensions(0, 1)).toThrow();
    expect(() => checkImageDimensions(10_001, 10_000)).toThrow();
    expect(() => checkImageDimensions(10_000, 10_000)).not.toThrow();
});

// External RAW fixtures are opt-in; never commit the large originals.
const sampleDirectory = process.env.ENTE_IMAGE_SAMPLES_DIR;
describe.skipIf(!sampleDirectory)("RAW samples", () => {
    for (const sample of samples) {
        test(
            sample.filename,
            async () => {
                const bytes = new Uint8Array(
                    readFileSync(join(sampleDirectory!, sample.filename)),
                );
                expect(hash(bytes)).toBe(sample.sha256);
                const detected = await detectFileTypeInfoFromChunk(
                    () => Promise.resolve(bytes.slice(0, 4100)),
                    sample.filename,
                );
                const format = rawImageFormat(
                    sample.filename,
                    detected.extension,
                );
                expect(format).toBeDefined();
                const thumbnail = decodeImage(bytes, format!, "thumbnail");
                expect(thumbnail.size).toBeLessThanOrEqual(100 * 1024);
                expect(
                    Math.max(...(await dimensions(thumbnail))),
                ).toBeLessThanOrEqual(720);
                expect(
                    await dimensions(decodeImage(bytes, format!, "view")),
                ).toEqual(sample.previewDimensions);
                expect(hash(bytes)).toBe(sample.sha256);
            },
            60_000,
        );
    }

    test.each([null, new Uint8Array([0, 1, 2])])(
        "decodes full RAW pixels when the embedded preview is missing or damaged (%s)",
        async (preview) => {
            const bytes = new Uint8Array(
                readFileSync(join(sampleDirectory!, "RAW_CANON_1DSM2.CR2")),
            );
            const createImage = MagickImage.create.bind(MagickImage);
            const create = vi
                .spyOn(MagickImage, "create")
                .mockImplementationOnce(() => {
                    const image = createImage();
                    vi.spyOn(image, "getProfile").mockReturnValue(
                        preview
                            ? ({ data: preview } as ReturnType<
                                  typeof image.getProfile
                              >)
                            : null,
                    );
                    return image;
                });
            try {
                expect(
                    await dimensions(decodeImage(bytes, "CR2", "view")),
                ).toEqual([3335, 5010]);
            } finally {
                create.mockRestore();
            }
        },
        60_000,
    );
});
