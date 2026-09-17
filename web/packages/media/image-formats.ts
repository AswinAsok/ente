import { lowercaseExtension } from "ente-base/file-name";

const rawFormats = [
    "CR2",
    "CR3",
    "DNG",
    "ORF",
    "RW2",
    "NEF",
    "RAF",
    "ARW",
] as const;
export type RAWImageFormat = (typeof rawFormats)[number];

/** Select a supported RAW decoder, preserving recognized non-RAW signatures. */
export const rawImageFormat = (
    fileName: string,
    detectedExtension?: string,
) => {
    // Some RAW files (notably NEF and ARW) share TIFF's magic signature.
    const extension =
        detectedExtension && detectedExtension != "tif"
            ? detectedExtension
            : (lowercaseExtension(fileName) ?? "");
    return rawFormats.find((format) => format == extension.toUpperCase());
};

export const maxImageConversionBytes = 100 * 1024 * 1024;
export const maxImageConversionPixels = 100_000_000;
export const imageConversionTimeout = 60_000;
export const maxImageThumbnailDimension = 720;
export const maxImageThumbnailBytes = 100 * 1024;

export type ImageConversionMode = "thumbnail" | "view";
