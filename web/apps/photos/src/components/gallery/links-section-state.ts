import type { Collection } from "ente-media/collection";

export interface LinksSectionState {
    selectedLinkID: number | undefined;
    searchQuery: string;
}

export const initialLinksSectionState: LinksSectionState = {
    selectedLinkID: undefined,
    searchQuery: "",
};

type LinksSectionAction =
    | { type: "reset" }
    | { type: "showOverview" }
    | { type: "selectLink"; collectionID: number }
    | { type: "search"; query: string }
    | { type: "reconcile"; links: Collection[] };

export const linksSectionReducer = (
    state: LinksSectionState,
    action: LinksSectionAction,
): LinksSectionState => {
    switch (action.type) {
        case "reset":
            return initialLinksSectionState;
        case "showOverview":
            return { ...state, selectedLinkID: undefined };
        case "selectLink":
            return { ...state, selectedLinkID: action.collectionID };
        case "search":
            return { ...state, searchQuery: action.query };
        case "reconcile":
            return action.links.some(({ id }) => id === state.selectedLinkID)
                ? state
                : { ...state, selectedLinkID: undefined };
    }
};
