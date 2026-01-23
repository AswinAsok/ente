import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import EditIcon from "@mui/icons-material/Edit";
import LogoutIcon from "@mui/icons-material/Logout";
import MapOutlinedIcon from "@mui/icons-material/MapOutlined";
import PushPinIcon from "@mui/icons-material/PushPin";
import PushPinOutlinedIcon from "@mui/icons-material/PushPinOutlined";
import SortIcon from "@mui/icons-material/Sort";
import TvIcon from "@mui/icons-material/Tv";
import UnarchiveIcon from "@mui/icons-material/Unarchive";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import { Box } from "@mui/material";
import { ActivityIndicator } from "ente-base/components/mui/ActivityIndicator";
import {
    useModalVisibility,
    type ModalVisibilityProps,
} from "ente-base/components/utils/modal";
import { useBaseContext } from "ente-base/context";
import type { AddSaveGroup } from "ente-gallery/components/utils/save-groups";
import { downloadAndSaveCollectionFiles } from "ente-gallery/services/save";
import { uniqueFilesByID } from "ente-gallery/utils/file";
import { CollectionOrder, type Collection } from "ente-media/collection";
import { ItemVisibility } from "ente-media/file-metadata";
import type { RemotePullOpts } from "ente-new/photos/components/gallery";
import { useSettingsSnapshot } from "ente-new/photos/components/utils/use-snapshot";
import {
    cleanUncategorized,
    defaultHiddenCollectionUserFacingName,
    deleteCollection,
    findDefaultHiddenCollectionIDs,
    isHiddenCollection,
    leaveSharedCollection,
    renameCollection,
    updateCollectionOrder,
    updateCollectionSortOrder,
    updateCollectionVisibility,
    updateShareeCollectionOrder,
} from "ente-new/photos/services/collection";
import {
    PseudoCollectionID,
    type CollectionSummary,
} from "ente-new/photos/services/collection-summary";
import {
    savedCollectionFiles,
    savedCollections,
} from "ente-new/photos/services/photos-fdb";
import { updateMapEnabled } from "ente-new/photos/services/settings";
import { emptyTrash } from "ente-new/photos/services/trash";
import { usePhotosAppContext } from "ente-new/photos/types/context";
import { t } from "i18next";
import React, { useCallback, useMemo } from "react";
import { Trans } from "react-i18next";

export interface CollectionMenuItem {
    key: string;
    label: string;
    icon: React.ReactNode;
    color?: "primary" | "critical";
    isDestructive?: boolean;
    onClick: () => void;
}

export interface UseCollectionMenuArgs {
    collectionSummary: CollectionSummary;
    collection: Collection | undefined;
    setActiveCollectionID: (collectionID: number) => void;
    onRemotePull: (opts?: RemotePullOpts) => Promise<void>;
    onCollectionShare: () => void;
    onCollectionCast: () => void;
    onAddSaveGroup: AddSaveGroup;
    isCollectionDownloadInProgress?: () => boolean;
    isActiveCollection: boolean;
}

export interface UseCollectionMenuResult {
    menuItems: CollectionMenuItem[];
    albumNameInputVisibilityProps: ModalVisibilityProps;
    sortOrderMenuVisibilityProps: ModalVisibilityProps;
    mapDialogVisibilityProps: ModalVisibilityProps;
    sortAsc: boolean;
    handleRenameCollection: (newName: string) => Promise<void>;
    changeSortOrderAsc: () => void;
    changeSortOrderDesc: () => void;
    confirmEmptyTrash: () => void;
    confirmCleanUncategorized: () => void;
    downloadCollection: () => void;
}

export const shouldShowMapOption = ({ type, fileCount }: CollectionSummary) =>
    fileCount > 0 &&
    type !== "all" &&
    type !== "archiveItems" &&
    type !== "trash" &&
    type !== "hiddenItems";

export const DownloadIcon: React.FC<
    React.SVGProps<SVGSVGElement>
> = (props) => (
    <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...props}
    >
        <path d="M2.99969 17.0002C2.99969 17.9302 2.99969 18.3952 3.10192 18.7767C3.37932 19.8119 4.18796 20.6206 5.22324 20.898C5.60474 21.0002 6.06972 21.0002 6.99969 21.0002L16.9997 21.0002C17.9297 21.0002 18.3947 21.0002 18.7762 20.898C19.8114 20.6206 20.6201 19.8119 20.8975 18.7767C20.9997 18.3952 20.9997 17.9302 20.9997 17.0002" />
        <path d="M16.4998 11.5002C16.4998 11.5002 13.1856 16.0002 11.9997 16.0002C10.8139 16.0002 7.49976 11.5002 7.49976 11.5002M11.9997 15.0002V3.00016" />
    </svg>
);

