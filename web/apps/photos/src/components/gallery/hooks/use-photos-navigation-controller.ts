import { visibleAlbumFilters, type AlbumFilter } from "@/utils/album-filters";
import { useModalVisibility } from "ente-base/components/utils/modal";
import { useBaseContext } from "ente-base/context";
import {
    useMLStatusSnapshot,
    useSettingsSnapshot,
} from "ente-new/photos/components/utils/use-snapshot";
import { PseudoCollectionID } from "ente-new/photos/services/collection-summary";
import { isMLEnabled } from "ente-new/photos/services/ml";
import type { SearchOption } from "ente-new/photos/services/search/types";
import { updateMapEnabled } from "ente-new/photos/services/settings";
import { useRouter } from "next/router";
import {
    useCallback,
    useEffect,
    useEffectEvent,
    useMemo,
    useRef,
    useState,
} from "react";
import type { PhotosNavigationActions } from "../PhotosNavigationContext";
import type { PhotosNavigationShellHandle } from "../PhotosNavigationShell";
import type { PlaceSelection } from "../PlacesList";
import {
    albumShortcutCollectionID,
    showCollectionSummaryWithAuthentication,
} from "../helpers";
import type { GalleryBarMode, useGalleryReducer } from "../reducer";
import { useGalleryAuthentication } from "./use-gallery-authentication";

type GalleryReducer = ReturnType<typeof useGalleryReducer>;

interface PhotosNavigationControllerOptions {
    state: Pick<
        GalleryReducer[0],
        | "view"
        | "normalCollectionSummaries"
        | "uncategorizedCollectionSummaryID"
    >;
    dispatch: GalleryReducer[1];
    selection: { clear: () => void; reset: () => void };
    remoteFilesPull: () => Promise<void>;
    closeSlideshow: () => void;
}

