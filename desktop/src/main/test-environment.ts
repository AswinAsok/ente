// This must run before electron-store or any other profile consumers initialize.
import { app } from "electron/main";
import { mkdirSync } from "node:fs";
import { isAbsolute, join } from "node:path";

const userData = process.env.ENTE_E2E_USER_DATA_DIR;
export const isE2E = !!userData;

if (userData) {
    if (!isAbsolute(userData)) {
        throw new Error("ENTE_E2E_USER_DATA_DIR must be an absolute path");
    }
    app.setPath("userData", userData);
    app.setPath("sessionData", userData);
    const logs = join(userData, "logs");
    mkdirSync(logs, { recursive: true });
    app.setPath("logs", logs);
    app.commandLine.appendSwitch("lang", "en-US");
}
