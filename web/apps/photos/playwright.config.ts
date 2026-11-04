import { defineConfig } from "@playwright/test";
import { join, resolve } from "node:path";
import type { PhotosOptions } from "./e2e/fixtures";

const output =
    process.env.E2E_OUTPUT_DIR ??
    resolve(__dirname, "../../e2e-results");

export default defineConfig<PhotosOptions>({
    testDir: "./e2e",
    outputDir: join(output, "tests"),
    workers: 1,
    retries: 0,
    forbidOnly: !!process.env.CI,
    timeout: 180_000,
    expect: { timeout: 15_000 },
    use: { actionTimeout: 15_000 },
    reporter: [
        ["list"],
        ["html", { outputFolder: join(output, "report"), open: "never" }],
    ],
    projects: [
        { name: "web", use: { target: "web" } },
        { name: "desktop", use: { target: "desktop" } },
    ],
});
