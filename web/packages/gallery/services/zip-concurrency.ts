import log from "ente-base/log";

/** Minimum number of concurrent file downloads during ZIP streaming. */
export const STREAM_ZIP_MIN_CONCURRENCY = 2;
/** Maximum number of concurrent file downloads during ZIP streaming. */
export const STREAM_ZIP_MAX_CONCURRENCY = 24;
/** Interval (ms) for recalculating optimal concurrency based on throughput. */
export const STREAM_ZIP_CONCURRENCY_REFRESH_MS = 600;
/** Base limit for queued files awaiting write to the ZIP stream. */
const STREAM_ZIP_BASE_WRITE_QUEUE_LIMIT = 24;
/** Bytes per megabyte (1 MB = 1024 * 1024 bytes). */
const STREAM_ZIP_BYTES_PER_MB = 1024 * 1024;
/** Bytes per gigabyte (1 GB = 1024 MB). */
const STREAM_ZIP_BYTES_PER_GB = STREAM_ZIP_BYTES_PER_MB * 1024;

export const clampConcurrency = (value: number) =>
    Math.max(
        STREAM_ZIP_MIN_CONCURRENCY,
        Math.min(value, STREAM_ZIP_MAX_CONCURRENCY),
    );

interface MeasureUserAgentSpecificMemoryResult {
    bytes: number;
    breakdown: {
        bytes: number;
        attribution: { url: string; scope?: string }[];
        types: string[];
    }[];
}

type MeasureUserAgentSpecificMemory =
    () => Promise<MeasureUserAgentSpecificMemoryResult>;

let pendingMemoryMeasurement: Promise<MeasureUserAgentSpecificMemoryResult | null> | null =
    null;
let lastMemoryMeasurement: MeasureUserAgentSpecificMemoryResult | null = null;
let lastMemoryMeasurementAt = 0;
let lastLoggedConcurrency: {
    value: number;
    method: string;
    detectedValue: string | number | undefined;
} | null = null;

const measureUserAgentMemory = async () => {
    const measureMemory = (
        performance as Performance & {
            measureUserAgentSpecificMemory?: MeasureUserAgentSpecificMemory;
        }
    ).measureUserAgentSpecificMemory;
    if (typeof measureMemory !== "function") return null;

    const now = Date.now();
    if (
        lastMemoryMeasurement &&
        now - lastMemoryMeasurementAt < STREAM_ZIP_CONCURRENCY_REFRESH_MS
    ) {
        return lastMemoryMeasurement;
    }

    if (pendingMemoryMeasurement) return pendingMemoryMeasurement;

    try {
        pendingMemoryMeasurement = measureMemory
            .call(performance)
            .then((result) => {
                lastMemoryMeasurement = result;
                lastMemoryMeasurementAt = Date.now();
                return result;
            })
            .catch((e: unknown) => {
                log.warn("measureUserAgentSpecificMemory failed", e);
                return null;
            })
            .finally(() => {
                pendingMemoryMeasurement = null;
            });
    } catch (e) {
        log.warn("measureUserAgentSpecificMemory failed", e);
        pendingMemoryMeasurement = null;
        return null;
    }

    return pendingMemoryMeasurement;
};

const concurrencyFromFreeBytes = (freeBytes: number) => {
    if (freeBytes > 4000 * STREAM_ZIP_BYTES_PER_MB) return clampConcurrency(24);
    if (freeBytes > 3000 * STREAM_ZIP_BYTES_PER_MB) return clampConcurrency(20);
    if (freeBytes > 2000 * STREAM_ZIP_BYTES_PER_MB) return clampConcurrency(16);
    if (freeBytes > 1200 * STREAM_ZIP_BYTES_PER_MB) return clampConcurrency(12);
    if (freeBytes > 800 * STREAM_ZIP_BYTES_PER_MB) return clampConcurrency(10);
    if (freeBytes > 400 * STREAM_ZIP_BYTES_PER_MB) return clampConcurrency(6);
    if (freeBytes > 200 * STREAM_ZIP_BYTES_PER_MB) return clampConcurrency(4);
    return clampConcurrency(2);
};

const applyUsageCaps = (base: number, usedBytes: number) => {
    const usedMB = usedBytes / STREAM_ZIP_BYTES_PER_MB;
    if (usedMB > 2500) return clampConcurrency(Math.min(base, 2));
    if (usedMB > 1800) return clampConcurrency(Math.min(base, 4));
    if (usedMB > 1200) return clampConcurrency(Math.min(base, 6));
    if (usedMB > 800) return clampConcurrency(Math.min(base, 8));
    if (usedMB > 500) return clampConcurrency(Math.min(base, 10));
    return clampConcurrency(base);
};

