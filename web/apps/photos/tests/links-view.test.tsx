import type { LocalUser } from "ente-accounts/services/user";
import { CollectionSubType, type Collection } from "ente-media/collection";
import type { EnteFile } from "ente-media/file";
import { ItemVisibility } from "ente-media/file-metadata";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";
import { AlbumsOverview } from "../src/components/gallery/AlbumsOverview";
import { LinksView } from "../src/components/gallery/LinksView";
import { PublicLinkDetails } from "../src/components/gallery/PublicLinkDetails";
import {
    galleryReducer,
    initialGalleryState,
} from "../src/components/gallery/reducer";
import { SectionNavigationContext } from "../src/components/gallery/section-navigation-context";
import {
    filteredQuickLinkSummaries,
    visibleQuickLinks,
} from "../src/utils/quick-links";

vi.mock("@/utils/quick-links", () => import("../src/utils/quick-links"));
vi.mock("../src/components/gallery/AlbumsOverview", () => ({
    AlbumsOverview: vi.fn(() => null),
}));
vi.mock("../src/components/gallery/PublicLinkDetails", () => ({
    PublicLinkDetails: vi.fn(() => null),
}));
vi.mock("../src/components/gallery/LinksNavigation", () => ({
    LinksNavigation: () => null,
}));

beforeEach(() => vi.clearAllMocks());

const link = (id: number, overrides: Partial<Collection> = {}): Collection => ({
    id,
    name: `Link ${id}`,
    type: "album",
    owner: { id: 1 },
    key: "test-key",
    sharees: [],
    updationTime: id,
    magicMetadata: {
        version: 1,
        count: 1,
        data: { subType: CollectionSubType.quicklink },
    },
    publicURLs: [
        {
            url: `https://albums.ente.com/?t=${id}`,
            validTill: 0,
            deviceLimit: 0,
            enableDownload: true,
            enableCollect: false,
            enableComment: false,
            enableJoin: false,
            passwordEnabled: false,
        },
    ],
    ...overrides,
});

const file = (id: number, collectionID = 1): EnteFile => ({
    id,
    collectionID,
    ownerID: 1,
    key: "file-key",
    file: { decryptionHeader: "" },
    thumbnail: { decryptionHeader: "" },
    updationTime: id,
    metadata: {
        fileType: 0,
        title: `${id}.jpg`,
        creationTime: id,
        modificationTime: id,
    },
});

const props = (
    collections = [link(1), link(2)],
    collectionFiles: EnteFile[] = [],
): ComponentProps<typeof LinksView> => {
    const user = { id: 1 } as LocalUser;
    const state = galleryReducer(initialGalleryState, {
        type: "mount",
        user,
        familyData: undefined,
        collections,
        collectionFiles,
        trashItems: [],
    });
    return {
        user,
        collections,
        collectionFiles: state.collectionFiles,
        collectionSummaries: state.normalCollectionSummaries,
        hiddenCollectionIDs: state.hiddenCollectionIDs,
        hiddenFileIDs: state.hiddenFileIDs,
        tempDeletedFileIDs: state.tempDeletedFileIDs,
        tempHiddenFileIDs: state.tempHiddenFileIDs,
        uncategorizedCollectionSummaryID:
            state.uncategorizedCollectionSummaryID,
        selectedLinkID: undefined,
        showContent: true,
        sortBy: "updation-time-desc",
        onChangeSortBy: vi.fn(),
        onCreateAlbum: vi.fn(),
        setBlockingLoad: vi.fn(),
        onRemotePull: vi.fn().mockResolvedValue(undefined),
    };
};

const renderView = (input: ComponentProps<typeof LinksView>) =>
    renderToStaticMarkup(
        <SectionNavigationContext.Provider
            value={{
                container: null,
                presentation: {
                    collapsed: false,
                    mobileDrawerProps: { open: false, onClose: vi.fn() },
                },
            }}
        >
            <LinksView {...input} />
        </SectionNavigationContext.Provider>,
    );

