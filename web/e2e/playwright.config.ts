import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";

const endpoint = process.env.NEXT_PUBLIC_ENTE_ENDPOINT ?? "";

const apps = [
    { name: "photos", port: 3300 },
    { name: "locker", port: 3309 },
];

export default defineConfig({
    testDir: "./tests",
    outputDir: "./test-results",
    forbidOnly: !!process.env.CI,
    workers: 1,
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
    projects: apps.map(({ name, port }) => ({
        name,
        testDir: `./tests/${name}`,
        use: { baseURL: `http://localhost:${port}` },
    })),
    webServer: apps.map(({ name, port }) => ({
        command: `npm exec --workspace ${name} -- next dev --webpack -p ${port}`,
        cwd: fileURLToPath(new URL("..", import.meta.url)),
        url: `http://localhost:${port}/signup`,
        env: { NEXT_PUBLIC_ENTE_ENDPOINT: endpoint },
        reuseExistingServer: false,
        timeout: 180_000,
    })),
});
