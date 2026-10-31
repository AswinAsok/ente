import {
    filteredQuickLinkSummaries,
    visibleQuickLinks,
} from "@/utils/quick-links";
import type { LocalUser } from "ente-accounts/services/user";
import type { Collection } from "ente-media/collection";
import type { EnteFile } from "ente-media/file";
import type {
    CollectionSummary,
    CollectionsSortBy,
} from "ente-new/photos/services/collection-summary";
import { t } from "i18next";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { RemotePullOpts } from ".";
import { AlbumsOverview } from "./AlbumsOverview";
import { LinksNavigation } from "./LinksNavigation";
import { PublicLinkDetails } from "./PublicLinkDetails";
import { useSectionNavigation } from "./section-navigation-context";

interface LinksViewProps {
    user: LocalUser;
    collections: Collection[];
    collectionFiles: EnteFile[];
    collectionSummaries: ReadonlyMap<number, CollectionSummary>;
    hiddenCollectionIDs: ReadonlySet<number>;
    hiddenFileIDs: ReadonlySet<number>;
    tempDeletedFileIDs: ReadonlySet<number>;
    tempHiddenFileIDs: ReadonlySet<number>;
    uncategorizedCollectionSummaryID: number;
    selectedLinkID: number | undefined;
    showContent: boolean;
    sortBy: CollectionsSortBy;
    onChangeSortBy: (by: CollectionsSortBy) => void;
    onCreateAlbum: () => void;
    setBlockingLoad: (value: boolean) => void;
    onRemotePull: (opts?: RemotePullOpts) => Promise<void>;
}

export const LinksView = ({
    user,
    collections,
    collectionFiles,
    collectionSummaries,
    hiddenCollectionIDs,
    hiddenFileIDs,
    tempDeletedFileIDs,
    tempHiddenFileIDs,
    uncategorizedCollectionSummaryID,
    selectedLinkID,
    showContent,
    sortBy,
    onChangeSortBy,
    onCreateAlbum,
    setBlockingLoad,
    onRemotePull,
}: LinksViewProps) => {
    const [searchQuery, setSearchQuery] = useState("");
    const navigationSlot = useSectionNavigation();
    const links = useMemo(
        () => visibleQuickLinks(collections, user.id, hiddenCollectionIDs),
        [collections, user.id, hiddenCollectionIDs],
    );
    const selectedLink = links.find(({ id }) => id === selectedLinkID);
    const selectedLinkSummary =
        selectedLink && collectionSummaries.get(selectedLink.id);
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
    const overviewLinks = useMemo(
        () =>
            filteredQuickLinkSummaries({
                links,
                collectionSummaries,
                uncategorizedCollectionSummaryID,
                searchQuery,
                sortBy,
            }),
        [
            links,
            collectionSummaries,
            searchQuery,
            sortBy,
            uncategorizedCollectionSummaryID,
        ],
    );

    const content = selectedLink ? (
        <PublicLinkDetails
            key={selectedLink.id}
            collection={selectedLink}
            fileCount={
                selectedLinkSummary?.fileCount ?? selectedLinkFiles.length
            }
            files={selectedLinkFiles}
            coverFile={selectedLinkSummary?.coverFile}
            user={user}
            setBlockingLoad={setBlockingLoad}
            onRemotePull={onRemotePull}
        />
    ) : (
        <AlbumsOverview
            albums={overviewLinks}
            title={t("links")}
            filter="links"
            searchQuery={searchQuery}
            sortBy={sortBy}
            onCreateAlbum={onCreateAlbum}
            onRemotePull={onRemotePull}
        />
    );
    return (
        <>
            {navigationSlot.container &&
                createPortal(
                    <LinksNavigation
                        {...navigationSlot.presentation}
                        collectionSummaries={overviewLinks}
                        selectedLinkID={selectedLinkID}
                        searchQuery={searchQuery}
                        onSearchQueryChange={setSearchQuery}
                        collectionsSortBy={sortBy}
                        onChangeCollectionsSortBy={onChangeSortBy}
                    />,
                    navigationSlot.container,
                )}
            {showContent && content}
        </>
    );
};