const logZipConcurrency = (
    concurrency: number,
    method: string,
    detectedValue: string | number = "none",
) => {
    if (
        lastLoggedConcurrency &&
        lastLoggedConcurrency.value === concurrency &&
        lastLoggedConcurrency.method === method &&
        lastLoggedConcurrency.detectedValue === detectedValue
    )
        return;
    lastLoggedConcurrency = { value: concurrency, method, detectedValue };
    const detail =
        detectedValue === "none" ? method : `${method}: ${detectedValue}`;
    log.info(`ZIP concurrency: ${concurrency} (${detail})`);
};

/**
 * Determine optimal concurrency based on available memory.
 * Prefers measureUserAgentSpecificMemory() with deviceMemory to estimate free
 * memory, falls back to hardwareConcurrency, defaults to 4.
 *
 * Note: navigator.deviceMemory is capped at 8 GB max by browsers for privacy.
 */
export const getStreamZipConcurrency = async (): Promise<number> => {
    let method = "default";
    let detectedValue: number | string = "none";
    let concurrency = 4;

    try {
        const memoryResult = await measureUserAgentMemory();
        const deviceMemory = (
            navigator as Navigator & { deviceMemory?: number }
        ).deviceMemory;

        if (memoryResult) {
            const usedBytes = Math.max(0, memoryResult.bytes);
            if (deviceMemory) {
                const freeBytes = Math.max(
                    0,
                    deviceMemory * STREAM_ZIP_BYTES_PER_GB - usedBytes,
                );
                method = "measureUserAgentSpecificMemory";
                detectedValue = `${Math.round(
                    freeBytes / STREAM_ZIP_BYTES_PER_MB,
                )} MB est free`;
                concurrency = concurrencyFromFreeBytes(freeBytes);
                logZipConcurrency(concurrency, method, detectedValue);
                return concurrency;
            }

            method = "measureUserAgentSpecificMemory";
            detectedValue = `${Math.round(
                usedBytes / STREAM_ZIP_BYTES_PER_MB,
            )} MB used`;
            const cores = navigator.hardwareConcurrency;
            const baseFromCores = cores
                ? Math.max(
                      STREAM_ZIP_MIN_CONCURRENCY,
                      Math.min(STREAM_ZIP_MAX_CONCURRENCY, cores * 2),
                  )
                : concurrency;
            concurrency = applyUsageCaps(baseFromCores, usedBytes);
            logZipConcurrency(concurrency, method, detectedValue);
            return concurrency;
        }

        // Fallback: hardwareConcurrency is widely available (Firefox/Safari).
        // Use a cautious multiplier with clamp to avoid overcommitting memory.
        const cores = navigator.hardwareConcurrency;
        if (cores) {
            method = "hardwareConcurrency";
            detectedValue = `${cores} cores`;
            concurrency = Math.min(
                STREAM_ZIP_MAX_CONCURRENCY,
                Math.max(STREAM_ZIP_MIN_CONCURRENCY, cores * 2),
            );
            logZipConcurrency(concurrency, method, detectedValue);
            return concurrency;
        }
    } catch (e) {
        log.warn("Failed to detect memory for ZIP concurrency", e);
    }

    logZipConcurrency(concurrency, method, detectedValue);
    return concurrency;
};

const queueLimitFromFreeBytes = (freeBytes: number) => {
    if (freeBytes > 4000 * STREAM_ZIP_BYTES_PER_MB) return 192;
    if (freeBytes > 3000 * STREAM_ZIP_BYTES_PER_MB) return 160;
    if (freeBytes > 2000 * STREAM_ZIP_BYTES_PER_MB) return 128;
    if (freeBytes > 1200 * STREAM_ZIP_BYTES_PER_MB) return 96;
    if (freeBytes > 800 * STREAM_ZIP_BYTES_PER_MB) return 64;
    if (freeBytes > 400 * STREAM_ZIP_BYTES_PER_MB) return 48;
    if (freeBytes > 200 * STREAM_ZIP_BYTES_PER_MB) return 32;
    return STREAM_ZIP_BASE_WRITE_QUEUE_LIMIT;
};

const applyUsageCapsForQueue = (base: number, usedBytes: number) => {
    const usedMB = usedBytes / STREAM_ZIP_BYTES_PER_MB;
    if (usedMB > 2500) return Math.min(base, 32);
    if (usedMB > 1800) return Math.min(base, 48);
    if (usedMB > 1200) return Math.min(base, 64);
    if (usedMB > 800) return Math.min(base, 96);
    if (usedMB > 500) return Math.min(base, 128);
    return base;
};

