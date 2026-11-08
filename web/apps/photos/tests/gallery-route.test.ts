import { PseudoCollectionID } from "ente-new/photos/services/collection-summary";
import { expect, test } from "vitest";
import {
    galleryDestinationFromHref,
    galleryHref,
} from "../src/components/gallery/navigation/gallery-route";
import {
    homeDestination,
    initialNavigationState,
    navigationReducer,
    type GalleryDestination,
} from "../src/components/gallery/navigation/navigation-state";
import { initialGalleryState } from "../src/components/gallery/reducer";

test.each<GalleryDestination>([
    homeDestination,
    { ...homeDestination, collectionID: 123 },
    { section: "albums", albumFilter: "ente" },
    { section: "albums", albumFilter: "received" },
    { section: "feed" },
    { section: "people", personID: "person/with spaces" },
    { section: "links", collectionID: 123 },
    { ...homeDestination, section: "places" },
    { ...homeDestination, collectionID: 123, collectionMap: true },
])("restores destination %j from its URL", (destination) => {
    expect(
        galleryDestinationFromHref(
            galleryHref(destination),
            initialGalleryState,
        ),
    ).toEqual(destination);
});

test("preserves existing album links", () => {
    expect(galleryHref({ ...homeDestination, collectionID: 123 })).toBe(
        "/gallery?collection=123",
    );
    expect(galleryHref(homeDestination)).toBe("/gallery");
});

test.each(["", "NaN", "1.5", "123extra", "9007199254740992"])(
    "ignores malformed collection ID %j",
    (collection) => {
        expect(
            galleryDestinationFromHref(
                `/gallery?collection=${collection}`,
                initialGalleryState,
            ).collectionID,
        ).toBe(PseudoCollectionID.all);
    },
);

test("restores hidden and archived albums in their respective modes", () => {
    const library = {
        ...initialGalleryState,
        hiddenCollectionSummaries: new Map([
            [
                123,
                {
                    ...initialGalleryState.normalCollectionSummaries
                        .values()
                        .next().value!,
                    id: 123,
                },
            ],
        ]),
        archivedCollectionSummaries: new Map([
            [
                456,
                {
                    ...initialGalleryState.normalCollectionSummaries
                        .values()
                        .next().value!,
                    id: 456,
                },
            ],
        ]),
    };
    expect(
        galleryDestinationFromHref("/gallery?collection=123", library),
    ).toMatchObject({ albumMode: "hidden-albums", collectionID: 123 });
    expect(
        galleryDestinationFromHref("/gallery?collection=456", library),
    ).toMatchObject({ albumMode: "archive-albums", collectionID: 456 });
});

test("history restoration dismisses a stale search or cleanup overlay", () => {
    const destination: GalleryDestination = { section: "feed" };
    expect(
        navigationReducer(
            { ...initialNavigationState, overlay: { section: "search" } },
            { type: "restoreDestination", destination },
        ),
    ).toMatchObject({ destination, overlay: undefined });
});
