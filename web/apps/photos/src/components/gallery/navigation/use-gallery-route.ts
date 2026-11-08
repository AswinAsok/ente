import { useRouter } from "next/router";
import { useEffect, useRef, type Dispatch } from "react";
import { showCollectionSummaryWithAuthentication } from "../helpers";
import type { GalleryState } from "../reducer";
import { galleryDestinationFromHref, galleryHref } from "./gallery-route";
import type {
    GalleryDestination,
    GalleryNavigationState,
    NavigationAction,
} from "./navigation-state";

export const useGalleryRoute = (
    { destination }: GalleryNavigationState,
    send: Dispatch<NavigationAction>,
    library: GalleryState,
    authenticateUser: () => Promise<boolean>,
) => {
    const router = useRouter();
    const previous = useRef<{ href: string; destination: GalleryDestination }>(
        undefined,
    );
    const pendingHref = useRef<string | undefined>(undefined);
    const restoredDestination = useRef<GalleryDestination | undefined>(
        undefined,
    );
    const lastHiddenAuthentication = useRef(0);
    const restoreRevision = useRef(0);

    useEffect(() => {
        if (!library.user || !router.isReady) return;
        const last = previous.current;
        previous.current = { href: router.asPath, destination };
        if (last?.href !== router.asPath) {
            const revision = ++restoreRevision.current;
            if (pendingHref.current === router.asPath) {
                pendingHref.current = undefined;
                return;
            }
            pendingHref.current = undefined;
            const restored = galleryDestinationFromHref(router.asPath, library);
            const restore = () => {
                if (restoreRevision.current !== revision) return;
                restoredDestination.current = restored;
                send({ type: "restoreDestination", destination: restored });
            };
            if (
                restored.albumMode === "hidden-albums" &&
                destination.albumMode !== "hidden-albums"
            ) {
                void showCollectionSummaryWithAuthentication(
                    restored.collectionID,
                    true,
                    lastHiddenAuthentication,
                    authenticateUser,
                    restore,
                ).then((authenticated) => {
                    if (restoreRevision.current !== revision) return;
                    if (!authenticated) {
                        pendingHref.current = galleryHref(destination);
                        void router.replace(pendingHref.current, undefined, {
                            shallow: true,
                            scroll: false,
                        });
                    }
                });
            } else restore();
            return;
        }
        if (restoredDestination.current === destination) {
            restoredDestination.current = undefined;
            return;
        }
        if (last.destination === destination) return;
        ++restoreRevision.current;
        if (destination.albumMode === "hidden-albums")
            lastHiddenAuthentication.current = Date.now();
        const href = galleryHref(destination);
        if (href !== router.asPath) {
            pendingHref.current = href;
            void router.push(href, undefined, { shallow: true, scroll: false });
        }
    }, [destination, send, library, authenticateUser, router]);
};