/** Map CPU cores to queue limit (used as fallback for Firefox/Safari). */
const queueLimitFromCores = (cores: number) => {
    if (cores >= 24) return 160;
    if (cores >= 16) return 128;
    if (cores >= 12) return 96;
    if (cores >= 8) return 64;
    if (cores >= 4) return 48;
    return 32;
};

/**
 * Determine write queue depth; allow more buffering on capable devices.
 *
 * Detection priority:
 * 1. measureUserAgentSpecificMemory + deviceMemory - estimate free memory (Chrome/Edge)
 * 2. measureUserAgentSpecificMemory + hardwareConcurrency - cap by usage (Chrome/Edge)
 * 3. navigator.deviceMemory - Chrome/Edge fallback (capped at 8 GB by browsers)
 * 4. navigator.hardwareConcurrency - Firefox/Safari fallback (CPU cores)
 * 5. Default - STREAM_ZIP_BASE_WRITE_QUEUE_LIMIT (24)
 *
 * Note: measureUserAgentSpecificMemory is not supported in Firefox and Safari.
 * For those browsers, we fall back to hardwareConcurrency as a proxy for device capability.
 */
export const getStreamZipWriteQueueLimit = async (): Promise<number> => {
    let method = "default";
    let detectedValue: number | string = "none";
    let limit = STREAM_ZIP_BASE_WRITE_QUEUE_LIMIT;

    try {
        const memoryResult = await measureUserAgentMemory();
        const deviceMemory = (
            navigator as Navigator & { deviceMemory?: number }
        ).deviceMemory;

        // Priority 1: measureUserAgentSpecificMemory + deviceMemory for estimated free memory
        if (memoryResult) {
            const usedBytes = Math.max(0, memoryResult.bytes);

            if (deviceMemory) {
                const freeBytes = Math.max(
                    0,
                    deviceMemory * STREAM_ZIP_BYTES_PER_GB - usedBytes,
                );
                method = "measureUserAgentSpecificMemory";
                detectedValue = `${Math.round(freeBytes / STREAM_ZIP_BYTES_PER_MB)} MB est free`;
                limit = queueLimitFromFreeBytes(freeBytes);
                log.info(`ZIP write queue: ${limit} (${method}: ${detectedValue})`);
                return limit;
            }

            // Priority 2: measureUserAgentSpecificMemory + cores - cap by usage
            method = "measureUserAgentSpecificMemory";
            detectedValue = `${Math.round(usedBytes / STREAM_ZIP_BYTES_PER_MB)} MB used`;
            const cores = navigator.hardwareConcurrency;
            const baseFromCores = cores
                ? queueLimitFromCores(cores)
                : STREAM_ZIP_BASE_WRITE_QUEUE_LIMIT;
            limit = applyUsageCapsForQueue(baseFromCores, usedBytes);
            log.info(`ZIP write queue: ${limit} (${method}: ${detectedValue})`);
            return limit;
        }

        // Priority 3: deviceMemory fallback (Chrome/Edge without measureUserAgentSpecificMemory)
        if (deviceMemory) {
            method = "deviceMemory";
            detectedValue = `${deviceMemory} GB`;
            // deviceMemory is capped at 8 GB by browsers for privacy
            if (deviceMemory >= 8) {
                limit = 160; // 8 GB (max reported)
            } else if (deviceMemory >= 4) {
                limit = 96; // 4 GB
            } else if (deviceMemory >= 2) {
                limit = 64; // 2 GB
            } else if (deviceMemory >= 1) {
                limit = 48; // 1 GB
            } else {
                limit = 32; // <1 GB
            }
            log.info(`ZIP write queue: ${limit} (${method}: ${detectedValue})`);
            return limit;
        }

        // Priority 4: hardwareConcurrency fallback (Firefox/Safari)
        // These browsers don't support measureUserAgentSpecificMemory,
        // so we use CPU cores as a proxy for device capability.
        const cores = navigator.hardwareConcurrency;
        if (cores) {
            method = "hardwareConcurrency";
            detectedValue = `${cores} cores`;
            limit = queueLimitFromCores(cores);
            log.info(`ZIP write queue: ${limit} (${method}: ${detectedValue})`);
            return limit;
        }
    } catch (e) {
        log.warn("Failed to detect memory/CPU for ZIP queue limit", e);
    }

    // Priority 5: Default for constrained/unknown environments
    log.info(`ZIP write queue: ${limit} (${method})`);
    return limit;
};
