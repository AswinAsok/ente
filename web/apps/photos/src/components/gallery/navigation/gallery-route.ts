import { PseudoCollectionID } from "ente-new/photos/services/collection-summary";
import type { GalleryState } from "../reducer";
import { homeDestination, type GalleryDestination } from "./navigation-state";

export const galleryHref = (destination: GalleryDestination) => {
    const query = new URLSearchParams();
    if (destination.section !== "albums")
        query.set("section", destination.section);
    if (
        destination.collectionID !== undefined &&
        destination.collectionID !== PseudoCollectionID.all
    )
        query.set("collection", String(destination.collectionID));
    if (destination.albumFilter)
        query.set("albumFilter", destination.albumFilter);
    if (destination.personID) query.set("person", destination.personID);
    if (destination.collectionMap) query.set("map", "1");
    return `/gallery${query.size ? `?${query}` : ""}`;
};

export const galleryDestinationFromHref = (
    href: string,
    library: GalleryState,
): GalleryDestination => {
    const query = new URL(href, "http://localhost").searchParams;
    const section = query.get("section") ?? "albums";
    if (
        section !== "albums" &&
        section !== "feed" &&
        section !== "people" &&
        section !== "links" &&
        section !== "places"
    )
        return homeDestination;
    const rawID = query.get("collection");
    const id = rawID !== null && /^-?\d+$/.test(rawID) ? Number(rawID) : NaN;
    const collectionID = Number.isSafeInteger(id) ? id : undefined;
    if (section === "feed") return { section };
    if (section === "people")
        return { section, personID: query.get("person") ?? undefined };
    if (section === "links") return { section, collectionID };
    if (section === "places") return { ...homeDestination, section };
    const filter = query.get("albumFilter");
    if (
        filter === "ente" ||
        filter === "shared" ||
        filter === "received" ||
        filter === "empty-albums"
    )
        return { section, albumFilter: filter };
    const selectedID = collectionID ?? PseudoCollectionID.all;
    return {
        section,
        collectionID: selectedID,
        albumMode: library.hiddenCollectionSummaries.has(selectedID)
            ? "hidden-albums"
            : library.archivedCollectionSummaries.has(selectedID)
              ? "archive-albums"
              : "albums",
        ...(query.get("map") === "1" && { collectionMap: true }),
    };
};
