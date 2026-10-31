import { createContext, useContext } from "react";
import type { GalleryBarPresentationProps } from "./NavigationPrimitives";

export const SectionNavigationContext = createContext<
    | {
          container: HTMLElement | null;
          presentation: GalleryBarPresentationProps;
      }
    | undefined
>(undefined);

export const useSectionNavigation = () => {
    const slot = useContext(SectionNavigationContext);
    if (!slot) {
        throw new Error("Section navigation requires PhotosNavigationShell");
    }
    return slot;
};
