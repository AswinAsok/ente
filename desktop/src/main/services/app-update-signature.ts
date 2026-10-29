import { createHash, createPublicKey, verify } from "node:crypto";
import { closeSync, fstatSync, openSync, readSync } from "node:fs";

export const appImageManifestLifetime = 180 * 24 * 60 * 60 * 1000;
export const appImagePublicKeyFile = "appimage-update-public-key.pem";
export const appImageManifestName = (arch: string) => {
    if (arch !== "x64" && arch !== "arm64")
        throw new Error("Unsupported AppImage architecture");
    return `appimage-update-${arch}.json`;
};

export interface AppImageManifest {
    schema: 1;
    app: "io.ente.bhari-frame";
    product: "photos";
    channel: "stable";
    platform: "linux";
    arch: "x64" | "arm64";
    version: string;
    issuedAt: number;
    expiresAt: number;
    file: string;
    size: number;
    sha512: string;
}

export const appImagePublicKeys = (pem: string) => {
    const blocks = pem.match(
        /-----BEGIN PUBLIC KEY-----[\s\S]+?-----END PUBLIC KEY-----/g,
    );
    if (
        !blocks?.length ||
        blocks.length > 4 ||
        blocks.reduce((rest, block) => rest.replace(block, ""), pem).trim()
    )
        throw new Error("Missing or invalid AppImage update public key");
    return blocks.map((block) => {
        const key = createPublicKey(block);
        if (key.asymmetricKeyType !== "ed25519")
            throw new Error("AppImage updates require Ed25519 keys");
        return key;
    });
};

const record = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("Invalid AppImage update manifest");
    return value as Record<string, unknown>;
};

const base64 = (value: unknown) => {
    if (typeof value !== "string" || !value.length)
        throw new Error("Invalid AppImage update signature encoding");
    const result = Buffer.from(value, "base64");
    if (result.toString("base64") !== value)
        throw new Error("Invalid AppImage update signature encoding");
    return result;
};

export const verifyAppImageManifest = (
    envelope: string,
    publicKey: string,
    arch: string,
    now = Date.now(),
): AppImageManifest => {
    appImageManifestName(arch);
    if (Buffer.byteLength(envelope) > 16 * 1024)
        throw new Error("AppImage update manifest is too large");
    const data = record(JSON.parse(envelope));
    const payload = base64(data.payload);
    if (
        !Array.isArray(data.signatures) ||
        !data.signatures.length ||
        data.signatures.length > 4
    )
        throw new Error("Missing AppImage update signature");
    const signatures = data.signatures.map((signature: unknown) =>
        base64(signature),
    );
    const keys = appImagePublicKeys(publicKey);
    if (
        !signatures.some(
            (signature) =>
                signature.length === 64 &&
                keys.some((key) => verify(null, payload, key, signature)),
        )
    )
        throw new Error("Invalid AppImage update signature");
    const manifest = record(JSON.parse(payload.toString("utf8")));
    if (
        manifest.schema !== 1 ||
        manifest.app !== "io.ente.bhari-frame" ||
        manifest.product !== "photos" ||
        manifest.channel !== "stable" ||
        manifest.platform !== "linux" ||
        manifest.arch !== arch ||
        typeof manifest.version !== "string" ||
        !/^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/.test(
            manifest.version,
        ) ||
        manifest.file !== `ente-${manifest.version}-${arch}.AppImage` ||
        typeof manifest.size !== "number" ||
        !Number.isSafeInteger(manifest.size) ||
        manifest.size <= 0 ||
        typeof manifest.issuedAt !== "number" ||
        !Number.isSafeInteger(manifest.issuedAt) ||
        typeof manifest.expiresAt !== "number" ||
        !Number.isSafeInteger(manifest.expiresAt) ||
        manifest.issuedAt > now + 5 * 60 * 1000 ||
        manifest.expiresAt <= now ||
        manifest.expiresAt <= manifest.issuedAt ||
        manifest.expiresAt - manifest.issuedAt > appImageManifestLifetime ||
        base64(manifest.sha512).length !== 64
    )
        throw new Error("Invalid or expired AppImage update metadata");
    return manifest as unknown as AppImageManifest;
};

export const appImageFileDigest = (path: string) => {
    const fd = openSync(path, "r");
    try {
        const stat = fstatSync(fd);
        if (!stat.isFile()) throw new Error("AppImage update is not a file");
        const hash = createHash("sha512");
        const buffer = Buffer.alloc(1024 * 1024);
        let size = 0;
        let count: number;
        while ((count = readSync(fd, buffer)) > 0) {
            hash.update(buffer.subarray(0, count));
            size += count;
        }
        return { size, sha512: hash.digest("base64") };
    } finally {
        closeSync(fd);
    }
};

export const verifyAppImageFile = (
    path: string,
    manifest: AppImageManifest,
) => {
    const digest = appImageFileDigest(path);
    if (digest.size !== manifest.size || digest.sha512 !== manifest.sha512)
        throw new Error("AppImage update does not match its signed manifest");
};
