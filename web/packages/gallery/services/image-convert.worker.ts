import { expose } from "comlink";
import { logUnhandledErrorsAndRejectionsInWorker } from "ente-base/log-web";
import type {
    ImageConversionFormat,
    ImageConversionMode,
} from "ente-media/image-formats";
import { decodeImage, initializeImageDecoder } from "./image-convert-magick";

let initialized: Promise<void> | undefined;

const initialize = async () => {
    // Next.js uses relative asset URLs, and Desktop uses the ente: protocol.
    // Supplying bytes avoids ImageMagick's HTTP-only URL loader in both cases.
    const response = await fetch(
        new URL("@imagemagick/magick-wasm/magick.wasm", import.meta.url),
    );
    if (!response.ok) throw new Error("Could not load the image decoder");
    await initializeImageDecoder(new Uint8Array(await response.arrayBuffer()));
};

export class ImageConvertWorker {
    async convert(
        blob: Blob,
        format: ImageConversionFormat,
        mode: ImageConversionMode,
    ) {
        await (initialized ??= initialize());
        return decodeImage(
            new Uint8Array(await blob.arrayBuffer()),
            format,
            mode,
        );
    }
}

expose(ImageConvertWorker);
logUnhandledErrorsAndRejectionsInWorker();
