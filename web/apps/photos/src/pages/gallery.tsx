import { useCollectionOperations } from "@/components/gallery/hooks/use-collection-operations";
import { useFileContextActions } from "@/components/gallery/hooks/use-file-context-actions";
import { useFileMutations } from "@/components/gallery/hooks/use-file-mutations";
import { useGallerySelection } from "@/components/gallery/hooks/use-gallery-selection";
import { useSelectedFileOperations } from "@/components/gallery/hooks/use-selected-file-operations";
// TODO: Audit this file (the code here is mostly fine, but needs revisiting
// the file it depends on have been audited and their interfaces fixed).
/* eslint-disable react-hooks/exhaustive-deps */
import { AuthenticateUser } from "@/components/AuthenticateUser";
import { DesktopWhatsNew } from "@/components/DesktopWhatsNew";
import type { FileListHeaderOrFooter } from "@/components/FileList";
import { FileListWithViewer } from "@/components/FileListWithViewer";
import { QuickLinkCreatedNotification } from "@/components/QuickLinkCreatedNotification";
import { SelectedFileOptions } from "@/components/SelectedFileOptions";
import { Upload } from "@/components/Upload";
import { AlbumSlideshow } from "@/components/collections/AlbumSlideshow";
import { CollectionMap } from "@/components/collections/CollectionMap";
import {
    EditAlbumDetailsDialog,
    type AlbumDetails,
} from "@/components/collections/EditAlbumDetailsDialog";
import { GalleryBarAndListHeader } from "@/components/collections/GalleryBarAndListHeader";
import {
    GalleryEmptyState,
    PeopleConsentDialog,
    SearchResultsHeader,
} from "@/components/gallery";
import { AlbumsOverview } from "@/components/gallery/AlbumsOverview";
import { DuplicatesView } from "@/components/gallery/DuplicatesView";
import { LargeFilesView } from "@/components/gallery/LargeFilesView";
import { LegacyGallerySection } from "@/components/gallery/LegacyGallerySection";
import { LinksView } from "@/components/gallery/LinksView";
import { PeopleOverview } from "@/components/gallery/PeopleOverview";
import {
    PhotosNavigationContext,
    type PhotosNavigationActions,
} from "@/components/gallery/PhotosNavigationContext";
import {
    PhotosNavigationShell,
    type PhotosNavigationShellHandle,
} from "@/components/gallery/PhotosNavigationShell";
import type { PlaceSelection } from "@/components/gallery/PlacesList";
import {
    albumShortcutCollectionID,
    showCollectionSummaryWithAuthentication,
} from "@/components/gallery/helpers";
import { useGalleryAuthentication } from "@/components/gallery/hooks/use-gallery-authentication";
import { useGalleryLibrary } from "@/components/gallery/hooks/use-gallery-library";
import { useGalleryPreferences } from "@/components/gallery/hooks/use-gallery-preferences";
import { useGallerySlideshow } from "@/components/gallery/hooks/use-gallery-slideshow";
import type { GalleryBarMode } from "@/components/gallery/reducer";
import { useAlbumNavigationData } from "@/components/gallery/use-album-navigation-data";
import {
    albumFilters,
    visibleAlbumFilters,
    type AlbumFilter,
} from "@/utils/album-filters";
import { externalLink } from "@/utils/link";
import { sortPeople } from "@/utils/people-sort";
import { Typography } from "@mui/material";
import { TranslucentLoadingOverlay } from "ente-base/components/loaders";
import { useModalVisibility } from "ente-base/components/utils/modal";
import { useBaseContext } from "ente-base/context";
import { DownloadStatusNotifications } from "ente-gallery/components/DownloadStatusNotifications";
import { FullScreenDropZone } from "ente-gallery/components/FullScreenDropZone";
import type { UploadTypeSelectorIntent } from "ente-gallery/components/Upload";
import {
    isSaveCancelled,
    isSaveComplete,
    useSaveGroups,
} from "ente-gallery/components/utils/save-groups";
import type { FileViewerInitialSidebar } from "ente-gallery/components/viewer/FileViewer";
import { ItemVisibility } from "ente-media/file-metadata";
import {
    useMLStatusSnapshot,
    useSettingsSnapshot,
} from "ente-new/photos/components/utils/use-snapshot";
import {
    renameCollection,
    updateCollectionDetails,
} from "ente-new/photos/services/collection";
import {
    haveOnlySystemCollections,
    PseudoCollectionID,
} from "ente-new/photos/services/collection-summary";
import { isMLEnabled } from "ente-new/photos/services/ml";

import { uploadManager } from "@/services/upload-manager";
import { getSelectedFiles, type SelectedState } from "@/utils/file";
import { filterSearchableFiles } from "ente-new/photos/services/search";
import type { SearchOption } from "ente-new/photos/services/search/types";
import { updateMapEnabled } from "ente-new/photos/services/settings";
import { usePhotosAppContext } from "ente-new/photos/types/context";
import { t } from "i18next";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FileWithPath } from "react-dropzone";
import { Trans } from "react-i18next";

