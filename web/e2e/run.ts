import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { appNames, apps, appServersFor } from "./apps.ts";

const args = process.argv.slice(2);
const { values } = parseArgs({
    args,
    options: { project: { type: "string", multiple: true } },
    strict: false,
    allowPositionals: true,
});
const projects = values.project ?? [];
if (
    projects.some(
        (name) => typeof name !== "string" || !Object.hasOwn(apps, name),
    )
) {
    throw new Error(`Expected --project to be one of: ${appNames.join(", ")}`);
}
const selected = appNames.filter(
    (name) => !projects.length || projects.includes(name),
);
const env = { ...process.env, ENTE_E2E_PROJECTS: selected.join(",") };
if (
    !process.env.NEXT_PUBLIC_ENTE_ENDPOINT ||
    !process.env.ENTE_TEST_EMAIL_CODE
) {
    throw new Error(
        "Run npm run test:e2e to start an isolated test backend before building",
    );
}
const cwd = fileURLToPath(new URL("..", import.meta.url));
const npmCLI = process.env.npm_execpath;
if (!npmCLI) throw new Error("Run this script through npm run test:e2e");
let child: ChildProcess | undefined;
const state = { interrupted: false };

for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
        state.interrupted = true;
        child?.kill(signal);
    });
}

const servers = appServersFor(selected);
const wasmBuilds =
    process.env.ENTE_E2E_WASM_CACHE_HIT === "true"
        ? []
        : [
              "build:prelogin-wasm",
              ...servers
                  .filter((name) => name !== "share")
                  .map((name) => `build:${name}-wasm`),
          ];
const builds = [...wasmBuilds, ...servers.map((name) => `build:${name}:app`)];
const commands = [
    ...builds.map((script) => [npmCLI, "run", script]),
    [
        "node_modules/playwright/cli.js",
        "test",
        "--config",
        "e2e/playwright.config.ts",
        ...args,
    ],
];

for (const commandArgs of commands) {
    const status = await new Promise<number>((resolve, reject) => {
        child = spawn(process.execPath, commandArgs, {
            cwd,
            env,
            stdio: "inherit",
        });
        child.once("error", reject);
        child.once("close", (code, signal) => {
            resolve(code ?? (signal === "SIGINT" ? 130 : 1));
        });
    });
    child = undefined;
    if (status !== 0 || state.interrupted) {
        process.exitCode = status || 1;
        break;
    }
}
