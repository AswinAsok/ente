import { PseudoCollectionID } from "ente-new/photos/services/collection-summary";
import type { SearchOption } from "ente-new/photos/services/search/types";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { usePhotosNavigationController } from "../src/components/gallery/hooks/use-photos-navigation-controller";
import {
    galleryReducer,
    initialGalleryState,
} from "../src/components/gallery/reducer";

const runtime = vi.hoisted(() => ({
    authenticateUser: vi.fn<() => Promise<boolean>>(),
    mlEnabled: true,
    mapEnabled: true,
    onGenericError: vi.fn(),
    updateMapEnabled: vi.fn<(enabled: boolean) => Promise<void>>(),
    router: { isReady: true, push: vi.fn() },
}));

vi.mock("@/utils/album-filters", () => import("../src/utils/album-filters"));
vi.mock("ente-base/context", () => ({
    useBaseContext: () => ({ onGenericError: runtime.onGenericError }),
}));
vi.mock("ente-new/photos/components/utils/use-snapshot", () => ({
    useSettingsSnapshot: () => ({ mapEnabled: runtime.mapEnabled }),
    useMLStatusSnapshot: () => undefined,
}));
vi.mock("ente-new/photos/services/ml", () => ({
    isMLEnabled: () => runtime.mlEnabled,
}));
vi.mock("ente-new/photos/services/settings", () => ({
    updateMapEnabled: runtime.updateMapEnabled,
}));
vi.mock("next/router", () => ({ useRouter: () => runtime.router }));
vi.mock("../src/components/gallery/hooks/use-gallery-authentication", () => ({
    useGalleryAuthentication: () => ({
        authenticateUser: runtime.authenticateUser,
        authenticateUserDialogProps: {
            open: false,
            onClose: vi.fn(),
            onAuthenticate: vi.fn(),
        },
    }),
}));

type Options = Parameters<typeof usePhotosNavigationController>[0];

const controller = (state: Options["state"] = initialGalleryState) => {
    const options = {
        state,
        dispatch: vi.fn<Options["dispatch"]>(),
        selection: { clear: vi.fn(), reset: vi.fn() },
        remoteFilesPull: vi.fn(() => Promise.resolve()),
        closeSlideshow: vi.fn(),
    };
    let result: ReturnType<typeof usePhotosNavigationController>;
    const Gallery = () => {
        result = usePhotosNavigationController(options);
        return null;
    };
    renderToStaticMarkup(<Gallery />);
    return { ...options, ...result! };
};

beforeEach(() => {
    vi.clearAllMocks();
    runtime.authenticateUser.mockResolvedValue(false);
    runtime.mlEnabled = true;
    runtime.mapEnabled = true;
});

