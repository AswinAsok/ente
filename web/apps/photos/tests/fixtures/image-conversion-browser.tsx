// Temporary local verification page; removed after the browser run.
import { renderableImageBlobWeb } from "ente-gallery/services/convert-core";
import { convertImage } from "ente-gallery/services/image-convert";
import { generateThumbnailWeb } from "ente-gallery/services/upload/thumbnail";
import { detectFileTypeInfoFromChunk } from "ente-gallery/utils/detect-type";

const dimensions = async (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    try {
        const img = new Image();
        img.src = url;
        await img.decode();
        return [img.naturalWidth, img.naturalHeight];
    } finally {
        URL.revokeObjectURL(url);
    }
};

async function check(files: FileList | null) {
    const results: unknown[] = [];
    const state = document.getElementById("results")!;
    for (const file of Array.from(files ?? [])) {
        const start = performance.now();
        try {
            let prepared: Blob | undefined;
            const type = await detectFileTypeInfoFromChunk(
                async () =>
                    new Uint8Array(await file.slice(0, 4100).arrayBuffer()),
                file.name,
                async () => {
                    prepared = (
                        await convertImage(file, file.name, "thumbnail")
                    ).blob;
                },
            );
            const thumbnail =
                prepared ??
                new Blob(
                    [
                        (await generateThumbnailWeb(file, type, file.name))
                            .thumbnail,
                    ],
                    { type: "image/jpeg" },
                );
            const thumb = await dimensions(thumbnail);
            const view = await renderableImageBlobWeb(file, file.name);
            const display = await dimensions(view);
            results.push({
                file: file.name,
                status: "passed",
                thumb,
                thumbnailBytes: thumbnail.size,
                display,
                ms: Math.round(performance.now() - start),
            });
        } catch (e) {
            results.push({
                file: file.name,
                status: "failed",
                error: String(e),
                ms: Math.round(performance.now() - start),
            });
        }
        state.textContent = JSON.stringify({ done: false, results });
    }
    state.textContent = JSON.stringify({ done: true, results });
}
export default function Page() {
    return (
        <>
            <input
                type="file"
                multiple
                onChange={(e) => void check(e.currentTarget.files)}
            />
            <pre id="results">ready</pre>
        </>
    );
}
