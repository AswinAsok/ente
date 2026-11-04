# Photos end-to-end tests

The same Playwright scenario runs against the production web export and an
unpacked production Electron app. Each target starts its own local Museum,
temporary Postgres, and disk-backed test object storage using
`rust/crates/test-support`. Tests sign up through the UI with disposable accounts;
no saved credentials or production backend are used.

## Prerequisites

Install Node 24, Rust (including the `wasm32-unknown-unknown` target), and Go matching
`server/go.mod`. Run `npm ci` in `web`, then install Chromium:

```sh
npm exec --workspace photos -- playwright install --with-deps chromium
```

For desktop, also run `npm ci` in `desktop`. Its existing install and packaging
scripts fetch the native media libraries and build Rust bindings. The first run
needs network access for these dependencies and the temporary Postgres binary.
Docker is not required.

## Run

From `web`:

```sh
npm run test:e2e:photos -- --target web
npm run test:e2e:photos -- --target desktop
npm run test:e2e:photos
```

The last command runs both targets sequentially. Desktop currently supports
macOS and Linux. On Linux, install Xvfb, D-Bus, GNOME Keyring, and the native build
prerequisites listed in `.github/workflows/photos-e2e.yml`. From the repository
root, use this wrapper to supply an isolated display and keyring session:

```sh
desktop/scripts/e2e-linux.sh
```

Both targets build automatically after Museum starts so its dynamically allocated
URL is embedded in the renderer. Web uses an available loopback port. Electron
loads the packaged `ente://app` renderer, including its real preload, IPC, and
native bindings. A temporary profile is supplied through
`ENTE_E2E_USER_DATA_DIR`; this opt-in mode sets the profile before stores initialize
and skips protocol registration and automatic updates. Never point it at a normal
user profile.

The initial scenario creates an empty album, reloads, then logs in through a fresh
browser context or Electron profile and reopens the album. It does not exercise
file storage or ML/People recognition yet. No API responses are mocked.

## Failures and cleanup

Output lives under `web/e2e-results/web` or `web/e2e-results/desktop`. Build and
launcher logs are always recorded. Failed tests retain screenshots, traces,
Playwright's HTML report, and available Electron and Museum logs. CI uploads these
for seven days. These artifacts contain disposable test account information.

The coordinator stops its applications before asking Rust to stop the backend.
It handles startup failures, test failures, SIGINT, and SIGTERM, preserving the
original failing result. Forced termination such as SIGKILL cannot guarantee
cleanup. Museum readiness has a five-minute timeout, build stages have a
fifteen-minute timeout, and shutdown has a thirty-second timeout.

To exercise coordinator process handling separately:

```sh
node --test scripts/e2e-process.test.mjs
```

Existing `npm test` Vitest suites remain separate from E2E testing.
