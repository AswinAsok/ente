import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { apps, appServersFor } from "./apps.ts";

const projects = process.env.ENTE_E2E_PROJECTS?.split(",");
const selected = Object.entries(apps).filter(
    ([name]) => !projects || projects.includes(name),
);
const servers = appServersFor(selected.map(([name]) => name));

export default defineConfig({
    outputDir: "./test-results",
    forbidOnly: !!process.env.CI,
    workers: process.env.CI ? 2 : 1,
    retries: 0,
    timeout: 120_000,
    expect: { timeout: 30_000 },
    reporter: [
        ["list"],
        ["html", { outputFolder: "playwright-report", open: "never" }],
    ],
    use: {
        ...devices["Desktop Chrome"],
        locale: "en-US",
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
    },
    projects: selected.map(([name, { port }]) => ({
        name,
        testDir: `../apps/${name}/e2e`,
        use: { baseURL: `http://localhost:${port}` },
        ...(name === "share" && {
            metadata: { lockerURL: `http://localhost:${apps.locker.port}` },
        }),
    })),
    webServer: Object.entries(apps)
        .filter(([name]) => servers.includes(name))
        .map(([name, { port, readyPath }]) => ({
            command: `node e2e/serve.ts ${name}`,
            cwd: fileURLToPath(new URL("..", import.meta.url)),
            url: `http://localhost:${port}${readyPath}`,
            reuseExistingServer: false,
            timeout: 180_000,
        })),
});
