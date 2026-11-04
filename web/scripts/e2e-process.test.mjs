import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { bounded, startProcess, stopProcess } from "./e2e-process.mjs";

test("a failed startup preserves its exit status and logs", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ente-process-test-"));
    try {
        const log = join(directory, "child.log");
        const child = startProcess(
            process.execPath,
            ["-e", 'console.error("startup failure"); process.exitCode = 7'],
            { log },
        );
        assert.equal((await child.exited).code, 7);
        assert.match(await readFile(log, "utf8"), /startup failure/);
        await stopProcess(child);
    } finally {
        await rm(directory, { recursive: true });
    }
});

test("timeout and interruption leave the caller able to stop its child", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ente-process-test-"));
    const child = startProcess(
        process.execPath,
        ["-e", 'process.stdin.resume(); console.log("ready")'],
        { log: join(directory, "child.log") },
    );
    try {
        await once(child.child.stdout, "data");
        await assert.rejects(
            bounded(child.exited, 20, "readiness"),
            /readiness timed out/,
        );
        const abort = new AbortController();
        const pending = bounded(child.exited, 60_000, "test run", abort.signal);
        abort.abort(new Error("Interrupted by SIGTERM"));
        await assert.rejects(pending, /Interrupted by SIGTERM/);
        await stopProcess(child);
        assert.notEqual((await child.exited).signal, null);
    } finally {
        await stopProcess(child);
        await rm(directory, { recursive: true });
    }
});
