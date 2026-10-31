import type { LocalUser } from "ente-accounts/services/user";
import { CollectionSubType, type Collection } from "ente-media/collection";
import type { EnteFile } from "ente-media/file";
import type { CollectionSummary } from "ente-new/photos/services/collection-summary";
import { useState, type ComponentProps, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { useLinksSection } from "../src/components/gallery/LinksSection";
import type { PublicLinkDetails } from "../src/components/gallery/PublicLinkDetails";

vi.mock("@/utils/quick-links", () => import("../src/utils/quick-links"));
vi.mock("@/utils/album-filters", () => import("../src/utils/album-filters"));
vi.mock("../src/components/gallery/LinksSidebar", () => ({
    LinksSidebar: () => null,
}));
vi.mock("../src/components/gallery/PublicLinkDetails", () => ({
    PublicLinkDetails: () => null,
}));
vi.mock("../src/components/gallery/AlbumsOverview", () => ({
    AlbumsOverview: () => null,
}));

type Options = Parameters<typeof useLinksSection>[0];
type Section = ReturnType<typeof useLinksSection>;
const link: Collection = {
    id: 1,
    name: "Trip",
    owner: { id: 1 },
    type: "album",
    key: "test-key",
    sharees: [],
    publicURLs: [
        {
            url: "https://example.invalid",
            validTill: 0,
            deviceLimit: 0,
            enableDownload: true,
            enableCollect: false,
            enableComment: false,
            enableJoin: false,
            passwordEnabled: false,
        },
    ],
    magicMetadata: {
        version: 1,
        count: 1,
        data: { subType: CollectionSubType.quicklink },
    },
    updationTime: 1,
};
const summary: CollectionSummary = {
    id: 1,
    name: "Trip",
    type: "album",
    attributes: new Set(),
    fileCount: 9,
    latestFile: undefined,
    coverFile: undefined,
    updationTime: 1,
    sortPriority: 0,
};
const files = [1, 2, 3, 4]
    .map((id) => ({ id, collectionID: 1 }) as EnteFile)
    .concat({ id: 5, collectionID: 2 } as EnteFile);
const options = (): Options => ({
    isLinksView: true,
    user: { id: 1 } as LocalUser,
    collections: [link],
    collectionSummaries: new Map([[1, summary]]),
    collectionFiles: files,
    hiddenCollectionIDs: new Set(),
    hiddenFileIDs: new Set([2]),
    tempDeletedFileIDs: new Set([3]),
    tempHiddenFileIDs: new Set([4]),
    uncategorizedCollectionSummaryID: 99,
    collectionsSortBy: "updation-time-desc",
    onChangeCollectionsSortBy: vi.fn(),
    onSelectLink: vi.fn(),
});

const renderSequence = (
    steps: {
        options?: Partial<Options>;
        action?: (section: Section) => void;
    }[],
) => {
    const defaults = options();
    let result: Section;
    const Harness = () => {
        const [index, setIndex] = useState(0);
        const step = steps[index]!;
        result = useLinksSection({ ...defaults, ...step.options });
        if (index < steps.length - 1) {
            step.action?.(result);
            setIndex(index + 1);
        }
        return null;
    };
    renderToStaticMarkup(<Harness />);
    return result!;
};
const content = (section: Section) =>
    section.renderContent({
        setBlockingLoad: vi.fn(),
        onRemotePull: vi.fn(() => Promise.resolve()),
        onCreateAlbum: vi.fn(),
    }) as ReactElement<ComponentProps<typeof PublicLinkDetails>>;

describe("Links section data and lifecycle", () => {
    test("passes only visible files in the selected collection to the existing details component", () => {
        const section = renderSequence([
            { action: (s) => s.selectLink(1) },
            {},
        ]);
        expect(content(section).props.files).toEqual([files[0]]);
        expect(content(section).props.fileCount).toBe(9);
        expect(content(section).key).toBe("1");
        expect(content(section).props.collection).toBe(link);
    });
    test("falls back to the filtered file count when a summary is unavailable", () => {
        const section = renderSequence([
            { action: (s) => s.selectLink(1) },
            { options: { collectionSummaries: new Map() } },
        ]);
        expect(content(section).props.fileCount).toBe(1);
    });
    test("keeps selection while the underlying Links view is unchanged and clears it after leaving", () => {
        expect(
            renderSequence([
                { action: (s) => s.selectLink(1) },
                { options: { isLinksView: true } },
            ]).selectedLinkID,
        ).toBe(1);
        const section = renderSequence([
            { action: (s) => s.selectLink(1) },
            { options: { isLinksView: false } },
            { options: { isLinksView: true } },
        ]);
        expect(section.selectedLinkID).toBeUndefined();
    });
    test("clears an unavailable selection without reopening it when the collection returns", () => {
        const section = renderSequence([
            { action: (s) => s.selectLink(1) },
            { options: { collections: [] } },
            { options: { collections: [link] } },
        ]);
        expect(section.selectedLinkID).toBeUndefined();
    });
});
