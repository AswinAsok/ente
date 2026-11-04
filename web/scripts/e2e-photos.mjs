import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { cp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import handler from "serve-handler";
import { bounded, startProcess, stopProcess } from "./e2e-process.mjs";

const web = resolve(import.meta.dirname, "..");
const root = resolve(web, "..");
const desktop = join(root, "desktop");
const args = process.argv.slice(2);
const targetIndex = args.indexOf("--target");
const targets =
    targetIndex === -1 ? ["web", "desktop"] : [args[targetIndex + 1]];
if (targetIndex !== -1) args.splice(targetIndex, 2);
if (args[0] === "--") args.shift();
if (
    targets.some((target) => !["web", "desktop"].includes(target)) ||
    args.length
) {
    throw new Error("Usage: npm run test:e2e:photos -- [--target web|desktop]");
}

const abort = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () =>
        abort.abort(new Error(`Interrupted by ${signal}`)),
    );
}

for (const target of targets) {
    await runTarget(target);
    if (process.exitCode) break;
}

async function runTarget(target) {
    const output = join(web, "e2e-results", target);
    await rm(output, { recursive: true, force: true });
    await mkdir(output, { recursive: true });
    const children = [];
    let museum;
    let ready;
    let server;
    let failed = true;
    const start = (command, args, cwd, env, name) => {
        const child = startProcess(command, args, {
            cwd,
            env,
            log: join(output, `${name}.log`),
        });
        children.push(child);
        return child;
    };
    const run = async (command, args, cwd, env, name) => {
        console.log(`[${target}] ${name}`);
        const child = start(command, args, cwd, env, name);
        const result = await bounded(
            child.exited,
            15 * 60_000,
            name,
            abort.signal,
        );
        if (result.code !== 0) {
            throw new Error(
                `${name} exited with ${result.code ?? result.signal}; see ${output}`,
            );
        }
    };
    try {
        const rust = join(root, "rust");
        await run(
            "cargo",
            [
                "build",
                "--locked",
                "-p",
                "ente-test-support",
                "--bin",
                "ente-test-museum",
            ],
            rust,
            process.env,
            "build-museum-launcher",
        );
        const metadata = JSON.parse(
            execFileSync(
                "cargo",
                ["metadata", "--no-deps", "--format-version", "1", "--locked"],
                { cwd: rust, encoding: "utf8" },
            ),
        );
        museum = start(
            join(
                metadata.target_directory,
                "debug",
                `ente-test-museum${process.platform === "win32" ? ".exe" : ""}`,
            ),
            [],
            rust,
            process.env,
            "museum-launcher",
        );
        const lines = createInterface({ input: museum.child.stdout });
        try {
            const line = await bounded(
                Promise.race([
                    once(lines, "line").then(([line]) => line),
                    museum.exited.then(() => {
                        throw new Error("Museum exited before readiness");
                    }),
                ]),
                5 * 60_000,
                "Museum readiness",
                abort.signal,
            );
            ready = JSON.parse(line);
        } finally {
            lines.close();
        }
        if (
            !ready.endpoint?.startsWith("http://127.0.0.1:") ||
            !ready.email_suffix ||
            !ready.ott ||
            !ready.logs_dir
        ) {
            throw new Error("Invalid Museum readiness metadata");
        }
        const env = {
            ...process.env,
            NEXT_PUBLIC_ENTE_ENDPOINT: ready.endpoint,
            CSC_IDENTITY_AUTO_DISCOVERY: "false",
        };
        delete env._ENTE_IS_DESKTOP;
        delete env.ELECTRON_RUN_AS_NODE;
        let baseURL;
        let executable;
        if (target === "web") {
            await run("npm", ["run", "build:photos"], web, env, "build-photos");
            server = createServer((request, response) => {
                void handler(request, response, {
                    public: join(web, "apps/photos/out"),
                    cleanUrls: true,
                    directoryListing: false,
                });
            });
            server.listen(0, "127.0.0.1");
            await once(server, "listening");
            baseURL = `http://127.0.0.1:${server.address().port}`;
            const response = await fetch(baseURL, {
                signal: AbortSignal.timeout(15_000),
            });
            if (!response.ok)
                throw new Error("Photos static server is not ready");
        } else {
            env._ENTE_IS_DESKTOP = "1";
            await run(
                "node",
                ["scripts/postinstall.mjs", "--if-needed"],
                desktop,
                env,
                "prepare-desktop-dependencies",
            );
            await run(
                "npm",
                ["run", "build-renderer"],
                desktop,
                env,
                "build-desktop-renderer",
            );
            await run(
                "npm",
                ["run", "codegen:napi"],
                desktop,
                env,
                "build-desktop-bindings",
            );
            await run(
                "npm",
                ["exec", "--", "tsc"],
                desktop,
                env,
                "build-desktop-main",
            );
            const platform =
                process.platform === "darwin"
                    ? "mac"
                    : process.platform === "linux"
                      ? "linux"
                      : undefined;
            if (!platform)
                throw new Error(
                    "Desktop E2E currently supports Linux and macOS",
                );
            const packageOutput = join(desktop, "dist", "e2e", process.arch);
            await run(
                "npm",
                [
                    "exec",
                    "--",
                    "electron-builder",
                    "--dir",
                    `--${platform}`,
                    `--${process.arch}`,
                    "--publish",
                    "never",
                    "--config.compression=store",
                    "--config.mac.identity=null",
                    `--config.directories.output=${packageOutput}`,
                ],
                desktop,
                env,
                "package-desktop",
            );
            executable = await findExecutable(packageOutput);
        }
        await run(
            "npm",
            [
                "exec",
                "--workspace",
                "photos",
                "--",
                "playwright",
                "test",
                "--project",
                target,
            ],
            web,
            {
                ...env,
                E2E_BASE_URL: baseURL ?? "",
                E2E_ELECTRON_EXECUTABLE: executable ?? "",
                E2E_MUSEUM_ENDPOINT: ready.endpoint,
                E2E_EMAIL_SUFFIX: ready.email_suffix,
                E2E_OTT: ready.ott,
                E2E_OUTPUT_DIR: output,
            },
            "playwright",
        );
        failed = false;
    } catch (error) {
        console.error(error);
        process.exitCode = 1;
    } finally {
        // Stop build/test processes before requesting backend teardown.
        for (const child of children.toReversed()) {
            if (child !== museum)
                await stopProcess(child).catch((error) => {
                    console.error(error);
                    failed = true;
                    process.exitCode = 1;
                });
        }
        if (server) {
            server.closeAllConnections();
            await new Promise((done) => server.close(done));
        }
        if (museum) {
            museum.child.stdin.on("error", () => {});
            museum.child.stdin.end(failed ? "failed\n" : "stop\n");
            const result = await bounded(
                museum.exited,
                30_000,
                "Museum shutdown",
            ).catch(async (error) => {
                console.error(error);
                failed = true;
                process.exitCode = 1;
                await stopProcess(museum);
            });
            if (!failed && result?.code !== 0) {
                console.error("Museum exited unsuccessfully during shutdown");
                failed = true;
                process.exitCode = 1;
            }
        }
        if (failed && ready) {
            await cp(ready.logs_dir, join(output, "museum"), {
                recursive: true,
            }).catch(console.error);
        }
        console.log(
            `[${target}] ${failed ? "FAILED" : "PASSED"}; output: ${output}`,
        );
    }
}

async function findExecutable(directory) {
    const { productName } = JSON.parse(
        await readFile(join(desktop, "package.json"), "utf8"),
    );
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (entry.name.endsWith(".app"))
            return join(directory, entry.name, "Contents/MacOS", productName);
        if (entry.name.endsWith("-unpacked") && process.platform === "linux")
            return join(directory, entry.name, productName);
        if (entry.name.startsWith("mac"))
            return findExecutable(join(directory, entry.name));
    }
    throw new Error(`Unpacked Electron executable not found in ${directory}`);
}
