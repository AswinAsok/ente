export const isAllowedPasskeyRedirect = (
    redirectURL: URL,
    accountsOrigin: string,
    isDevBuild: boolean,
    allowedOrigins: string | undefined,
) => {
    if (
        redirectURL.protocol === "ente:" ||
        redirectURL.protocol === "enteauth:" ||
        redirectURL.protocol === "entelocker:" ||
        redirectURL.protocol === "ensu:" ||
        redirectURL.protocol === "ente-cli:" ||
        (redirectURL.protocol === "tauri:" &&
            redirectURL.hostname === "localhost")
    ) {
        return true;
    }

    if (
        (redirectURL.protocol !== "http:" &&
            redirectURL.protocol !== "https:") ||
        redirectURL.username ||
        redirectURL.password
    ) {
        return false;
    }

    const accountsHostname = new URL(accountsOrigin).hostname;
    const isDefaultRedirect =
        (isDevBuild && isLocalhost(redirectURL.hostname)) ||
        redirectURL.host === "ente.space" ||
        isEnteHostname(redirectURL.host);
    if (isEnteHostname(accountsHostname)) return isDefaultRedirect;
    if (isLocalhost(accountsHostname) && isDefaultRedirect) return true;

    return (
        redirectURL.origin === accountsOrigin ||
        (allowedOrigins ?? "").split(",").some((origin) => {
            try {
                const allowedURL = new URL(origin.trim());
                return (
                    !allowedURL.username &&
                    !allowedURL.password &&
                    allowedURL.pathname === "/" &&
                    !allowedURL.search &&
                    !allowedURL.hash &&
                    redirectURL.origin === allowedURL.origin
                );
            } catch {
                return false;
            }
        })
    );
};

const isLocalhost = (hostname: string) =>
    hostname === "localhost" || hostname.endsWith(".localhost");

const isEnteHostname = (hostname: string) =>
    hostname.endsWith(".ente.com") ||
    hostname.endsWith(".ente.io") ||
    hostname.endsWith(".ente.sh");
