import { compareVersions } from "compare-versions";
import {
    AppImageUpdater,
    Provider,
    type AppUpdater,
    type ResolvedUpdateFileInfo,
    type UpdateDownloadedEvent,
    type UpdateInfo,
} from "electron-updater";
import type { AppAdapter } from "electron-updater/out/AppAdapter";
import type { InstallOptions } from "electron-updater/out/BaseUpdater";
import type { ProviderRuntimeOptions } from "electron-updater/out/providers/Provider";
import {
    appImageManifestName,
    verifyAppImageFile,
    verifyAppImageManifest,
    type AppImageManifest,
} from "./app-update-signature";

const releasesURL = "https://github.com/ente/photos-desktop/releases";

interface SignedUpdateInfo extends UpdateInfo {
    appImageEnvelope: string;
}

interface AppImageUpdateOptions {
    arch: string;
    publicKey: () => string;
    highestVersion: () => string | undefined;
    rememberVersion: (version: string) => void;
}

export class SignedAppImageUpdater extends AppImageUpdater {
    private readonly signing: AppImageUpdateOptions;
    private verifiedDownload:
        | { path: string; manifest: AppImageManifest }
        | undefined;

    constructor(signing: AppImageUpdateOptions, app?: AppAdapter) {
        super(undefined, app);
        this.signing = signing;
        this.allowDowngrade = false;
        this.allowPrerelease = false;
        this.disableDifferentialDownload = true;
        this.setFeedURL({
            provider: "custom",
            updateProvider: class extends Provider<SignedUpdateInfo> {
                constructor(
                    _options: unknown,
                    _updater: AppUpdater,
                    runtime: ProviderRuntimeOptions,
                ) {
                    super(runtime);
                }

                async getLatestVersion(): Promise<SignedUpdateInfo> {
                    const raw = await this.httpRequest(
                        new URL(
                            `${releasesURL}/latest/download/${appImageManifestName(signing.arch)}`,
                        ),
                    );
                    if (!raw)
                        throw new Error(
                            "Missing signed AppImage update manifest",
                        );
                    const manifest = verifyAppImageManifest(
                        raw,
                        signing.publicKey(),
                        signing.arch,
                    );
                    const highest = signing.highestVersion();
                    if (
                        highest &&
                        compareVersions(manifest.version, highest) < 0
                    )
                        throw new Error("AppImage update rollback rejected");
                    signing.rememberVersion(manifest.version);
                    return {
                        version: manifest.version,
                        files: [
                            {
                                url: manifest.file,
                                size: manifest.size,
                                sha512: manifest.sha512,
                            },
                        ],
                        path: manifest.file,
                        sha512: manifest.sha512,
                        releaseDate: new Date(manifest.issuedAt).toISOString(),
                        appImageEnvelope: raw,
                    };
                }

                resolveFiles(info: SignedUpdateInfo): ResolvedUpdateFileInfo[] {
                    const manifest = verifyAppImageManifest(
                        info.appImageEnvelope,
                        signing.publicKey(),
                        signing.arch,
                    );
                    return [
                        {
                            url: new URL(
                                `${releasesURL}/download/v${manifest.version}/${manifest.file}`,
                            ),
                            info: {
                                url: manifest.file,
                                size: manifest.size,
                                sha512: manifest.sha512,
                            },
                        },
                    ];
                }
            },
        });
    }

    protected override dispatchUpdateDownloaded(event: UpdateDownloadedEvent) {
        if (
            !("appImageEnvelope" in event) ||
            typeof event.appImageEnvelope !== "string"
        )
            throw new Error("Missing authenticated AppImage update");
        const manifest = verifyAppImageManifest(
            event.appImageEnvelope,
            this.signing.publicKey(),
            this.signing.arch,
        );
        verifyAppImageFile(event.downloadedFile, manifest);
        this.verifiedDownload = { path: event.downloadedFile, manifest };
        super.dispatchUpdateDownloaded(event);
    }

    protected override doInstall(options: InstallOptions) {
        const verified = this.verifiedDownload;
        if (this.installerPath !== verified?.path)
            throw new Error("AppImage update has not been authenticated");
        // Both explicit restart and install-on-quit reach this final check.
        verifyAppImageFile(verified.path, verified.manifest);
        return super.doInstall(options);
    }
}
