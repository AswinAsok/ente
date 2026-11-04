# ente-test-support

Runs a local Museum backed by temporary Postgres and object storage for use by various Rust integration tests.

## Setup

Requires `go` on PATH to build and run Museum. The Postgres binary ([postgresql_embedded](https://crates.io/crates/postgresql_embedded)) is downloaded and cached on first use.

## Usage

Tests that use it are gated behind a Cargo feature so that a plain `cargo test` skips them. They can be run by enabling the `museum` feature, e.g.:

```sh
cargo test -p ente-cli --features museum
```

## External test runners

`ente-test-museum` makes the same backend available to browser tests and other
non-Rust runners:

```sh
cargo run --locked -p ente-test-support --bin ente-test-museum
```

Spawn it with piped stdin and stdout. Once Museum is ready, stdout emits one JSON
line with these fields:

| Field | Meaning |
| --- | --- |
| `endpoint` | Local Museum URL, including its dynamically allocated port |
| `email_suffix` | Test email suffix (`@example.org`) |
| `ott` | Email verification code accepted for that suffix (`123456`) |
| `logs_dir` | Directory containing `museum.log` |

Build diagnostics go to stderr. A startup failure exits nonzero without emitting
readiness. Go and the repository's server sources must be available, and the first
run needs network access to download Postgres. No Docker is required. Object
storage is the existing disk-backed test server, not a full S3 implementation.

Keep stdin open while testing. To shut down, write `stop\n` and wait for the
process to exit, or close stdin. Write `failed\n` instead if the tests failed:
the launcher exits nonzero and retains Museum's temporary directory and logs.
Backend processes and temporary Postgres/object storage are stopped in either
case. On Unix, SIGINT and SIGTERM also trigger clean shutdown. A hard kill cannot
run cleanup.

For Photos, the caller would start Next.js with `NEXT_PUBLIC_ENTE_ENDPOINT` set to
the advertised `endpoint`, then point its browser tests at that Next.js server.
The web app needs only the Museum URL; it does not import this crate. Test signup
can use a unique email ending in `email_suffix` and enter `ott` through the UI.
The caller owns web/browser startup, readiness timeouts, diagnostics, and stopping
those processes before shutting down Museum.

The launcher itself is exercised against the live backend with:

```sh
cargo test --locked -p ente-test-support --features museum --test launcher
```
