# CollectionMapDialog Thumbnail Loading System

This document explains how thumbnails are loaded and updated in the `CollectionMapDialog.tsx` component, with a focus on the viewport-based on-demand loading system.

## Overview

The thumbnail loading system uses a **two-phase approach**:

1. **Phase 1: Cache-only initial load** - Quickly displays any thumbnails already in browser cache
2. **Phase 2: On-demand viewport-based loading** - Loads thumbnails for visible markers as the user interacts with the map

This prevents overwhelming the network with potentially 95K+ thumbnail requests at once.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CollectionMapDialog                          │
│                                                                     │
│  ┌─────────────────┐     ┌──────────────────┐     ┌──────────────┐ │
│  │   useMapData    │────▶│ thumbByFileID    │◀────│ addThumbnails│ │
│  │                 │     │ (Map<id, url>)   │     │  (callback)  │ │
│  └────────┬────────┘     └──────────────────┘     └──────▲───────┘ │
│           │                                              │         │
│           ▼                                              │         │
│  ┌─────────────────┐                                     │         │
│  │loadCachedThumbs │                                     │         │
│  │ (Phase 1)       │                                     │         │
│  └─────────────────┘                                     │         │
│                                                          │         │
│  ┌─────────────────────────────────────────────────────┐ │         │
│  │           useViewportThumbnailLoader                │ │         │
│  │                    (Phase 2)                        │─┘         │
│  │  ┌─────────────┐  ┌──────────────┐  ┌───────────┐  │           │
│  │  │visiblePhotos│─▶│loadThumbnail │─▶│ onBatch   │  │           │
│  │  │  (input)    │  │   Batch      │  │ Complete  │  │           │
│  │  └─────────────┘  └──────────────┘  └───────────┘  │           │
│  │                          │                          │           │
│  │                          ▼                          │           │
│  │              ┌──────────────────────┐               │           │
│  │              │processWithConcurrency│               │           │
│  │              │  (25 concurrent max) │               │           │
│  │              └──────────────────────┘               │           │
│  └─────────────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Cache-Only Initial Load

### Function: `loadCachedThumbnails()`

**Location:** Lines 213-250

**Purpose:** Quickly load any thumbnails that are already cached in the browser without making network requests.

```typescript
async function loadCachedThumbnails(
    points: JourneyPoint[],
    files: EnteFile[],
): Promise<Map<number, string>> {
    const filesById = new Map(files.map((f) => [f.id, f]));
    const thumbs = new Map<number, string>();

    // Process in parallel but with concurrency limit to avoid blocking
    const batchSize = 50;
    for (let i = 0; i < points.length; i += batchSize) {
        const batch = points.slice(i, i + batchSize);
        const results = await Promise.all(
            batch.map(async (point) => {
                // Skip if already has an image from generateNeededThumbnails
                if (point.image) {
                    return [point.fileId, point.image] as const;
                }
                const file = filesById.get(point.fileId);
                if (!file) return [point.fileId, undefined] as const;
                try {
                    // cachedOnly = true means no network request
                    const thumb = await downloadManager.renderableThumbnailURL(
                        file,
                        true, // <-- Key parameter: cache-only
                    );
                    return [point.fileId, thumb] as const;
                } catch {
                    return [point.fileId, undefined] as const;
                }
            }),
        );
        // ... merge results into thumbs map
    }
    return thumbs;
}
```

**Key Points:**

- Uses `cachedOnly = true` parameter to avoid network requests
- Processes in batches of 50 to avoid blocking the main thread
- Reuses thumbnails already loaded by `gallery.tsx`
- Returns a `Map<fileId, thumbnailUrl>`

### When It's Called

In `useMapData` hook (line 426-429):

```typescript
// Build initial thumbnails from cache only (no network calls).
// This reuses thumbnails already loaded by gallery.tsx.
// Network requests happen on-demand via useViewportThumbnailLoader.
const cachedThumbs = await loadCachedThumbnails(sortedPoints, files);
```

---

## Phase 2: Viewport-Based On-Demand Loading

### Hook: `useViewportThumbnailLoader()`

