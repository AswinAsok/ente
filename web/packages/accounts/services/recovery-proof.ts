import type { TwoFactorType } from "./user";

/**
 * Prove recovery without returning the decrypted server-supplied ciphertext.
 * The HMAC key is the UTF-8 encoded base64 secret, matching the server protocol.
 */
export const twoFactorRecoveryProof = async (
    secret: string,
    twoFactorType: TwoFactorType,
    sessionID: string,
): Promise<string> => {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const proof = await crypto.subtle.sign(
        "HMAC",
        key,
        encoder.encode(
            `ente-two-factor-recovery:v1\0${twoFactorType}\0${sessionID}`,
        ),
    );
    return btoa(String.fromCharCode(...new Uint8Array(proof)));
};
