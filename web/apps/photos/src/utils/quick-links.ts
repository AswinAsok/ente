import { CollectionSubType, type Collection } from "ente-media/collection";
import {
    PseudoCollectionID,
    sortCollectionSummaries,
    type CollectionSummary,
    type CollectionsSortBy,
} from "ente-new/photos/services/collection-summary";

export const visibleQuickLinks = (
    collections: Collection[],
    userID: number,
    hiddenCollectionIDs: ReadonlySet<number>,
) =>
    collections
        .filter(
            (collection) =>
                collection.owner.id == userID &&
                collection.magicMetadata?.data.subType ==
                    CollectionSubType.quicklink &&
                !collection.sharees.length &&
                collection.publicURLs.length > 0 &&
                !hiddenCollectionIDs.has(collection.id),
        )
        .sort((a, b) => b.updationTime - a.updationTime || b.id - a.id);

export const filteredQuickLinkSummaries = ({
    links,
    collectionSummaries,
    uncategorizedCollectionSummaryID,
    searchQuery,
    sortBy,
}: {
    links: Collection[];
    collectionSummaries: ReadonlyMap<number, CollectionSummary>;
    uncategorizedCollectionSummaryID: number;
    searchQuery: string;
    sortBy: CollectionsSortBy;
}) => {
    const summaries = links.flatMap((link) => {
        const summary = collectionSummaries.get(link.id);
        return summary ? [summary] : [];
    });
    const query = searchQuery.trim().toLowerCase();
    return sortCollectionSummaries(summaries, sortBy)
        .sort((a, b) => b.sortPriority - a.sortPriority)
        .filter(
            (summary) =>
                summary.id !== uncategorizedCollectionSummaryID &&
                summary.id !== PseudoCollectionID.hiddenItems &&
                summary.id !== PseudoCollectionID.archiveItems &&
                summary.id !== PseudoCollectionID.trash &&
                !summary.attributes.has("hideFromCollectionBar") &&
                summary.name.toLowerCase().includes(query),
        );
};
