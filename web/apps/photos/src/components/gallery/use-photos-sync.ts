import watcher from "@/services/watch";
import { subscribeMainWindowFocus } from "ente-base/electron";
import { useEffect, useEffectEvent } from "react";
import type { RemotePullOpts } from ".";

interface PhotosSyncOptions {
    enabled: boolean;
    remotePull: (opts?: RemotePullOpts) => Promise<void>;
}

export const usePhotosSync = ({ enabled, remotePull }: PhotosSyncOptions) => {
    const periodicPull = useEffectEvent(() => {
        void remotePull({ silent: true, source: "gallery-periodic" });
    });
    const onMainWindowFocus = useEffectEvent(() => {
        void remotePull({ silent: true, source: "desktop-focus" });
        void watcher.checkAccessibility();
    });

    useEffect(() => {
        if (!enabled) return;
        const intervalID = setInterval(periodicPull, 5 * 60 * 1000);
        const unsubscribe = globalThis.electron
            ? subscribeMainWindowFocus(onMainWindowFocus)
            : undefined;
        return () => {
            clearInterval(intervalID);
            unsubscribe?.();
        };
    }, [enabled]);
};
