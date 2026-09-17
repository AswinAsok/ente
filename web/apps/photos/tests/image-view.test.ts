import { renderableImageBlobWeb } from "ente-gallery/services/convert-core";
import { beforeEach, expect, test, vi } from "vitest";

const convertImage = vi.hoisted(() => vi.fn());
vi.mock("ente-gallery/services/image-convert", () => ({ convertImage }));
vi.mock("ente-base/log", () => ({
    logToDisk: vi.fn(),
    default: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
beforeEach(() => {
    convertImage.mockReset();
});

test("shares converted viewing without replacing the original blob", async () => {
    const original = new Blob(["P3\n1 1\n255\n255 0 0\n"]);
    const preview = new Blob(["preview"], { type: "image/jpeg" });
    convertImage.mockResolvedValue(preview);
    const native = vi.fn();
    expect(
        await renderableImageBlobWeb(original, "sample.orf", {
            convertToJPEG: native,
        }),
    ).toBe(preview);
    expect(convertImage).toHaveBeenCalledWith(original, "ORF", "view");
    expect(native).not.toHaveBeenCalled();
    expect(await original.text()).toBe("P3\n1 1\n255\n255 0 0\n");
});

test("retains Desktop native conversion when the browser decoder fails", async () => {
    const original = new Blob(["unreadable by browser decoder"]);
    const preview = new Blob(["native preview"]);
    convertImage.mockRejectedValue(new Error("decoder limit"));
    const native = vi.fn().mockResolvedValue(preview);
    expect(
        await renderableImageBlobWeb(original, "sample.orf", {
            convertToJPEG: native,
        }),
    ).toBe(preview);
    expect(native).toHaveBeenCalledWith(original);
});

test("keeps the existing viewing fallback when both decoders fail", async () => {
    const original = new Blob(["unreadable"]);
    const nativeError = new Error("native decode failed");
    convertImage.mockRejectedValue(new Error("browser decode failed"));
    const onError = vi.fn();
    expect(
        await renderableImageBlobWeb(original, "sample.orf", {
            convertToJPEG: vi.fn().mockRejectedValue(nativeError),
            onConvertToJPEGError: onError,
        }),
    ).toBe(original);
    expect(onError).toHaveBeenCalledWith(nativeError);
});
