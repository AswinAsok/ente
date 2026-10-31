import type { FileListHeaderOrFooter } from "@/components/FileList";
import { sortFiles } from "ente-media/collection-sort";
import { useEffect, useMemo, useRef, useState } from "react";
import { SearchResultsHeader } from ".";
import { albumFiles, albumView } from "./album-files";
import { GalleryMedia } from "./GalleryMedia";
import { GallerySectionLayout } from "./GallerySectionLayout";
import { useSearchResults } from "./hooks/use-search-results";
import { suppressSharedFilesSavedByUser } from "./media-files";
import type { GallerySectionProps } from "./section-types";

export const SearchSection = ({
    library,
    operations,
    navigation,
    preferences,
    presentation,
}: GallerySectionProps) => {
    const destination = navigation.destination;
    const mode =
        destination.section === "people" || destination.section === "links"
            ? destination.section
            : (destination.albumMode ?? "albums");
    const collectionView =
        destination.section === "albums" || destination.section === "places"
            ? albumView(library, destination)
            : undefined;
    const activeCollection =
        collectionView && collectionView.type !== "album-overview"
            ? collectionView.activeCollection
            : undefined;
    const activePersonID = destination.personID;
    const suggestion = navigation.overlay?.suggestion;
    const results = useSearchResults(suggestion, library.searchIndexRevision);
    const [initialFiles] = useState(() =>
        operations.mediaSource?.mode === mode
            ? operations.mediaSource.files
            : collectionView
              ? albumFiles(library, collectionView)
              : [],
    );
    const previousFiles = useRef(initialFiles);
    const { searchSortAsc, setSearchSortAsc } = preferences;
    const files = useMemo(() => {
        const visible = suppressSharedFilesSavedByUser(
            results ?? previousFiles.current,
            library.user?.id,
            activeCollection,
        );
        return searchSortAsc === undefined
            ? visible
            : sortFiles([...visible], searchSortAsc);
    }, [results, library.user?.id, activeCollection, searchSortAsc]);
    useEffect(() => {
        previousFiles.current = files;
    }, [files]);
    const [header, setHeader] = useState<FileListHeaderOrFooter>();
    useEffect(() => {
        if (suggestion)
            setHeader({
                component: (
                    <SearchResultsHeader
                        searchSuggestion={suggestion}
                        fileCount={results?.length ?? 0}
                        sortAsc={searchSortAsc}
                        onSortOrderChange={setSearchSortAsc}
                    />
                ),
                height: 104,
            });
    }, [suggestion, results, searchSortAsc, setSearchSortAsc]);
    return (
        <GallerySectionLayout presentation={presentation}>
            <GalleryMedia
                {...{ library, operations, navigation }}
                header={header}
                source={{
                    mode,
                    modePlus: "search",
                    files,
                    activeCollectionID:
                        collectionView &&
                        collectionView.type !== "album-overview"
                            ? collectionView.activeCollectionSummaryID
                            : undefined,
                    activeCollection,
                    activeCollectionSummary:
                        collectionView &&
                        collectionView.type !== "album-overview"
                            ? collectionView.activeCollectionSummary
                            : undefined,
                    activePersonID,
                    disableGrouping: suggestion?.type == "clip",
                }}
            />
        </GallerySectionLayout>
    );
};