test("derives the overview from library data with shared sorting and search", () => {
    const input = props([
        link(1, { name: "Summer Alpha" }),
        link(2, { name: "Summer Beta" }),
        link(3, { name: "Winter" }),
        link(4, { name: "Summer regular album", magicMetadata: undefined }),
        link(5, { name: "Summer removed link", publicURLs: [] }),
    ]);
    const summaries = new Map(input.collectionSummaries);
    summaries.set(2, { ...summaries.get(2)!, sortPriority: 7 });

    const filtered = filteredQuickLinkSummaries({
        links: visibleQuickLinks(
            input.collections,
            input.user.id,
            input.hiddenCollectionIDs,
        ),
        collectionSummaries: summaries,
        uncategorizedCollectionSummaryID:
            input.uncategorizedCollectionSummaryID,
        searchQuery: "  SUMMER  ",
        sortBy: "name-asc",
    });
    expect(filtered.map(({ id }) => id)).toEqual([2, 1]);

    renderView({
        ...input,
        collectionSummaries: summaries,
        sortBy: "name-asc",
    });

    const overview = vi.mocked(AlbumsOverview).mock.calls[0]![0];
    expect(overview.albums.map(({ id }) => id)).toEqual([2, 1, 3]);
    expect(overview.filter).toBe("links");
    expect(overview.searchQuery).toBe("");
    expect(overview.sortBy).toBe("name-asc");
    expect(overview.onRemotePull).toBe(input.onRemotePull);
    expect(overview.onCreateAlbum).toBe(input.onCreateAlbum);
    expect(PublicLinkDetails).not.toHaveBeenCalled();
    expect(summaries.get(2)?.sortPriority).toBe(7);
    expect(input.collections.map(({ id }) => id)).toEqual([1, 2, 3, 4, 5]);
});

test("hides content while the section is covered by another view", () => {
    renderView({ ...props(), showContent: false });
    expect(AlbumsOverview).not.toHaveBeenCalled();
    expect(PublicLinkDetails).not.toHaveBeenCalled();
});

test.each([0, 17])(
    "filters detail files and uses the summary count of %i and its cover",
    (fileCount) => {
        const archived = file(6);
        archived.magicMetadata = {
            version: 1,
            count: 1,
            data: { visibility: ItemVisibility.archived },
        };
        const input = props(undefined, [
            file(1),
            file(2),
            file(3),
            file(4),
            file(5, 2),
            archived,
        ]);
        const coverFile = file(7);
        const summaries = new Map(input.collectionSummaries);
        summaries.set(1, { ...summaries.get(1)!, fileCount, coverFile });

        renderView({
            ...input,
            selectedLinkID: 1,
            collectionSummaries: summaries,
            hiddenFileIDs: new Set([2]),
            tempDeletedFileIDs: new Set([3]),
            tempHiddenFileIDs: new Set([4]),
        });

        const details = vi.mocked(PublicLinkDetails).mock.calls[0]![0];
        expect(details.collection.id).toBe(1);
        expect(details.files.map(({ id }) => id).sort()).toEqual([1, 6]);
        expect(details.fileCount).toBe(fileCount);
        expect(details.coverFile).toBe(coverFile);
        expect(details.user).toBe(input.user);
        expect(details.setBlockingLoad).toBe(input.setBlockingLoad);
        expect(details.onRemotePull).toBe(input.onRemotePull);
        expect(AlbumsOverview).not.toHaveBeenCalled();
    },
);

test("uses the filtered detail file count when no summary exists", () => {
    const input = props(undefined, [file(1), file(2), file(3, 2)]);
    renderView({ ...input, selectedLinkID: 1, collectionSummaries: new Map() });
    const details = vi.mocked(PublicLinkDetails).mock.calls[0]![0];
    expect(details.fileCount).toBe(2);
    expect(details.coverFile).toBeUndefined();
});

test.each(["removed", "unlinked", "hidden", "shared", "other-owner"])(
    "returns to the overview when the selected link is %s",
    (change) => {
        const updated = link(1);
        if (change == "unlinked") updated.publicURLs = [];
        if (change == "shared") updated.sharees = [{ id: 2 }];
        if (change == "other-owner") updated.owner.id = 2;
        const input = props(
            change == "removed" ? [link(2)] : [updated, link(2)],
        );
        renderView({
            ...input,
            selectedLinkID: 1,
            hiddenCollectionIDs: new Set(change == "hidden" ? [1] : []),
        });
        const overview = vi.mocked(AlbumsOverview).mock.calls[0]![0];
        expect(overview.albums.map(({ id }) => id)).toEqual([2]);
        expect(PublicLinkDetails).not.toHaveBeenCalled();
    },
);
