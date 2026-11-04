#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../../web"
session_dir=$(mktemp -d)
trap 'rm -rf "$session_dir"' EXIT
mkdir -p "$session_dir/data" "$session_dir/config" "$session_dir/runtime"
chmod 700 "$session_dir/runtime"

XDG_DATA_HOME="$session_dir/data" XDG_CONFIG_HOME="$session_dir/config" \
    XDG_RUNTIME_DIR="$session_dir/runtime" dbus-run-session -- bash -euc '
        printf %s photos-e2e | gnome-keyring-daemon --foreground --unlock --components=secrets &
        daemon=$!
        trap '\''kill "$daemon" 2>/dev/null || true; wait "$daemon" 2>/dev/null || true'\'' EXIT
        gdbus wait --session --timeout 30 org.freedesktop.secrets
        xvfb-run -a npm run test:e2e:photos -- --target desktop
    '
