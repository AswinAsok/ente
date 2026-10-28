import { ensureAuthenticatedSession } from "@/services/authenticated-session";
import { shouldShowWhatsNew } from "@/services/changelog";
import { processPendingAlbumJoin } from "@/services/join-album";
import { sessionExpiredDialogAttributes } from "ente-accounts/components/utils/dialog";
import {
    getAndClearIsFirstLogin,
    savedJustSignedUp,
} from "ente-accounts/services/accounts-db";
import { stashRedirect } from "ente-accounts/services/redirect";
import { ensureLocalUser } from "ente-accounts/services/user";
import { useBaseContext } from "ente-base/context";
import { isNamedError } from "ente-base/error";
import { hasPendingAlbumToJoin } from "ente-base/join-album";
import log from "ente-base/log";
import { haveMasterKeyInSession } from "ente-base/session-storage";
import { savedAuthToken } from "ente-base/token";
import { initContacts, pullContacts } from "ente-contacts";
import {
    savedCollectionFiles,
    savedCollections,
    savedTrashItems,
} from "ente-new/photos/services/photos-fdb";
import { initSettings } from "ente-new/photos/services/settings";
import { savedUserDetailsOrTriggerPull } from "ente-new/photos/services/user-details";
import { contactsGetDiff, contactsGetProfilePicture } from "ente-photos-wasm";
import { t } from "i18next";
import { useRouter } from "next/router";
import { useEffect, useEffectEvent, useState } from "react";
import type { RemotePullOpts } from ".";
import type { useGalleryReducer } from "./reducer";

interface PhotosStartupOptions {
    dispatch: ReturnType<typeof useGalleryReducer>[1];
    remotePull: (opts?: RemotePullOpts) => Promise<void>;
    showWhatsNew: () => void;
}

export const usePhotosStartup = ({
    dispatch,
    remotePull,
    showWhatsNew,
}: PhotosStartupOptions) => {
    const router = useRouter();
    const { logout, showMiniDialog, onGenericError } = useBaseContext();
    const [isFirstLoad, setIsFirstLoad] = useState(false);
    const [isStartupComplete, setIsStartupComplete] = useState(false);

    const startup = useEffectEvent(async (isCancelled: () => boolean) => {
        try {
            const authToken = await savedAuthToken();
            if (isCancelled()) return;
            if (!haveMasterKeyInSession() || !authToken) {
                stashRedirect("/gallery");
                void router.push("/");
                return;
            }
            if (savedJustSignedUp()) {
                void router.replace("/plan");
                return;
            }

            try {
                await ensureAuthenticatedSession();
            } catch (e) {
                if (isCancelled()) return;
                if (isNamedError(e, "missing_recovery_key")) {
                    showMiniDialog(sessionExpiredDialogAttributes(logout));
                } else {
                    onGenericError(e);
                }
                return;
            }
            if (isCancelled()) return;

            initSettings();
            dispatch({ type: "showAll" });
            setIsFirstLoad(getAndClearIsFirstLogin());

            const user = ensureLocalUser();
            void initContacts(
                user.id,
                ensureAuthenticatedSession,
                contactsGetDiff,
                contactsGetProfilePicture,
            )
                .then(pullContacts)
                .catch((error: unknown) => {
                    log.warn(
                        "[gallery] Failed to warm contacts display cache",
                        error,
                    );
                });
            const userDetails = await savedUserDetailsOrTriggerPull();
            const collections = await savedCollections();
            const collectionFiles = await savedCollectionFiles();
            const trashItems = await savedTrashItems();
            if (isCancelled()) return;
            dispatch({
                type: "mount",
                user,
                familyData: userDetails?.familyData,
                collections,
                collectionFiles,
                trashItems,
            });

            let joinedAlbumID: number | null = null;
            if (hasPendingAlbumToJoin()) {
                try {
                    joinedAlbumID = await processPendingAlbumJoin();
                } catch (error) {
                    if (isCancelled()) return;
                    log.error("Failed to join album", error);
                    showMiniDialog({
                        title: t("error"),
                        message: t("album_join_failed"),
                    });
                }
            }
            if (isCancelled()) return;

            await remotePull({ source: "gallery-mount" });
            if (isCancelled()) return;
            if (joinedAlbumID) {
                dispatch({
                    type: "showCollectionSummary",
                    collectionSummaryID: joinedAlbumID,
                });
            }
            setIsFirstLoad(false);
            setIsStartupComplete(true);

            const electron = globalThis.electron;
            if (electron && (await shouldShowWhatsNew(electron))) {
                if (!isCancelled()) showWhatsNew();
            }
        } catch (error) {
            if (!isCancelled()) onGenericError(error);
        }
    });

    useEffect(() => {
        let cancelled = false;
        void startup(() => cancelled);
        return () => {
            cancelled = true;
        };
    }, []);

    return { isFirstLoad, isStartupComplete };
};
