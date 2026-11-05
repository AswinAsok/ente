import { fileURLToPath } from "node:url";
import { preview } from "vite";
import { apps } from "./apps.ts";

const app = apps.find(({ name }) => name === process.argv[2]);
if (!app) throw new Error("Expected an app name: photos or locker");

// Serve Next's exported pages, including extensionless routes such as /signup.
// MPA mode returns 404 for missing pages instead of falling back to index.html.
const server = await preview({
    configFile: false,
    envDir: false,
    root: fileURLToPath(new URL(`../apps/${app.name}/`, import.meta.url)),
    appType: "mpa",
    build: { outDir: "out" },
    preview: { host: "localhost", port: app.port, strictPort: true },
});
server.printUrls();
