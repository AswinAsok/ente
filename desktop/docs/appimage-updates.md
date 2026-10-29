# Signed AppImage updates

Photos AppImage clients authenticate `appimage-update-x64.json` or
`appimage-update-arm64.json` using the Ed25519 public key bundled in their
resources. Each file contains a base64 payload and one or more signatures over
the exact payload bytes. The signed payload identifies Photos, Linux, the stable
channel, architecture, version, filename, size, SHA-512, and expiry.

The updater only resolves assets in `ente/photos-desktop` at the signed version
tag. Missing keys, missing manifests, invalid signatures, expired metadata, and
rollback below a previously authenticated version stop the update. It checks the
AppImage against the signed digest before announcing the download and immediately
before installation, including installation on normal quit.

The separate JSON manifests leave electron-builder's YAML metadata available to
older clients. The first release containing this verifier establishes the trust
key for future updates; publishing signatures does not protect clients that have
not installed that release. Windows and macOS retain their platform signing.

## Configure production signing before merging

1. Generate an Ed25519 keypair in a trusted maintainer environment and retain a
   secure offline backup of the private key:

    ```sh
    umask 077
    openssl genpkey -algorithm Ed25519 -out appimage-private.pem
    openssl pkey -in appimage-private.pem -pubout -out appimage-public.pem
    ```

2. Set the repository variable `PHOTOS_APPIMAGE_UPDATE_PUBLIC_KEY` to the public
   PEM. Linux AppImage packaging requires it and embeds it in
   `resources/appimage-update-public-key.pem`. The key is read from the installed
   application, never from the feed. Forks and local AppImage builds should use
   their own development keypair.
3. Create the `photos-appimage-signing` GitHub environment. Restrict it to approved
   `release/photos-desktop-v*` branches and require an independent reviewer with
   self-review and bypass disabled. Store `PHOTOS_APPIMAGE_SIGNING_KEY` there as
   the private PEM. Do not put this secret in repository-wide secrets or the
   `production` environment. Protect the workflow and signer source against
   unauthorized changes. These environment controls must be configured in GitHub;
   the workflow file cannot enforce them by itself.
4. Build and exercise an RC after this configuration. The Linux build job stages
   unsigned assets, the protected signing job signs both AppImages without a
   release-upload token, and the publishing job verifies them before uploading to
   the draft. Promotion independently downloads and verifies both signed
   manifests and AppImages before making the release latest. Existing release
   branches must include the signing changes before using this promotion path.

Only the signing step receives the private key. Signing uses Node's built-in
cryptography and filesystem APIs, without executing the AppImages or installing
dependencies. Missing configuration fails packaging or signing; there is no
unsigned fallback.

## Verify and maintain releases

Run `npm run test:appimage-updates` for fixture-based signature, provider, cache,
and installation checks. No test fixture is executable and no production feed is
modified. To verify downloaded release assets with the configured public key:

```sh
node desktop/scripts/appimage-updates.mjs verify /path/to/assets 1.7.32
```

Manifests expire 180 days after signing. Publish a new signed release before that
deadline. Expiry blocks updates, not use of the installed application. If a
release must be kept longer, a maintainer must re-sign the same verified assets
through the protected signing process and replace only the JSON manifests after
verification. Do not disable signature or expiry checks to recover updates.

For key rotation, concatenate the old and new public PEM blocks in the public
variable and the corresponding private PEM blocks in the signing secret. The
resulting release trusts both keys and publishes both signatures. Keep dual
signing while clients that only know the old key need to update. Removing the old
key from subsequent clients does not revoke it in offline old installations;
those installations need a bridge release or trusted manual reinstall if the old
key is lost or compromised.
