export const apps = [
    { name: "photos", port: 3300 },
    { name: "locker", port: 3309 },
] as const;

// Match Playwright's repeated / variadic --project options and wildcard names.
export const selectedApps = (args: string[]) => {
    const patterns: string[] = [];
    for (let i = 0; i < args.length; i++) {
        const arg = args[i]!;
        if (arg === "--") break;
        if (arg.startsWith("--project=")) {
            patterns.push(arg.slice("--project=".length));
        } else if (arg === "--project") {
            const start = patterns.length;
            while (args[i + 1] && !args[i + 1]!.startsWith("-")) {
                patterns.push(args[++i]!);
            }
            if (patterns.length === start) {
                throw new Error(
                    "--project requires an app name: photos or locker",
                );
            }
        }
    }
    const matches = (name: string, pattern: string) =>
        new RegExp(
            `^${pattern.split("*").map(RegExp.escape).join(".*")}$`,
            "i",
        ).test(name);
    for (const pattern of patterns) {
        if (!apps.some(({ name }) => matches(name, pattern))) {
            throw new Error(
                `Unknown project: ${pattern}. Available projects: photos, locker`,
            );
        }
    }
    return apps.filter(
        ({ name }) =>
            patterns.length === 0 ||
            patterns.some((pattern) => matches(name, pattern)),
    );
};
