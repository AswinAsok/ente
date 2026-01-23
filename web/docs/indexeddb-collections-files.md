# IndexedDB: Collections and Files (Photos App)

This note explains how `savedCollections()` and `savedCollectionFiles()` work,
what they store in IndexedDB, why that data is persisted locally, and how it is
initially populated.

## Where the data lives

The Photos app uses the localForage library as a thin wrapper over IndexedDB.
In this app the configuration is:

- IndexedDB database name: `ente-files`
- Object store: `files`

Keys inside that object store include (not exhaustive):

- `collections`
- `files`
- `collection-updation-time`
- `<collectionId>-time`
- `file-trash`
- `trash-time`
- `deleted-collection`
- `hidden-files` (legacy, migrated on read)

Refs:

- `web/packages/gallery/services/files-db.ts`
- `web/packages/new/photos/services/photos-fdb.ts`

## What `savedCollections()` stores

`savedCollections()` reads the `collections` key from `ente-files` and parses
each entry as a decrypted `Collection` object. In practice this includes:

- `id`, `name`, `type`, `owner`, `sharees`, `publicURLs`
- `key` (decrypted collection key)
- `updationTime`
- `magicMetadata` (private/public/shared metadata)

The data is "UI ready" in the sense that it is already decrypted and can be
used directly by the gallery state to build collection summaries.

Refs:

- `web/packages/new/photos/services/photos-fdb.ts`
- `web/packages/gallery/services/files-db.ts`

## What `savedCollectionFiles()` stores

`savedCollectionFiles()` reads the `files` key from the same DB and returns a
list of `EnteFile` objects. Important details:

- These are "collection files": one entry per file per collection.
- The same file can appear multiple times with different `collectionID`.
- Only metadata is stored; actual file bytes are not stored in IndexedDB.
- A migration merges legacy `hidden-files` into `files` on read.
- A lightweight transform cleans legacy fields when needed.

Refs:

- `web/packages/new/photos/services/photos-fdb.ts`
- `web/packages/gallery/services/files-db.ts`

## Why this data is stored locally

- Fast startup and offline access: the gallery can render before network sync.
- Efficient UI derivations: counts, cover files, summaries are computed locally.
- Incremental sync: per-collection and global timestamps allow delta pulls.

Refs:

- `web/apps/photos/src/pages/gallery.tsx`
- `web/packages/new/photos/components/gallery/reducer.ts`

## How the data is populated (first time)

1. On initial gallery mount, the app reads local state:
   - `savedCollections()`
   - `savedCollectionFiles()`
   - `savedTrashItems()`
2. If this is a fresh install, those return empty arrays.
3. The app then runs a remote pull:
   - `pullCollections()` fetches `/collections/v2` diffs and saves results via
     `saveCollections()` + `saveCollectionsUpdationTime()`.
   - `pullCollectionFiles()` fetches `/collections/v2/diff` for each collection
     and merges results into `saveCollectionFiles()`. It also updates
     `<collectionId>-time` to track per-collection sync progress.
4. Each time a batch is saved locally, the gallery state is also updated via
   `onSetCollections` / `onSetCollectionFiles` so the UI reflects new data.

Refs:

- `web/apps/photos/src/pages/gallery.tsx`
- `web/packages/new/photos/services/pull.ts`
- `web/packages/new/photos/services/collection.ts`

## What localForage means here

localForage is a small storage library that exposes a promise-based API over
IndexedDB and falls back to other web storage when IndexedDB is unavailable.
In this codebase it is used for the `ente-files` DB to keep the API simple and
stable while storing large metadata arrays.

Ref:

- `web/packages/gallery/services/files-db.ts`
