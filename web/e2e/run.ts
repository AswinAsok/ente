import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { apps } from "./apps.ts";

const args = process.argv.slice(2);
const { values } = parseArgs({
    args,
    options: { project: { type: "string", multiple: true } },
    strict: false,
    allowPositionals: true,
});
const projects = values.project ?? [];
if (projects.length > 1)
    throw new Error("Select only one --project, or omit it to test all apps");
const project = projects[0];
if (
    project !== undefined &&
    (typeof project !== "string" || !Object.hasOwn(apps, project))
) {
    throw new Error("Expected --project=photos or --project=locker");
}
const selected = Object.keys(apps).filter(
    (name) => project === undefined || name === project,
);
const env = { ...process.env, ENTE_E2E_PROJECT: project ?? "" };
if (
    !process.env.NEXT_PUBLIC_ENTE_ENDPOINT ||
    !process.env.ENTE_TEST_EMAIL_CODE
) {
    throw new Error(
        "Run npm run test:e2e to start an isolated test backend before building",
    );
}
const cwd = fileURLToPath(new URL("..", import.meta.url));
let child: ChildProcess | undefined;
const state = { interrupted: false };

// Let the active build or Playwright command shut down before the backend exits.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
        state.interrupted = true;
        child?.kill(signal);
    });
}

const commands: [string, string[]][] = [
    ...selected.map((name): [string, string[]] => [
        "npm",
        ["run", `build:${name}`],
    ]),
    [
        process.execPath,
        [
            "node_modules/playwright/cli.js",
            "test",
            "--config",
            "e2e/playwright.config.ts",
            ...args,
        ],
    ],
];

for (const [command, commandArgs] of commands) {
    const status = await new Promise<number>((resolve, reject) => {
        child = spawn(command, commandArgs, { cwd, env, stdio: "inherit" });
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