const Page: React.FC = () => {
    const { onGenericError } = useBaseContext();
    const { showLoadingBar, hideLoadingBar, watchFolderView } =
        usePhotosAppContext();

    const {
        state,
        dispatch,
        isFirstLoad,
        peopleState,
        remotePull,
        remoteFilesPull,
        showSessionExpiredDialog,
    } = useGalleryLibrary();

    const [cleanupView, setCleanupView] = useState<
        "large-files" | "duplicates"
    >();
    const isCleanupViewOpen = cleanupView !== undefined;
    const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
    const { selected, setSelected, clearSelection } = useGallerySelection();
    const [blockingLoad, setBlockingLoad] = useState(false);
    const [shouldDisableDropzone, setShouldDisableDropzone] = useState(false);
    const [dragAndDropFiles, setDragAndDropFiles] = useState<FileWithPath[]>(
        [],
    );
    const [isFileViewerOpen, setIsFileViewerOpen] = useState(false);
    const [pendingFileNavigation, setPendingFileNavigation] = useState<{
        fileIndex: number;
        sidebar?: FileViewerInitialSidebar;
        commentID?: string;
    }>();
    const [uploadTypeSelectorView, setUploadTypeSelectorView] = useState(false);
    const [uploadTypeSelectorIntent, setUploadTypeSelectorIntent] =
        useState<UploadTypeSelectorIntent>("upload");
    const [fileListHeader, setFileListHeader] = useState<
        FileListHeaderOrFooter | undefined
    >(undefined);

    const { mapEnabled } = useSettingsSnapshot();
    const mlStatus = useMLStatusSnapshot();

    const { saveGroups, onAddSaveGroup, onRemoveSaveGroup } = useSaveGroups();
    const navigationRef = useRef<PhotosNavigationShellHandle>(null);

    const lastAuthenticationForHiddenTimestamp = useRef<number>(0);

    const { show: showPeopleConsent, props: peopleConsentVisibilityProps } =
        useModalVisibility();
    const pendingPeopleSearchReset = useRef<(() => void) | undefined>(
        undefined,
    );
    const { authenticateUser, authenticateUserDialogProps } =
        useGalleryAuthentication();
    const {
        show: showEditAlbumDetails,
        props: editAlbumDetailsVisibilityProps,
    } = useModalVisibility();
    const [selectedPlace, setSelectedPlace] = useState<PlaceSelection>();
    const [placeSelectionRevision, setPlaceSelectionRevision] = useState(0);
    const [isMapView, setIsMapView] = useState(false);
    const closeCollectionMap = useCallback(() => setIsMapView(false), []);

    const handleShowCollectionMap = useCallback(() => {
        void (async () => {
            if (!mapEnabled) {
                try {
                    await updateMapEnabled(true);
                } catch (e) {
                    onGenericError(e);
                    return;
                }
            }
            setIsMapView(true);
        })();
    }, [mapEnabled, onGenericError]);

    const {
        user,
        favoriteFileIDs,
        collectionNameByID,
        fileNormalCollectionIDs,
        hiddenCollectionIDs,
        normalCollectionSummaries,
        hiddenFileIDs,
        tempDeletedFileIDs,
        tempHiddenFileIDs,
        pendingFavoriteUpdates,
        pendingVisibilityUpdates,
        isInSearchMode,
        filteredFiles,
    } = state;

    const isAlbumOverview = state.view?.type == "album-overview";
    const barMode =
        state.view?.type == "album-overview"
            ? "albums"
            : (state.view?.type ?? "albums");
    const overviewFilter =
        state.view?.type == "album-overview"
            ? state.view.albumFilter
            : undefined;
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

    const activeCollectionID =
        state.view?.type == "people" ||
        state.view?.type == "album-overview" ||
        state.view?.type == "links"
            ? undefined
            : state.view?.activeCollectionSummaryID;
    const activeCollection =
        state.view?.type == "people" ||
        state.view?.type == "album-overview" ||
        state.view?.type == "links"
            ? undefined
            : state.view?.activeCollection;
    const activeCollectionSummary =
        state.view?.type == "people" ||
        state.view?.type == "album-overview" ||
        state.view?.type == "links"
            ? undefined
            : state.view?.activeCollectionSummary;
    const selectedLinkID =
        state.view?.type == "links" ? state.view.selectedLinkID : undefined;
    const galleryBarActiveCollectionID =
        barMode == "links" ? selectedLinkID : activeCollectionID;
    const {
        albumFilter,
        setAlbumFilter,
        albumSearchQuery,
        setAlbumSearchQuery,
        albumOpenedFromOverview,
        setAlbumOpenedFromOverview,
        peopleSortBy,
        setPeopleSortBy,
        collectionsSortBy,
        onChangeCollectionsSortBy,
        albumExpansion,
    } = useGalleryPreferences({
        barMode,
        activeCollectionID,
        navigationAvailable: !isCleanupViewOpen && !isInSearchMode,
    });
    const isActiveCollectionDownloadInProgress = useCallback(() => {
        const group = saveGroups.find(
            (g) => g.collectionSummaryID === galleryBarActiveCollectionID,
        );
        return !!group && !isSaveComplete(group) && !isSaveCancelled(group);
    }, [saveGroups, galleryBarActiveCollectionID]);
    const activePerson =
        state.view?.type == "people" ? state.view.activePerson : undefined;
    const people =
        (state.view?.type == "people" ? state.view.visiblePeople : undefined) ??
        [];
    const sortedPeople = useMemo(
        () => sortPeople(people, peopleSortBy),
        [people, peopleSortBy],
    );
    const activePersonID = activePerson?.id;
    const fileCollectionIDs = useMemo(
        () =>
            state.collectionFiles.reduce((result, file) => {
                const collectionIDs = result.get(file.id);
                if (collectionIDs) {
                    if (!collectionIDs.includes(file.collectionID)) {
                        collectionIDs.push(file.collectionID);
                    }
                } else {
                    result.set(file.id, [file.collectionID]);
                }
                return result;
            }, new Map<number, number[]>()),
        [state.collectionFiles],
    );

    const activeCollectionFiles = useMemo(() => {
        if (!activeCollection) return [];
        if (barMode == "hidden-albums" || barMode == "archive-albums") {
            return filteredFiles;
        }

        return filteredFiles.filter(({ id, magicMetadata }) => {
            const visibility = magicMetadata?.data.visibility;
            const isVisible =
                visibility === undefined ||
                visibility === ItemVisibility.visible;

            return (
                isVisible &&
                !hiddenFileIDs.has(id) &&
                !tempDeletedFileIDs.has(id) &&
                !tempHiddenFileIDs.has(id)
            );
        });
    }, [
        activeCollection,
        barMode,
        filteredFiles,
        hiddenFileIDs,
        tempDeletedFileIDs,
        tempHiddenFileIDs,
    ]);
    const { slideshow, startSlideshow, closeSlideshow } = useGallerySlideshow({
        activeCollection,
        activeCollectionFiles,
        activeCollectionSummary,
        isInSearchMode,
        user,
    });

    const mapFileSource = useMemo(
        () => ({
            collectionFiles: state.collectionFiles,
            favoriteFileIDs,
            hiddenFileIDs,
            archivedFileIDs: state.archivedFileIDs,
            tempDeletedFileIDs,
            tempHiddenFileIDs,
        }),
        [
            favoriteFileIDs,
            hiddenFileIDs,
            state.archivedFileIDs,
            state.collectionFiles,
            tempDeletedFileIDs,
            tempHiddenFileIDs,
        ],
    );
    const selectedFilesInView = useMemo(
        () => getSelectedFiles(selected, filteredFiles),
        [selected, filteredFiles],
    );
    const isAllSelectedInView =
        filteredFiles.length > 0 &&
        selectedFilesInView.length === filteredFiles.length;

    const barCollectionSummaries =
        barMode == "hidden-albums"
            ? state.hiddenCollectionSummaries
            : barMode == "archive-albums"
              ? state.archivedCollectionSummaries
              : state.normalCollectionSummaries;

    const collectionSummary = barCollectionSummaries.get(
        galleryBarActiveCollectionID!,
    );

    const {
        sidebarCollectionSummaries,
        overviewAlbums,
        visibleAlbumFilters: sidebarAlbumFilters,
    } = useAlbumNavigationData({
        mode: barMode == "links" ? undefined : barMode,
        collectionsSortBy,
        collectionSummaries: barCollectionSummaries,
        uncategorizedCollectionSummaryID:
            state.uncategorizedCollectionSummaryID,
        albumFilter,
        albumSearchQuery,
    });

    useEffect(() => {
        const available = visibleAlbumFilters([
            ...normalCollectionSummaries.values(),
        ]);
        if (!available.some(({ value }) => value == albumFilter)) {
            setAlbumFilter("ente");
            if (overviewFilter)
                dispatch({ type: "showAlbumOverview", albumFilter: "ente" });
        }
    }, [normalCollectionSummaries, albumFilter, overviewFilter]);

    const router = useRouter();

    useEffect(() => {
        if (
            (!isAlbumOverview && typeof activeCollectionID == "undefined") ||
            !router.isReady
        ) {
            return;
        }
        let collectionURL = "";
        if (!isAlbumOverview && activeCollectionID !== PseudoCollectionID.all) {
            // TODO: Is this URL param even used?
            collectionURL = `?collection=${activeCollectionID}`;
        }
        const href = `/gallery${collectionURL}`;
        void router.push(href, undefined, { shallow: true });
    }, [activeCollectionID, isAlbumOverview, router.isReady]);

    useEffect(() => {
        if (!activeCollectionSummary) closeCollectionMap();
    }, [activeCollectionSummary, closeCollectionMap]);

    useEffect(() => {
        if (isInSearchMode && state.searchSuggestion) {
            setFileListHeader({
                component: (
                    <SearchResultsHeader
                        searchSuggestion={state.searchSuggestion}
                        fileCount={state.searchResults?.length ?? 0}
                        sortAsc={state.searchSortAsc}
                        onSortOrderChange={(asc) =>
                            dispatch({ type: "setSearchSortOrder", asc })
                        }
                    />
                ),
                height: 104,
            });
        }
    }, [
        isInSearchMode,
        state.searchSuggestion,
        state.searchResults,
        state.searchSortAsc,
    ]);

    useEffect(() => {
        const pendingSearchSuggestion = state.pendingSearchSuggestions.at(-1);
        if (!state.isRecomputingSearchResults && pendingSearchSuggestion) {
            dispatch({ type: "updatingSearchResults" });
            // TODO: A rejection leaves isRecomputingSearchResults stuck true,
            // and search stops until it is exited. Recovery needs a reducer
            // change.
            void filterSearchableFiles(pendingSearchSuggestion).then(
                (searchResults) => {
                    dispatch({ type: "setSearchResults", searchResults });
                },
            );
        }
    }, [state.isRecomputingSearchResults, state.pendingSearchSuggestions]);

    const selectAll = (e: KeyboardEvent) => {
        if (
            e.target instanceof HTMLInputElement ||
            e.target instanceof HTMLTextAreaElement
        ) {
            return;
        }

        e.preventDefault();

        if (
            !user ||
            !filteredFiles.length ||
            uploadTypeSelectorView ||
            openCollectionSelector ||
            fixCreationTimeVisibilityProps.open ||
            authenticateUserDialogProps.open ||
            albumNameInputVisibilityProps.open ||
            editAlbumDetailsVisibilityProps.open ||
            isFileViewerOpen ||
            slideshow
        ) {
            return;
        }

        const selected: SelectedState = {
            ownCount: 0,
            count: 0,
            collectionID: activeCollectionID,
            context:
                barMode == "people" && activePersonID
                    ? { mode: "people", personID: activePersonID }
                    : {
                          mode: barMode as
                              "albums" | "hidden-albums" | "archive-albums",
                          collectionID: activeCollectionID!,
                      },
        };

        filteredFiles.forEach((item) => {
            if (item.ownerID === user.id) {
                selected.ownCount++;
            }
            selected.count++;
            selected[item.id] = true;
        });
        setSelected(selected);
    };

    const handleSelectAll = () => {
        if (!user || !filteredFiles.length) return;

        const selected: SelectedState = {
            ownCount: 0,
            count: 0,
            collectionID: activeCollectionID,
            context:
                barMode == "people" && activePersonID
                    ? { mode: "people", personID: activePersonID }
                    : {
                          mode: barMode as
                              "albums" | "hidden-albums" | "archive-albums",
                          collectionID: activeCollectionID!,
                      },
        };

        filteredFiles.forEach((item) => {
            if (item.ownerID === user.id) {
                selected.ownCount++;
            }
            selected.count++;
            selected[item.id] = true;
        });
        setSelected(selected);
    };

    const keyboardShortcutHandlerRef = useRef({
        selectAll,
        clearSelection,
        isCleanupViewOpen,
    });

    useEffect(() => {
        keyboardShortcutHandlerRef.current = {
            selectAll,
            clearSelection,
            isCleanupViewOpen,
        };
    }, [selectAll, clearSelection, isCleanupViewOpen]);

    const handleVisualFeedback = useCallback(() => {
        showLoadingBar();
        setTimeout(hideLoadingBar, 0);
    }, [showLoadingBar, hideLoadingBar]);

    const handlePendingNavigationConsumed = useCallback(() => {
        setPendingFileNavigation(undefined);
    }, []);

    const setupSelectAllKeyBoardShortcutHandler = () => {
        const handleKeyUp = (e: KeyboardEvent) => {
            if (keyboardShortcutHandlerRef.current.isCleanupViewOpen) return;
            switch (e.key) {
                case "Escape":
                    keyboardShortcutHandlerRef.current.clearSelection();
                    break;
                case "a":
                    if (e.ctrlKey || e.metaKey) {
                        keyboardShortcutHandlerRef.current.selectAll(e);
                    }
                    break;
            }
        };
        document.addEventListener("keydown", handleKeyUp);
        return () => {
            document.removeEventListener("keydown", handleKeyUp);
        };
    };

    useEffect(() => {
        return user ? setupSelectAllKeyBoardShortcutHandler() : undefined;
    }, [!!user]);

    const {
        openCollectionSelector,
        showAlbumNameInput,
        albumNameInputVisibilityProps,
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

    const openUploader = (intent?: UploadTypeSelectorIntent) => {
        if (uploadManager.isUploadInProgress()) return;
        setUploadTypeSelectorView(true);
        setUploadTypeSelectorIntent(intent ?? "upload");
    };

    const handleShowCollectionSummaryWithID = useCallback(
        (collectionSummaryID: number | undefined) => {
            setAlbumOpenedFromOverview(undefined);
            setIsMapView(false);
            setCleanupView(undefined);
            // Museum deletes collection contents asynchronously; pull on entry.
            if (collectionSummaryID == PseudoCollectionID.trash) {
                void remoteFilesPull();
            }

            dispatch({ type: "showCollectionSummary", collectionSummaryID });
        },
        [],
    );

    useEffect(() => {
        if (mlStatus?.phase == "disabled" && barMode == "people") {
            handleShowCollectionSummaryWithID(PseudoCollectionID.all);
        }
    }, [mlStatus?.phase, barMode, handleShowCollectionSummaryWithID]);

    const showCollectionSummary = useCallback(
        (
            collectionSummaryID: number | undefined,
            isHiddenCollectionSummary?: boolean,
        ) =>
            showCollectionSummaryWithAuthentication(
                collectionSummaryID,
                !!isHiddenCollectionSummary && barMode != "hidden-albums",
                lastAuthenticationForHiddenTimestamp,
                authenticateUser,
                handleShowCollectionSummaryWithID,
            ),
        [authenticateUser, handleShowCollectionSummaryWithID, barMode],
    );

    const handleSelectSearchOption = useCallback(
        (
            searchOption: SearchOption | undefined,
            options?: { shouldExitSearchMode?: boolean },
        ) => {
            setIsMapView(false);
            if (searchOption) {
                const type = searchOption.suggestion.type;
                if (type == "sidebarAction") {
                    const collectionID = albumShortcutCollectionID(
                        searchOption.suggestion.actionID,
                        state.uncategorizedCollectionSummaryID,
                    );
                    if (collectionID !== undefined) {
                        void showCollectionSummary(
                            collectionID,
                            collectionID == PseudoCollectionID.hiddenItems,
                        );
                        return;
                    }
                }
                setCleanupView(undefined);
                if (type == "collection") {
                    dispatch({
                        type: "showCollectionSummary",
                        collectionSummaryID:
                            searchOption.suggestion.collectionID,
                    });
                } else if (type == "person") {
                    dispatch({
                        type: "showPerson",
                        personID: searchOption.suggestion.person.id,
                    });
                } else if (type == "sidebarAction") {
                    navigationRef.current?.showSettings(
                        searchOption.suggestion.actionID,
                    );

                    const shouldExitSearchMode =
                        options?.shouldExitSearchMode ?? true;
                    dispatch({ type: "exitSearch", shouldExitSearchMode });
                } else {
                    if (barMode === "hidden-albums") {
                        dispatch({ type: "showAlbums" });
                    }
                    dispatch({
                        type: "enterSearchMode",
                        searchSuggestion: searchOption.suggestion,
                    });
                }
            } else {
                const shouldExitSearchMode =
                    options?.shouldExitSearchMode ?? true;
                dispatch({ type: "exitSearch", shouldExitSearchMode });
            }
        },
        [
            barMode,
            dispatch,
            showCollectionSummary,
            state.uncategorizedCollectionSummaryID,
        ],
    );

    const handleShowCleanupView = useCallback(
        (view: "large-files" | "duplicates") => {
            setIsMapView(false);
            setSelected({
                ownCount: 0,
                count: 0,
                collectionID: 0,
                context: undefined,
            });
            closeCollectionMap();
            closeSlideshow();
            dispatch({ type: "exitSearch", shouldExitSearchMode: true });
            setCleanupView(view);
        },
        [closeCollectionMap, closeSlideshow],
    );

    const handleShowPeople = useCallback(
        (onNavigate?: () => void) => {
            if (!isMLEnabled()) {
                pendingPeopleSearchReset.current = onNavigate;
                showPeopleConsent();
                return false;
            }
            onNavigate?.();
            setIsMapView(false);
            setCleanupView(undefined);
            dispatch({ type: "showPeople" });
            return true;
        },
        [dispatch, showPeopleConsent],
    );

    const handleBackToPeople = useCallback(() => {
        setCleanupView(undefined);
        setSelected({
            ownCount: 0,
            count: 0,
            collectionID: 0,
            context: undefined,
        });
        dispatch({ type: "showPeople" });
    }, []);

    const handleShowAlbumOverview = useCallback(
        (filter: AlbumFilter) => {
            setCleanupView(undefined);
            clearSelection();
            setAlbumFilter(filter);
            dispatch({ type: "showAlbumOverview", albumFilter: filter });
        },
        [clearSelection, dispatch],
    );

    const handleBackToAlbums = useCallback(() => {
        setCleanupView(undefined);
        const origin =
            albumOpenedFromOverview?.collectionID === collectionSummary?.id
                ? albumOpenedFromOverview
                : undefined;
        const filter = origin?.filter ?? "ente";
        setAlbumSearchQuery(origin?.searchQuery ?? "");
        setSelected({
            ownCount: 0,
            count: 0,
            collectionID: 0,
            context: undefined,
        });
        setAlbumFilter(filter);
        dispatch({ type: "showAlbumOverview", albumFilter: filter });
    }, [albumOpenedFromOverview, collectionSummary?.id]);

    const handleChangeBarMode = useCallback(
        (mode: GalleryBarMode) => {
            if (mode == "links") {
                setCleanupView(undefined);
                clearSelection();
                dispatch({ type: "showLinks" });
                return true;
            }
            if (mode == "people") {
                return handleShowPeople();
            }
            setCleanupView(undefined);
            handleShowAlbumOverview("ente");
            return true;
        },
        [clearSelection, dispatch, handleShowAlbumOverview, handleShowPeople],
    );

    const handleSelectCollection = useCallback(
        (collectionID: number) => {
            setIsMapView(false);
            closeCollectionMap();
            dispatch({
                type: "showCollectionSummary",
                collectionSummaryID: collectionID,
            });
        },
        [closeCollectionMap],
    );

    const handleSelectPerson = useCallback(
        (personID: string) => {
            setCleanupView(undefined);
            setIsMapView(false);
            closeCollectionMap();
            dispatch({ type: "showPerson", personID });
        },
        [closeCollectionMap],
    );

    const handleEditAlbumDetails = useCallback(
        async ({ name, description, coverID }: AlbumDetails) => {
            if (!activeCollection) return;

            let didAttemptWrite = false;
            try {
                if (activeCollection.name != name) {
                    didAttemptWrite = true;
                    await renameCollection(activeCollection, name);
                }
                const descriptionChanged =
                    (
                        activeCollection.pubMagicMetadata?.data.caption ?? ""
                    ).trim() != description;
                if (descriptionChanged || coverID !== undefined) {
                    didAttemptWrite = true;
                    await updateCollectionDetails(activeCollection, {
                        description: descriptionChanged
                            ? description
                            : undefined,
                        coverID,
                    });
                }
            } finally {
                if (didAttemptWrite) {
                    await remotePull({
                        silent: true,
                        source: "update-album-details",
                    });
                }
            }
        },
        [activeCollection, remotePull],
    );

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

    const showAppDownloadFooter =
        state.collectionFiles.length < 30 && !isInSearchMode;

    const fileListFooter = useMemo(
        () => (showAppDownloadFooter ? createAppDownloadFooter() : undefined),
        [showAppDownloadFooter],
    );

    const hasActiveFileSelection =
        selected.count > 0 && selected.collectionID === activeCollectionID;
    const showSelectionBar =
        hasActiveFileSelection &&
        !suppressContextSelectionBar &&
        !(isContextMenuOpen && selected.count === 1);

    const selectGalleryCollection = useCallback(
        (collectionID: number) => {
            if (barMode == "links") {
                dispatch({ type: "selectLink", collectionID });
            } else {
                handleShowCollectionSummaryWithID(collectionID);
            }
        },
        [barMode, dispatch, handleShowCollectionSummaryWithID],
    );
    const handleGoHome = useCallback(() => {
        setIsMapView(false);
        handleShowCollectionSummaryWithID(PseudoCollectionID.all);
    }, [handleShowCollectionSummaryWithID]);
    const handleChangeMode = useCallback(
        (mode: GalleryBarMode) => {
            const changed = handleChangeBarMode(mode);
            if (changed) setIsMapView(false);
            return changed;
        },
        [handleChangeBarMode],
    );
    const handleShowLibraryMap = useCallback(() => {
        setSelectedPlace(undefined);
        handleShowCollectionSummaryWithID(PseudoCollectionID.all);
        handleShowCollectionMap();
    }, [handleShowCollectionSummaryWithID, handleShowCollectionMap]);
    const handleSelectPlace = useCallback(
        (place: PlaceSelection | undefined) => {
            setSelectedPlace(place);
            setPlaceSelectionRevision((revision) => revision + 1);
        },
        [],
    );
    const handleOpenOverviewAlbum = useCallback(
        (collectionID: number) => {
            handleShowCollectionSummaryWithID(collectionID);
            setAlbumOpenedFromOverview({
                collectionID,
                filter: overviewFilter!,
                searchQuery: albumSearchQuery,
            });
        },
        [handleShowCollectionSummaryWithID, overviewFilter, albumSearchQuery],
    );
    const handleShowLinksOverview = useCallback(
        () => handleChangeBarMode("links"),
        [handleChangeBarMode],
    );
    const handleDownloadStatusNotificationsShowCollectionSummary = useCallback(
        (
            collectionSummaryID: number | undefined,
            isHiddenCollectionSummary: boolean | undefined,
        ) => {
            void showCollectionSummary(
                collectionSummaryID,
                isHiddenCollectionSummary,
            );
        },
        [showCollectionSummary],
    );

    const navigationActions = useMemo<PhotosNavigationActions>(
        () => ({
            goHome: handleGoHome,
            changeMode: handleChangeMode,
            showLibraryMap: handleShowLibraryMap,
            showCollectionMap: handleShowCollectionMap,
            selectPlace: handleSelectPlace,
            showCollectionSummary,
            selectCollection: selectGalleryCollection,
            selectCollectionFromViewer: handleSelectCollection,
            openOverviewAlbum: handleOpenOverviewAlbum,
            showAlbumOverview: handleShowAlbumOverview,
            backToAlbums: handleBackToAlbums,
            showLinksOverview: handleShowLinksOverview,
            showPeople: handleShowPeople,
            selectPerson: handleSelectPerson,
            backToPeople: handleBackToPeople,
            selectSearchOption: handleSelectSearchOption,
            showCleanupView: handleShowCleanupView,
        }),
        [
            handleGoHome,
            handleChangeMode,
            handleShowLibraryMap,
            handleShowCollectionMap,
            handleSelectPlace,
            showCollectionSummary,
            selectGalleryCollection,
            handleSelectCollection,
            handleOpenOverviewAlbum,
            handleShowAlbumOverview,
            handleBackToAlbums,
            handleShowLinksOverview,
            handleShowPeople,
            handleSelectPerson,
            handleBackToPeople,
            handleSelectSearchOption,
            handleShowCleanupView,
        ],
    );

    if (!user) {
        // Children rely on user after the mount dispatch.
        return <div></div>;
    }

    const collectionMap = activeCollectionSummary && (
        <CollectionMap
            collectionSummary={activeCollectionSummary}
            files={activeCollection ? activeCollectionFiles : filteredFiles}
            selectedPlace={
                activeCollectionID === PseudoCollectionID.all
                    ? selectedPlace
                    : undefined
            }
            placeSelectionRevision={placeSelectionRevision}
            mapFileSource={mapFileSource}
            onRemotePull={remotePull}
            onAddSaveGroup={onAddSaveGroup}
            onMarkTempDeleted={handleMarkTempDeleted}
            onAddFileToCollection={handleAddSingleFileToCollection}
            onRemoteFilesPull={remoteFilesPull}
            onVisualFeedback={handleVisualFeedback}
            fileNormalCollectionIDs={fileNormalCollectionIDs}
            collectionNameByID={collectionNameByID}
            emailByUserID={state.emailByUserID}
        />
    );

    return (
        <PhotosNavigationContext.Provider value={navigationActions}>
            <FullScreenDropZone
                message={
                    watchFolderView
                        ? t("watch_folder_dropzone_hint")
                        : undefined
                }
                disabled={
                    shouldDisableDropzone || !!slideshow || isCleanupViewOpen
                }
                onDrop={setDragAndDropFiles}
            >
                {blockingLoad && <TranslucentLoadingOverlay />}
                {collectionOperationDialogs}
                {selectedFileOperationDialogs}
                <DownloadStatusNotifications
                    {...{ saveGroups, onRemoveSaveGroup }}
                    onShowCollectionSummary={
                        handleDownloadStatusNotificationsShowCollectionSummary
                    }
                />

                <PhotosNavigationShell
                    ref={navigationRef}
                    isFirstLoad={isFirstLoad}
                    isInSearchMode={isInSearchMode}
                    collectionNameByID={collectionNameByID}
                    onAuthenticateUser={authenticateUser}
                    mode={barMode}
                    isMapView={isMapView}
                    isMapSelected={
                        isMapView &&
                        activeCollectionID === PseudoCollectionID.all
                    }
                    onUpload={openUploader}
                    navigationAvailable={!isCleanupViewOpen}
                    activeCollectionID={galleryBarActiveCollectionID}
                    alternateHeader={
                        showSelectionBar ? (
                            <SelectedFileOptions
                                barMode={barMode}
                                isInSearchMode={isInSearchMode}
                                collection={
                                    isInSearchMode
                                        ? undefined
                                        : activeCollection
                                }
                                collectionSummary={
                                    isInSearchMode
                                        ? undefined
                                        : activeCollectionSummary
                                }
                                selectedFileCount={selected.count}
                                selectedOwnFileCount={selected.ownCount}
                                selectedFavoriteCount={selectedFavoriteCount}
                                onClearSelection={clearSelection}
                                onDelete={() => handleDeleteFiles()}
                                onRemoveFilesFromCollection={
                                    handleRemoveFilesFromCollection
                                }
                                onOpenCollectionSelector={
                                    handleOpenCollectionSelector
                                }
                                onSelectAll={handleSelectAll}
                                isAllSelected={isAllSelectedInView}
                                {...{
                                    createOnCreateForCollectionOp,
                                    createOnSelectForCollectionOp,
                                    createFileOpHandler,
                                    onShowAssignPersonDialog:
                                        showAddPersonAction
                                            ? showContextMenuAssignPerson
                                            : undefined,
                                }}
                                onEditLocation={showEditLocation}
                            />
                        ) : null
                    }
                >
                    {(presentation) =>
                        !isInSearchMode &&
                        !isCleanupViewOpen &&
                        !isMapView &&
                        barMode == "links" ? (
                            <LinksView
                                presentation={presentation}
                                onSearchQueryChange={setAlbumSearchQuery}
                                onChangeSortBy={onChangeCollectionsSortBy}
                                user={user}
                                collections={state.collections}
                                collectionFiles={state.collectionFiles}
                                collectionSummaries={normalCollectionSummaries}
                                hiddenCollectionIDs={hiddenCollectionIDs}
                                hiddenFileIDs={hiddenFileIDs}
                                tempDeletedFileIDs={tempDeletedFileIDs}
                                tempHiddenFileIDs={tempHiddenFileIDs}
                                uncategorizedCollectionSummaryID={
                                    state.uncategorizedCollectionSummaryID
                                }
                                selectedLinkID={selectedLinkID}
                                searchQuery={albumSearchQuery}
                                sortBy={collectionsSortBy}
                                onCreateAlbum={showAlbumNameInput}
                                setBlockingLoad={setBlockingLoad}
                                onRemotePull={remotePull}
                            />
                        ) : (
                            <LegacyGallerySection
                                mode={barMode}
                                presentation={presentation}
                                fullBleed={isMapView}
                                navigation={
                                    isCleanupViewOpen || isInSearchMode
                                        ? undefined
                                        : {
                                              selectedPlace,
                                              placesFiles:
                                                  isMapView &&
                                                  activeCollectionID ===
                                                      PseudoCollectionID.all
                                                      ? filteredFiles
                                                      : undefined,
                                              activeCollectionID:
                                                  galleryBarActiveCollectionID,
                                              onRemotePull: remotePull,
                                              activePerson,
                                              albumFilter,
                                              albumExpansion,
                                              albumSearchQuery,
                                              onAlbumSearchQueryChange:
                                                  setAlbumSearchQuery,
                                              collectionSummaries:
                                                  sidebarCollectionSummaries,
                                              visibleAlbumFilters:
                                                  sidebarAlbumFilters,
                                              uncategorizedCollectionSummaryID:
                                                  state.uncategorizedCollectionSummaryID,
                                              collectionsSortBy,
                                              onChangeCollectionsSortBy,
                                              peopleSortBy,
                                              onChangePeopleSortBy:
                                                  setPeopleSortBy,
                                              people: sortedPeople,
                                          }
                                }
                            >
                                {!isMapView && !isCleanupViewOpen && (
                                    <>
                                        <GalleryBarAndListHeader
                                            albums={sidebarCollectionSummaries}
                                            {...{
                                                user,
                                                activeCollection,
                                                activePerson,
                                                collectionSummary,
                                                people,
                                                setBlockingLoad,
                                                setFileListHeader,
                                                hasActiveFileSelection,
                                                isActiveCollectionDownloadInProgress,
                                                onAddSaveGroup,
                                            }}
                                            showBackToAlbums={
                                                albumOpenedFromOverview !==
                                                    undefined &&
                                                albumOpenedFromOverview.collectionID ===
                                                    collectionSummary?.id
                                            }
                                            mode={barMode}
                                            shouldHide={isInSearchMode}
                                            onEditAlbumDetails={
                                                showEditAlbumDetails
                                            }
                                            onCollectionSlideshow={
                                                startSlideshow
                                            }
                                            emailByUserID={state.emailByUserID}
                                            shareSuggestionEmails={
                                                state.shareSuggestionEmails
                                            }
                                            onRemotePull={remotePull}
                                        />
                                    </>
                                )}
                                {isMapView ? (
                                    collectionMap
                                ) : cleanupView === "duplicates" ? (
                                    <DuplicatesView
                                        onRemoteFilesPull={remoteFilesPull}
                                    />
                                ) : cleanupView === "large-files" ? (
                                    <LargeFilesView
                                        onRemoteFilesPull={remoteFilesPull}
                                    />
                                ) : !isInSearchMode &&
                                  barMode == "links" ? null : !isInSearchMode &&
                                  !isFirstLoad &&
                                  !state.collectionFiles.length &&
                                  activeCollectionID ===
                                      PseudoCollectionID.all ? (
                                    <GalleryEmptyState
                                        isUploadInProgress={uploadManager.isUploadInProgress()}
                                        onUpload={openUploader}
                                    />
                                ) : !isInSearchMode &&
                                  !isFirstLoad &&
                                  isAlbumOverview ? (
                                    <AlbumsOverview
                                        onRemotePull={remotePull}
                                        albums={overviewAlbums}
                                        title={(
                                            albumFilters.find(
                                                ({ value }) =>
                                                    value == overviewFilter,
                                            ) ?? albumFilters[0]!
                                        ).title()}
                                        filter={overviewFilter!}
                                        searchQuery={albumSearchQuery}
                                        sortBy={collectionsSortBy}
                                        onCreateAlbum={showAlbumNameInput}
                                    />
                                ) : !isInSearchMode &&
                                  !isFirstLoad &&
                                  state.view?.type == "people" &&
                                  !state.view.activePerson ? (
                                    <PeopleOverview
                                        people={state.view.visiblePeople}
                                        allPeople={state.view.people}
                                        peopleSortBy={peopleSortBy}
                                    />
                                ) : (
                                    <FileListWithViewer
                                        mode={barMode}
                                        modePlus={
                                            isInSearchMode ? "search" : barMode
                                        }
                                        header={fileListHeader}
                                        footer={fileListFooter}
                                        user={user}
                                        files={filteredFiles}
                                        enableDownload={true}
                                        disableGrouping={
                                            state.searchSuggestion?.type ==
                                                "clip" ||
                                            (!isInSearchMode &&
                                                activeCollection
                                                    ?.pubMagicMetadata?.data
                                                    .sortBy === "fileName")
                                        }
                                        enableSelect={true}
                                        selected={selected}
                                        setSelected={setSelected}
                                        // TODO: Incorrect assertion, need to update the type
                                        activeCollectionID={activeCollectionID!}
                                        activeCollectionSummary={
                                            activeCollectionSummary
                                        }
                                        activePersonID={activePerson?.id}
                                        isInIncomingSharedCollection={activeCollectionSummary?.attributes.has(
                                            "sharedIncoming",
                                        )}
                                        isInHiddenSection={
                                            barMode == "hidden-albums"
                                        }
                                        onContextMenuAction={
                                            handleContextMenuAction
                                        }
                                        onContextMenuOpenChange={
                                            setIsContextMenuOpen
                                        }
                                        suppressSelectionUI={
                                            suppressContextSelectionBar
                                        }
                                        showAddPersonAction={
                                            showAddPersonAction
                                        }
                                        showEditLocationAction={
                                            selected.ownCount > 0
                                        }
                                        {...{
                                            favoriteFileIDs,
                                            collectionNameByID,
                                            fileNormalCollectionIDs,
                                            fileCollectionIDs,
                                            hiddenCollectionIDs,
                                            pendingFavoriteUpdates,
                                            pendingVisibilityUpdates,
                                            onAddSaveGroup,
                                        }}
                                        collectionSummaries={
                                            normalCollectionSummaries
                                        }
                                        emailByUserID={state.emailByUserID}
                                        onToggleFavorite={
                                            handleFileViewerToggleFavorite
                                        }
                                        onFileVisibilityUpdate={
                                            handleFileViewerFileVisibilityUpdate
                                        }
                                        onSendLink={handleFileViewerSendLink}
                                        onMarkTempDeleted={
                                            handleMarkTempDeleted
                                        }
                                        onSetOpenFileViewer={
                                            setIsFileViewerOpen
                                        }
                                        onRemotePull={remotePull}
                                        onRemoteFilesPull={remoteFilesPull}
                                        onVisualFeedback={handleVisualFeedback}
                                        onAddFileToCollection={
                                            handleAddSingleFileToCollection
                                        }
                                        pendingFileIndex={
                                            pendingFileNavigation?.fileIndex
                                        }
                                        pendingFileSidebar={
                                            pendingFileNavigation?.sidebar
                                        }
                                        pendingHighlightCommentID={
                                            pendingFileNavigation?.commentID
                                        }
                                        onPendingNavigationConsumed={
                                            handlePendingNavigationConsumed
                                        }
                                    />
                                )}
                            </LegacyGallerySection>
                        )
                    }
                </PhotosNavigationShell>
                <Upload
                    {...{
                        user,
                        dragAndDropFiles,
                        uploadTypeSelectorIntent,
                        uploadTypeSelectorView,
                    }}
                    isFirstUpload={haveOnlySystemCollections(
                        normalCollectionSummaries,
                    )}
                    activeCollection={activeCollection}
                    closeUploadTypeSelector={setUploadTypeSelectorView.bind(
                        null,
                        false,
                    )}
                    setLoading={setBlockingLoad}
                    setShouldDisableDropzone={setShouldDisableDropzone}
                    onRemotePull={remotePull}
                    onRemoteFilesPull={remoteFilesPull}
                    onOpenCollectionSelector={handleOpenCollectionSelector}
                    onCloseCollectionSelector={handleCloseCollectionSelector}
                    onUploadFile={(file) =>
                        dispatch({ type: "uploadFile", file })
                    }
                    onShowSubscription={() =>
                        navigationRef.current?.showSettings("subscription")
                    }
                    onShowSessionExpiredDialog={showSessionExpiredDialog}
                    isInHiddenSection={barMode == "hidden-albums"}
                />
                <DesktopWhatsNew />
                <PeopleConsentDialog
                    {...peopleConsentVisibilityProps}
                    onClose={() => {
                        pendingPeopleSearchReset.current = undefined;
                        peopleConsentVisibilityProps.onClose();
                    }}
                    onEnabled={() =>
                        handleShowPeople(pendingPeopleSearchReset.current)
                    }
                />

                {slideshow &&
                    slideshow.collectionID === activeCollection?.id &&
                    !isInSearchMode && (
                        <AlbumSlideshow
                            files={slideshow.files}
                            title={slideshow.title}
                            onClose={closeSlideshow}
                        />
                    )}
                {activeCollection && editAlbumDetailsVisibilityProps.open && (
                    <EditAlbumDetailsDialog
                        key={activeCollection.id}
                        {...editAlbumDetailsVisibilityProps}
                        collection={activeCollection}
                        files={activeCollectionFiles}
                        initialCoverFile={activeCollectionSummary?.coverFile}
                        onSubmit={handleEditAlbumDetails}
                    />
                )}
                <AuthenticateUser {...authenticateUserDialogProps} />
            </FullScreenDropZone>

            <QuickLinkCreatedNotification
                open={publicLinkToast.open}
                onCopy={() => {
                    if (publicLinkToast.url) {
                        void navigator.clipboard.writeText(publicLinkToast.url);
                    }
                }}
                onClose={() =>
                    setPublicLinkToast((prev) => ({ ...prev, open: false }))
                }
            />
        </PhotosNavigationContext.Provider>
    );
};

export default Page;

const createAppDownloadFooter = (): FileListHeaderOrFooter => ({
    component: (
        <Typography
            variant="small"
            sx={{
                alignSelf: "flex-end",
                marginInline: "auto",
                marginBlock: 0.75,
                textAlign: "center",
                color: "text.faint",
            }}
        >
            <Trans
                i18nKey="install_mobile_app"
                components={{
                    a: externalLink(
                        "https://play.google.com/store/apps/details?id=io.ente.photos",
                    ),
                    b: externalLink(
                        "https://apps.apple.com/in/app/ente-photos/id1542026904",
                    ),
                }}
            />
        </Typography>
    ),
    height: 90,
});
