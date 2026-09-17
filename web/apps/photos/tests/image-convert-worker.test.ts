import { afterEach, beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    convert: vi.fn(),
    workers: [] as (Worker & { terminate: ReturnType<typeof vi.fn> })[],
}));
vi.mock("ente-base/worker/comlink-worker", () => ({
    ComlinkWorker: class {
        remote = Promise.resolve({ convert: mocks.convert });
        constructor(
            _name: string,
            public worker: Worker & { terminate: ReturnType<typeof vi.fn> },
        ) {
            mocks.workers.push(worker);
        }
        terminate() {
            this.worker.terminate();
        }
    },
}));

beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    mocks.workers.length = 0;
    mocks.convert.mockReset().mockResolvedValue(new Blob());
    vi.stubGlobal(
        "Worker",
        class extends EventTarget {
            terminate = vi.fn();
        },
    );
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

test("loads lazily and serializes concurrent conversions", async () => {
    const { convertImage } =
        await import("ente-gallery/services/image-convert");
    expect(mocks.workers).toHaveLength(0);
    let finish!: (value: unknown) => void;
    mocks.convert.mockImplementationOnce(
        () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
    );
    const first = convertImage(new Blob(), "CR2", "thumbnail");
    const second = convertImage(new Blob(), "NEF", "view");
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.convert).toHaveBeenCalledOnce();
    finish(new Blob());
    await Promise.all([first, second]);
    expect(mocks.convert).toHaveBeenCalledTimes(2);
    expect(mocks.workers).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
});

test.each(["timeout", "crash", "cancel", "decode error"])(
    "replaces the worker after %s and continues the queue",
    async (failure) => {
        const { convertImage } =
            await import("ente-gallery/services/image-convert");
        let cancelled = false;
        const abort = () => {
            if (cancelled) throw new Error("cancelled");
        };
        mocks.convert.mockImplementationOnce(() =>
            failure == "decode error"
                ? Promise.reject(new Error("decode error"))
                : new Promise(() => {
                      /* Simulate a stalled decoder. */
                  }),
        );
        const first = convertImage(new Blob(), "CR2", "thumbnail", abort);
        const rejected = expect(first).rejects.toThrow();
        const next = convertImage(new Blob(), "NEF", "view");
        await vi.advanceTimersByTimeAsync(0);
        if (failure == "timeout") await vi.advanceTimersByTimeAsync(60_000);
        else if (failure == "cancel") {
            cancelled = true;
            await vi.advanceTimersByTimeAsync(100);
        } else if (failure == "crash")
            mocks.workers[0]!.dispatchEvent(
                Object.assign(new Event("error"), { message: "worker died" }),
            );
        await rejected;
        await next;
        expect(mocks.workers).toHaveLength(2);
        expect(mocks.workers[0]!.terminate).toHaveBeenCalledOnce();
        expect(vi.getTimerCount()).toBe(0);
    },
);

test("rejects a cancelled queued job before starting its decoder", async () => {
    const { convertImage } =
        await import("ente-gallery/services/image-convert");
    await expect(
        convertImage(new Blob(), "CR2", "thumbnail", () => {
            throw new Error("cancelled");
        }),
    ).rejects.toThrow("cancelled");
    expect(mocks.workers).toHaveLength(0);
});

test("rejects oversized input before creating a worker", async () => {
    const { convertImage } =
        await import("ente-gallery/services/image-convert");
    await expect(
        convertImage(
            { size: 100 * 1024 * 1024 + 1 } as Blob,
            "CR2",
            "thumbnail",
        ),
    ).rejects.toHaveProperty("name", "image_conversion_limit");
    expect(mocks.workers).toHaveLength(0);
});