**Location:** Lines 698-838

**Purpose:** Load thumbnails for photos that are currently visible in the map viewport, with concurrency limiting and retry logic.

### Parameters

```typescript
function useViewportThumbnailLoader(
    visiblePhotos: JourneyPoint[], // Photos currently in viewport
    filesByID: Map<number, EnteFile>, // All files by ID
    thumbByFileID: Map<number, string>, // Already loaded thumbnails
    onThumbsLoaded: (newThumbs: Map<number, string>) => void, // Callback to update state
);
```

### Internal State Management (Refs)

```typescript
// Single abort controller for cleanup only (when dialog closes)
const cleanupAbortRef = useRef<AbortController>(new AbortController());

// Successfully loaded file IDs
const loadedFileIdsRef = useRef<Set<number>>(new Set());

// Currently in-flight file IDs
const inFlightFileIdsRef = useRef<Set<number>>(new Set());

// File IDs that genuinely failed (not aborted) - eligible for retry
const failedFileIdsRef = useRef<Set<number>>(new Set());

// Retry counter for each file ID
const retryCountRef = useRef<Map<number, number>>(new Map());
```

### Key Behaviors

#### 1. No Abort on Viewport Change

Previous batches are **NOT** aborted when new photos become visible:

```typescript
// Process thumbnails WITHOUT aborting previous batches
void processWithConcurrency(
    photosToLoad,
    async (point, signal) => {
        /* ... */
    },
    {
        /* ... */
    },
);
```

#### 2. Filtering Photos That Need Loading

```typescript
const photosNeedingThumbs = visiblePhotos.filter((photo) => {
    const hasThumb =
        photo.image ||
        thumbByFileID.has(photo.fileId) ||
        loadedFileIdsRef.current.has(photo.fileId);
    const alreadyInFlight = inFlightFileIdsRef.current.has(photo.fileId);
    const retryCount = retryCountRef.current.get(photo.fileId) ?? 0;
    const canRetry = retryCount < THUMBNAIL_RETRY_LIMIT;
    const needsRetry = failedFileIdsRef.current.has(photo.fileId) && canRetry;

    return (
        (!hasThumb || needsRetry) &&
        !alreadyInFlight &&
        filesByID.has(photo.fileId)
    );
});
```

#### 3. Retry Logic

Failed thumbnails are retried up to 3 times with a 2-second delay:

```typescript
const THUMBNAIL_RETRY_LIMIT = 3;
const THUMBNAIL_RETRY_DELAY_MS = 2000;

// Schedule retry for failed items after delay
const retryTimer = setTimeout(() => {
    const failedCount = failedFileIdsRef.current.size;
    const inFlightCount = inFlightFileIdsRef.current.size;
    if (failedCount > 0 && inFlightCount === 0) {
        setRetryTrigger((prev) => prev + 1); // Triggers re-render
    }
}, THUMBNAIL_RETRY_DELAY_MS);
```

---

## Concurrency-Limited Processing

### Function: `processWithConcurrency()`

**Location:** Lines 84-165

**Purpose:** Process async tasks with a maximum concurrent request limit to prevent network congestion.

### Configuration Constants

```typescript
const THUMBNAIL_CONCURRENCY_LIMIT = 25; // Max concurrent requests
const MAX_RETRY_ATTEMPTS = 2; // Retries per thumbnail fetch
const RETRY_BASE_DELAY_MS = 500; // Base delay between retries
const VIEWPORT_BATCH_UPDATE_SIZE = 5; // Batch size for UI updates
```

### How It Works

```typescript
async function processWithConcurrency<T, R>(
    items: T[],
    processor: (item: T, signal: AbortSignal) => Promise<R | undefined>,
    options: {
        concurrency: number;
        batchUpdateSize: number;
        onBatchComplete: (results: Map<number, R>, isComplete: boolean) => void;
        getKey: (item: T) => number;
        onItemComplete?: (key: number, succeeded: boolean) => void;
        signal: AbortSignal;
    },
): Promise<void>;
```

### Processing Flow

