import {
    _electron,
    test as base,
    expect,
    type Browser,
    type BrowserContext,
    type Page,
} from "@playwright/test";
import { createWriteStream } from "node:fs";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface PhotosOptions {
    target: "web" | "desktop";
}

interface App {
    open: () => Promise<Page>;
    restart: () => Promise<Page>;
}

export const test = base.extend<PhotosOptions & { app: App }>({
    target: ["web", { option: true }],
    app: async ({ playwright, target }, use, testInfo) => {
        if (!process.env.E2E_MUSEUM_ENDPOINT?.startsWith("http://127.0.0.1:")) {
            throw new Error(
                "Run npm run test:e2e:photos from web to start local Museum",
            );
        }
        let browser: Browser | undefined;
        let current: { page?: Page; close: () => Promise<void> } | undefined;
        const traces: string[] = [];
        const profiles: string[] = [];
        const errors: string[] = [];
        const open = async () => {
            let page: Page;
            let context: BrowserContext;
            let close: () => Promise<void>;
            if (target === "web") {
                browser ??= await playwright.chromium.launch();
                context = await browser.newContext({ locale: "en-US" });
                page = await context.newPage();
                close = () => context.close();
            } else {
                const profile = await mkdtemp(
                    join(tmpdir(), "ente-photos-e2e-"),
                );
                profiles.push(profile);
                const executable = process.env.E2E_ELECTRON_EXECUTABLE;
                if (!executable)
                    throw new Error("Missing packaged Electron executable");
                const env: Record<string, string> = Object.fromEntries(
                    Object.entries(process.env).filter(
                        (entry): entry is [string, string] =>
                            entry[1] !== undefined,
                    ),
                );
                env.ENTE_E2E_USER_DATA_DIR = profile;
                delete env.ELECTRON_RUN_AS_NODE;
                const electron = await _electron.launch({
                    executablePath: executable,
                    env,
                });
                const log = createWriteStream(
                    testInfo.outputPath(`electron-${profiles.length}.log`),
                );
                electron.process().stdout?.pipe(log, { end: false });
                electron.process().stderr?.pipe(log, { end: false });
                electron.process().once("close", () => log.end());
                current = { close: () => electron.close() };
                page = await electron.firstWindow();
                const actual = await electron.evaluate(
                    ({
                        app,
                        safeStorage,
                    }: {
                        app: {
                            isPackaged: boolean;
                            getPath: (name: "userData") => string;
                        };
                        safeStorage: { isEncryptionAvailable: () => boolean };
                    }) => ({
                        packaged: app.isPackaged,
                        profile: app.getPath("userData"),
                        secureStorage: safeStorage.isEncryptionAvailable(),
                    }),
                );
                expect(actual.packaged).toBe(true);
                expect(actual.profile).toBe(profile);
                expect(actual.secureStorage).toBe(true);
                context = electron.context();
                close = () => electron.close();
            }
            context.setDefaultTimeout(15_000);
            context.setDefaultNavigationTimeout(30_000);
            await context.tracing.start({
                screenshots: true,
                snapshots: true,
                sources: true,
            });
            page.on("pageerror", (error) => errors.push(error.message));
            page.on("request", (request) => {
                if (new URL(request.url()).hostname === "api.ente.com") {
                    errors.push(
                        "Photos attempted to contact production Museum",
                    );
                }
            });
            const trace = testInfo.outputPath(`trace-${traces.length}.zip`);
            traces.push(trace);
            let closed = false;
            current = {
                page,
                close: async () => {
                    if (closed) return;
                    closed = true;
                    try {
                        await context.tracing.stop({ path: trace });
                    } finally {
                        await close();
                    }
                },
            };
            if (target === "web") {
                const url = process.env.E2E_BASE_URL;
                if (!url) throw new Error("Missing Photos web URL");
                await page.goto(url);
            } else {
                await expect(page).toHaveURL(/^ente:\/\/app/);
                await expect
                    .poll(() =>
                        page.evaluate(() => window.electron?.appVersion()),
                    )
                    .toBeTruthy();
            }
            return page;
        };
        const cleanupErrors: unknown[] = [];
        let fixtureFailed = false;
        try {
            await use({
                open,
                restart: async () => {
                    await current?.close();
                    current = undefined;
                    return open();
                },
            });
            expect(errors, "Application errors").toEqual([]);
        } catch (error) {
            fixtureFailed = true;
            throw error;
        } finally {
            let failed =
                fixtureFailed || testInfo.status !== testInfo.expectedStatus;
            try {
                if (failed && current?.page && !current.page.isClosed()) {
                    await testInfo.attach("failure", {
                        body: await current.page.screenshot(),
                        contentType: "image/png",
                    });
                }
            } finally {
                await current
                    ?.close()
                    .catch((error: unknown) => cleanupErrors.push(error));
                await browser
                    ?.close()
                    .catch((error: unknown) => cleanupErrors.push(error));
                failed ||= cleanupErrors.length > 0;
                for (const trace of traces) {
                    if (failed)
                        await testInfo
                            .attach("trace", {
                                path: trace,
                                contentType: "application/zip",
                            })
                            .catch((error: unknown) =>
                                console.error(
                                    "E2E cleanup or artifact collection failed",
                                    error,
                                ),
                            );
                    else await rm(trace, { force: true });
                }
                for (const [index, profile] of profiles.entries()) {
                    if (failed)
                        await cp(
                            join(profile, "logs"),
                            testInfo.outputPath(`desktop-logs-${index}`),
                            { recursive: true },
                        ).catch((error: unknown) =>
                            console.error(
                                "E2E cleanup or artifact collection failed",
                                error,
                            ),
                        );
                    await rm(profile, { recursive: true, force: true });
                }
                if (cleanupErrors.length)
                    console.error("E2E cleanup failed", cleanupErrors);
            }
        }
        if (cleanupErrors.length) {
            throw new AggregateError(cleanupErrors, "E2E cleanup failed");
        }
    },
});
