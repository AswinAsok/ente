import { namedError } from "ente-base/error";
import { ComlinkWorker } from "ente-base/worker/comlink-worker";
import {
    imageConversionTimeout,
    maxImageConversionBytes,
    type ImageConversionMode,
    type RAWImageFormat,
} from "ente-media/image-formats";
import { PromiseQueue, withTimeout } from "ente-utils/promise";
import type { ImageConvertWorker } from "./image-convert.worker";

const queue = new PromiseQueue<Blob>();
let worker: ComlinkWorker<typeof ImageConvertWorker> | undefined;

export const convertImage = (
    blob: Blob,
    format: RAWImageFormat,
    mode: ImageConversionMode,
    abortIfCancelled?: () => void,
): Promise<Blob> =>
    queue.add(async () => {
        abortIfCancelled?.();
        if (blob.size > maxImageConversionBytes)
            throw namedError(
                "image_conversion_limit",
                "Image exceeds the preview size limit",
            );

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
