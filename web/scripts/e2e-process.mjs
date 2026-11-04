import { spawn } from "node:child_process";
import { once } from "node:events";
import { createWriteStream } from "node:fs";

export function startProcess(command, args, { log, ...options }) {
    const output = createWriteStream(log, { flags: "a" });
    const child = spawn(command, args, {
        ...options,
        detached: process.platform !== "win32",
        stdio: ["pipe", "pipe", "pipe"],
    });
    child.stdout.pipe(output, { end: false });
    child.stderr.pipe(output, { end: false });
    const exited = once(child, "close").then(([code, signal]) => ({
        code,
        signal,
    }));
    // Keep spawn errors handled even while the caller waits for readiness.
    void exited.catch(() => {});
    const finished = exited.finally(
        () => new Promise((done) => output.end(done)),
    );
    void finished.catch(() => {});
    return { child, exited: finished };
}

export async function bounded(promise, ms, label, signal) {
    let timer;
    let onAbort;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timer = setTimeout(
                    () => reject(new Error(`${label} timed out`)),
                    ms,
                );
                onAbort = () => reject(signal.reason);
                if (signal?.aborted) onAbort();
                else signal?.addEventListener("abort", onAbort, { once: true });
            }),
        ]);
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
    }
}

export async function stopProcess(managed) {
    const signalTree = (signal) => {
        try {
            if (process.platform === "win32") managed.child.kill(signal);
            else if (managed.child.pid)
                process.kill(-managed.child.pid, signal);
        } catch (error) {
            if (error.code !== "ESRCH") throw error;
        }
    };
    if (managed.child.exitCode !== null || managed.child.signalCode !== null)
        return;
    signalTree("SIGTERM");
    try {
        await bounded(managed.exited, 30_000, "process shutdown");
    } finally {
        // Include descendants: killing npm alone can leave Electron or a build
        // process running after cancellation.
        signalTree("SIGKILL");
        await managed.exited.catch(() => {});
    }
}
