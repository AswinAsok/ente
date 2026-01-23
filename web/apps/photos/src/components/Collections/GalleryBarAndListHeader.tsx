// TODO: Audit this file
import { AllAlbums } from "components/Collections/AllAlbums";
import {
    CollectionShare,
    type CollectionShareProps,
} from "components/Collections/CollectionShare";
import type { FileListHeaderOrFooter } from "components/FileList";
import { useModalVisibility } from "ente-base/components/utils/modal";
import {
    isSaveCancelled,
    isSaveComplete,
    type SaveGroup,
} from "ente-gallery/components/utils/save-groups";
import type { Collection } from "ente-media/collection";
import {
    GalleryBarImpl,
    type GalleryBarImplProps,
} from "ente-new/photos/components/gallery/BarImpl";
import {
    GalleryItemsHeaderAdapter,
    GalleryItemsSummary,
} from "ente-new/photos/components/gallery/ListHeader";
import { PeopleHeader } from "ente-new/photos/components/gallery/PeopleHeader";
import {
    collectionsSortBy,
    haveOnlySystemCollections,
    PseudoCollectionID,
    sortCollectionSummaries,
    type CollectionsSortBy,
    type CollectionSummary,
    type CollectionSummaries,
} from "ente-new/photos/services/collection-summary";
import { includes } from "ente-utils/type-guards";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlbumCastDialog } from "./AlbumCastDialog";
import { CollectionContextMenu } from "./CollectionContextMenu";
import {
    CollectionHeader,
    type CollectionHeaderProps,
} from "./CollectionHeader";

type GalleryBarAndListHeaderProps = Omit<
    GalleryBarImplProps,
    | "collectionSummaries"
    | "onSelectCollectionID"
    | "collectionsSortBy"
    | "onChangeCollectionsSortBy"
    | "onShowAllAlbums"
> & {
    /**
     * When `true`, the bar is be hidden altogether.
     */
    shouldHide: boolean;
    barCollectionSummaries: CollectionSummaries;
    collections: Collection[];
    activeCollection: Collection | undefined;
    setActiveCollectionID: (collectionID: number) => void;
    setFileListHeader: (header: FileListHeaderOrFooter) => void;
    saveGroups: SaveGroup[];
} & Pick<
        CollectionHeaderProps,
        | "onRemotePull"
        | "onAddSaveGroup"
        | "onMarkTempDeleted"
        | "onAddFileToCollection"
        | "onRemoteFilesPull"
        | "onVisualFeedback"
        | "fileNormalCollectionIDs"
        | "collectionNameByID"
        | "onSelectCollection"
        | "onSelectPerson"
    > &
    Pick<
        CollectionShareProps,
        "user" | "emailByUserID" | "shareSuggestionEmails" | "setBlockingLoad"
    >;

/**
 * The gallery bar, the header for the list items, and state for any associated
 * dialogs that might be triggered by actions on either the bar or the header..
 *
 * This component manages the sticky horizontally scrollable bar shown at the
 * top of the gallery, AND the (non-sticky) header shown below the bar, at the
 * top of the actual list of items.
 *
 * These are disparate views - indeed, the list header is not even a child of
 * this component but is instead proxied via {@link setFileListHeader}. Still,
 * having this intermediate wrapper component allows us to move some of the
 * common concerns shared by both the gallery bar and list header (e.g. some
 * dialogs that can be invoked from both places) into this file instead of
 * cluttering the already big gallery component.
 *
 * TODO: Once the gallery code is better responsibilitied out, consider moving
 * this code back inline into the gallery.
 */
export const GalleryBarAndListHeader: React.FC<
    GalleryBarAndListHeaderProps
