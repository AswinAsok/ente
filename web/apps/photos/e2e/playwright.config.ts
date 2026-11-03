import { defineConfig } from "@playwright/test";

const photos = "http://localhost:3100";

export default defineConfig({
    testDir: ".",
    outputDir: "./test-results",
    timeout: 90_000,
    expect: { timeout: 20_000 },
    use: {
        actionTimeout: 20_000,
        baseURL: photos,
        channel: "chrome",
        trace: "retain-on-failure",
    },
    webServer: {
        command:
            "npm run build:prelogin-wasm && npm run build:photos-wasm && npm exec --workspace photos -- next dev --webpack -p 3100",
        cwd: "../../..",
        env: { NEXT_PUBLIC_ENTE_ENDPOINT: "http://localhost:8083" },
        url: photos,
        timeout: 300_000,
    },
});
