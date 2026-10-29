import { AppImageUpdater } from "electron-updater";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import {
    existsSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { SignedAppImageUpdater } from "../.appimage-tests/main/services/app-update-appimage.js";
import {
    appImageManifestName,
    verifyAppImageFile,
    verifyAppImageManifest,
} from "../.appimage-tests/main/services/app-update-signature.js";
import {
    prepareAppImageUpdateKey,
    signAppImageUpdates,
    verifyAppImageUpdates,
} from "../scripts/appimage-updates.mjs";

const keypair = () =>
    generateKeyPairSync("ed25519", {
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
const keys = keypair();
const otherKeys = keypair();
const version = "2.0.0";
const bytes = Buffer.from("inert AppImage fixture, never executed");

const encode = (manifest, privateKeys = [keys.privateKey]) => {
    const payload = Buffer.from(JSON.stringify(manifest));
    return JSON.stringify({
        payload: payload.toString("base64"),
        signatures: privateKeys.map((key) =>
            sign(null, payload, key).toString("base64"),
        ),
    });
};

const fixture = (t) => {
    const dir = mkdtempSync(join(tmpdir(), "ente-appimage-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    for (const arch of ["x64", "arm64"])
        writeFileSync(join(dir, `ente-${version}-${arch}.AppImage`), bytes);
    signAppImageUpdates(dir, version, keys.privateKey, keys.publicKey);
    const raw = readFileSync(join(dir, appImageManifestName("x64")), "utf8");
    const manifest = verifyAppImageManifest(raw, keys.publicKey, "x64");
    return { dir, raw, manifest };
};

const updaterFixture = async (t) => {
    const f = fixture(t);
    const appImage = join(f.dir, "installed.AppImage");
    writeFileSync(appImage, "old app");
    const originalAppImage = process.env.APPIMAGE;
    process.env.APPIMAGE = appImage;
    t.after(() => {
        if (originalAppImage === undefined) delete process.env.APPIMAGE;
        else process.env.APPIMAGE = originalAppImage;
    });
    const config = join(f.dir, "app-update.yml");
    writeFileSync(config, "updaterCacheDirName: ente-update-test\n");
    const quit = [];
    let highest;
    const updater = new SignedAppImageUpdater(
        {
            arch: "x64",
            publicKey: () => keys.publicKey,
            highestVersion: () => highest,
            rememberVersion: (value) => {
                highest = value;
            },
        },
        {
            version: "1.0.0",
            name: "ente",
            isPackaged: true,
            appUpdateConfigPath: config,
            userDataPath: f.dir,
            baseCachePath: f.dir,
            whenReady: async () => {},
            relaunch() {},
            quit() {},
            onQuit: (handler) => quit.push(handler),
        },
    );
    updater.autoDownload = false;
    updater.logger = { info() {}, warn() {}, error() {}, debug() {} };
    const provider = await updater.clientPromise;
    let raw = f.raw;
    const requests = [];
    provider.httpRequest = async (url) => {
        requests.push(url.href);
        return raw;
    };
    let downloadedBytes = bytes;
    let downloads = 0;
    updater.httpExecutor = {
        async download(_url, destination) {
            downloads++;
            writeFileSync(destination, downloadedBytes);
        },
    };
    return {
        ...f,
        updater,
        provider,
        quit,
        requests,
        setManifest: (value) => {
            raw = value;
        },
        setDownload: (value) => {
            downloadedBytes = value;
        },
        downloadCount: () => downloads,
    };
};

test("sign and verify both architectures without changing legacy update metadata", (t) => {
    const { dir } = fixture(t);
    const legacy = join(dir, "latest-linux.yml");
    writeFileSync(legacy, "legacy feed stays unchanged\n");
    signAppImageUpdates(dir, version, keys.privateKey, keys.publicKey);
    verifyAppImageUpdates(dir, version, keys.publicKey);
    assert.equal(readFileSync(legacy, "utf8"), "legacy feed stays unchanged\n");
    assert.throws(
        () => verifyAppImageUpdates(dir, "2.0.1", keys.publicKey),
        /version mismatch/,
    );
});

test("matching attacker metadata and checksum cannot replace the publisher signature", (t) => {
    const { raw, manifest } = fixture(t);
    const envelope = JSON.parse(raw);
    assert.throws(
        () =>
            verifyAppImageManifest(
                JSON.stringify({ ...envelope, signatures: [] }),
                keys.publicKey,
                "x64",
            ),
        /signature/,
    );
    assert.throws(
        () =>
            verifyAppImageManifest(
                encode(manifest, [otherKeys.privateKey]),
                keys.publicKey,
                "x64",
            ),
        /signature/,
    );
    envelope.payload = Buffer.from(
        JSON.stringify({ ...manifest, version: "3.0.0" }),
    ).toString("base64");
    assert.throws(
        () =>
            verifyAppImageManifest(
                JSON.stringify(envelope),
                keys.publicKey,
                "x64",
            ),
        /signature/,
    );
    assert.throws(() => verifyAppImageManifest(raw, "", "x64"), /public key/);
});

test("signed metadata must match the app, channel, architecture, version and lifetime", (t) => {
    const { manifest } = fixture(t);
    for (const change of [
        { schema: 2 },
        { app: "other-app" },
        { product: "auth" },
        { channel: "beta" },
        { platform: "win32" },
        { arch: "arm64" },
        { version: "2.0.0-beta" },
        { version: "../../malicious" },
        { file: "https://example.com/update.AppImage" },
        { size: 0 },
        { sha512: "wrong" },
        { expiresAt: Date.now() - 1 },
        { expiresAt: manifest.expiresAt + 1 },
        { issuedAt: Date.now() + 10 * 60 * 1000 },
    ])
        assert.throws(
            () =>
                verifyAppImageManifest(
                    encode({ ...manifest, ...change }),
                    keys.publicKey,
                    "x64",
                ),
            undefined,
            JSON.stringify(change),
        );
    assert.throws(
        () => verifyAppImageManifest(" ".repeat(16385), keys.publicKey, "x64"),
        /too large/,
    );
});

test("overlapping keys allow rotation without trusting keys from the feed", (t) => {
    const { manifest } = fixture(t);
    const dual = encode(manifest, [keys.privateKey, otherKeys.privateKey]);
    verifyAppImageManifest(dual, keys.publicKey, "x64");
    verifyAppImageManifest(dual, otherKeys.publicKey, "x64");
    verifyAppImageManifest(
        encode(manifest, [otherKeys.privateKey]),
        keys.publicKey + otherKeys.publicKey,
        "x64",
    );
});

test("packaging requires a valid public key and only writes public material", (t) => {
    const { dir } = fixture(t);
    const old = process.env.PHOTOS_APPIMAGE_UPDATE_PUBLIC_KEY;
    t.after(() => {
        if (old === undefined)
            delete process.env.PHOTOS_APPIMAGE_UPDATE_PUBLIC_KEY;
        else process.env.PHOTOS_APPIMAGE_UPDATE_PUBLIC_KEY = old;
    });
    delete process.env.PHOTOS_APPIMAGE_UPDATE_PUBLIC_KEY;
    assert.throws(() => prepareAppImageUpdateKey(dir), /public key/);
    process.env.PHOTOS_APPIMAGE_UPDATE_PUBLIC_KEY = keys.publicKey;
    prepareAppImageUpdateKey(dir);
    assert.equal(
        readFileSync(join(dir, "build/appimage-update-public-key.pem"), "utf8"),
        keys.publicKey,
    );
});

test("signing rejects missing architecture and mismatched keys before publishing manifests", (t) => {
    const { dir } = fixture(t);
    assert.throws(
        () =>
            signAppImageUpdates(
                dir,
                version,
                otherKeys.privateKey,
                keys.publicKey,
            ),
        /signature/,
    );
    rmSync(join(dir, appImageManifestName("x64")));
    rmSync(join(dir, appImageManifestName("arm64")));
    rmSync(join(dir, `ente-${version}-arm64.AppImage`));
    assert.throws(
        () =>
            signAppImageUpdates(dir, version, keys.privateKey, keys.publicKey),
        /ENOENT/,
    );
    assert.equal(existsSync(join(dir, appImageManifestName("x64"))), false);
});

test("release verification rejects missing manifests and modified AppImages", (t) => {
    const { dir, manifest } = fixture(t);
    writeFileSync(join(dir, manifest.file), "modified");
    assert.throws(
        () => verifyAppImageFile(join(dir, manifest.file), manifest),
        /does not match/,
    );
    assert.throws(
        () => verifyAppImageUpdates(dir, version, keys.publicKey),
        /does not match/,
    );
    rmSync(join(dir, appImageManifestName("x64")));
    assert.throws(
        () => verifyAppImageUpdates(dir, version, keys.publicKey),
        /ENOENT/,
    );
});

test("the provider uses signed artifact fields and rejects a previously observed version rollback", async (t) => {
    const f = await updaterFixture(t);
    const result = await f.updater.checkForUpdates();
    assert.equal(result.isUpdateAvailable, true);
    const files = f.provider.resolveFiles(result.updateInfo);
    assert.equal(
        files[0].url.href,
        `https://github.com/ente/photos-desktop/releases/download/v${version}/${f.manifest.file}`,
    );
    assert.deepEqual(f.requests, [
        "https://github.com/ente/photos-desktop/releases/latest/download/appimage-update-x64.json",
    ]);
    f.setManifest(
        encode({
            ...f.manifest,
            version: "1.9.0",
            file: "ente-1.9.0-x64.AppImage",
        }),
    );
    await assert.rejects(f.updater.checkForUpdates(), /rollback/);
    f.setManifest(f.raw);
    assert.equal((await f.updater.checkForUpdates()).isUpdateAvailable, true);
    assert.equal(f.downloadCount(), 0);
});

test("unsigned feed metadata never downloads or registers an install-on-quit handler", async (t) => {
    const f = await updaterFixture(t);
    f.setManifest(JSON.stringify({ version, sha512: f.manifest.sha512 }));
    await assert.rejects(f.updater.checkForUpdates());
    assert.equal(f.downloadCount(), 0);
    assert.equal(f.quit.length, 0);
    assert.equal(f.updater.install(true, false), false);
});

test("a valid download is authenticated before notifying and can reach install-on-quit", async (t) => {
    const f = await updaterFixture(t);
    const installs = t.mock.method(
        AppImageUpdater.prototype,
        "doInstall",
        () => true,
    );
    let notified = 0;
    f.updater.on("update-downloaded", () => notified++);
    await f.updater.checkForUpdates();
    await f.updater.downloadUpdate();
    assert.equal(notified, 1);
    assert.equal(f.quit.length, 1);
    f.quit[0](0);
    assert.equal(installs.mock.callCount(), 1);
});

test("a modified download never becomes installable, including on explicit restart", async (t) => {
    const f = await updaterFixture(t);
    const installs = t.mock.method(
        AppImageUpdater.prototype,
        "doInstall",
        () => true,
    );
    let notified = 0;
    f.updater.on("update-downloaded", () => notified++);
    f.setDownload(Buffer.from("corrupted download"));
    await f.updater.checkForUpdates();
    await assert.rejects(f.updater.downloadUpdate(), /does not match/);
    assert.equal(notified, 0);
    assert.equal(f.quit.length, 0);
    f.updater.quitAndInstall();
    assert.equal(installs.mock.callCount(), 0);
});

test("cached and post-download tampering cannot bypass either installation path", async (t) => {
    const f = await updaterFixture(t);
    const installs = t.mock.method(
        AppImageUpdater.prototype,
        "doInstall",
        () => true,
    );
    await f.updater.checkForUpdates();
    const [cached] = await f.updater.downloadUpdate();
    writeFileSync(cached, Buffer.alloc(bytes.length, 1));
    await assert.rejects(f.updater.downloadUpdate(), /does not match/);
    assert.equal(f.downloadCount(), 1);
    f.updater.quitAndInstall();
    f.quit[0](0);
    assert.equal(installs.mock.callCount(), 0);
});

test("a later failed check cannot replace an already authenticated candidate", async (t) => {
    const f = await updaterFixture(t);
    const installs = t.mock.method(
        AppImageUpdater.prototype,
        "doInstall",
        () => true,
    );
    await f.updater.checkForUpdates();
    await f.updater.downloadUpdate();
    f.setManifest("invalid JSON");
    await assert.rejects(f.updater.checkForUpdates());
    f.quit[0](0);
    assert.equal(installs.mock.callCount(), 1);
});
