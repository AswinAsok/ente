import { SortCategoryOption, SortOptionsMenu } from "@/components/SortOptions";
import type { IconButtonProps, PaperProps, Theme } from "@mui/material";
import type { CollectionsSortBy } from "ente-new/photos/services/collection-summary";
import { t } from "i18next";
import React from "react";

interface CollectionsSortOptionsProps {
    activeSortBy: CollectionsSortBy;
    onChangeSortBy: (by: CollectionsSortBy) => void;
    nestedInDialog?: boolean;
    transparentTriggerButtonBackground?: boolean;
    variant?: "default" | "v2";
}

type SortCategory = "name" | "creation-time" | "updation-time";

const getSortCategory = (sortBy: CollectionsSortBy): SortCategory => {
    if (sortBy.startsWith("name")) return "name";
    if (sortBy.startsWith("creation-time")) return "creation-time";
    return "updation-time";
};

const isAscending = (sortBy: CollectionsSortBy): boolean =>
    sortBy.endsWith("-asc");

const getSortBy = (
    category: SortCategory,
    ascending: boolean,
): CollectionsSortBy => `${category}-${ascending ? "asc" : "desc"}`;

export const CollectionsSortOptions: React.FC<CollectionsSortOptionsProps> = ({
    activeSortBy,
    onChangeSortBy,
    nestedInDialog,
    transparentTriggerButtonBackground,
    variant = "default",
}) => {
    const ariaID = "collection-sort";

    const activeCategory = getSortCategory(activeSortBy);
    const activeAscending = isAscending(activeSortBy);

    const handleCategoryClick = (
        category: SortCategory,
        onSelect: (sortBy: CollectionsSortBy) => void,
    ) => {
        let nextSortBy: CollectionsSortBy;
        if (category === activeCategory) {
            nextSortBy = getSortBy(category, !activeAscending);
        } else {
            // Names default to ascending; dates default to newest first.
            const defaultAscending = category === "name";
            nextSortBy = getSortBy(category, defaultAscending);
        }
        onSelect(nextSortBy);
    };

    const isV2 = variant === "v2";

    const triggerButtonSxProps: IconButtonProps["sx"] = isV2
        ? v2TriggerButtonSx
        : [
              transparentTriggerButtonBackground
                  ? {}
                  : { backgroundColor: "fill.faint" },
          ];

    const menuPaperSxProps: PaperProps["sx"] | undefined =
        !isV2 && nestedInDialog
            ? { backgroundColor: "background.paper2" }
            : undefined;

    return (
        <SortOptionsMenu
            ariaID={ariaID}
            onChangeSortBy={onChangeSortBy}
            ariaLabel={isV2 ? t("sort_by") : undefined}
            triggerButtonSx={triggerButtonSxProps}
            triggerIconSx={isV2 ? { fontSize: 20 } : undefined}
            menuSx={isV2 ? v2MenuSx : undefined}
            menuPaperSx={menuPaperSxProps ? { sx: menuPaperSxProps } : {}}
        >
            {(onSelect) => (
                <>
                    <SortCategoryOption<SortCategory>
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
                    <SortCategoryOption<SortCategory>
                        category="creation-time"
                        activeCategory={activeCategory}
                        activeAscending={activeAscending}
                        onClick={(category) =>
                            handleCategoryClick(category, onSelect)
                        }
                        label={t("created")}
                        directionLabel={
                            activeAscending ? t("oldest") : t("newest")
                        }
                    />
                    <SortCategoryOption<SortCategory>
                        category="updation-time"
                        activeCategory={activeCategory}
                        activeAscending={activeAscending}
                        onClick={(category) =>
                            handleCategoryClick(category, onSelect)
                        }
                        label={t("updated")}
                        directionLabel={
                            activeAscending ? t("oldest") : t("newest")
                        }
                    />
                </>
            )}
        </SortOptionsMenu>
    );
};

const v2TriggerButtonSx = (theme: Theme) => ({
    width: 38,
    height: 38,
    p: 0,
    color: "text.base",
    backgroundColor: "background.paper",
    "&:hover": { backgroundColor: "fill.faintHover" },
    ...theme.applyStyles("dark", {
        backgroundColor: "rgba(255 255 255 / 0.12)",
    }),
});

const v2MenuSx = (theme: Theme) => ({
    "& .MuiPaper-root": {
        width: 238,
        minWidth: 238,
        border: "1px solid #ececec",
        borderRadius: "16px",
        backgroundColor: "background.paper",
        boxShadow: "0 4px 4px rgba(0 0 0 / 0.16)",
        ...theme.applyStyles("dark", {
            borderColor: "rgba(255 255 255 / 0.12)",
            backgroundColor: "#282828",
            boxShadow: "0 4px 4px rgba(0 0 0 / 0.40)",
        }),
    },
    "& .MuiMenuItem-root": {
        minHeight: 44,
        height: 44,
        boxSizing: "border-box",
        py: "12px",
        px: "16px",
    },
    "& .MuiTypography-root": {
        fontSize: 14,
        lineHeight: "20px",
        fontWeight: 500,
    },
});
