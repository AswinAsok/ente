import { afterEach, beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ load: vi.fn(), terminate: vi.fn() }));
vi.mock("@ffmpeg/ffmpeg", () => ({
    FFFSType: { WORKERFS: "WORKERFS" },
    FFmpeg: class {
        load = mocks.load;
        terminate = mocks.terminate;
        createDir = vi.fn().mockResolvedValue(undefined);
        mount = vi.fn().mockResolvedValue(undefined);
        exec = vi.fn().mockResolvedValue(0);
        readFile = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
        deleteFile = vi.fn().mockResolvedValue(undefined);
        unmount = vi.fn().mockResolvedValue(undefined);
        deleteDir = vi.fn().mockResolvedValue(undefined);
    },
}));
vi.mock("ente-base/log", () => ({
    default: { debug: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    mocks.load.mockReset().mockResolvedValue(true);
    mocks.terminate.mockReset();
});
afterEach(() => vi.useRealTimers());

test.each(["timeout", "cancel"])(
    "recovers from %s while FFmpeg is loading",
    async (failure) => {
        const { ffmpegExecWeb } =
            await import("ente-gallery/services/ffmpeg/web");
        let rejectLoad!: (error: Error) => void;
        mocks.load.mockImplementationOnce(
            () =>
                new Promise((_, reject) => {
                    rejectLoad = reject;
                }),
        );
        let cancelled = false;
        const first = ffmpegExecWeb([], new Blob(), "png", 60_000, () => {
            if (cancelled) throw new Error("cancelled");
        });
        const rejected = expect(first).rejects.toThrow();
        const next = ffmpegExecWeb([], new Blob(), "png", 60_000);
        if (failure == "cancel") cancelled = true;
        await vi.advanceTimersByTimeAsync(failure == "cancel" ? 100 : 60_000);
        await rejected;
        await expect(next).resolves.toEqual(new Uint8Array([1, 2, 3]));
        expect(mocks.terminate).toHaveBeenCalledOnce();
        // A late failure from the old loader must not terminate its replacement.
        rejectLoad(new Error("terminated"));
        await vi.advanceTimersByTimeAsync(0);
        expect(mocks.terminate).toHaveBeenCalledOnce();
        expect(vi.getTimerCount()).toBe(0);
    },
);
