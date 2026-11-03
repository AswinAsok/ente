# Photos browser tests

With Docker Compose, Google Chrome, and the usual web build dependencies
installed, run these commands from the `web` directory:

```sh
npm ci
npm run test:e2e
```

The test starts an isolated Museum stack on port 8083 and Photos on port 3100.
It uses a throwaway account and a fixed verification code configured only in the
test stack. The runner removes its containers and volumes on exit. Playwright
keeps traces for failed tests in `apps/photos/e2e/test-results`.
