import type { SelectedState } from "@/utils/file";
import type { LocalUser } from "ente-accounts/services/user";
import type { EnteFile } from "ente-media/file";
import { useCallback, useEffect, useRef } from "react";
import type { GalleryBarMode } from "../reducer";

export const useSelectionShortcuts = ({
    user,
    filteredFiles,
    activeCollectionID,
    activePersonID,
    barMode,
    setSelected,
    clearSelection,
    disabled,
    isCleanupViewOpen,
}: {
    user: LocalUser | undefined;
    filteredFiles: EnteFile[];
    activeCollectionID: number | undefined;
    activePersonID: string | undefined;
    barMode: GalleryBarMode;
    setSelected: React.Dispatch<React.SetStateAction<SelectedState>>;
    clearSelection: () => void;
    disabled: boolean;
    isCleanupViewOpen: boolean;
}) => {
    const selectAll = useCallback(() => {
        if (!user || !filteredFiles.length) return;
        const selected: SelectedState = {
            ownCount: 0,
            count: 0,
            collectionID: activeCollectionID,
            context:
                barMode === "people" && activePersonID
                    ? { mode: "people", personID: activePersonID }
                    : {
                          mode: barMode as
                              "albums" | "hidden-albums" | "archive-albums",
                          collectionID: activeCollectionID!,
                      },
        };
        for (const file of filteredFiles) {
            if (file.ownerID === user.id) selected.ownCount++;
            selected.count++;
            selected[file.id] = true;
        }
        setSelected(selected);
    }, [
        user,
        filteredFiles,
        activeCollectionID,
        activePersonID,
        barMode,
        setSelected,
    ]);
    const current = useRef({
        selectAll,
        clearSelection,
        disabled,
        isCleanupViewOpen,
    });
    useEffect(() => {
        current.current = {
            selectAll,
            clearSelection,
            disabled,
            isCleanupViewOpen,
        };
    }, [selectAll, clearSelection, disabled, isCleanupViewOpen]);
    useEffect(() => {
        if (!user) return;
        const handleKey = (event: KeyboardEvent) => {
            const handlers = current.current;
            if (handlers.isCleanupViewOpen) return;
            if (event.key === "Escape") handlers.clearSelection();
            else if (event.key === "a" && (event.ctrlKey || event.metaKey)) {
                if (
                    event.target instanceof HTMLInputElement ||
                    event.target instanceof HTMLTextAreaElement
                )
                    return;
                event.preventDefault();
                if (!handlers.disabled) handlers.selectAll();
            }
        };
        document.addEventListener("keydown", handleKey);
        return () => document.removeEventListener("keydown", handleKey);
    }, [user]);
    return selectAll;
};
