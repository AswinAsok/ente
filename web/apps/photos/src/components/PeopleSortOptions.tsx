import { SortCategoryOption, SortOptionsMenu } from "@/components/SortOptions";
import type { PeopleSortBy } from "@/utils/people-sort";
import type { IconButtonProps, PaperProps } from "@mui/material";
import { t } from "i18next";
import React from "react";

interface PeopleSortOptionsProps {
    activeSortBy: PeopleSortBy;
    onChangeSortBy: (by: PeopleSortBy) => void;
    nestedInDialog?: boolean;
    transparentTriggerButtonBackground?: boolean;
}

type PeopleSortCategory = "name" | "count";

const getPeopleSortCategory = (sortBy: PeopleSortBy): PeopleSortCategory =>
    sortBy.startsWith("name") ? "name" : "count";

const isPeopleSortAscending = (sortBy: PeopleSortBy) => sortBy.endsWith("asc");

const getPeopleSortBy = (
    category: PeopleSortCategory,
    ascending: boolean,
): PeopleSortBy => `${category}-${ascending ? "asc" : "desc"}`;

export const PeopleSortOptions: React.FC<PeopleSortOptionsProps> = ({
    activeSortBy,
    onChangeSortBy,
    nestedInDialog,
    transparentTriggerButtonBackground,
}) => {
    const ariaID = "people-sort";

    // Split the current sort into its category and direction for simpler menu logic.
    const activeCategory = getPeopleSortCategory(activeSortBy);
    const activeAscending = isPeopleSortAscending(activeSortBy);

    // Re-selecting the active category flips its direction; choosing a new
    // category applies that category's default direction.
    const handleCategoryClick = (
        category: PeopleSortCategory,
        onSelect: (sortBy: PeopleSortBy) => void,
    ) => {
        let nextSortBy: PeopleSortBy;
        if (category === activeCategory) {
            nextSortBy = getPeopleSortBy(category, !activeAscending);
        } else {
            nextSortBy = getPeopleSortBy(category, category === "name");
        }
        onSelect(nextSortBy);
    };

    // Optionally remove the trigger button background when this control is
    // rendered inside layouts that already provide their own styling.
    const triggerButtonSxProps: IconButtonProps["sx"] = [
        transparentTriggerButtonBackground
            ? {}
            : { backgroundColor: "fill.faint" },
    ];

    const menuPaperSxProps: PaperProps["sx"] | undefined = nestedInDialog
        ? { backgroundColor: "background.paper2" }
        : undefined;

    return (
        <SortOptionsMenu
            ariaID={ariaID}
            onChangeSortBy={onChangeSortBy}
            triggerButtonSx={triggerButtonSxProps}
            menuPaperSx={menuPaperSxProps ? { sx: menuPaperSxProps } : {}}
        >
            {(onSelect) => (
                <>
                    <SortCategoryOption<PeopleSortCategory>
                        category="name"
                        activeCategory={activeCategory}
                        activeAscending={activeAscending}
                        onClick={(category) =>
                            handleCategoryClick(category, onSelect)
                        }
                        label={t("name")}
                        directionLabel={
                            activeAscending
                                ? t("sort_asc_indicator")
                                : t("sort_desc_indicator")
                        }
                    />
                    <SortCategoryOption<PeopleSortCategory>
                        category="count"
                        activeCategory={activeCategory}
                        activeAscending={activeAscending}
                        onClick={(category) =>
                            handleCategoryClick(category, onSelect)
                        }
                        label={t("photos")}
                    />
                </>
            )}
        </SortOptionsMenu>
    );
};