export const ShareIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg
        width="21"
        height="19"
        viewBox="0 0 22 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        {...props}
    >
        <path
            d="M13.875 8C13.3918 8 13 8.39175 13 8.875C13 9.35825 13.3918 9.75 13.875 9.75V8.875V8ZM13.875 0C13.3918 0 13 0.391751 13 0.875C13 1.35825 13.3918 1.75 13.875 1.75V0.875V0ZM15.875 11C15.3918 11 15 11.3918 15 11.875C15 12.3582 15.3918 12.75 15.875 12.75V11.875V11ZM17.375 18C16.8918 18 16.5 18.3918 16.5 18.875C16.5 19.3582 16.8918 19.75 17.375 19.75V18.875V18ZM11.875 4.875H11C11 6.60089 9.60086 8 7.875 8V8.875V9.75C10.5673 9.75 12.75 7.56739 12.75 4.875H11.875ZM7.875 8.875V8C6.14911 8 4.75 6.60089 4.75 4.875H3.875H3C3 7.56739 5.18261 9.75 7.875 9.75V8.875ZM3.875 4.875H4.75C4.75 3.14911 6.14911 1.75 7.875 1.75V0.875V0C5.18261 0 3 2.18261 3 4.875H3.875ZM7.875 0.875V1.75C9.60086 1.75 11 3.14911 11 4.875H11.875H12.75C12.75 2.18261 10.5673 0 7.875 0V0.875ZM13.875 8.875V9.75C16.5673 9.75 18.75 7.56739 18.75 4.875H17.875H17C17 6.60089 15.6009 8 13.875 8V8.875ZM17.875 4.875H18.75C18.75 2.18261 16.5673 0 13.875 0V0.875V1.75C15.6009 1.75 17 3.14911 17 4.875H17.875ZM9.875 11.875V11H5.875V11.875V12.75H9.875V11.875ZM5.875 11.875V11C2.63033 11 0 13.6304 0 16.875H0.875H1.75C1.75 14.5968 3.59683 12.75 5.875 12.75V11.875ZM0.875 16.875H0C0 18.4629 1.28719 19.75 2.875 19.75V18.875V18C2.25367 18 1.75 17.4963 1.75 16.875H0.875ZM2.875 18.875V19.75H12.875V18.875V18H2.875V18.875ZM12.875 18.875V19.75C14.4628 19.75 15.75 18.4628 15.75 16.875H14.875H14C14 17.4964 13.4964 18 12.875 18V18.875ZM14.875 16.875H15.75C15.75 13.6304 13.1196 11 9.875 11V11.875V12.75C12.1532 12.75 14 14.5968 14 16.875H14.875ZM15.875 11.875V12.75C18.1532 12.75 20 14.5968 20 16.875H20.875H21.75C21.75 13.6304 19.1196 11 15.875 11V11.875ZM20.875 16.875H20C20 17.4964 19.4964 18 18.875 18V18.875V19.75C20.4628 19.75 21.75 18.4628 21.75 16.875H20.875ZM18.875 18.875V18H17.375V18.875V19.75H18.875V18.875Z"
            fill="currentColor"
        />
    </svg>
);

