import { createPrivateKey, sign } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
    appImageFileDigest,
    appImageManifestLifetime,
    appImageManifestName,
    appImagePublicKeyFile,
    appImagePublicKeys,
    verifyAppImageFile,
    verifyAppImageManifest,
} from "../src/main/services/app-update-signature.ts";

export const prepareAppImageUpdateKey = (projectDir) => {
    const publicKey = process.env.PHOTOS_APPIMAGE_UPDATE_PUBLIC_KEY ?? "";
    appImagePublicKeys(publicKey);
    mkdirSync(join(projectDir, "build"), { recursive: true });
    writeFileSync(join(projectDir, "build", appImagePublicKeyFile), publicKey);
};

export const signAppImageUpdates = (
    directory,
    version,
    privateKey,
    publicKey,
) => {
    const blocks = privateKey.match(
        /-----BEGIN PRIVATE KEY-----[\s\S]+?-----END PRIVATE KEY-----/g,
    );
    if (
        !blocks?.length ||
        blocks.length > 4 ||
        blocks
            .reduce((rest, block) => rest.replace(block, ""), privateKey)
            .trim()
    )
        throw new Error("Missing or invalid AppImage signing key");
    const keys = blocks.map((block) => {
        const key = createPrivateKey(block);
        if (key.asymmetricKeyType !== "ed25519")
            throw new Error("Expected an Ed25519 signing key");
        return key;
    });
    const issuedAt = Date.now();
    const manifests = ["x64", "arm64"].map((arch) => {
        const file = `ente-${version}-${arch}.AppImage`;
        const payload = Buffer.from(
            JSON.stringify({
                schema: 1,
                app: "io.ente.bhari-frame",
                product: "photos",
                channel: "stable",
                platform: "linux",
                arch,
                version,
                issuedAt,
                expiresAt: issuedAt + appImageManifestLifetime,
                file,
                ...appImageFileDigest(join(directory, file)),
            }),
        );
        const envelope = JSON.stringify({
            payload: payload.toString("base64"),
            signatures: keys.map((key) =>
                sign(null, payload, key).toString("base64"),
            ),
        });
        verifyAppImageManifest(envelope, publicKey, arch);
        return { name: appImageManifestName(arch), envelope };
    });
    for (const { name, envelope } of manifests)
        writeFileSync(join(directory, name), `${envelope}\n`);
};

export const verifyAppImageUpdates = (directory, version, publicKey) => {
    for (const arch of ["x64", "arm64"]) {
        const envelope = readFileSync(
            join(directory, appImageManifestName(arch)),
            "utf8",
        );
        const manifest = verifyAppImageManifest(envelope, publicKey, arch);
        if (manifest.version !== version)
            throw new Error("AppImage release version mismatch");
        verifyAppImageFile(join(directory, manifest.file), manifest);
    }
};

if (
    process.argv[1] &&
    resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
    const [command, directory, version] = process.argv.slice(2);
    if (
        !directory ||
        !version ||
        !/^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/.test(version)
    )
        throw new Error(
            "Usage: appimage-updates.mjs sign|verify DIRECTORY VERSION",
        );
    const publicKey = process.env.PHOTOS_APPIMAGE_UPDATE_PUBLIC_KEY ?? "";
    if (command === "sign")
        signAppImageUpdates(
            directory,
            version,
            process.env.PHOTOS_APPIMAGE_SIGNING_KEY ?? "",
            publicKey,
        );
    else if (command !== "verify") throw new Error("Expected sign or verify");
    verifyAppImageUpdates(directory, version, publicKey);
    console.log(`Verified both AppImage update manifests for ${version}`);
}
