import { visibleQuickLinks } from "@/utils/quick-links";
import type { LocalUser } from "ente-accounts/services/user";
import type { Collection } from "ente-media/collection";
import type { EnteFile } from "ente-media/file";
import type {
    CollectionSummaries,
    CollectionsSortBy,
} from "ente-new/photos/services/collection-summary";
import { t } from "i18next";
import { useMemo, useReducer, useState } from "react";
import type { RemotePullOpts } from ".";
import { AlbumsOverview } from "./AlbumsOverview";
import {
    initialLinksSectionState,
    linksSectionReducer,
} from "./links-section-state";
import { LinksSidebar } from "./LinksSidebar";
import type { GalleryBarPresentationProps } from "./NavigationPrimitives";
import { PublicLinkDetails } from "./PublicLinkDetails";
import { useAlbumNavigationData } from "./use-album-navigation-data";

interface LinksSectionOptions {
    isLinksView: boolean;
    user: LocalUser | undefined;
    collections: Collection[];
    collectionSummaries: CollectionSummaries;
    collectionFiles: EnteFile[];
    hiddenCollectionIDs: ReadonlySet<number>;
    hiddenFileIDs: ReadonlySet<number>;
    tempDeletedFileIDs: ReadonlySet<number>;
    tempHiddenFileIDs: ReadonlySet<number>;
    uncategorizedCollectionSummaryID: number;
    collectionsSortBy: CollectionsSortBy;
    onChangeCollectionsSortBy: (by: CollectionsSortBy) => void;
    onSelectLink: () => void;
}

export const useLinksSection = ({
    isLinksView,
    user,
    collections,
    collectionSummaries,
    collectionFiles,
    hiddenCollectionIDs,
    hiddenFileIDs,
    tempDeletedFileIDs,
    tempHiddenFileIDs,
    uncategorizedCollectionSummaryID,
    collectionsSortBy,
    onChangeCollectionsSortBy,
    onSelectLink,
}: LinksSectionOptions) => {
    const [state, dispatch] = useReducer(
        linksSectionReducer,
        initialLinksSectionState,
    );
    const [previousIsLinksView, setPreviousIsLinksView] = useState(isLinksView);
    if (previousIsLinksView !== isLinksView) {
        setPreviousIsLinksView(isLinksView);
        dispatch({ type: "reset" });
    }
    const quickLinks = useMemo(
        () =>
            visibleQuickLinks(collections, user?.id ?? 0, hiddenCollectionIDs),
        [collections, user?.id, hiddenCollectionIDs],
    );
    const linkSummaries = useMemo(
        () =>
            new Map(
                quickLinks.flatMap((collection) => {
                    const summary = collectionSummaries.get(collection.id);
                    return summary ? [[collection.id, summary] as const] : [];
                }),
            ),
        [quickLinks, collectionSummaries],
    );
    const selectedLinkID = isLinksView ? state.selectedLinkID : undefined;
    const selectedLink = quickLinks.find(({ id }) => id === selectedLinkID);
    if (selectedLinkID !== undefined && !selectedLink)
        dispatch({ type: "reconcile", links: quickLinks });
    const selectedLinkSummary =
        selectedLink && linkSummaries.get(selectedLink.id);
    const selectedLinkFiles = useMemo(
        () =>
            selectedLinkID === undefined
                ? []
                : collectionFiles.filter(
                      ({ id, collectionID }) =>
                          collectionID === selectedLinkID &&
                          !hiddenFileIDs.has(id) &&
                          !tempDeletedFileIDs.has(id) &&
                          !tempHiddenFileIDs.has(id),
                  ),
        [
            selectedLinkID,
            collectionFiles,
            hiddenFileIDs,
            tempDeletedFileIDs,
            tempHiddenFileIDs,
        ],
    );
    const { sidebarCollectionSummaries } = useAlbumNavigationData({
        mode: "links",
        collectionSummaries: linkSummaries,
        uncategorizedCollectionSummaryID,
        albumFilter: "ente",
        albumSearchQuery: state.searchQuery,
        collectionsSortBy,
    });
    const selectLink = (collectionID: number) => {
        dispatch({ type: "selectLink", collectionID });
        onSelectLink();
    };
    const showOverview = () => dispatch({ type: "showOverview" });

    return {
        selectedLinkID,
        collectionSummaries: linkSummaries,
        collectionSummary: selectedLinkSummary,
        showOverview,
        selectLink,
        renderSidebar: (
            presentation: GalleryBarPresentationProps,
            onShowOverview: () => void,
        ) => (
            <LinksSidebar
                {...presentation}
                collectionSummaries={sidebarCollectionSummaries}
                selectedLinkID={selectedLinkID}
                searchQuery={state.searchQuery}
                onSearchQueryChange={(query) =>
                    dispatch({ type: "search", query })
                }
                collectionsSortBy={collectionsSortBy}
                onChangeCollectionsSortBy={onChangeCollectionsSortBy}
                onSelectLink={selectLink}
                onShowOverview={onShowOverview}
            />
        ),
        renderContent: ({
            setBlockingLoad,
            onRemotePull,
            onCreateAlbum,
        }: {
            setBlockingLoad: (value: boolean) => void;
            onRemotePull: (opts?: RemotePullOpts) => Promise<void>;
            onCreateAlbum: () => void;
        }) =>
            user ? (
                selectedLink ? (
                    <PublicLinkDetails
                        key={selectedLink.id}
                        collection={selectedLink}
                        fileCount={
                            selectedLinkSummary?.fileCount ??
                            selectedLinkFiles.length
                        }
                        files={selectedLinkFiles}
                        user={user}
                        setBlockingLoad={setBlockingLoad}
                        onRemotePull={onRemotePull}
                        coverFile={selectedLinkSummary?.coverFile}
                    />
                ) : (
                    <AlbumsOverview
                        albums={sidebarCollectionSummaries}
                        title={t("links")}
                        filter="links"
                        searchQuery={state.searchQuery}
                        sortBy={collectionsSortBy}
                        onSelectAlbum={selectLink}
                        onCreateAlbum={onCreateAlbum}
                        onRemotePull={onRemotePull}
                    />
                )
            ) : null,
    };
};