describe("Photos navigation controller", () => {
    test("selects links without opening them as gallery collections", () => {
        const links = controller({
            ...initialGalleryState,
            view: { type: "links", selectedLinkID: undefined },
        });
        links.actions.selectCollection(42);
        expect(links.dispatch).toHaveBeenCalledExactlyOnceWith({
            type: "selectLink",
            collectionID: 42,
        });

        const albums = controller();
        albums.actions.selectCollection(42);
        expect(albums.dispatch).toHaveBeenCalledExactlyOnceWith({
            type: "showCollectionSummary",
            collectionSummaryID: 42,
        });
    });

    test("refreshes Trash on normal entry while preserving the viewer entry path", () => {
        const navigation = controller();
        navigation.actions.selectCollection(PseudoCollectionID.trash);
        expect(navigation.remoteFilesPull).toHaveBeenCalledOnce();
        expect(
            navigation.remoteFilesPull.mock.invocationCallOrder[0],
        ).toBeLessThan(navigation.dispatch.mock.invocationCallOrder[0]!);

        navigation.remoteFilesPull.mockClear();
        navigation.actions.selectCollectionFromViewer(PseudoCollectionID.trash);
        expect(navigation.remoteFilesPull).not.toHaveBeenCalled();
    });

    test("cancelled or failed Hidden authentication does not navigate", async () => {
        const navigation = controller();
        for (const fail of [false, true]) {
            if (fail)
                runtime.authenticateUser.mockRejectedValueOnce(
                    new Error("Cancelled"),
                );
            await expect(
                navigation.actions.showCollectionSummary(
                    PseudoCollectionID.hiddenItems,
                    true,
                ),
            ).resolves.toBe(false);
        }
        expect(navigation.dispatch).not.toHaveBeenCalled();
    });

    test("reuses successful Hidden authentication", async () => {
        runtime.authenticateUser.mockResolvedValue(true);
        const navigation = controller();
        await expect(
            navigation.actions.showCollectionSummary(
                PseudoCollectionID.hiddenItems,
                true,
            ),
        ).resolves.toBe(true);
        await expect(
            navigation.actions.showCollectionSummary(
                PseudoCollectionID.hiddenItems,
                true,
            ),
        ).resolves.toBe(true);
        expect(runtime.authenticateUser).toHaveBeenCalledOnce();
        expect(navigation.dispatch).toHaveBeenCalledTimes(2);
    });

    test("defers the People search reset until consent is enabled", () => {
        runtime.mlEnabled = false;
        const navigation = controller();
        const resetSearch = vi.fn();
        expect(navigation.actions.showPeople(resetSearch)).toBe(false);
        expect(resetSearch).not.toHaveBeenCalled();
        expect(navigation.dispatch).not.toHaveBeenCalled();

        runtime.mlEnabled = true;
        navigation.peopleConsentDialogProps.onEnabled();
        expect(resetSearch).toHaveBeenCalledOnce();
        expect(navigation.dispatch).toHaveBeenCalledExactlyOnceWith({
            type: "showPeople",
        });
        expect(resetSearch.mock.invocationCallOrder[0]).toBeLessThan(
            navigation.dispatch.mock.invocationCallOrder[0]!,
        );
    });

    test("clears a cancelled People search reset", () => {
        runtime.mlEnabled = false;
        const navigation = controller();
        const resetSearch = vi.fn();
        navigation.actions.showPeople(resetSearch);
        navigation.peopleConsentDialogProps.onClose();
        runtime.mlEnabled = true;
        navigation.peopleConsentDialogProps.onEnabled();
        expect(resetSearch).not.toHaveBeenCalled();
    });

    test("preserves search exit options and leaves Hidden before searching normal files", () => {
        const navigation = controller(
            galleryReducer(initialGalleryState, { type: "showHidden" }),
        );
        navigation.actions.selectSearchOption(undefined, {
            shouldExitSearchMode: false,
        });
        expect(navigation.dispatch).toHaveBeenLastCalledWith({
            type: "exitSearch",
            shouldExitSearchMode: false,
        });
        const option: SearchOption = {
            suggestion: { type: "fileName", label: "Trip", fileIDs: [1] },
            previewFiles: [],
            fileCount: 1,
        };
        navigation.actions.selectSearchOption(option);
        expect(navigation.dispatch.mock.calls.slice(-2)).toEqual([
            [{ type: "showAlbums" }],
            [{ type: "enterSearchMode", searchSuggestion: option.suggestion }],
        ]);
    });

    test("resets selection and closes the slideshow before cleanup", () => {
        const navigation = controller();
        navigation.actions.showCleanupView("duplicates");
        expect(navigation.selection.reset).toHaveBeenCalledOnce();
        expect(navigation.closeSlideshow).toHaveBeenCalledOnce();
        expect(navigation.dispatch).toHaveBeenCalledExactlyOnceWith({
            type: "exitSearch",
            shouldExitSearchMode: true,
        });
        expect(navigation.selection.clear).not.toHaveBeenCalled();
    });

    test("handles map enabling failures through the shared error UI", async () => {
        runtime.mapEnabled = false;
        const failure = new Error("Map preferences unavailable");
        runtime.updateMapEnabled.mockRejectedValueOnce(failure);
        controller().actions.showCollectionMap();
        await vi.waitFor(() =>
            expect(runtime.onGenericError).toHaveBeenCalledExactlyOnceWith(
                failure,
            ),
        );
    });
});
