import { ThemeProvider } from "@mui/material";
import { photosTheme } from "ente-base/components/utils/theme";
import type { EnteFile } from "ente-media/file";
import type { Person } from "ente-new/photos/services/ml/people";
import type { ComponentProps, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { PeopleView } from "../src/components/gallery/PeopleView";
import {
    PhotosNavigationContext,
    type PhotosNavigationActions,
} from "../src/components/gallery/PhotosNavigationContext";
import { SectionNavigationContext } from "../src/components/gallery/section-navigation-context";

vi.mock("@/utils/people-sort", () => import("../src/utils/people-sort"));
vi.mock("@/components/PeopleSortOptions", () => ({
    PeopleSortOptions: () => null,
}));
vi.mock("../src/components/gallery/index", () => ({
    PeopleEmptyState: () => <p>Empty people</p>,
}));
vi.mock("react-dom", async (importOriginal) => ({
    ...(await importOriginal<typeof import("react-dom")>()),
    createPortal: (children: ReactNode) => children,
}));
vi.mock("ente-new/photos/components/Tiles", () => ({ ItemCard: () => null }));
vi.mock("react-virtualized-auto-sizer", () => ({
    default: ({
        children,
    }: {
        children: (size: { width: number; height: number }) => ReactNode;
    }) => children({ width: 800, height: 1000 }),
}));
vi.mock("i18next", () => ({
    t: (key: string, options?: { count: number }) =>
        options ? `${key}: ${options.count}` : key,
}));

const person = (id: string, count: number, isPinned = false): Person => ({
    type: "cluster",
    cluster: { id, faces: [] },
    id,
    name: id,
    fileIDs: Array.from({ length: count }, (_, i) => i + 1),
    isPinned,
    hideFromMemories: false,
    displayFaceID: id,
    displayFaceFile: { id: 1 } as EnteFile,
});
const people = [
    person("Small", 1),
    person("Large", 10),
    person("Pinned", 2, true),
];

const renderView = (
    overrides: Partial<ComponentProps<typeof PeopleView>> = {},
    sidebar = true,
) =>
    renderToStaticMarkup(
        <ThemeProvider theme={photosTheme}>
            <PhotosNavigationContext.Provider
                value={
                    {
                        selectPerson: vi.fn(),
                        showPeople: vi.fn(() => true),
                    } as unknown as PhotosNavigationActions
                }
            >
                <SectionNavigationContext.Provider
                    value={{
                        container: sidebar ? ({} as HTMLElement) : null,
                        presentation: {
                            collapsed: false,
                            mobileDrawerProps: {
                                open: false,
                                onClose: vi.fn(),
                            },
                        },
                    }}
                >
                    <PeopleView
                        view={{
                            people,
                            visiblePeople: people,
                            activePerson: undefined,
                        }}
                        showOverview
                        {...overrides}
                    />
                </SectionNavigationContext.Provider>
            </PhotosNavigationContext.Provider>
        </ThemeProvider>,
    );

const navigationNames = (html: string) =>
    Array.from(
        html.matchAll(/<button\b[^>]*aria-label="([^"]+)"/g),
        (match) => match[1],
    );

describe("People view", () => {
    test("orders the sidebar by the existing pinned/count default and renders the overview", () => {
        const html = renderView();
        expect(navigationNames(html)).toEqual(["Pinned", "Large", "Small"]);
        expect(html).toContain("people_count: 3");
        expect(html).toContain('aria-label="people_search_hint"');
        expect(people.map(({ id }) => id)).toEqual([
            "Small",
            "Large",
            "Pinned",
        ]);
    });

    test("does not render an inactive section", () => {
        const html = renderView({ view: undefined });
        expect(html).not.toContain("<nav");
        expect(html).not.toContain("<h1");
    });

    test("keeps selected-person navigation while the shared viewer owns the content", () => {
        const html = renderView({
            view: { people, visiblePeople: people, activePerson: people[1] },
        });
        expect(navigationNames(html)).toEqual(["Pinned", "Large", "Small"]);
        expect(html).toMatch(/aria-label="Large" aria-current="true"/);
        expect(html).not.toContain("<h1");
    });

    test("can hide the overview without losing navigation", () => {
        const html = renderView({ showOverview: false });
        expect(navigationNames(html)).toHaveLength(3);
        expect(html).not.toContain("<h1");
    });

    test("can render content while the shell has no sidebar target", () => {
        const html = renderView({}, false);
        expect(navigationNames(html)).toHaveLength(0);
        expect(html).toContain("people_count: 3");
    });

    test("retains the extra-faces fallback and excludes hidden groups", () => {
        const hidden = {
            ...person("Hidden", 5),
            type: "cgroup",
            isHidden: true,
        } as Person;
        const html = renderView({
            view: {
                visiblePeople: [],
                people: [person("Extra", 4), hidden],
                activePerson: undefined,
            },
        });
        expect(html).toContain(">Extra<");
        expect(html).not.toContain(">Hidden<");
        expect(html).toContain("people_count: 1");
        expect(html).not.toContain("show_more_faces");
    });

    test("retains the empty state when no faces exist", () => {
        const html = renderView({
            view: { people: [], visiblePeople: [], activePerson: undefined },
        });
        expect(html).toContain("Empty people");
        expect(html).toContain("people_count: 0");
    });
});
