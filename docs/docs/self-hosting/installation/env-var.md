---
title: Environment variables and defaults - Self-hosting
description: "Information about all the configuration variables needed to run Ente along with description on default configuration"
---

# Environment variables and defaults

The environment variables needed for running Ente and the default configuration are documented below:

## Environment Variables

A self-hosted Ente web app needs the Museum API endpoint. Web app origins are configured in `museum.yaml` under `apps`. Self-hosted Accounts also needs an explicit list of trusted web callback origins for passkey login and recovery.

This document outlines the essential environment variables and port mappings of the web apps.

Here's the list of environment variables that is used by the cluster:

| Service    | Environment Variable             | Description                                                                                                                                                | Default Value                   |
| ---------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `web`      | `ENTE_API_ORIGIN`                | Alias for `NEXT_PUBLIC_ENTE_ENDPOINT`. API Endpoint for Ente's API (Museum).                                                                               | http://localhost:8080           |
| `web`      | `ENTE_ACCOUNTS_REDIRECT_ORIGINS` | Comma-separated web origins allowed to receive passkey callbacks from self-hosted Accounts. Docker alias for `NEXT_PUBLIC_ENTE_ACCOUNTS_REDIRECT_ORIGINS`. | Empty                           |
| `postgres` | `POSTGRES_USER`                  | Username for PostgreSQL database                                                                                                                           | `pguser`                        |
| `postgres` | `POSTGRES_DB`                    | Name of database for use with Ente                                                                                                                         | `ente_db`                       |
| `postgres` | `POSTGRES_PASSWORD`              | Password for PostgreSQL database's user                                                                                                                    | Randomly generated (quickstart) |
| `minio`    | `MINIO_ROOT_USER`                | Username for MinIO                                                                                                                                         | Randomly generated (quickstart) |
| `minio`    | `MINIO_ROOT_PASSWORD`            | Password for MinIO                                                                                                                                         | Randomly generated (quickstart) |

For example, set `ENTE_ACCOUNTS_REDIRECT_ORIGINS=https://photos.example.org,https://auth.example.org,https://locker.example.org` on the web container. Each entry must be an origin, including the scheme and any non-default port, without a path, query, credentials, or fragment. Subdomains are not included automatically.

For source builds, set `NEXT_PUBLIC_ENTE_ACCOUNTS_REDIRECT_ORIGINS` when building Accounts. Recreate the web container or rebuild the app after changing the configuration. When no origins are configured, self-hosted Accounts only accepts web callbacks to its own origin. Native app callbacks continue to work, and Ente-hosted Accounts retains its built-in allowlist.

## Default Configuration

Self-hosted Ente clusters have certain default configuration for ease of use, which is documented below to understand its behavior:

### Ports

The table below lists the default host/container ports used by Ente's web container and related services. The mapping is of the format `<host-port>:<container-port>` in the compose file.

If you are using `quickstart.sh`, note that only `3000` (Photos) and `3002` (Albums) are exposed by default.

| Service                                                  | Type     | Host Port | Container Port |
| -------------------------------------------------------- | -------- | --------- | -------------- |
| Museum                                                   | Server   | 8080      | 8080           |
| Ente Photos                                              | Web      | 3000      | 3000           |
| Ente Accounts                                            | Web      | 3001      | 3001           |
| Ente Albums                                              | Web      | 3002      | 3002           |
| [Ente Auth](https://ente.com/auth/)                      | Web      | 3003      | 3003           |
| [Ente Cast](https://ente.com/help/photos/features/cast/) | Web      | 3004      | 3004           |
| Ente Public Locker                                       | Web      | 3005      | 3005           |
| Ente Embed                                               | Web      | 3006      | 3006           |
| Ente Paste (if deployed separately)                      | Web      | 3008      | 3008           |
| Ente Locker                                              | Web      | 3009      | 3009           |
| Ente Memories                                            | Web      | 3010      | 3010           |
| MinIO                                                    | S3       | 3200      | 3200           |
| PostgreSQL                                               | Database |           | 5432           |
