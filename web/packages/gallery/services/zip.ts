import log from "ente-base/log";
import { type Electron } from "ente-base/types/ipc";
import { downloadManager } from "ente-gallery/services/download";
import {
    clampConcurrency,
    getStreamZipConcurrency,
    getStreamZipWriteQueueLimit,
    STREAM_ZIP_CONCURRENCY_REFRESH_MS,
} from "ente-gallery/services/zip-concurrency";
import { writeStream } from "ente-gallery/utils/native-stream";
import type { EnteFile } from "ente-media/file";
import { fileFileName } from "ente-media/file-metadata";
import { FileType } from "ente-media/file-type";
import { decodeLivePhoto } from "ente-media/live-photo";
import { wait } from "ente-utils/promise";
import { Zip, ZipPassThrough } from "fflate";

/**
 * Create a sanitized ZIP filename from a title.
 *
 * Sanitizes the title by replacing invalid filesystem characters
 * (\ / : * ? " < > |) with underscores, trims whitespace, strips any existing
 * .zip extension, defaults to "ente-download" if empty, optionally appends a
 * part number suffix, and adds the .zip extension.
 *
 * @param title The title to use as the base filename.
 * @param part Optional part number for multi-part ZIPs (e.g., "photos-part2.zip").
 */
export const createZipFileName = (title: string, part?: number) => {
    const base = (
        title.replace(/[\\/:*?"<>|]/g, "_").trim() || "ente-download"
    ).replace(/\.zip$/i, "");
    return part ? `${base}-part${part}.zip` : `${base}.zip`;
};

/**
 * Handle for managing a writable stream during ZIP creation.
 * Abstracts writable stream implementations (browser FS API or native).
 */
export interface WritableStreamHandle {
    /** Writable stream accepting Uint8Array chunks. */
    stream: WritableStream<Uint8Array>;
    /** Finalize the file. Must be called on success. */
    close: () => Promise<void>;
    /** Abort and clean up. Call on error. */
    abort: () => void;
}

// MITM helper page required by StreamSaver
const STREAM_SAVER_MITM_URL = "/streamsaver/mitm.html";

/**
 * Get a writable stream for ZIP file using StreamSaver.
 * Returns undefined if streaming is unavailable in the environment.
 */
export const getWritableStreamForZip = async (
    fileName: string,
): Promise<WritableStreamHandle | undefined> => {
    // To create a writable stream, the browser, WritableStream API,
    // and service workers are required. Return undefined if any
    // of them are unavailable.
    if (
        typeof window === "undefined" ||
        typeof WritableStream === "undefined" ||
        !("serviceWorker" in navigator)
    )
        return undefined;

    try {
        const streamSaver = (await import("streamsaver")).default as {
            createWriteStream: (name: string) => WritableStream<Uint8Array>;
            mitm?: string;
            WritableStream?: typeof WritableStream;
            supportsTransferable?: boolean;
        };

        streamSaver.mitm = streamSaver.mitm || STREAM_SAVER_MITM_URL;
        streamSaver.WritableStream =
            streamSaver.WritableStream ?? WritableStream;

        const fileStream = streamSaver.createWriteStream(fileName);
        const writer = fileStream.getWriter();
        let closed = false;

        const wrappedStream = new WritableStream<Uint8Array>({
            write: (chunk) => writer.write(chunk),
            close: async () => {
                if (closed) return;
                closed = true;
                await writer.close();
            },
            abort: async () => {
                if (closed) return;
                closed = true;
                await writer.abort();
            },
        });

        return {
            stream: wrappedStream,
            close: async () => {
                if (closed) return;
                closed = true;
                await writer.close();
            },
            abort: () => {
                if (closed) return;
                closed = true;
                void writer.abort().catch(() => undefined);
            },
        };
    } catch (e) {
        log.warn("StreamSaver unavailable for ZIP streaming", e);
        return undefined;
    }
};

/** Options for {@link streamFilesToZip}. */
export interface StreamingZipOptions {
    /** Files to add (processed in order, live photos expanded to image+video). */
    files: EnteFile[];
    /** Title for ZIP filename. */
    title: string;
    /** AbortSignal to cancel the operation. */
    signal: AbortSignal;
    /** Optional pre-configured writable (for desktop native writes). */
    writable?: WritableStreamHandle;
    /** Called when a file is successfully added. */
    onFileSuccess: (file: EnteFile, entryCount: number) => void;
    /** Called when a file fails (after retries exhausted). */
    onFileFailure: (file: EnteFile, error: unknown) => void;
}

/** Result: "success", "cancelled", "error", or "unavailable" (no streaming support). */
export type StreamingZipResult =
    | "success"
    | "cancelled"
    | "error"
    | "unavailable";

/** Maximum retry attempts for failed file downloads. */
const STREAM_ZIP_MAX_RETRIES = 3;
/** Base retry delay (multiplied by attempt number for backoff). */
const STREAM_ZIP_RETRY_DELAY_MS = 400;

/**
 * Create a writable stream for desktop app using native filesystem via Electron.
 * Uses TransformStream to bridge ZIP writes to native file streaming.
 */
export const createNativeZipWritable = (
    electron: Electron,
    filePath: string,
): WritableStreamHandle => {
    const transform = new TransformStream<Uint8Array, Uint8Array>();
    const writer = transform.writable.getWriter();

    // Track if native write stream has failed so we can fail fast on subsequent writes
    let streamError: Error | undefined;
    let aborted = false;

    const writePromise = writeStream(electron, filePath, transform.readable);

    // Monitor writePromise for failures - if native stream fails, capture error immediately
    // so we stop accumulating data in memory
    writePromise.catch((e: unknown) => {
        streamError = e instanceof Error ? e : new Error(String(e));
        // Abort the writer to stop any pending writes from queuing more data
        if (!aborted) {
            aborted = true;
            void writer.abort(streamError).catch(() => undefined);
        }
    });

    const close = async () => {
        // Check for stream error before closing
        if (streamError) throw streamError;
        await writer.close();
        await writePromise;
    };

    const abort = () => {
        if (aborted) return;
        aborted = true;
        void writer.abort().catch(() => undefined);
    };

    return {
        stream: new WritableStream<Uint8Array>({
            write: async (chunk) => {
                // Fail fast if native stream has already failed
                if (streamError) throw streamError;
                if (aborted) throw new Error("Stream aborted");
                return writer.write(chunk);
            },
            close,
            abort,
        }),
        close,
        abort,
    };
};

/**
 * Stream files to a ZIP archive using fflate.
 *
 * Downloads files with limited concurrency, writes them to ZIP in order using
 * ZipPassThrough (no compression). Live photos expand to image+video entries.
 * Failed files are retried, then skipped. Reports progress via callbacks.
 */
export const streamFilesToZip = async ({
    files,
    title,
    signal,
    writable,
    onFileSuccess,
    onFileFailure,
}: StreamingZipOptions): Promise<StreamingZipResult> => {
    const zipName = createZipFileName(title);
    const handle = writable ?? (await getWritableStreamForZip(zipName));

    if (!handle) return "unavailable";

    const { stream } = handle;
    const writer = stream.getWriter();
    const writeQueueLimit = await getStreamZipWriteQueueLimit();

    let zipError: Error | undefined;
    let allowWrites = true;
    let writerClosed = false;
    let writerClosing = false;
    let shuttingDown = false;
    let writeChain = Promise.resolve();
    let writeQueueDepth = 0;
    // Track writes requested vs actually queued to detect silent drops
    let writesRequested = 0;
    let writesQueued = 0;

    const closeWriter = async () => {
        if (writerClosed || writerClosing) return;
        shuttingDown = true;
        writerClosing = true;
        try {
            await writer.close();
            writerClosed = true;
        } catch (e) {
            log.warn("Failed to close ZIP writer", e);
        }
    };

    const abortWriter = () => {
        if (writerClosed) return;
        shuttingDown = true;
        writerClosing = true;
        try {
            void writer.abort();
            writerClosed = true;
        } catch (e) {
            log.warn("Failed to abort ZIP writer", e);
        }
    };

    const isClosingError = (err: unknown) => {
        if (!(err instanceof Error)) return false;
        const msg = err.message.toLowerCase();
        return msg.includes("closing") || msg.includes("closed");
    };

    const flushWrites = async () => {
        let lastChain: Promise<void> | undefined;
        do {
            lastChain = writeChain;
            await lastChain;
        } while (lastChain !== writeChain);
    };

    const waitForWriteWindow = async () => {
        while (writeQueueDepth >= writeQueueLimit) {
            if (zipError) throw zipError;
            try {
                await writeChain;
            } catch {
                // zipError will be picked up on next loop
            }
        }
    };

    /** Queue write, serialize through promise chain, capture errors in zipError. */
    const enqueueWrite = async (data: Uint8Array) => {
        // If writes are blocked or a previous error occurred, don't queue.
        // This prevents silent data loss that would cause ZIP corruption.
        if (!allowWrites || writerClosed || writerClosing || zipError) {
            if (!zipError) {
                zipError = new Error("Write dropped: stream closed");
            }
            return;
        }
        await waitForWriteWindow();
        // Re-check after await: concurrent writes may have failed and set zipError.
        // waitForWriteWindow() only checks zipError inside its loop, so if queue
        // wasn't full, it returns immediately without checking. We must verify here.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (zipError) return;
        writeQueueDepth++;
        writesQueued++;
        writeChain = writeChain
            .then(() => writer.write(data))
            .catch((e: unknown) => {
                if (shuttingDown && isClosingError(e)) return;
                zipError = e instanceof Error ? e : new Error(String(e));
                throw zipError;
            })
            .finally(() => {
                writeQueueDepth = Math.max(0, writeQueueDepth - 1);
            });
        return writeChain;
    };

    const zip = new Zip((err, data) => {
        if (err) {
            zipError = err instanceof Error ? err : new Error(String(err));
            return;
        }
        writesRequested++;
        void enqueueWrite(data);
    });

    interface PreparedEntry {
        name: string;
        getData: () => Promise<Uint8Array | ReadableStream<Uint8Array>>;
    }

    interface PreparedFile {
        file: EnteFile;
        entries: PreparedEntry[];
        entryCount: number;
    }

    /** Download and prepare file for ZIP (decodes live photos to image+video). */
    const prepareFile = async (
        file: EnteFile,
    ): Promise<PreparedFile | null> => {
        try {
            const fileName = fileFileName(file);

            if (file.metadata.fileType === FileType.livePhoto) {
                const blob = await downloadManager.fileBlob(file);
                if (signal.aborted) return null;

                const { imageFileName, imageData, videoFileName, videoData } =
                    await decodeLivePhoto(fileName, blob);

                const dataToStream = (
                    data: Blob | ArrayBuffer | Uint8Array,
                ): ReadableStream<Uint8Array> => {
                    if (data instanceof Blob) {
                        const body = new Response(data).body;
                        if (!body) {
                            throw new Error("Failed to create blob stream");
                        }
                        return body;
                    }
                    const view =
                        data instanceof Uint8Array
                            ? data
                            : new Uint8Array(data);
                    return new ReadableStream<Uint8Array>({
                        pull(controller) {
                            controller.enqueue(view);
                            controller.close();
                        },
                        cancel() {
                            return Promise.resolve();
                        },
                    });
                };

                const entries: PreparedEntry[] = [
                    {
                        name: imageFileName,
                        getData: () => Promise.resolve(dataToStream(imageData)),
                    },
                    {
                        name: videoFileName,
                        getData: () => Promise.resolve(dataToStream(videoData)),
                    },
                ];

                return { file, entries, entryCount: 1 };
            }

            const getStream = async () => {
                const stream = await downloadManager.fileStream(file);
                if (!stream) throw new Error("Failed to get file stream");
                return stream;
            };

            return {
                file,
                entries: [{ name: fileName, getData: getStream }],
                entryCount: 1,
            };
        } catch (e) {
            onFileFailure(file, e);
            return null;
        }
    };

    const preparedPromises: Promise<PreparedFile | null>[] = [];

    let targetConcurrency = clampConcurrency(await getStreamZipConcurrency());
    let lastConcurrencyCheck = 0;
    let concurrencyCheckTimer: ReturnType<typeof setInterval> | undefined;

    const stopConcurrencyRefresh = () => {
        if (concurrencyCheckTimer) {
            clearInterval(concurrencyCheckTimer);
            concurrencyCheckTimer = undefined;
        }
    };

    const refreshConcurrency = async (force = false) => {
        const now = Date.now();
        if (
            !force &&
            now - lastConcurrencyCheck < STREAM_ZIP_CONCURRENCY_REFRESH_MS
        )
            return targetConcurrency;
        lastConcurrencyCheck = now;
        const next = clampConcurrency(await getStreamZipConcurrency());
        if (next !== targetConcurrency) {
            targetConcurrency = next;
            scheduleNext();
        }
        return targetConcurrency;
    };

    const startConcurrencyRefresh = () => {
        if (typeof setInterval !== "function") return;
        concurrencyCheckTimer = setInterval(() => {
            void refreshConcurrency(true);
        }, STREAM_ZIP_CONCURRENCY_REFRESH_MS);
    };

    let nextToSchedule = 0;
    let active = 0;

    /** Schedule next file prep if under concurrency limit. */
    const scheduleNext = () => {
        const allowed = targetConcurrency;
        while (nextToSchedule < files.length && active < allowed) {
            const index = nextToSchedule++;
            const file = files[index]!;
            const promise = prepareFile(file).finally(() => {
                active--;
                scheduleNext();
            });
            preparedPromises[index] = promise;
            active++;
        }
    };

    startConcurrencyRefresh();
    scheduleNext();

    let lastCompletedIndex = -1;

    // Track ZIP entry state for salvage logic on error.
    // If all started entries are complete, we can finalize the ZIP cleanly.
    let entriesAddedToZip = 0;
    let entriesCompletedInZip = 0;

    // Batch failure tracking to avoid flooding logs (prevents localStorage quota errors)
    const failedFileIds: number[] = [];
    let retryCount = 0;

    /**
     * Add entry to ZIP. Retries only the data fetch, NOT the ZIP write.
     *
     * IMPORTANT: Once zip.add() is called, we cannot retry without corrupting
     * the ZIP (each retry would add a duplicate incomplete entry). So retries
     * only happen for getData(), and any failure after zip.add() is final.
     */
    const addEntryToZip = async (_file: EnteFile, entry: PreparedEntry) => {
        // Phase 1: Get data with retries (safe to retry - ZIP not modified yet)
        let resolvedData: Uint8Array | ReadableStream<Uint8Array> | undefined;
        let lastError: unknown;

        for (let attempt = 1; attempt <= STREAM_ZIP_MAX_RETRIES; attempt++) {
            try {
                resolvedData = await entry.getData();
                break;
            } catch (e) {
                lastError = e;
                if (signal.aborted) throw e;
                if (attempt < STREAM_ZIP_MAX_RETRIES) {
                    // Track retries without logging each one to avoid localStorage quota
                    retryCount++;
                    await wait(STREAM_ZIP_RETRY_DELAY_MS * attempt);
                }
            }
        }

        if (resolvedData === undefined) {
            throw lastError instanceof Error
                ? lastError
                : new Error("Failed to get entry data");
        }

        // Phase 2: Write to ZIP (NO retries - would corrupt ZIP with duplicates)
        const passThrough = new ZipPassThrough(entry.name);
        zip.add(passThrough);
        entriesAddedToZip++;

        // Stream or write the data
        if (resolvedData instanceof ReadableStream) {
            const reader = resolvedData.getReader();
            let shouldCancel = true;
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    if (signal.aborted) {
                        void reader.cancel().catch(() => undefined);
                        throw new DOMException("Aborted", "AbortError");
                    }
                    await waitForWriteWindow();
                    passThrough.push(value);
                    if (zipError) throw zipError;
                }
                shouldCancel = false;
            } finally {
                if (shouldCancel) {
                    void reader.cancel().catch(() => undefined);
                }
            }
        } else {
            await waitForWriteWindow();
            passThrough.push(resolvedData);
        }

        // Finalize this entry
        await waitForWriteWindow();
        passThrough.push(new Uint8Array(0), true);

        await writeChain;
        if (zipError) throw zipError;
        entriesCompletedInZip++;
    };

    const inFlightEntries = new Set<Promise<void>>();
    let entryFailure: unknown = null;

    const waitForEntrySlot = async () => {
        while (inFlightEntries.size >= targetConcurrency) {
            await Promise.race(inFlightEntries);
        }
    };

    const startEntry = (file: EnteFile, entry: PreparedEntry) => {
        const p: Promise<void> = addEntryToZip(file, entry)
            .catch((e: unknown) => {
                entryFailure = entryFailure ?? e;
                throw e;
            })
            .finally(() => {
                inFlightEntries.delete(p);
            });
        inFlightEntries.add(p);
        return p;
    };

    const fileCompletions: Promise<void>[] = [];

    try {
        // Consume prepared files in order; preparation happens with limited concurrency
        for (let i = 0; i < files.length; i++) {
            if (signal.aborted) {
                abortWriter();
                stopConcurrencyRefresh();
                return "cancelled";
            }

            const preparedPromise = preparedPromises[i];
            if (!preparedPromise) {
                continue;
            }
            const prepared = await preparedPromise;
            const file = files[i]!;
            if (prepared) {
                const entryPromises: Promise<void>[] = [];
                for (const entry of prepared.entries) {
                    await waitForEntrySlot();
                    entryPromises.push(startEntry(file, entry));
                }
                fileCompletions.push(
                    Promise.all(entryPromises)
                        .then(() => onFileSuccess(file, prepared.entryCount))
                        .catch((e: unknown) => {
                            // Track failed file IDs for batched logging (avoid localStorage quota)
                            failedFileIds.push(file.id);
                            onFileFailure(file, e);
                        }),
                );
            }

            // Track that this file's preparation is complete (success or failure)
            // so the catch block won't double-count it
            lastCompletedIndex = i;

            if (zipError) {
                throw zipError;
            }
        }

        // Drain remaining in-flight entry writes and file completions
        if (inFlightEntries.size) {
            await Promise.allSettled([...inFlightEntries]);
        }
        if (fileCompletions.length) {
            await Promise.allSettled(fileCompletions);
        }
        lastCompletedIndex = files.length - 1;
        if (entryFailure) {
            throw entryFailure instanceof Error
                ? entryFailure
                : new Error(JSON.stringify(entryFailure));
        }

        // Finalize the ZIP
        zip.end();

        // Wait for all pending writes to flush and close the writer
        await flushWrites();
        if (zipError) throw zipError;

        // Verify write integrity - all requested writes must have been queued
        if (writesRequested !== writesQueued) {
            throw new Error(
                `ZIP write integrity check failed: ${writesRequested - writesQueued} writes dropped`,
            );
        }

        allowWrites = false;

        await closeWriter();
        stopConcurrencyRefresh();

        // Log batched summary of any issues encountered during successful ZIP creation
        if (retryCount > 0 || failedFileIds.length > 0) {
            log.info(
                `ZIP completed with issues: ${failedFileIds.length} files failed, ${retryCount} retries`,
                failedFileIds.length > 0
                    ? { failedIds: failedFileIds.slice(0, 100) }
                    : undefined,
            );
        }

        return "success";
    } catch (e) {
        // Mark remaining files as failed IMMEDIATELY so UI progress updates.
        // This prevents the progress from appearing stuck during network failures.
        // Track IDs for batched logging instead of logging each one.
        if (!signal.aborted) {
            for (let i = lastCompletedIndex + 1; i < files.length; i++) {
                const file = files[i]!;
                failedFileIds.push(file.id);
                onFileFailure(file, e);
            }
        }

        // Now wait for any in-flight entries to settle before checking salvage condition.
        // This ensures entriesAddedToZip and entriesCompletedInZip are accurate.
        if (inFlightEntries.size) {
            await Promise.allSettled([...inFlightEntries]);
        }

        // Log single summary with failed file IDs (capped to avoid quota issues)
        log.error(
            `ZIP creation failed: ${failedFileIds.length} files failed, ${retryCount} retries`,
            {
                error: e instanceof Error ? e.message : String(e),
                failedIds: failedFileIds.slice(0, 50),
                totalFailed: failedFileIds.length,
            },
        );
        stopConcurrencyRefresh();

        // Try to salvage the ZIP if all started entries are complete AND
        // all writes were actually queued (no silent drops).
        // This produces a valid partial ZIP with successfully downloaded files.
        const writesDropped = writesRequested !== writesQueued;
        if (
            !signal.aborted &&
            entriesAddedToZip > 0 &&
            entriesAddedToZip === entriesCompletedInZip &&
            !writesDropped
        ) {
            log.info(
                `Attempting to salvage ZIP with ${entriesCompletedInZip} complete entries`,
            );
            try {
                zip.end();
                await flushWrites();
                // Verify no writes were dropped during zip.end()
                if (writesRequested !== writesQueued) {
                    throw new Error("Writes dropped during ZIP finalization");
                }
                allowWrites = false;
                await closeWriter();
                log.info("ZIP salvaged successfully");
                return "error";
            } catch (salvageError) {
                log.warn("Failed to salvage ZIP", salvageError);
                abortWriter();
            }
        } else {
            if (entriesAddedToZip !== entriesCompletedInZip) {
                log.info(
                    `Cannot salvage ZIP: ${entriesAddedToZip - entriesCompletedInZip} entries incomplete`,
                );
            }
            if (writesDropped) {
                log.info(
                    `Cannot salvage ZIP: ${writesRequested - writesQueued} writes were dropped`,
                );
            }
            abortWriter();
        }

        return signal.aborted ? "cancelled" : "error";
    }
};
