# Duplicate removal: manual end-to-end verification

Verified on 2026-10-30 for commit `6c3ece3b2fdcb67420f46944546af674975d1eb1`
in PR #14241, using the Photos web app at `http://localhost:3030` connected to
local Museum at `http://localhost:8080`, PostgreSQL, and object storage.
Testing used disposable local accounts.

## Real-file comparisons

Uploaded three byte-identical PNG files with different filenames, one each in
albums Parity A, B, and C. A temporary browser harness compared the previous Web
execution path with the combined Rust planning and execution call. Before each
run it restored the same file IDs and original album memberships. Metadata for
each retention case was supplied on the selected group passed to the service.
The WASM implementation and Museum mutation requests were real.

All eight cases passed:

| Case                                    | Surviving copy |
| --------------------------------------- | -------------- |
| Caption preference                      | B              |
| Fallback to album order                 | A              |
| Renamed copy                            | C              |
| Edited date                             | B              |
| Caption tie                             | A              |
| Edit tie                                | A              |
| Empty edited name overrides edited date | A              |
| Legacy numeric caption `0`              | B              |

For every case, both paths produced identical surviving file IDs, memberships in
all three albums, trashed IDs, mutation request order and file IDs, and progress
values (`25`, `50`, `75`, `100`). All album additions preceded trashing.

Four failure comparisons also passed. The harness injected HTTP 503 responses
at the first album addition, second album addition, trash request, or gallery
refresh. All other requests reached local Museum. Both implementations rejected
the operation with matching requests, progress, and persisted state. Addition
failures prevented trashing; trash failure preserved the copies; refresh failure
left the completed remote removal intact without reporting 100% completion.

Separately, deletion was exercised through Settings > Free up space > Duplicates
using a caption saved through the normal UI. After a full reload, the captioned
file remained accessible from all three albums, its caption was preserved, the
two extra copies appeared in Trash, and the Duplicates view showed no duplicates.

## Large-fixture stress run

An isolated account was seeded with 100,000 duplicate pairs (200,000 metadata-only
file records) in two albums. The real browser WASM removal call wrapped and added
100,000 retained file keys, then trashed 100,000 duplicate files through Museum.
All 200 requests succeeded: 100 add-files and 100 trash requests, each containing
1,000 items.

The single measured run took 7.14 seconds. First progress arrived after 2.41
seconds; the longest timer gap was 220.5 ms. WASM linear-memory capacity grew from
1.4 to 60.3 MiB. These measurements demonstrate a remaining responsiveness concern;
they are not a general performance guarantee. Database queries confirmed 100,000
original files active in each album, 100,000 duplicates in Trash, and no active
duplicate memberships.

## Automated local Museum test

`dedup_museum_test.rs` uses `ente-test-support::Museum::run_async` to start an
isolated Museum with temporary PostgreSQL and object storage. It creates accounts
and albums, uploads encrypted original and thumbnail objects, and creates file
records through the real APIs. It reads and decrypts the stored metadata before
running duplicate grouping and the combined removal call.

The test covers the eight retention cases above, checking the surviving ID in
every album, opened file keys, public metadata, decrypted downloads, Trash IDs,
and progress. Two additional cases use an inaccessible album owned by another
account to cause a real Museum HTTP 404 on the first or a later addition. They
verify that no files are trashed and that only completed additions persist.
No Mockito server or injected HTTP response is used in this test.

Run from `rust/` with Go on `PATH`:

```sh
cargo test --locked -p ente-photos --features museum --test dedup_museum_test
```

This test passed locally on 2026-10-30. The `museum` feature follows the existing
Rust integration-test pattern and is enabled by the Rust test CI workflow.

## Scope and remaining gaps

The automated test covers the shared Rust grouping and removal path against real
Museum. Browser UI behavior, JavaScript/WASM integration, injected network and
refresh failures, and the large-fixture stress measurements remain separate
checks. The temporary browser harness was removed after verification; the Rust
HTTP mock tests and WASM binding tests complement the local Museum test.

The stress run did not upload or render 200,000 images, measure gallery refresh at
that scale, or test mobile and CLI integrations. The proposed per-batch encryption
and progress fix remains stashed locally and is not included in the PR or the
stress results documented here.