```
┌──────────────────────────────────────────────────────────────┐
│                    processWithConcurrency                     │
│                                                              │
│  ┌────────┐                                                  │
│  │ Queue  │ [item1, item2, item3, item4, item5, ...]        │
│  └────────┘                                                  │
│       │                                                      │
│       ▼                                                      │
│  ┌─────────────────────────────────────────────────────┐    │
│  │         Active Workers (max 25 concurrent)          │    │
│  │  ┌───────┐ ┌───────┐ ┌───────┐      ┌───────┐      │    │
│  │  │Worker1│ │Worker2│ │Worker3│ ...  │Worker25│     │    │
│  │  └───┬───┘ └───┬───┘ └───┬───┘      └───┬───┘      │    │
│  │      │         │         │              │           │    │
│  │      ▼         ▼         ▼              ▼           │    │
│  │  ┌─────────────────────────────────────────────┐   │    │
│  │  │           Results Map                        │   │    │
│  │  │   { fileId1: url1, fileId2: url2, ... }     │   │    │
│  │  └─────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────┘    │
│       │                                                      │
│       ▼ (every 5 completions)                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              onBatchComplete()                       │    │
│  │    Updates thumbByFileID state in parent component   │    │
│  └─────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

### Batch Flushing Logic

Results are flushed to the UI every `VIEWPORT_BATCH_UPDATE_SIZE` (5) completions:

```typescript
const flushResults = (force: boolean) => {
    if (
        results.size > 0 &&
        (force || completedSinceLastUpdate >= batchUpdateSize)
    ) {
        onBatchComplete(new Map(results), totalCompleted >= items.length);
        results.clear();
        completedSinceLastUpdate = 0;
    }
};
```

---

## Thumbnail Fetching with Retry

### Function: `fetchThumbnailWithRetry()`

**Location:** Lines 171-207

```typescript
async function fetchThumbnailWithRetry(
    file: EnteFile,
    signal: AbortSignal,
): Promise<string | undefined> {
    // First, try to get from cache without triggering a network request
    try {
        const cachedThumb = await downloadManager.renderableThumbnailURL(
            file,
            true, // cachedOnly
        );
        if (cachedThumb) return cachedThumb;
    } catch {
        // Cache miss or error, proceed to download
    }

    // Not in cache, download with retry logic
    for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
        if (signal.aborted) return undefined;

        try {
            const thumb = await downloadManager.renderableThumbnailURL(file);
            return thumb;
        } catch {
            // Only retry if not aborted and not the last attempt
            if (!signal.aborted && attempt < MAX_RETRY_ATTEMPTS - 1) {
                await new Promise((resolve) =>
                    setTimeout(resolve, RETRY_BASE_DELAY_MS * (attempt + 1)),
                );
            }
        }
    }
    return undefined;
}
```

### Retry Strategy

| Attempt | Delay Before Retry                             |
| ------- | ---------------------------------------------- |
| 1       | 500ms                                          |
| 2       | 1000ms                                         |
| (fail)  | Added to failedFileIdsRef for hook-level retry |

---

## State Update Flow

### How Thumbnails Get Updated in the UI

```
1. MapViewportListener detects viewport change
                │
                ▼
2. Calls onVisiblePhotosChange(photosInView)
                │
                ▼
3. useViewportThumbnailLoader receives new visiblePhotos
                │
                ▼
4. Filters photos that need thumbnails
                │
                ▼
5. Calls loadThumbnailBatch() with photosToLoad
                │
                ▼
6. processWithConcurrency fetches thumbnails
                │
                ▼
7. Every 5 completions, onBatchComplete is called
                │
                ▼
8. onThumbsLoaded (addThumbnails) merges into thumbByFileID
                │
                ▼
9. React re-renders MapCanvas with updated markerIcons
                │
                ▼
