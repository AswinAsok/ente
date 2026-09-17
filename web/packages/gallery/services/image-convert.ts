import { namedError } from "ente-base/error";
import { ComlinkWorker } from "ente-base/worker/comlink-worker";
import {
    imageConversionFormat,
    imageConversionTimeout,
    maxImageConversionBytes,
    maxImageConversionPixels,
    type ConvertedImage,
    type ImageConversionMode,
} from "ente-media/image-formats";
import { PromiseQueue, withTimeout } from "ente-utils/promise";
import type { ImageConvertWorker } from "./image-convert.worker";

const queue = new PromiseQueue<ConvertedImage>();
let worker: ComlinkWorker<typeof ImageConvertWorker> | undefined;

export const convertImage = (
    blob: Blob,
    fileName: string,
    mode: ImageConversionMode,
    abortIfCancelled?: () => void,
): Promise<ConvertedImage> =>
    queue.add(async () => {
        abortIfCancelled?.();
        let format = imageConversionFormat(fileName);
        if (!format)
            throw namedError(
                "file_type_not_supported",
                "No image decoder for this format",
            );
        if (blob.size > maxImageConversionBytes)
            throw namedError(
                "image_conversion_limit",
                "Image exceeds the preview size limit",
            );

        if (format.decoder == "XWD") {
            const header = new DataView(await blob.slice(0, 100).arrayBuffer());
            if (header.byteLength < 100 || header.getUint32(4) != 7)
                throw namedError(
                    "file_type_not_supported",
                    "Invalid XWD header",
                );
            const width = header.getUint32(16),
                height = header.getUint32(20);
            if (!width || !height || width * height > maxImageConversionPixels)
                throw namedError(
                    "image_conversion_limit",
                    "XWD exceeds the preview pixel limit",
                );
            const { ffmpegExecWeb } = await import("./ffmpeg/web");
            const {
                ffmpegPathPlaceholder,
                inputPathPlaceholder,
                outputPathPlaceholder,
            } = await import("./ffmpeg/constants");
            const png = await ffmpegExecWeb(
                [
                    ffmpegPathPlaceholder,
                    "-f",
                    "image2pipe",
                    "-c:v",
                    "xwd",
                    "-i",
                    inputPathPlaceholder,
                    "-frames:v",
                    "1",
                    outputPathPlaceholder,
                ],
                blob,
                "png",
                imageConversionTimeout,
                abortIfCancelled,
            );
            blob = new Blob([png], { type: "image/png" });
            format = { decoder: "PNG", mimeType: "image/png" };
        }

        abortIfCancelled?.();
        const current = (worker ??= new ComlinkWorker<
            typeof ImageConvertWorker
        >(
            "image-convert-worker",
            new Worker(new URL("image-convert.worker.ts", import.meta.url)),
        ));
        let cancelTimer: ReturnType<typeof setInterval> | undefined;
        let onError: (event: ErrorEvent) => void;
        const interrupted = new Promise<never>((_, reject) => {
            onError = (event) =>
                reject(
                    new Error(event.message || "Image decoder worker failed"),
                );
            current.worker.addEventListener("error", onError);
            if (abortIfCancelled)
                cancelTimer = setInterval(() => {
                    try {
                        abortIfCancelled();
                    } catch (e) {
                        reject(e instanceof Error ? e : new Error(String(e)));
                    }
                }, 100);
        });
        try {
            return await withTimeout(
                Promise.race([
                    current.remote.then((remote) =>
                        remote.convert(blob, format, mode),
                    ),
                    interrupted,
                ]),
                imageConversionTimeout,
            );
        } catch (e) {
            current.terminate();
            worker = undefined;
            throw e;
        } finally {
            clearInterval(cancelTimer);
            current.worker.removeEventListener("error", onError!);
        }
    });
