import {
    AlphaAction,
    ColorProfile,
    ColorSpace,
    initializeImageMagick,
    MagickColors,
    MagickFormat,
    MagickImage,
    MagickReadSettings,
    Orientation,
    ResourceLimits,
    type IMagickImage,
} from "@imagemagick/magick-wasm";
import { isNamedError, namedError } from "ente-base/error";
import {
    maxImageConversionBytes,
    maxImageConversionPixels,
    maxImageThumbnailBytes,
    maxImageThumbnailDimension,
    type ConvertedImage,
    type ImageConversionFormat,
    type ImageConversionMode,
} from "ente-media/image-formats";

export const initializeImageDecoder = async (wasm: URL | Uint8Array) => {
    await initializeImageMagick(wasm);
    ResourceLimits.memory = 512n * 1024n * 1024n;
    ResourceLimits.disk = 0n;
    // The decoder also counts temporary working images, not just input frames.
    // frameCount below still selects only the first frame / merged PSD image.
    ResourceLimits.listLength = 16n;
    ResourceLimits.width = BigInt(maxImageConversionPixels);
    ResourceLimits.height = BigInt(maxImageConversionPixels);
};

export const checkImageDimensions = (width: number, height: number) => {
    if (
        !Number.isSafeInteger(width) ||
        !Number.isSafeInteger(height) ||
        width <= 0 ||
        height <= 0
    )
        throw namedError("file_type_not_supported", "Invalid image dimensions");
    if (width * height > maxImageConversionPixels)
        throw namedError(
            "image_conversion_limit",
            "Image exceeds the preview pixel limit",
        );
};

export const decodeImage = (
    data: Uint8Array,
    format: ImageConversionFormat,
    mode: ImageConversionMode,
): ConvertedImage => {
    if (data.byteLength > maxImageConversionBytes)
        throw namedError(
            "image_conversion_limit",
            "Image exceeds the preview size limit",
        );

    let image = MagickImage.create();
    try {
        const settings = new MagickReadSettings({
            format: format.decoder as MagickFormat,
            frameIndex: 0,
            frameCount: 1,
        });
        if (format.raw) settings.setDefine("dng:read-thumbnail", "true");
        image.ping(data, settings);
        checkImageDimensions(image.width, image.height);
        const orientation = image.orientation;
        const rotated = [5, 6, 7, 8].includes(orientation);
        const sourceWidth = rotated ? image.height : image.width;
        const sourceHeight = rotated ? image.width : image.height;

        const previewProfile = format.raw
            ? image.getProfile("dng:thumbnail")?.data
            : undefined;
        const preview = previewProfile && Uint8Array.from(previewProfile);
        // Keep the probe's RAW metadata from leaking into an embedded JPEG.
        image.dispose();
        image = MagickImage.create();
        let usedPreview = false;
        if (preview?.length) {
            try {
                image.read(preview);
                checkImageDimensions(image.width, image.height);
                // Some previews are already rotated but retain the RAW EXIF.
                const previewIsPortrait = image.height > image.width;
                const sourceIsPortrait = sourceHeight > sourceWidth;
                const alreadyRotated =
                    rotated &&
                    image.width != image.height &&
                    previewIsPortrait == sourceIsPortrait;
                if (alreadyRotated) image.orientation = Orientation.TopLeft;
                else if (!image.orientation) image.orientation = orientation;
                usedPreview = true;
            } catch (e) {
                if (e instanceof WebAssembly.RuntimeError) throw e;
                // A missing or damaged embedded preview can still have valid RAW pixels.
            }
        }
        if (!usedPreview) image.read(data, settings);
        checkImageDimensions(image.width, image.height);
        image.autoOrient();
        if (image.getColorProfile())
            image.transformColorSpace(new ColorProfile(sRGBProfile));
        else image.colorSpace = ColorSpace.sRGB;

        const blob = mode == "thumbnail" ? thumbnail(image) : viewImage(image);
        return { blob, sourceWidth, sourceHeight };
    } catch (e) {
        if (
            isNamedError(e, "image_conversion_limit") ||
            e instanceof WebAssembly.RuntimeError
        )
            throw e;
        throw namedError(
            "file_type_not_supported",
            `Could not decode ${format.decoder} image`,
            { cause: e },
        );
    } finally {
        image.dispose();
    }
};

const writeImage = (image: IMagickImage, format: MagickFormat, mime: string) =>
    image.write(
        format,
        (bytes) => new Blob([Uint8Array.from(bytes)], { type: mime }),
    );

const thumbnail = (image: IMagickImage) => {
    const scale = Math.min(
        1,
        maxImageThumbnailDimension / Math.max(image.width, image.height),
    );
    if (scale < 1)
        image.resize(
            Math.max(1, Math.round(image.width * scale)),
            Math.max(1, Math.round(image.height * scale)),
        );
    image.backgroundColor = MagickColors.White;
    image.alpha(AlphaAction.Remove);
    image.strip();
    image.quality = 70;
    for (;;) {
        const blob = writeImage(image, MagickFormat.Jpeg, "image/jpeg");
        if (blob.size <= maxImageThumbnailBytes) return blob;
        if (image.quality > 40) image.quality -= 10;
        else
            image.resize(
                Math.max(1, Math.floor(image.width / 2)),
                Math.max(1, Math.floor(image.height / 2)),
            );
    }
};

const viewImage = (image: IMagickImage) => {
    image.quality = 90;
    image.strip();
    return image.hasAlpha
        ? writeImage(image, MagickFormat.Png, "image/png")
        : writeImage(image, MagickFormat.Jpeg, "image/jpeg");
};

// CC0 sRGB-v4 profile from https://github.com/saucecontrol/Compact-ICC-Profiles.
// Transform tagged pixels before stripping profiles from browser previews.
const sRGBProfile = Uint8Array.from(
    atob(
        "AAAB4GxjbXMEIAAAbW50clJHQiBYWVogB+IAAwAUAAkADgAdYWNzcE1TRlQAAAAAc2F3c2N0cmwAAAAAAAAAAAAAAAAAAPbWAAEAAAAA0y1oYW5keem/Vlo+AbaDI4VVRvdPqgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKZGVzYwAAAPwAAAAkY3BydAAAASAAAAAid3RwdAAAAUQAAAAUY2hhZAAAAVgAAAAsclhZWgAAAYQAAAAUZ1hZWgAAAZgAAAAUYlhZWgAAAawAAAAUclRSQwAAAcAAAAAgZ1RSQwAAAcAAAAAgYlRSQwAAAcAAAAAgbWx1YwAAAAAAAAABAAAADGVuVVMAAAAIAAAAHABzAFIARwBCbWx1YwAAAAAAAAABAAAADGVuVVMAAAAGAAAAHABDAEMAMAAAWFlaIAAAAAAAAPbWAAEAAAAA0y1zZjMyAAAAAAABDD8AAAXd///zJgAAB5AAAP2S///7of///aIAAAPcAADAcVhZWiAAAAAAAABvoAAAOPIAAAOPWFlaIAAAAAAAAGKWAAC3iQAAGNpYWVogAAAAAAAAJKAAAA+FAAC2xHBhcmEAAAAAAAMAAAACZmkAAPKnAAANWQAAE9AAAApb",
    ),
    (c) => c.charCodeAt(0),
);
