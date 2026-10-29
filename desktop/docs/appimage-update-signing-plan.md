# Plan: authenticate Photos AppImage updates

Status: proposed implementation plan. This document does not change runtime or
release behavior and does not resolve [ente/review#124](https://github.com/ente/review/issues/124).

Sign the Linux update metadata with an Ente-controlled Ed25519 key, embed its
public key in the app, and verify the metadata before the updater can download
an AppImage. Keep electron-updater's existing download, checksum, and installation
machinery.

## 1. Scope and signature contract

The current checkout uses electron-builder 26.18.0 and electron-updater 6.8.9.
Neither provides the built-in signed-manifest configuration described in the
[upcoming v27 documentation](https://www.electron.build/docs/features/signed-update-manifests/).
Implement a small Linux provider using the existing custom-provider extension;
do not require a prerelease dependency upgrade. Reassess that choice before
implementation if upstream ships stable support.

Apply the new verification to production Photos running as an AppImage on x64
or arm64. Preserve Windows and macOS platform signing and the current behavior of
other Linux packages and development builds. Verify the actual generated channel
filenames for both architectures before implementing the provider.

The security boundary is a compromised release feed or upload credential. The
attacker must not be able to produce a trusted signature merely by changing a
GitHub release. A compromised signing key, authorized malicious build, or attacker
already able to modify the installed application remains outside this fix.

- Preserve the existing `latest-linux*.yml` fields used by older clients. Add an
  `enteUpdate` object containing schema version `1`, application ID
  `io.ente.bhari-frame`, product `photos`, channel `stable`, platform `linux`,
  architecture, and an expiry timestamp. The existing version, artifact names,
  sizes, and SHA-512 values are also covered by the signature.
- Sign the final UTF-8 bytes of the manifest, without parsing and reserializing
  them during verification. Use Node's built-in `crypto` Ed25519 support. Publish
  a sibling `<manifest>.sig` JSON file containing a format version and a
  `signatures` array of `{ keyId, signature }`, where each signature is base64.
  Start with one signing key; the array permits an overlapping key rotation.
- Embed the allowed public keys and their identifiers in reviewed client source.
  A key ID from the sidecar only selects a locally trusted key. Never accept a
  public key supplied by the feed, signature file, or user preferences.
- After verifying the bytes, validate the signed identity, channel, platform,
  architecture, semantic version, expiry, and artifact fields. Reject missing or
  invalid signatures, unsupported schemas, duplicate YAML keys, and unexpected
  artifact paths. Bound metadata and sidecar sizes before parsing.
- Initially use a 180-day metadata lifetime. Renew signed metadata before expiry
  even when no new binary is released, with an operational reminder at 30 days
  remaining. An expired manifest stops updating; the installed app keeps working.
  Reject downgrades and versions below the highest authenticated version already
  seen for this channel. Allow retrying that same version after a failed download.

## 2. Client implementation

Wire a dedicated signed provider into `setupAutoUpdater` before any update check.
Automatic startup checks, daily checks, and manual checks must use the same
provider instance. Keep `autoDownload = false` and the existing update dialog.

The provider treats GitHub's latest-release pointer as discovery only. It fetches
the architecture-specific manifest and its sidecar from the same release tag,
verifies them, and requires that the tag agrees with the signed version. Resolve
artifact URLs using the fixed `ente/photos-desktop` repository, that version tag,
and validated artifact basenames. Do not accept arbitrary download origins from
the manifest.

Return update information parsed from the exact verified bytes. Do not verify a
separate fetch and then let the normal GitHub provider fetch metadata again. That
would let the bytes checked differ from those used for installation. A small
implementation of the custom provider's `getLatestVersion` and `resolveFiles`
methods keeps the normal downloader and its SHA-512 enforcement intact.

Register error handling before checking for updates, including failures raised
before downloading. A verification failure must not emit `update-downloaded`,
create an installable candidate, or fall back to the unsigned provider. Show a
clear update-verification error without offering to install the rejected file.
Inspect the existing error dialog path before reusing its download action.

Cached updates must also pass through an authenticated check and match the signed
digest before becoming installable. Verify this against the pinned dependency's
cache behavior; do not assume that hiding the restart button blocks installation.
electron-updater also installs downloaded updates on normal quit. Both that path
and `quitAndInstall()` must only use an authenticated candidate. A previously
authenticated candidate may remain installable after a later network failure;
the failure must never authorize a different candidate.

Planned source changes:

| File                                                      | Responsibility                                                                                      |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `desktop/src/main/services/app-update.ts`                 | Configure the signed AppImage provider before checks and handle verification failures.              |
| New `desktop/src/main/services/app-update-signature.ts`   | Pinned public keys, signature verification, and signed metadata validation.                         |
| New `desktop/src/main/services/app-update-provider.ts`    | Release discovery, authenticated metadata retrieval, and artifact resolution.                       |
| `desktop/src/main/stores/user-preferences.ts`             | Persist the highest authenticated stable Linux version. This is rollback state, not a trust anchor. |
| Focused desktop verification/provider fixtures and checks | Exercise the real update boundaries, including cached downloads and installation on quit.           |

Use existing dependencies where practical. Any direct imports of updater runtime
types or YAML parsing libraries should have explicit package declarations rather
than relying on transitive dependency hoisting. Keep key validation and provider
logic independent of Electron startup so they can be checked with local fixtures.

## 3. Release pipeline changes

The current RC build runs electron-builder with `--publish always`, producing the
draft release in `ente/photos-desktop`. Promotion in `app-release.yml` subsequently
makes that draft public and latest. Insert signing before publishing Linux update
metadata and verification before promotion.

1. In `.github/workflows/photos-desktop-build.yml`, package Linux with publishing
   disabled and retain AppImages, update YAML, and associated update assets for
   both architectures. Leave Windows and macOS signing behavior intact. Ordinary
   nightly builds must not obtain the production update-signing key.
2. Add `desktop/scripts/sign-appimage-updates.mjs`. Recompute the artifact sizes
   and SHA-512 values, check them against the generated manifests, add the signed
   context, and produce the detached signatures. Abort if either architecture or
   any expected artifact is missing or mismatched.
3. Run signing in a separate job with a dedicated protected environment. Only
   approved release refs can use the key. Execute the signer from reviewed source
   at a pinned revision; never run a downloaded AppImage, dependency install, or
   artifact-supplied script in the signing job. Give this job no release-upload
   credential. Provision the environment restrictions and secret outside the
   repository before enabling the job.
4. Give a separate publishing job release-upload access, without the signing key.
   Upload the exact signed metadata, sidecars, and matching assets to the draft.
   Check whether the draft already exists or is already published before writing;
   do not overwrite assets of a public release as part of a routine RC rebuild.
5. In `.github/workflows/app-release.yml`, verify the uploaded manifests against
   the pinned public key and recompute both uploaded AppImage digests before
   marking the draft latest. Require matching app, architecture, tag, version,
   channel, and unexpired signatures. For release lines adopting this feature,
   missing signing output must block promotion. Document the procedure in
   `desktop/docs/release.md`.

Environment protection must prevent an upload-only principal from changing or
invoking the signer on arbitrary bytes. A separate job name alone does not create
that boundary. Do not claim protection against compromise of an account that can
also bypass the signing environment's controls.

## 4. Rollout and recovery

Publish signed metadata before distributing a client that requires it. Existing
clients must still parse the metadata and ignore the added fields and sidecars;
confirm this using the currently shipped client version as well as the pinned
development dependency.

The first release containing the public key and verifier bootstraps protection.
Its old clients cannot authenticate that transition with a key they do not yet
have. Protection applies to subsequent updates after users have installed that
release. Do not describe merely publishing signatures as protecting old installs.

Exercise the transition on an isolated fixture feed with development keys and
Linux x64 and arm64 builds. The production key must never be used in local checks,
committed fixtures, or fork CI. Require a real pinned production public key in
release packaging; never ship a placeholder or silently disable verification
because a key is missing.

For planned key rotation, ship a client trusting both old and new public keys in
an update signed by the old key. Dual-sign manifests during the transition, then
remove the old key from later clients when appropriate. Installs that never
received the new key need a supported bridge release or a trusted manual
reinstall. A leaked key cannot be safely revoked for every offline old client
through an unauthenticated feed message.

Keep an offline backup of the signing key. Publish corrections as a higher signed
version instead of enabling downgrades or unsigned fallback. If the signer is
unavailable, leave the installed app usable and block release promotion. Document
the expiry-renewal owner and key-loss recovery before enabling enforcement.

## 5. Acceptance checks and implementation order

Use generated development keys and local fixtures. Never publish or execute a
malicious update against the production feed.

- Accept a valid signed manifest and matching AppImage for each architecture.
  Reject matching feed metadata and SHA-512 when the trusted signature is absent,
  from another key, malformed, or changed. Mutating any signed field must fail.
- Reject wrong app, product, channel, platform, architecture, release tag,
  expired metadata, and rollback attempts. Cover same-version download retries,
  malformed YAML, excessive metadata, and old/new key overlap.
- Tamper with the AppImage after signing and with a cached download. Assert that
  neither can become installable through explicit restart or normal quit. Cover
  metadata changes between requests and verify that only the authenticated
  metadata object reaches the downloader.
- Check startup, daily, and manual update paths, signature-fetch failures,
  cancellation, retries, and a prior authenticated candidate. Confirm existing
  Windows/macOS behavior and old-client compatibility with the added fields.
- Dry-run packaging, signing, and draft verification for x64 and arm64 with test
  keys. Assert that promotion rejects missing sidecars and replaced assets. Run
  desktop lint/type checks and the focused automated checks before shipping.

Implement in three reviewable changes: the signature contract and fixture checks;
the signing/publishing/promotion pipeline; then client enforcement and rollout
checks. Land and exercise the signing pipeline before releasing the enforcing
client. Keep the issue open until the client and production signing pipeline are
both deployed and the signed update path is verified.