export const usePhotosNavigationController = ({
    state,
    dispatch,
    selection: { clear: clearSelection, reset: resetSelection },
    remoteFilesPull,
    closeSlideshow,
}: PhotosNavigationControllerOptions) => {
    const { onGenericError } = useBaseContext();
    const { mapEnabled } = useSettingsSnapshot();
    const mlStatus = useMLStatusSnapshot();
    const router = useRouter();
    const { normalCollectionSummaries } = state;
    const isAlbumOverview = state.view?.type == "album-overview";
    const barMode = isAlbumOverview ? "albums" : (state.view?.type ?? "albums");
    const overviewFilter =
        state.view?.type == "album-overview"
            ? state.view.albumFilter
            : undefined;
    const albumView =
        state.view?.type == "albums" ||
        state.view?.type == "hidden-albums" ||
        state.view?.type == "archive-albums"
            ? state.view
            : undefined;
    const activeCollectionID = albumView?.activeCollectionSummaryID;
    const activeCollectionSummary = albumView?.activeCollectionSummary;
    const collectionSummaryID =
        state.view?.type == "links"
            ? normalCollectionSummaries.get(state.view.selectedLinkID!)?.id
            : activeCollectionSummary?.id;

    const [cleanupView, setCleanupView] = useState<
        "large-files" | "duplicates"
    >();
    const isCleanupViewOpen = cleanupView !== undefined;
    const [albumFilter, setAlbumFilter] = useState<AlbumFilter>("ente");
    const [albumSearchQuery, setAlbumSearchQuery] = useState("");
    const [albumOpenedFromOverview, setAlbumOpenedFromOverview] = useState<{
        collectionID: number;
        filter: AlbumFilter;
        searchQuery: string;
    }>();
    const navigationRef = useRef<PhotosNavigationShellHandle>(null);

    const lastAuthenticationForHiddenTimestamp = useRef<number>(0);

    const { show: showPeopleConsent, props: peopleConsentVisibilityProps } =
        useModalVisibility();
    const pendingPeopleSearchReset = useRef<(() => void) | undefined>(
        undefined,
    );
    const { authenticateUser, authenticateUserDialogProps } =
        useGalleryAuthentication();
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
        [dispatch, remoteFilesPull],
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
        [
            authenticateUser,
            handleShowCollectionSummaryWithID,
            barMode,
            lastAuthenticationForHiddenTimestamp,
        ],
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
            resetSelection();
            closeCollectionMap();
            closeSlideshow();
            dispatch({ type: "exitSearch", shouldExitSearchMode: true });
            setCleanupView(view);
        },
        [closeCollectionMap, closeSlideshow, dispatch, resetSelection],
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
        resetSelection();
        dispatch({ type: "showPeople" });
    }, [dispatch, resetSelection]);

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
            albumOpenedFromOverview?.collectionID === collectionSummaryID
                ? albumOpenedFromOverview
                : undefined;
        const filter = origin?.filter ?? "ente";
        setAlbumSearchQuery(origin?.searchQuery ?? "");
        resetSelection();
        setAlbumFilter(filter);
        dispatch({ type: "showAlbumOverview", albumFilter: filter });
    }, [
        albumOpenedFromOverview,
        collectionSummaryID,
        dispatch,
        resetSelection,
    ]);

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
        [closeCollectionMap, dispatch],
    );

    const handleSelectPerson = useCallback(
        (personID: string) => {
            setCleanupView(undefined);
            setIsMapView(false);
            closeCollectionMap();
            dispatch({ type: "showPerson", personID });
        },
        [closeCollectionMap, dispatch],
    );

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

    useEffect(() => {
        setAlbumSearchQuery("");
    }, [barMode]);

    useEffect(() => {
        if (barMode == "albums" && activeCollectionID == PseudoCollectionID.all)
            setAlbumSearchQuery("");
    }, [barMode, activeCollectionID]);

    useEffect(() => {
        const available = visibleAlbumFilters([
            ...normalCollectionSummaries.values(),
        ]);
        if (!available.some(({ value }) => value == albumFilter)) {
            setAlbumFilter("ente");
            if (overviewFilter)
                dispatch({ type: "showAlbumOverview", albumFilter: "ente" });
        }
    }, [normalCollectionSummaries, albumFilter, overviewFilter, dispatch]);

    const updateCollectionURL = useEffectEvent((href: string) => {
        void router.push(href, undefined, { shallow: true });
    });

    useEffect(() => {
        if (
            (!isAlbumOverview && typeof activeCollectionID == "undefined") ||
            !router.isReady
        ) {
            return;
        }
        let collectionURL = "";
        if (!isAlbumOverview && activeCollectionID !== PseudoCollectionID.all) {
            collectionURL = `?collection=${activeCollectionID}`;
        }
        const href = `/gallery${collectionURL}`;
        updateCollectionURL(href);
    }, [activeCollectionID, isAlbumOverview, router.isReady]);

    useEffect(() => {
        if (!activeCollectionSummary) closeCollectionMap();
    }, [activeCollectionSummary, closeCollectionMap]);

    const { onClose: closePeopleConsent } = peopleConsentVisibilityProps;
    const handleClosePeopleConsent = useCallback(() => {
        pendingPeopleSearchReset.current = undefined;
        closePeopleConsent();
    }, [closePeopleConsent]);
    const handlePeopleConsentEnabled = useCallback(
        () => handleShowPeople(pendingPeopleSearchReset.current),
        [handleShowPeople],
    );
    const showSubscription = useCallback(
        () => navigationRef.current?.showSettings("subscription"),
        [],
    );
    const showDownloadedCollection = useCallback(
        (id: number | undefined, isHidden: boolean | undefined) => {
            void showCollectionSummary(id, isHidden);
        },
        [showCollectionSummary],
    );

    return {
        actions: navigationActions,
        albumFilter,
        albumSearchQuery,
        setAlbumSearchQuery,
        showBackToAlbums:
            albumOpenedFromOverview !== undefined &&
            albumOpenedFromOverview.collectionID === collectionSummaryID,
        cleanupView,
        isCleanupViewOpen,
        isMapView,
        selectedPlace,
        placeSelectionRevision,
        shellRef: navigationRef,
        showSubscription,
        showDownloadedCollection,
        authenticateUser,
        authenticateUserDialogProps,
        peopleConsentDialogProps: {
            ...peopleConsentVisibilityProps,
            onClose: handleClosePeopleConsent,
            onEnabled: handlePeopleConsentEnabled,
        },
    };
};
