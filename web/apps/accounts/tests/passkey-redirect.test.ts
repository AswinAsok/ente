import { expect, test } from "vitest";
import { isAllowedPasskeyRedirect } from "../src/services/passkey-redirect";

const accountsOrigin = "https://accounts.example.org";
const allowedOrigins =
    "https://photos.example.org, https://auth.example.org:8443/";

test.each([
    ["https://photos.example.org/passkeys/finish", true],
    ["https://photos.example.org/passkeys/recover", true],
    ["https://auth.example.org:8443/passkeys/finish", true],
    ["https://accounts.example.org/passkeys/finish", true],
    ["https://attacker.example/passkeys/finish", false],
    ["http://photos.example.org/passkeys/finish", false],
    ["https://photos.example.org:8443/passkeys/finish", false],
    ["https://auth.example.org/passkeys/finish", false],
    ["https://photos.example.org.attacker.example/passkeys/finish", false],
    ["https://other.photos.example.org/passkeys/finish", false],
    ["https://photos.example.org@attacker.example/passkeys/finish", false],
    ["https://attacker@photos.example.org/passkeys/finish", false],
    ["javascript:alert(1)", false],
    ["data:text/html,test", false],
    ["file:///passkeys/finish", false],
    ["tauri://attacker.example/passkeys/finish", false],
])("self-hosted callback %s is allowed: %s", (redirect, allowed) => {
    expect(
        isAllowedPasskeyRedirect(
            new URL(redirect),
            accountsOrigin,
            false,
            allowedOrigins,
        ),
    ).toBe(allowed);
});

test.each([
    undefined,
    "",
    ", ,",
    "not a URL",
    "https://*.example.org",
    "https://photos.example.org/path",
    "https://photos.example.org?query=value",
    "https://photos.example.org#fragment",
    "https://user:password@photos.example.org",
    "ENTE_ACCOUNTS_REDIRECT_ORIGINS_PLACEHOLDER",
])("missing or invalid origins fail closed: %s", (origins) => {
    expect(
        isAllowedPasskeyRedirect(
            new URL("https://photos.example.org/passkeys/finish"),
            accountsOrigin,
            false,
            origins,
        ),
    ).toBe(false);
});

test.each([
    "ente://app/passkeys/finish",
    "enteauth://passkey",
    "entelocker://passkey",
    "ensu://passkey",
    "ente-cli://passkey",
    "tauri://localhost/passkeys/finish",
])("native callback works without configuration: %s", (redirect) => {
    for (const origin of [accountsOrigin, "https://accounts.ente.com"]) {
        expect(
            isAllowedPasskeyRedirect(
                new URL(redirect),
                origin,
                false,
                undefined,
            ),
        ).toBe(true);
    }
});

test.each([
    ["https://photos.ente.com/passkeys/finish", true],
    ["https://auth.ente.io/passkeys/finish", true],
    ["https://photos.ente.sh/passkeys/finish", true],
    ["https://ente.space/passkeys/finish", true],
    ["https://photos.ente.com.attacker.example/passkeys/finish", false],
    ["https://photos.example.org/passkeys/finish", false],
    ["http://localhost:3000/passkeys/finish", false],
])("hosted Accounts preserves its allowlist: %s", (redirect, allowed) => {
    expect(
        isAllowedPasskeyRedirect(
            new URL(redirect),
            "https://accounts.ente.com",
            false,
            allowedOrigins,
        ),
    ).toBe(allowed);
});

test("development allows localhost, but not a hostname merely ending in localhost", () => {
    for (const hostname of [
        "localhost",
        "photos.localhost",
        "attackerlocalhost",
    ]) {
        expect(
            isAllowedPasskeyRedirect(
                new URL(`http://${hostname}:3000/passkeys/finish`),
                "http://localhost:3001",
                true,
                undefined,
            ),
        ).toBe(hostname !== "attackerlocalhost");
    }
});

test("a production localhost deployment can explicitly allow another port", () => {
    const redirect = new URL("http://localhost:3000/passkeys/finish");
    expect(
        isAllowedPasskeyRedirect(
            redirect,
            "http://localhost:3001",
            false,
            undefined,
        ),
    ).toBe(false);
    expect(
        isAllowedPasskeyRedirect(
            redirect,
            "http://localhost:3001",
            false,
            "http://localhost:3000",
        ),
    ).toBe(true);
});
