import { QuickLinkCreatedNotification } from "@/components/QuickLinkCreatedNotification";
import { SelectedFileOptions } from "@/components/SelectedFileOptions";
import { GalleryDownloadNotifications } from "@/components/gallery/GalleryDownloadNotifications";
import { useCollectionOperations } from "@/components/gallery/hooks/use-collection-operations";
import { useFileContextActions } from "@/components/gallery/hooks/use-file-context-actions";
import { useFileMutations } from "@/components/gallery/hooks/use-file-mutations";
import type { useGalleryLibrary } from "@/components/gallery/hooks/use-gallery-library";
import type { useGallerySelection } from "@/components/gallery/hooks/use-gallery-selection";
import { useGalleryUploads } from "@/components/gallery/hooks/use-gallery-uploads";
import { useSelectedFileOperations } from "@/components/gallery/hooks/use-selected-file-operations";
import type { GalleryBarMode } from "@/components/gallery/reducer";
import type { GallerySectionOperations } from "@/components/gallery/section-types";
import { getSelectedFiles } from "@/utils/file";
import { TranslucentLoadingOverlay } from "ente-base/components/loaders";
import { useSaveGroups } from "ente-gallery/components/utils/save-groups";
import type { EnteFile } from "ente-media/file";
import { ItemVisibility } from "ente-media/file-metadata";
import { haveOnlySystemCollections } from "ente-new/photos/services/collection-summary";
import type { SidebarActionID } from "ente-new/photos/services/search/types";
import { usePhotosAppContext } from "ente-new/photos/types/context";
import { useCallback, useMemo, useState } from "react";
import type { GalleryNavigationState } from "../navigation-state";
import { useSelectionShortcuts } from "./use-selection-shortcuts";
export const useGalleryOperations = (
    libraryOwner: ReturnType<typeof useGalleryLibrary>,
    selection: ReturnType<typeof useGallerySelection>,
    navigation: GalleryNavigationState,
    authenticateOpen: boolean,
    showSettings: (action?: SidebarActionID) => void,
) => {
    const {
        state,
        dispatch,
        peopleState,
        remotePull,
        remoteFilesPull,
        showSessionExpiredDialog,
    } = libraryOwner;
    const {
        selected,
        setSelected,
        clearSelection,
        mediaSource,
        setMediaSource,
    } = selection;
    const { user, normalCollectionSummaries } = state;
    const filteredFiles = mediaSource?.files ?? emptyFiles;
    const barMode: GalleryBarMode =
        mediaSource?.mode ?? navigation.destination.albumMode ?? "albums";
    const activeCollectionID = mediaSource?.activeCollectionID;
    const activeCollection =
        mediaSource?.activeCollection ??
        state.collections.find(
            (c) => c.id === navigation.destination.collectionID,
        );
    const activeCollectionSummary = mediaSource?.activeCollectionSummary;
    const activePersonID = mediaSource?.activePersonID;
    const isInSearchMode = navigation.overlay?.section === "search";
    const isCleanupViewOpen =
        navigation.overlay?.section === "duplicates" ||
        navigation.overlay?.section === "large-files";
    const { showLoadingBar, hideLoadingBar } = usePhotosAppContext();
    const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
    const [sectionActivity, setSectionActivity] = useState({
        selection: false,
        drop: false,
    });
    const [blockingLoad, setBlockingLoad] = useState(false);
    const [isFileViewerOpen, setIsFileViewerOpen] = useState(false);
    const { saveGroups, onAddSaveGroup, onRemoveSaveGroup } = useSaveGroups();
    const quickLinkVisibility =
        barMode == "hidden-albums"
            ? ItemVisibility.hidden
            : ItemVisibility.visible;
    const {
        publicLinkToast,
        setPublicLinkToast,
        handleFavoriteFileOp,
        onSendLinkError,
        handleFileViewerToggleFavorite,
        handleFileViewerFileVisibilityUpdate,
        handleFileViewerSendLink,
        handleMarkTempDeleted,
    } = useFileMutations({ state, dispatch, remotePull, quickLinkVisibility });
    const selectedFilesInView = useMemo(
        () => getSelectedFiles(selected, filteredFiles),
        [selected, filteredFiles],
    );
    const isAllSelectedInView =
        filteredFiles.length > 0 &&
        selectedFilesInView.length === filteredFiles.length;
    const handleVisualFeedback = useCallback(() => {
        showLoadingBar();
        setTimeout(hideLoadingBar, 0);
    }, [showLoadingBar, hideLoadingBar]);
    const {
        openCollectionSelector,
        showAlbumNameInput,
        albumNameInputVisibilityProps,
        setPostCreateAlbumOp,
        postCreateAlbumHidden,
        handleRemoveFilesFromCollection,
        createOnSelectForCollectionOp,
        createOnCreateForCollectionOp,
        handleOpenCollectionSelector,
        handleCloseCollectionSelector,
        handleAddSingleFileToCollection,
        collectionOperationDialogs,
    } = useCollectionOperations({
        state,
        selected,
        filteredFiles,
        barMode,
        clearSelection,
        remotePull,
    });
    const {
        suppressContextSelectionBar,
        showAddPersonAction,
        fixCreationTimeVisibilityProps,
        showEditLocation,
        showContextMenuAssignPerson,
        createFileOpHandler,
        handleDeleteFiles,
        selectedFavoriteCount,
        selectedCount,
        selectedOwnCount,
        selectedFileOperationDialogs,
    } = useSelectedFileOperations({
        state,
        dispatch,
        peopleState,
        selected,
        filteredFiles,
        quickLinkVisibility,
        clearSelection,
        onAddSaveGroup,
        remotePull,
        mutations: {
            setPublicLinkToast,
            handleFavoriteFileOp,
            onSendLinkError,
            handleMarkTempDeleted,
        },
    });
    const { openUploader, uploadTypeSelectorView, uploadUI, dropzoneProps } =
        useGalleryUploads({
            user,
            activeCollection,
            isFirstUpload: haveOnlySystemCollections(normalCollectionSummaries),
            isInHiddenSection: barMode == "hidden-albums",
            onUploadFile: (file) => dispatch({ type: "uploadFile", file }),
            onShowSubscription: () => showSettings("subscription"),
            onRemotePull: remotePull,
            onRemoteFilesPull: remoteFilesPull,
            onOpenCollectionSelector: handleOpenCollectionSelector,
            onCloseCollectionSelector: handleCloseCollectionSelector,
            onShowSessionExpiredDialog: showSessionExpiredDialog,
            setLoading: setBlockingLoad,
        });
    const handleContextMenuAction = useFileContextActions({
        collectionOperations: {
            createOnCreateForCollectionOp,
            createOnSelectForCollectionOp,
            handleOpenCollectionSelector,
            handleRemoveFilesFromCollection,
        },
        selectedOperations: {
            createFileOpHandler,
            handleDeleteFiles,
            showContextMenuAssignPerson,
            showEditLocation,
            selectedCount,
            selectedOwnCount,
        },
        activeCollection,
        activeCollectionSummary,
        barMode,
    });
    const hasActiveFileSelection =
        selected.count > 0 && selected.collectionID === activeCollectionID;
    const showSelectionBar =
        hasActiveFileSelection &&
        !suppressContextSelectionBar &&
        !(isContextMenuOpen && selected.count === 1);
    const handleSelectAll = useSelectionShortcuts({
        user,
        filteredFiles,
        activeCollectionID,
        activePersonID,
        barMode,
        setSelected,
        clearSelection,
        disabled:
            uploadTypeSelectorView ||
            openCollectionSelector ||
            fixCreationTimeVisibilityProps.open ||
            authenticateOpen ||
            albumNameInputVisibilityProps.open ||
            sectionActivity.selection ||
            isFileViewerOpen,
        isCleanupViewOpen,
    });
    const sectionOperations: GallerySectionOperations = {
        mediaSource,
        setMediaSource,
        selected,
        setSelected,
        onContextMenuAction: handleContextMenuAction,
        onContextMenuOpenChange: setIsContextMenuOpen,
        suppressSelectionUI: suppressContextSelectionBar,
        showAddPersonAction,
        onAddSaveGroup,
        onToggleFavorite: handleFileViewerToggleFavorite,
        onFileVisibilityUpdate: handleFileViewerFileVisibilityUpdate,
        onSendLink: handleFileViewerSendLink,
        onMarkTempDeleted: handleMarkTempDeleted,
        onSetOpenFileViewer: setIsFileViewerOpen,
        onRemotePull: remotePull,
        onRemoteFilesPull: remoteFilesPull,
        onVisualFeedback: handleVisualFeedback,
        onAddFileToCollection: handleAddSingleFileToCollection,
        onPendingNavigationConsumed: () => undefined,
        setBlockingLoad,
        onUpload: openUploader,
        onCreateAlbum: () => {
            setPostCreateAlbumOp(undefined);
            postCreateAlbumHidden.current = false;
            showAlbumNameInput();
        },
        saveGroups,
        setSectionActivity,
    };

    return {
        operations: sectionOperations,
        dropzoneProps: {
            ...dropzoneProps,
            disabled:
                dropzoneProps.disabled ||
                sectionActivity.drop ||
                isCleanupViewOpen,
        },
        alternateHeader: showSelectionBar ? (
            <SelectedFileOptions
                barMode={barMode}
                isInSearchMode={isInSearchMode}
                collection={isInSearchMode ? undefined : activeCollection}
                collectionSummary={
                    isInSearchMode ? undefined : activeCollectionSummary
                }
                selectedFileCount={selected.count}
                selectedOwnFileCount={selected.ownCount}
                selectedFavoriteCount={selectedFavoriteCount}
                onClearSelection={clearSelection}
                onDelete={() => handleDeleteFiles()}
                onRemoveFilesFromCollection={handleRemoveFilesFromCollection}
                onOpenCollectionSelector={handleOpenCollectionSelector}
                onSelectAll={handleSelectAll}
                isAllSelected={isAllSelectedInView}
                {...{
                    createOnCreateForCollectionOp,
                    createOnSelectForCollectionOp,
                    createFileOpHandler,
                    onShowAssignPersonDialog: showAddPersonAction
                        ? showContextMenuAssignPerson
                        : undefined,
                }}
                onEditLocation={showEditLocation}
            />
        ) : null,
        ui: (
            <>
                {blockingLoad && <TranslucentLoadingOverlay />}
                {collectionOperationDialogs}
                {selectedFileOperationDialogs}
                <GalleryDownloadNotifications
                    {...{ saveGroups, onRemoveSaveGroup }}
                />
                {uploadUI}
                <QuickLinkCreatedNotification
                    open={publicLinkToast.open}
                    onCopy={() => {
                        if (publicLinkToast.url)
                            void navigator.clipboard.writeText(
                                publicLinkToast.url,
                            );
                    }}
                    onClose={() =>
                        setPublicLinkToast((prev) => ({ ...prev, open: false }))
                    }
                />
            </>
        ),
    };
};
const emptyFiles: EnteFile[] = [];
