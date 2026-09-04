import type { EnteFile } from "ente-media/file";
import { FileType } from "ente-media/file-type";
import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    kv: new Map<string, unknown>(),
    collectionFiles: [] as EnteFile[],
    collectionFilesReadCount: 0,
    collectionFilesReadGate: undefined as Promise<void> | undefined,
    pulledFileIDs: new Set<number>(),
    previewStatusPullCount: 0,
    previewStatusPullGate: undefined as Promise<void> | undefined,
}));

vi.mock("ente-base/app", async (importOriginal) => ({
    ...(await importOriginal<typeof import("ente-base/app")>()),
    isDesktop: true,
}));
vi.mock("ente-base/kv", async (importOriginal) => ({
    ...(await importOriginal<typeof import("ente-base/kv")>()),
    getKV: (key: string) => Promise.resolve(mocks.kv.get(key)),
    getKVB: (key: string) => Promise.resolve(mocks.kv.get(key)),
    getKVN: (key: string) => Promise.resolve(mocks.kv.get(key)),
    setKV: (key: string, value: unknown) => {
        mocks.kv.set(key, value);
        return Promise.resolve();
    },
}));
vi.mock("ente-accounts/services/user", async (importOriginal) => ({
    ...(await importOriginal<typeof import("ente-accounts/services/user")>()),
    ensureLocalUser: () => ({ id: 1 }),
}));
vi.mock("ente-new/photos/services/photos-fdb", async (importOriginal) => ({
    ...(await importOriginal<
        typeof import("ente-new/photos/services/photos-fdb")
    >()),
    savedCollectionFiles: async () => {
        mocks.collectionFilesReadCount++;
        await mocks.collectionFilesReadGate;
        return mocks.collectionFiles;
    },
}));
vi.mock("ente-new/photos/services/trash", async (importOriginal) => ({
    ...(await importOriginal<
        typeof import("ente-new/photos/services/trash")
    >()),
    savedTrashItemFileIDs: () => Promise.resolve(new Set<number>()),
}));
vi.mock("ente-gallery/services/file-data", async (importOriginal) => ({
    ...(await importOriginal<
        typeof import("ente-gallery/services/file-data")
    >()),
    syncUpdatedFileDataFileIDs: async (
        _type: string,
        _lastUpdatedAt: number,
        onPage: (page: {
            fileIDs: Set<number>;
            lastUpdatedAt: number;
        }) => Promise<void>,
    ) => {
        mocks.previewStatusPullCount++;
        await mocks.previewStatusPullGate;
        return onPage({ fileIDs: mocks.pulledFileIDs, lastUpdatedAt: 1 });
    },
}));
vi.mock("ente-utils/promise", async (importOriginal) => ({
    ...(await importOriginal<typeof import("ente-utils/promise")>()),
    wait: () => new Promise<void>(() => undefined),
}));

const {
    hlsGenerationStatusSnapshot,
    initVideoProcessing,
    processedVideoFraction,
    resetVideoState,
    streamCandidateFiles,
    toggleHLSGeneration,
    videoProcessingSyncIfNeeded,
} = await import("ente-gallery/services/video");

const MiB = 1024 * 1024;

const file = (
    id: number,
    overrides: {
        ownerID?: number;
        fileType?: FileType;
        sv?: number;
        fileSize?: number;
        duration?: number;
    } = {},
) =>
    ({
        id,
        ownerID: overrides.ownerID ?? 1,
        metadata: {
            fileType: overrides.fileType ?? FileType.video,
            duration: overrides.duration ?? 30,
        },
        info: { fileSize: overrides.fileSize ?? 10 * MiB },
        ...(overrides.sv == undefined
            ? {}
            : { pubMagicMetadata: { data: { sv: overrides.sv } } }),
    }) as EnteFile;

describe("video streaming percentage", () => {
    afterEach(() => {
        resetVideoState();
        mocks.kv.clear();
        mocks.collectionFiles = [];
        mocks.collectionFilesReadCount = 0;
        mocks.collectionFilesReadGate = undefined;
        mocks.pulledFileIDs = new Set();
        mocks.previewStatusPullCount = 0;
        mocks.previewStatusPullGate = undefined;
    });

    test("calculates the processed fraction using mobile's limits", () => {
        expect(processedVideoFraction(new Set(), [])).toBe(1);
        expect(processedVideoFraction(new Set(), [file(1), file(2)])).toBe(0);
        expect(
            processedVideoFraction(new Set([1, 3]), [
                file(1),
                file(2),
                file(3),
                file(4),
            ]),
        ).toBe(0.5);

        const candidates = [
            file(1),
            file(2, { duration: 61 }),
            file(3, { fileSize: 500 * MiB + 1 }),
        ];
        expect(processedVideoFraction(new Set([2, 3]), candidates)).toBe(2 / 3);
    });

    test("reuses Desktop's backfill population", () => {
        const candidates = streamCandidateFiles(
            [
                file(1),
                file(1),
                file(2, { ownerID: 2 }),
                file(3),
                file(4, { fileType: FileType.image }),
                file(5, { sv: 1 }),
                file(6, { duration: 600 }),
                file(7, { fileSize: 600 * MiB }),
            ],
            new Set([3]),
            1,
        );

        expect(candidates.map(({ id }) => id)).toEqual([1, 6, 7]);
    });

    test("syncs previews before calculating when enabled", async () => {
        mocks.collectionFiles = [file(1)];
        mocks.pulledFileIDs = new Set([1]);
        let releasePreviewStatusPull!: () => void;
        mocks.previewStatusPullGate = new Promise<void>((resolve) => {
            releasePreviewStatusPull = resolve;
        });

        // A normal pull while disabled deliberately skips preview status.
        await videoProcessingSyncIfNeeded();
        const toggle = toggleHLSGeneration();

        await vi.waitFor(() => expect(mocks.previewStatusPullCount).toBe(1));
        expect(hlsGenerationStatusSnapshot()).toEqual({ enabled: true });
        expect(mocks.collectionFilesReadCount).toBe(0);

        releasePreviewStatusPull();
        await toggle;

        await vi.waitFor(() =>
            expect(hlsGenerationStatusSnapshot()).toMatchObject({
                enabled: true,
                processedFraction: 1,
            }),
        );
    });

    test("coalesces overlapping fraction refresh requests", async () => {
        mocks.kv.set("generateHLS", true);
        mocks.collectionFiles = [file(1)];
        let releaseCollectionFilesRead!: () => void;
        mocks.collectionFilesReadGate = new Promise<void>((resolve) => {
            releaseCollectionFilesRead = resolve;
        });

        await initVideoProcessing();
        await initVideoProcessing();
        await initVideoProcessing();

        expect(mocks.collectionFilesReadCount).toBe(1);

        releaseCollectionFilesRead();

        await vi.waitFor(() => {
            expect(mocks.collectionFilesReadCount).toBe(2);
            expect(hlsGenerationStatusSnapshot()).toMatchObject({
                enabled: true,
                processedFraction: 0,
            });
        });
    });
});