> = ({
    shouldHide,
    mode,
    onChangeMode,
    user,
    barCollectionSummaries: toShowCollectionSummaries,
    collections,
    activeCollection,
    activeCollectionID,
    setActiveCollectionID,
    setBlockingLoad,
    people,
    saveGroups,
    activePerson,
    emailByUserID,
    shareSuggestionEmails,
    onRemotePull,
    onAddSaveGroup,
    onMarkTempDeleted,
    onAddFileToCollection,
    onRemoteFilesPull,
    onVisualFeedback,
    fileNormalCollectionIDs,
    collectionNameByID,
    onSelectCollection,
    onSelectPerson,
    setFileListHeader,
}) => {
    const { show: showAllAlbums, props: allAlbumsVisibilityProps } =
        useModalVisibility();
    const { show: showCollectionShare, props: collectionShareVisibilityProps } =
        useModalVisibility();
    const { show: showCollectionCast, props: collectionCastVisibilityProps } =
        useModalVisibility();

    const [collectionsSortBy, setCollectionsSortBy] =
        useCollectionsSortByLocalState("updation-time-desc");

    const [collectionContextMenu, setCollectionContextMenu] = useState<{
        position: { top: number; left: number };
        collectionSummary: CollectionSummary;
    } | null>(null);
    const [isCollectionContextMenuOpen, setIsCollectionContextMenuOpen] =
        useState(false);
    const [shareTargetCollectionID, setShareTargetCollectionID] = useState<
        number | null
    >(null);
    const [castTargetCollectionID, setCastTargetCollectionID] = useState<
        number | null
    >(null);

    const handleOpenCollectionShare = useCallback(
        (collectionID: number) => {
            setShareTargetCollectionID(collectionID);
            showCollectionShare();
        },
        [showCollectionShare],
    );

    const handleOpenCollectionCast = useCallback(
        (collectionID: number) => {
            setCastTargetCollectionID(collectionID);
            showCollectionCast();
        },
        [showCollectionCast],
    );

    const handleActiveCollectionShare = useCallback(() => {
        if (activeCollectionID === undefined) return;
        handleOpenCollectionShare(activeCollectionID);
    }, [activeCollectionID, handleOpenCollectionShare]);

    const handleActiveCollectionCast = useCallback(() => {
        if (activeCollectionID === undefined) return;
        handleOpenCollectionCast(activeCollectionID);
    }, [activeCollectionID, handleOpenCollectionCast]);

    const shouldBeHidden = useMemo(
        () =>
            shouldHide ||
            (haveOnlySystemCollections(toShowCollectionSummaries) &&
                activeCollectionID === PseudoCollectionID.all),
        [shouldHide, toShowCollectionSummaries, activeCollectionID],
    );

    const sortedCollectionSummaries = useMemo(
        () =>
            sortCollectionSummaries(
                [...toShowCollectionSummaries.values()],
                collectionsSortBy,
            ).sort((a, b) => b.sortPriority - a.sortPriority),
        [collectionsSortBy, toShowCollectionSummaries],
    );

    const isCollectionDownloadInProgress = useCallback(
        (collectionSummaryID: number | undefined) => {
            if (collectionSummaryID === undefined) return false;
            const group = saveGroups.find(
                (g) => g.collectionSummaryID === collectionSummaryID,
            );
            return !!group && !isSaveComplete(group) && !isSaveCancelled(group);
        },
        [saveGroups],
    );

    const isActiveCollectionDownloadInProgress = useCallback(
        () => isCollectionDownloadInProgress(activeCollectionID),
        [isCollectionDownloadInProgress, activeCollectionID],
    );

    const handleCollectionContextMenu = useCallback(
        (event: React.MouseEvent, collectionSummary: CollectionSummary) => {
            if (!shouldShowCollectionContextMenu(collectionSummary)) return;
            event.preventDefault();
            event.stopPropagation();
            setCollectionContextMenu({
                position: { top: event.clientY, left: event.clientX },
                collectionSummary,
            });
            setIsCollectionContextMenuOpen(true);
        },
        [setCollectionContextMenu, setIsCollectionContextMenuOpen],
    );

    const handleCloseCollectionContextMenu = useCallback(() => {
        setIsCollectionContextMenuOpen(false);
    }, [setIsCollectionContextMenuOpen]);

    useEffect(() => {
        if (shouldHide) return;

        const collectionSummary = toShowCollectionSummaries.get(
            activeCollectionID!,
        );
        setFileListHeader({
            component:
                mode != "people" && activeCollection ? (
                    <CollectionHeader
                        {...{
                            activeCollection,
                            setActiveCollectionID,
                            isActiveCollectionDownloadInProgress,
                            onRemotePull,
                            onAddSaveGroup,
                            onMarkTempDeleted,
                            onAddFileToCollection,
                            onRemoteFilesPull,
                            onVisualFeedback,
                            fileNormalCollectionIDs,
                            collectionNameByID,
                            onSelectCollection,
                            onSelectPerson,
                        }}
                        collectionSummary={collectionSummary!}
                        onCollectionShare={handleActiveCollectionShare}
                        onCollectionCast={handleActiveCollectionCast}
                    />
                ) : mode != "people" && collectionSummary ? (
                    <GalleryItemsHeaderAdapter>
                        <GalleryItemsSummary
                            name={collectionSummary.name}
                            fileCount={collectionSummary.fileCount}
                        />
                    </GalleryItemsHeaderAdapter>
                ) : activePerson ? (
                    <PeopleHeader
                        person={activePerson}
                        {...{ onSelectPerson, people }}
                    />
                ) : (
                    <></>
                ),
            height: 68,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        shouldHide,
        mode,
        toShowCollectionSummaries,
        activeCollection,
        activeCollectionID,
        isActiveCollectionDownloadInProgress,
        activePerson,
        handleActiveCollectionShare,
        handleActiveCollectionCast,
        onRemotePull,
        onAddSaveGroup,
        onMarkTempDeleted,
        onAddFileToCollection,
        onRemoteFilesPull,
        onVisualFeedback,
        fileNormalCollectionIDs,
        collectionNameByID,
        onSelectCollection,
        onSelectPerson,
        // TODO: Cluster
        // This causes a loop since it is an array dep
        // people,
    ]);

    const contextMenuCollectionSummary =
        collectionContextMenu?.collectionSummary;
    const contextMenuCollection = useMemo(() => {
        if (!contextMenuCollectionSummary) return undefined;
        return collections.find(
            (collection) => collection.id === contextMenuCollectionSummary.id,
        );
    }, [collections, contextMenuCollectionSummary]);

    const contextMenuDownloadInProgress = useMemo(
        () =>
            contextMenuCollectionSummary
                ? () =>
                      isCollectionDownloadInProgress(
                          contextMenuCollectionSummary.id,
                      )
                : undefined,
        [contextMenuCollectionSummary, isCollectionDownloadInProgress],
    );

    const isContextMenuCollectionActive =
        contextMenuCollectionSummary?.id === activeCollectionID;

    const handleContextMenuShare = useCallback(() => {
        if (!contextMenuCollectionSummary) return;
        handleOpenCollectionShare(contextMenuCollectionSummary.id);
    }, [contextMenuCollectionSummary, handleOpenCollectionShare]);

    const handleContextMenuCast = useCallback(() => {
        if (!contextMenuCollectionSummary) return;
        handleOpenCollectionCast(contextMenuCollectionSummary.id);
    }, [contextMenuCollectionSummary, handleOpenCollectionCast]);

    const shareCollectionID = shareTargetCollectionID ?? activeCollectionID;
    const shareCollectionSummary =
        shareCollectionID === undefined
            ? undefined
            : toShowCollectionSummaries.get(shareCollectionID);
    const shareCollection = useMemo(
        () =>
            shareCollectionID === undefined
                ? undefined
                : collections.find(
                      (collection) => collection.id === shareCollectionID,
                  ),
        [collections, shareCollectionID],
    );

    const castCollectionID = castTargetCollectionID ?? activeCollectionID;
    const castCollection = useMemo(
        () =>
            castCollectionID === undefined
                ? undefined
                : collections.find((collection) => collection.id === castCollectionID),
        [collections, castCollectionID],
    );

    const handleCloseCollectionShare = useCallback(() => {
        setShareTargetCollectionID(null);
        collectionShareVisibilityProps.onClose();
    }, [collectionShareVisibilityProps.onClose]);

    const handleCloseCollectionCast = useCallback(() => {
        setCastTargetCollectionID(null);
        collectionCastVisibilityProps.onClose();
    }, [collectionCastVisibilityProps.onClose]);

    if (shouldBeHidden) {
        return <></>;
    }

    return (
        <>
            <GalleryBarImpl
                {...{
                    mode,
                    onChangeMode,
                    activeCollectionID,
                    people,
                    activePerson,
                    onSelectPerson,
                    collectionsSortBy,
                }}
                onSelectCollectionID={setActiveCollectionID}
                onCollectionContextMenu={
                    mode != "people" ? handleCollectionContextMenu : undefined
                }
                onChangeCollectionsSortBy={setCollectionsSortBy}
                onShowAllAlbums={showAllAlbums}
                collectionSummaries={sortedCollectionSummaries.filter(
                    (cs) => !cs.attributes.has("hideFromCollectionBar"),
                )}
            />
            {contextMenuCollectionSummary && (
                <CollectionContextMenu
                    open={isCollectionContextMenuOpen}
                    anchorPosition={collectionContextMenu?.position}
                    onClose={handleCloseCollectionContextMenu}
                    collectionSummary={contextMenuCollectionSummary}
                    collection={contextMenuCollection}
                    isActiveCollection={!!isContextMenuCollectionActive}
                    setActiveCollectionID={setActiveCollectionID}
                    isCollectionDownloadInProgress={contextMenuDownloadInProgress}
                    onCollectionShare={handleContextMenuShare}
                    onCollectionCast={handleContextMenuCast}
                    onRemotePull={onRemotePull}
                    onAddSaveGroup={onAddSaveGroup}
                    onMarkTempDeleted={onMarkTempDeleted}
                    onAddFileToCollection={onAddFileToCollection}
                    onRemoteFilesPull={onRemoteFilesPull}
                    onVisualFeedback={onVisualFeedback}
                    fileNormalCollectionIDs={fileNormalCollectionIDs}
                    collectionNameByID={collectionNameByID}
                    onSelectCollection={onSelectCollection}
                    onSelectPerson={onSelectPerson}
                />
            )}

            <AllAlbums
                {...allAlbumsVisibilityProps}
                collectionSummaries={sortedCollectionSummaries.filter(
                    (cs) => !cs.attributes.has("system"),
                )}
                onSelectCollectionID={setActiveCollectionID}
                onChangeCollectionsSortBy={setCollectionsSortBy}
                collectionsSortBy={collectionsSortBy}
                isInHiddenSection={mode == "hidden-albums"}
                onRemotePull={onRemotePull}
            />
            {shareCollection && shareCollectionSummary && (
                <CollectionShare
                    {...collectionShareVisibilityProps}
                    onClose={handleCloseCollectionShare}
                    collectionSummary={shareCollectionSummary}
                    collection={shareCollection}
                    {...{
                        user,
                        emailByUserID,
                        shareSuggestionEmails,
                        setBlockingLoad,
                        onRemotePull,
                    }}
                />
            )}
            {castCollection && (
                <AlbumCastDialog
                    {...collectionCastVisibilityProps}
                    onClose={handleCloseCollectionCast}
                    collection={castCollection}
                />
            )}
        </>
    );
};

const shouldShowCollectionContextMenu = ({ type }: CollectionSummary) =>
    type !== "all" && type !== "archiveItems" && type !== "uncategorized";

/**
 * A hook that maintains the collections sort order both as in-memory and local
 * storage state.
 */
const useCollectionsSortByLocalState = (initialValue: CollectionsSortBy) => {
    const key = "collectionsSortBy";

    const [value, setValue] = useState(initialValue);

    useEffect(() => {
        const value = localStorage.getItem(key);
        if (value && includes(collectionsSortBy, value)) setValue(value);
    }, []);

    const setter = (value: CollectionsSortBy) => {
        localStorage.setItem(key, value);
        setValue(value);
    };

    return [value, setter] as const;
};
