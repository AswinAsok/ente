import { twoFactorRecoveryProof } from "ente-accounts/services/recovery-proof";
import { recoverTwoFactorFinish } from "ente-accounts/services/user";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const { decryptBox, saveKeyAttributes, clearInflightPasskeySessionID } =
    vi.hoisted(() => ({
        decryptBox: vi.fn(),
        saveKeyAttributes: vi.fn(),
        clearInflightPasskeySessionID: vi.fn(),
    }));

vi.mock("ente-accounts/services/crypto", () => ({ decryptBox }));
vi.mock("ente-accounts/services/recovery-key", () => ({
    recoveryKeyFromMnemonic: vi.fn(() => Promise.resolve("recovery-key")),
}));
vi.mock("ente-accounts/services/accounts-db", () => ({
    savedPartialLocalUser: () => ({ id: 1 }),
    replaceSavedLocalUser: vi.fn(),
    updateSavedLocalUser: vi.fn(),
    saveKeyAttributes,
}));
vi.mock("ente-accounts/services/key-attributes", () => ({}));
vi.mock("ente-accounts/services/passkey", () => ({
    clearInflightPasskeySessionID,
}));
vi.mock("ente-base/token", () => ({ removeAuthToken: vi.fn() }));
vi.mock("ente-base/origins", () => ({
    apiURL: (path: string) => Promise.resolve(`https://api.example.org${path}`),
}));
vi.mock("ente-base/http", () => ({
    publicRequestHeaders: () => ({}),
    ensureOk: (response: Response) => {
        if (!response.ok) throw new Error("Recovery rejected");
    },
}));

beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.unstubAllGlobals());

// Shared with the server PR's TestRecoveryProof protocol vectors.
test.each([
    {
        factor: "totp" as const,
        secret: "JBSWY3DPEHPK3PXP",
        expected: "fImRC3XicUbYB/Uh6VVXMSRdZNCMIl2RwqRlRHDxfkE=",
    },
    {
        factor: "passkey" as const,
        secret: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=",
        expected: "PxcSH0NrKUX3u330jU6TtYp/I/mT4087vajBXIdPh0I=",
    },
])(
    "$factor matches the server protocol",
    async ({ factor, secret, expected }) => {
        expect(
            await twoFactorRecoveryProof(secret, factor, "recovery-session"),
        ).toBe(expected);
        expect(
            await twoFactorRecoveryProof(secret, factor, "another-session"),
        ).not.toBe(expected);
        expect(
            await twoFactorRecoveryProof(
                secret,
                factor == "totp" ? "passkey" : "totp",
                "recovery-session",
            ),
        ).not.toBe(expected);
    },
);

test.each(["totp", "passkey"] as const)(
    "%s recovery saves the authorization returned after proof verification",
    async (factor) => {
        decryptBox.mockResolvedValue("JBSWY3DPEHPK3PXP");
        const keyAttributes = {
            kekSalt: "salt",
            encryptedKey: "key",
            keyDecryptionNonce: "nonce",
            publicKey: "public-key",
            encryptedSecretKey: "secret-key",
            secretKeyDecryptionNonce: "secret-key-nonce",
            memLimit: 1,
            opsLimit: 1,
        };
        vi.stubGlobal(
            "fetch",
            vi.fn(() =>
                Promise.resolve(
                    Response.json({
                        id: 1,
                        keyAttributes,
                        encryptedToken: "token",
                    }),
                ),
            ),
        );

        await recoverTwoFactorFinish(
            factor,
            "recovery-session",
            { encryptedSecret: "ciphertext", secretDecryptionNonce: "nonce" },
            "recovery mnemonic",
        );

        expect(saveKeyAttributes).toHaveBeenCalledExactlyOnceWith(
            keyAttributes,
        );
        expect(clearInflightPasskeySessionID).toHaveBeenCalledTimes(
            factor == "passkey" ? 1 : 0,
        );
    },
);

test("invalid recovery keys send no request", async () => {
    decryptBox.mockRejectedValue(new Error("Invalid recovery key"));
    const fetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", fetch);

    await expect(
        recoverTwoFactorFinish(
            "totp",
            "recovery-session",
            { encryptedSecret: "ciphertext", secretDecryptionNonce: "nonce" },
            "incorrect recovery mnemonic",
        ),
    ).rejects.toThrow("Invalid recovery key");
    expect(fetch).not.toHaveBeenCalled();
});

test.each(["totp", "passkey"] as const)(
    "%s recovery never sends plaintext, even when the server rejects proofs",
    async (factor) => {
        // Simulate the service substituting an encrypted master key.
        const masterKey = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=";
        decryptBox.mockResolvedValue(masterKey);
        const fetch = vi.fn<typeof globalThis.fetch>(() =>
            Promise.resolve(new Response(null, { status: 400 })),
        );
        vi.stubGlobal("fetch", fetch);

        await expect(
            recoverTwoFactorFinish(
                factor,
                "recovery-session",
                {
                    encryptedSecret: "substituted-master-key-ciphertext",
                    secretDecryptionNonce: "master-key-nonce",
                },
                "recovery mnemonic",
            ),
        ).rejects.toThrow("Recovery rejected");

        expect(fetch).toHaveBeenCalledExactlyOnceWith(
            "https://api.example.org/users/two-factor/remove",
            {
                method: "POST",
                headers: {},
                body: JSON.stringify({
                    twoFactorType: factor,
                    sessionID: "recovery-session",
                    proof: await twoFactorRecoveryProof(
                        masterKey,
                        factor,
                        "recovery-session",
                    ),
                }),
            },
        );
    },
);
