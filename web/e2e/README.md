# Web end-to-end tests

Run from `web/` with Node 24, npm, Rust/Cargo, and Go (see `server/go.mod`)
available on PATH:

```sh
npm ci
npx playwright install --with-deps chromium
npm run test:e2e
npm run test:e2e -- --project=photos
npm run test:e2e -- --project=locker
```

The command builds the required WASM packages once, then the Rust `with-museum`
runner starts real Museum with temporary PostgreSQL and test object storage using
`ente-test-support`. PostgreSQL is downloaded and cached on first use. Docker and
existing Ente accounts are not required.

The runner passes `NEXT_PUBLIC_ENTE_ENDPOINT` and the test-only email code/domain
to Playwright. Playwright starts fresh Photos and Locker development servers on
ports 3300 and 3309; both must be free, including when selecting just one project.
Each test signs up a unique account through the UI against the isolated backend.
Browser contexts are isolated, and backend data is removed after the run.

Playwright stops its frontend servers, then Rust stops the backend. On failure,
the runner retains Museum's diagnostic directory and prints its location. On
Unix, SIGINT/SIGTERM during the test command allows up to 20 seconds for graceful
shutdown before forcing the command's process group to exit.

Use `npm run test:e2e -- --headed` to watch the browser, or add `--debug` to step
through tests. Open the HTML report afterward:

```sh
npx playwright show-report e2e/playwright-report
```

Failure traces and screenshots are under `e2e/test-results/`. Reports and browser
state are ignored by Git. The object store is a lightweight test implementation;
these tests do not validate a production S3 service. CI should install the same
prerequisites and invoke `npm run test:e2e`.