10. Leaflet markers display new thumbnails
```

### The `addThumbnails` Callback

**Location:** Lines 538-547

```typescript
const addThumbnails = useCallback((newThumbs: Map<number, string>) => {
    if (newThumbs.size === 0) return;
    setState((prev) => {
        const merged = new Map(prev.thumbByFileID);
        newThumbs.forEach((thumb, fileId) => {
            merged.set(fileId, thumb);
        });
        return { ...prev, thumbByFileID: merged };
    });
}, []);
```

---

## Cleanup and Reset

### When Dialog Closes or Collection Changes

```typescript
// Reset all tracking refs when the collection changes (new filesByID)
// and set up cleanup abort for when the dialog closes
useEffect(() => {
    // Create fresh abort controller for this collection
    cleanupAbortRef.current = new AbortController();
    loadedFileIdsRef.current = new Set();
    inFlightFileIdsRef.current = new Set();
    failedFileIdsRef.current = new Set();
    retryCountRef.current = new Map();
    setRetryTrigger(0);

    return () => {
        // Abort only on cleanup (dialog close / collection change)
        cleanupAbortRef.current.abort();
    };
}, [filesByID]);
```

---

## Summary of Key Improvements

| Previous Approach                       | Current Approach                        |
| --------------------------------------- | --------------------------------------- |
| Load all thumbnails at once             | Load from cache first, then on-demand   |
| No concurrency limit                    | Max 25 concurrent requests              |
| Abort previous batch on viewport change | Keep previous batches running           |
| No retry for failures                   | Retry up to 3 times per thumbnail       |
| Single bulk state update                | Incremental updates every 5 completions |
| No tracking of in-flight requests       | Prevents duplicate fetches              |

---

## Live Sync While Map is Open

### Problem

When users open the map view before the gallery has fully synced all files from the server, the map would show only the files that had been synced at that moment. Once loaded, it wouldn't update even as more files synced to IndexedDB.

### Solution: Polling Mechanism

The map now polls IndexedDB every 3 seconds while the dialog is open to detect newly synced files.

```typescript
// Poll for new files while dialog is open
useEffect(() => {
    if (!open) return;

    // Poll every 3 seconds to check for new geotagged files
    const pollInterval = setInterval(() => {
        void loadMapData(false);
    }, 3000);

    return () => clearInterval(pollInterval);
}, [open, loadMapData]);
```

### Key Changes

1. **Cache by actual geotagged count** (not `collectionSummary.fileCount`)
    - `collectionSummary.fileCount` is the server's count, which doesn't reflect IndexedDB state during sync
    - Now tracks `geotaggedCount` - the actual number of files with location data loaded from IndexedDB

2. **Extracted `loadMapData` as reusable callback**
    - Can be called for initial load (`isInitialLoad: true`) or polling (`isInitialLoad: false`)
    - Initial load shows loading spinner; polling updates silently

3. **Smart update detection**
    - Polling only triggers a state update if `geotaggedCount` has changed
    - Avoids unnecessary re-renders when no new files have synced

```typescript
// Skip update if we already have the same data (for polling)
if (
    !isInitialLoad &&
    loaded &&
    loaded.summaryId === currentSummaryId &&
    loaded.collectionId === currentCollectionId &&
    loaded.geotaggedCount === geotaggedCount
) {
    return;
}
```

### Behavior

1. User opens map view while gallery is syncing
2. Map loads currently available geotagged files from IndexedDB
3. Every 3 seconds, map checks IndexedDB for new files
4. If new geotagged files are found, map updates automatically
5. Polling stops when dialog closes

---

## File References

| Component/Function           | Lines     | Purpose                                |
| ---------------------------- | --------- | -------------------------------------- |
| `processWithConcurrency`     | 84-165    | Concurrency-limited async processing   |
| `fetchThumbnailWithRetry`    | 171-207   | Single thumbnail fetch with retry      |
| `loadCachedThumbnails`       | 213-250   | Phase 1: Cache-only loading            |
| `useMapData`                 | 363-550   | Main data hook with `addThumbnails`    |
| `useViewportThumbnailLoader` | 698-838   | Phase 2: Viewport-based loading        |
| `createMarkerIcon`           | 844-912   | Creates marker icons with thumbnails   |
| `createClusterIcon`          | 918-1017  | Creates cluster icons with thumbnails  |
| `MapCanvas`                  | 1804-1869 | Renders map with memoized marker icons |