export const useCollectionMenu = ({
    collectionSummary,
    collection,
    setActiveCollectionID,
    onRemotePull,
    onCollectionShare,
    onCollectionCast,
    onAddSaveGroup,
    isCollectionDownloadInProgress,
    isActiveCollection,
}: UseCollectionMenuArgs): UseCollectionMenuResult => {
    const { showMiniDialog, onGenericError } = useBaseContext();
    const { showLoadingBar, hideLoadingBar, showNotification } =
        usePhotosAppContext();
    const { mapEnabled, isInternalUser } = useSettingsSnapshot();

    const { show: showSortOrderMenu, props: sortOrderMenuVisibilityProps } =
        useModalVisibility();
    const { show: showAlbumNameInput, props: albumNameInputVisibilityProps } =
        useModalVisibility();
    const { show: showMapDialog, props: mapDialogVisibilityProps } =
        useModalVisibility();

    const { type: collectionSummaryType, fileCount } = collectionSummary;

    /**
     * Return a new function by wrapping an async function in an error handler,
     * showing the global loading bar when the function runs, and syncing with
     * remote on completion.
     */
    const wrap = useCallback(
        (f: () => Promise<void>) => {
            const wrapped = async () => {
                showLoadingBar();
                try {
                    await f();
                } catch (e) {
                    onGenericError(e);
                } finally {
                    void onRemotePull({ silent: true });
                    hideLoadingBar();
                }
            };
            return (): void => void wrapped();
        },
        [showLoadingBar, hideLoadingBar, onGenericError, onRemotePull],
    );

    const setActiveCollectionIDIfCurrent = useCallback(
        (collectionID: number) => {
            if (isActiveCollection) setActiveCollectionID(collectionID);
        },
        [isActiveCollection, setActiveCollectionID],
    );

    const handleRenameCollection = useCallback(
        async (newName: string) => {
            if (!collection) return;
            if (collection.name !== newName) {
                await renameCollection(collection, newName);
                void onRemotePull({ silent: true });
            }
        },
        [collection, onRemotePull],
    );

    const hasAlbumFiles = fileCount > 0;

    const deleteCollectionAlongWithFiles = wrap(async () => {
        if (!collection) return;
        await deleteCollection(collection.id);
        setActiveCollectionIDIfCurrent(PseudoCollectionID.all);
    });

    const deleteCollectionButKeepFiles = wrap(async () => {
        if (!collection) return;
        await deleteCollection(collection.id, { keepFiles: true });
        setActiveCollectionIDIfCurrent(PseudoCollectionID.all);
    });

    const confirmDeleteCollection = () => {
        if (hasAlbumFiles) {
            showMiniDialog({
                title: t("delete_album_title"),
                message: (
                    <Trans
                        i18nKey={"delete_album_message"}
                        components={{
                            a: (
                                <Box
                                    component={"span"}
                                    sx={{ color: "text.base" }}
                                />
                            ),
                        }}
                    />
                ),
                continue: {
                    text: t("keep_photos"),
                    color: "primary",
                    action: deleteCollectionButKeepFiles,
                },
                secondary: {
                    text: t("delete_photos"),
                    color: "critical",
                    action: deleteCollectionAlongWithFiles,
                },
            });
            return;
        }

        showMiniDialog({
            title: t("delete_album_title"),
            message: (
                <Trans
                    i18nKey={"delete_album_message_no_photos"}
                    components={{
                        a: (
                            <Box component={"span"} sx={{ color: "text.base" }} />
                        ),
                    }}
                />
            ),
            continue: {
                text: t("delete_album"),
                color: "critical",
                action: deleteCollectionAlongWithFiles,
            },
        });
    };

    const doEmptyTrash = wrap(async () => {
        await emptyTrash();
        setActiveCollectionIDIfCurrent(PseudoCollectionID.all);
    });

    const confirmEmptyTrash = () =>
        showMiniDialog({
            title: t("empty_trash_title"),
            message: t("empty_trash_message"),
            continue: {
                text: t("empty_trash"),
                color: "critical",
                action: doEmptyTrash,
            },
        });

    const doCleanUncategorized = wrap(async () => {
        if (!collection) return;
        const count = await cleanUncategorized(collection);
        showNotification({
            color: "secondary",
            title: t("clean_uncategorized_success", { count }),
        });
    });

    const confirmCleanUncategorized = () =>
        showMiniDialog({
            title: t("clean_uncategorized"),
            message: t("clean_uncategorized_message"),
            continue: {
                text: t("clean_uncategorized"),
                color: "primary",
                action: doCleanUncategorized,
            },
        });

    const _downloadCollection = async () => {
        if (isCollectionDownloadInProgress?.()) return;

        if (collectionSummaryType == "hiddenItems") {
            const defaultHiddenCollectionsIDs = findDefaultHiddenCollectionIDs(
                await savedCollections(),
            );
            const collectionFiles = await savedCollectionFiles();
            const defaultHiddenCollectionFiles = uniqueFilesByID(
                collectionFiles.filter((file) =>
                    defaultHiddenCollectionsIDs.has(file.collectionID),
                ),
            );
            await downloadAndSaveCollectionFiles(
                defaultHiddenCollectionUserFacingName,
                PseudoCollectionID.hiddenItems,
                defaultHiddenCollectionFiles,
                true,
                onAddSaveGroup,
            );
        } else if (collection) {
            await downloadAndSaveCollectionFiles(
                collection.name,
                collection.id,
                (await savedCollectionFiles()).filter(
                    (file) => file.collectionID == collection.id,
                ),
                isHiddenCollection(collection),
                onAddSaveGroup,
            );
        }
    };

    const downloadCollection = useCallback(
        () => void _downloadCollection().catch(onGenericError),
        [_downloadCollection, onGenericError],
    );

    const archiveAlbum = wrap(async () => {
        if (!collection) return;
        await updateCollectionVisibility(collection, ItemVisibility.archived);
    });

    const unarchiveAlbum = wrap(async () => {
        if (!collection) return;
        await updateCollectionVisibility(collection, ItemVisibility.visible);
    });

    const leaveSharedAlbum = wrap(async () => {
        if (!collection) return;
        await leaveSharedCollection(collection.id);
        setActiveCollectionIDIfCurrent(PseudoCollectionID.all);
    });

    const confirmLeaveSharedAlbum = () =>
        showMiniDialog({
            title: t("leave_shared_album_title"),
            message: t("leave_shared_album_message"),
            continue: {
                text: t("leave_shared_album"),
                color: "critical",
                action: leaveSharedAlbum,
            },
        });

    const pinAlbum = wrap(async () => {
        if (!collection) return;
        await updateCollectionOrder(collection, CollectionOrder.pinned);
    });

    const unpinAlbum = wrap(async () => {
        if (!collection) return;
        await updateCollectionOrder(collection, CollectionOrder.default);
    });

    const pinSharedAlbum = wrap(async () => {
        if (!collection) return;
        await updateShareeCollectionOrder(collection, CollectionOrder.pinned);
    });

    const unpinSharedAlbum = wrap(async () => {
        if (!collection) return;
        await updateShareeCollectionOrder(collection, CollectionOrder.default);
    });

    const hideAlbum = wrap(async () => {
        if (!collection) return;
        await updateCollectionVisibility(collection, ItemVisibility.hidden);
        setActiveCollectionIDIfCurrent(PseudoCollectionID.all);
    });

    const unhideAlbum = wrap(async () => {
        if (!collection) return;
        await updateCollectionVisibility(collection, ItemVisibility.visible);
        setActiveCollectionIDIfCurrent(PseudoCollectionID.hiddenItems);
    });

    const changeSortOrderAsc = wrap(async () => {
        if (!collection) return;
        await updateCollectionSortOrder(collection, true);
    });

    const changeSortOrderDesc = wrap(async () => {
        if (!collection) return;
        await updateCollectionSortOrder(collection, false);
    });

    const handleShowMap = useCallback(async () => {
        if (!mapEnabled) {
            try {
                await updateMapEnabled(true);
            } catch (e) {
                onGenericError(e);
                return;
            }
        }
        showMapDialog();
    }, [mapEnabled, onGenericError, showMapDialog]);

    const downloadMenuIcon = useMemo(
        () =>
            isCollectionDownloadInProgress?.() ? (
                <ActivityIndicator size="20px" sx={{ cursor: "not-allowed" }} />
            ) : (
                <DownloadIcon />
            ),
        [isCollectionDownloadInProgress],
    );

    const isCollectionHidden = useMemo(
        () => (collection ? isHiddenCollection(collection) : false),
        [collection],
    );

    const sortAsc = collection?.pubMagicMetadata?.data.asc ?? false;

    const menuItems = useMemo(() => {
        const items: CollectionMenuItem[] = [];

        switch (collectionSummaryType) {
            case "trash":
                items.push({
                    key: "trash",
                    label: t("empty_trash"),
                    icon: <DeleteOutlinedIcon />,
                    color: "critical",
                    isDestructive: true,
                    onClick: confirmEmptyTrash,
                });
                break;

            case "userFavorites":
                if (fileCount) {
                    items.push({
                        key: "download",
                        label: t("download_favorites"),
                        icon: downloadMenuIcon,
                        onClick: downloadCollection,
                    });
                }
                items.push(
                    {
                        key: "share",
                        label: t("share_favorites"),
                        icon: <ShareIcon />,
                        onClick: onCollectionShare,
                    },
                    {
                        key: "cast",
                        label: t("cast_to_tv"),
                        icon: <TvIcon />,
                        onClick: onCollectionCast,
                    },
                );
                break;

            case "uncategorized":
                // Quick options are shown instead of a menu.
                break;

            case "hiddenItems":
                if (fileCount) {
                    items.push({
                        key: "download-hidden",
                        label: t("download_hidden_items"),
                        icon: downloadMenuIcon,
                        onClick: downloadCollection,
                    });
                }
                break;

            case "sharedIncoming":
                if (!collection) break;
                items.push(
                    collectionSummary.attributes.has("shareePinned")
                        ? {
                              key: "unpin",
                              label: t("unpin_album"),
                              icon: <PushPinOutlinedIcon />,
                              onClick: unpinSharedAlbum,
                          }
                        : {
                              key: "pin",
                              label: t("pin_album"),
                              icon: <PushPinIcon />,
                              onClick: pinSharedAlbum,
                          },
                    collectionSummary.attributes.has("archived")
                        ? {
                              key: "unarchive",
                              label: t("unarchive_album"),
                              icon: <UnarchiveIcon />,
                              onClick: unarchiveAlbum,
                          }
                        : {
                              key: "archive",
                              label: t("archive_album"),
                              icon: <ArchiveOutlinedIcon />,
                              onClick: archiveAlbum,
                          },
                );
                if (isInternalUser) {
                    items.push(
                        isCollectionHidden
                            ? {
                                  key: "unhide",
                                  label: t("unhide_collection"),
                                  icon: <VisibilityOutlinedIcon />,
                                  onClick: unhideAlbum,
                              }
                            : {
                                  key: "hide",
                                  label: t("hide_collection"),
                                  icon: <VisibilityOffOutlinedIcon />,
                                  onClick: hideAlbum,
                              },
                    );
                }
                items.push(
                    {
                        key: "leave",
                        label: t("leave_album"),
                        icon: <LogoutIcon />,
                        isDestructive: true,
                        onClick: confirmLeaveSharedAlbum,
                    },
                    {
                        key: "cast",
                        label: t("cast_album_to_tv"),
                        icon: <TvIcon />,
                        onClick: onCollectionCast,
                    },
                );
                break;

            default:
                if (!collection) break;
                items.push(
                    {
                        key: "rename",
                        label: t("rename_album"),
                        icon: <EditIcon />,
                        onClick: showAlbumNameInput,
                    },
                    {
                        key: "sort",
                        label: t("sort_by"),
                        icon: <SortIcon />,
                        onClick: showSortOrderMenu,
                    },
                );
                if (shouldShowMapOption(collectionSummary)) {
                    items.push({
                        key: "map",
                        label: t("map"),
                        icon: <MapOutlinedIcon />,
                        onClick: handleShowMap,
                    });
                }
                items.push(
                    collectionSummary.attributes.has("pinned")
                        ? {
                              key: "unpin",
                              label: t("unpin_album"),
                              icon: <PushPinOutlinedIcon />,
                              onClick: unpinAlbum,
                          }
                        : {
                              key: "pin",
                              label: t("pin_album"),
                              icon: <PushPinIcon />,
                              onClick: pinAlbum,
                          },
                );
                if (!isCollectionHidden) {
                    items.push(
                        collectionSummary.attributes.has("archived")
                            ? {
                                  key: "unarchive",
                                  label: t("unarchive_album"),
                                  icon: <UnarchiveIcon />,
                                  onClick: unarchiveAlbum,
                              }
                            : {
                                  key: "archive",
                                  label: t("archive_album"),
                                  icon: <ArchiveOutlinedIcon />,
                                  onClick: archiveAlbum,
                              },
                    );
                }
                items.push(
                    isCollectionHidden
                        ? {
                              key: "unhide",
                              label: t("unhide_collection"),
                              icon: <VisibilityOutlinedIcon />,
                              onClick: unhideAlbum,
                          }
                        : {
                              key: "hide",
                              label: t("hide_collection"),
                              icon: <VisibilityOffOutlinedIcon />,
                              onClick: hideAlbum,
                          },
                    {
                        key: "delete",
                        label: t("delete_album"),
                        icon: <DeleteOutlinedIcon />,
                        isDestructive: true,
                        onClick: confirmDeleteCollection,
                    },
                    {
                        key: "share",
                        label: t("share_album"),
                        icon: <ShareIcon />,
                        onClick: onCollectionShare,
                    },
                    {
                        key: "cast",
                        label: t("cast_album_to_tv"),
                        icon: <TvIcon />,
                        onClick: onCollectionCast,
                    },
                );
                break;
        }

        return items;
    }, [
        archiveAlbum,
        collection,
        collectionSummary,
        collectionSummaryType,
        confirmDeleteCollection,
        confirmEmptyTrash,
        confirmLeaveSharedAlbum,
        downloadCollection,
        downloadMenuIcon,
        fileCount,
        handleShowMap,
        hideAlbum,
        isCollectionHidden,
        isInternalUser,
        onCollectionCast,
        onCollectionShare,
        pinAlbum,
        pinSharedAlbum,
        showAlbumNameInput,
        showSortOrderMenu,
        unarchiveAlbum,
        unhideAlbum,
        unpinAlbum,
        unpinSharedAlbum,
    ]);

    return {
        menuItems,
        albumNameInputVisibilityProps,
        sortOrderMenuVisibilityProps,
        mapDialogVisibilityProps,
        sortAsc,
        handleRenameCollection,
        changeSortOrderAsc,
        changeSortOrderDesc,
        confirmEmptyTrash,
        confirmCleanUncategorized,
        downloadCollection,
    };
};
