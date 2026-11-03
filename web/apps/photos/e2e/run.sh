#!/usr/bin/env bash
set -euo pipefail

compose=(docker compose -p "ente-photos-e2e-$$" -f ../server/compose.yaml -f apps/photos/e2e/compose.yaml)

cleanup() {
    status=$?
    if (( status != 0 )); then
        "${compose[@]}" logs --tail 100
    fi
    "${compose[@]}" down -v
    exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

"${compose[@]}" up -d --build
for (( attempt = 0; attempt < 60; attempt++ )); do
    if curl --fail --silent --max-time 1 http://localhost:8083/ping > /dev/null; then
        playwright test --config apps/photos/e2e/playwright.config.ts "$@"
        exit
    fi
    sleep 1
done

echo "Museum did not become ready at http://localhost:8083/ping" >&2
exit 1
