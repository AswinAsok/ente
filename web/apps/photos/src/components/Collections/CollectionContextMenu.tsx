import CheckIcon from "@mui/icons-material/Check";
import {
    ListItemIcon,
    ListItemText,
    Menu,
    MenuItem,
    styled,
} from "@mui/material";
import { SingleInputDialog } from "ente-base/components/SingleInputDialog";
import type { Collection } from "ente-media/collection";
import type { CollectionSummary } from "ente-new/photos/services/collection-summary";
import { t } from "i18next";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { CollectionHeaderProps } from "./CollectionHeader";
import { CollectionMapDialog } from "./CollectionMapDialog";
import { useCollectionMenu, type CollectionMenuItem } from "./CollectionMenu";

interface ContextMenuPosition {
    top: number;
    left: number;
}

type CollectionContextMenuProps = {
    open: boolean;
    anchorPosition: ContextMenuPosition | undefined;
    onClose: () => void;
    collectionSummary: CollectionSummary;
    collection: Collection | undefined;
    isActiveCollection: boolean;
    setActiveCollectionID: (collectionID: number) => void;
    isCollectionDownloadInProgress?: () => boolean;
    onCollectionShare: () => void;
    onCollectionCast: () => void;
} & Pick<
    CollectionHeaderProps,
    | "onRemotePull"
    | "onAddSaveGroup"
    | "onMarkTempDeleted"
    | "onAddFileToCollection"
    | "onRemoteFilesPull"
    | "onVisualFeedback"
    | "fileNormalCollectionIDs"
    | "collectionNameByID"
    | "onSelectCollection"
    | "onSelectPerson"
>;

export const CollectionContextMenu: React.FC<CollectionContextMenuProps> = ({
    open,
    anchorPosition,
    onClose,
    collectionSummary,
    collection,
    isActiveCollection,
    setActiveCollectionID,
    isCollectionDownloadInProgress,
    onCollectionShare,
    onCollectionCast,
    onRemotePull,
    onAddSaveGroup,
    onMarkTempDeleted,
    onAddFileToCollection,
    onRemoteFilesPull,
    onVisualFeedback,
    fileNormalCollectionIDs,
    collectionNameByID,
    onSelectCollection,
    onSelectPerson,
}) => {
    const {
        menuItems,
        albumNameInputVisibilityProps,
        sortOrderMenuVisibilityProps,
        mapDialogVisibilityProps,
        sortAsc,
        handleRenameCollection,
        changeSortOrderAsc,
        changeSortOrderDesc,
    } = useCollectionMenu({
        collectionSummary,
        collection,
        setActiveCollectionID,
        onRemotePull,
        onCollectionShare,
        onCollectionCast,
        onAddSaveGroup,
        isCollectionDownloadInProgress,
        isActiveCollection,
    });

    const adjustedAnchorPosition = useMemo(() => {
        if (!anchorPosition) return undefined;
        const offset = 6;
        return {
            top: anchorPosition.top + offset,
            left: anchorPosition.left + offset,
        };
    }, [anchorPosition]);

    const [sortMenuAnchorPosition, setSortMenuAnchorPosition] =
        useState<ContextMenuPosition | undefined>(undefined);

    useEffect(() => {
        if (open && menuItems.length === 0) onClose();
    }, [open, menuItems.length, onClose]);

    const handleSortMenuClose = useCallback(() => {
        sortOrderMenuVisibilityProps.onClose();
        setSortMenuAnchorPosition(undefined);
    }, [sortOrderMenuVisibilityProps.onClose, setSortMenuAnchorPosition]);

    const handleSortAscClick = useCallback(() => {
        changeSortOrderAsc();
        handleSortMenuClose();
    }, [changeSortOrderAsc, handleSortMenuClose]);

    const handleSortDescClick = useCallback(() => {
        changeSortOrderDesc();
        handleSortMenuClose();
    }, [changeSortOrderDesc, handleSortMenuClose]);

    const handleMenuItemClick = useCallback(
        (item: CollectionMenuItem) => {
            if (item.key === "sort" && adjustedAnchorPosition) {
                setSortMenuAnchorPosition(adjustedAnchorPosition);
            }
            onClose();
            item.onClick();
        },
        [adjustedAnchorPosition, onClose],
    );

    const isMenuOpen = open && !!adjustedAnchorPosition;
    const isSortMenuOpen =
        sortOrderMenuVisibilityProps.open && !!sortMenuAnchorPosition;

    return (
        <>
            <StyledMenu
                open={isMenuOpen}
                onClose={onClose}
                anchorReference="anchorPosition"
                anchorPosition={adjustedAnchorPosition}
                slotProps={{
                    root: {
                        onContextMenu: (e: React.MouseEvent) =>
                            e.preventDefault(),
                    },
                }}
            >
                {menuItems.map((item) => {
                    const isDestructive =
                        item.color === "critical" || item.isDestructive;
                    return (
                        <StyledMenuItem
                            key={item.key}
                            onClick={() => handleMenuItemClick(item)}
                            sx={
                                isDestructive
                                    ? { color: "critical.main" }
                                    : undefined
                            }
                        >
                            <ListItemIcon sx={{ color: "inherit" }}>
                                {item.icon}
                            </ListItemIcon>
                            <ListItemText>{item.label}</ListItemText>
                        </StyledMenuItem>
                    );
                })}
            </StyledMenu>

            <StyledMenu
                open={isSortMenuOpen}
                onClose={handleSortMenuClose}
                anchorReference="anchorPosition"
                anchorPosition={sortMenuAnchorPosition}
                slotProps={{
                    root: {
                        onContextMenu: (e: React.MouseEvent) =>
                            e.preventDefault(),
                    },
                }}
            >
                <StyledMenuItem onClick={handleSortDescClick}>
                    <ListItemText>{t("newest_first")}</ListItemText>
                    {!sortAsc && <CheckIcon sx={{ ml: "auto" }} />}
                </StyledMenuItem>
                <StyledMenuItem onClick={handleSortAscClick}>
                    <ListItemText>{t("oldest_first")}</ListItemText>
                    {sortAsc && <CheckIcon sx={{ ml: "auto" }} />}
                </StyledMenuItem>
            </StyledMenu>

            <CollectionMapDialog
                {...mapDialogVisibilityProps}
                collectionSummary={collectionSummary}
                activeCollection={collection}
                onRemotePull={onRemotePull}
                onAddSaveGroup={onAddSaveGroup}
                onMarkTempDeleted={onMarkTempDeleted}
                onAddFileToCollection={onAddFileToCollection}
                onRemoteFilesPull={onRemoteFilesPull}
                onVisualFeedback={onVisualFeedback}
                fileNormalCollectionIDs={fileNormalCollectionIDs}
                collectionNameByID={collectionNameByID}
                onSelectCollection={onSelectCollection}
                onSelectPerson={onSelectPerson}
            />
            <SingleInputDialog
                {...albumNameInputVisibilityProps}
                title={t("rename_album")}
                label={t("album_name")}
                initialValue={collection?.name}
                submitButtonColor="primary"
                submitButtonTitle={t("rename")}
                onSubmit={handleRenameCollection}
            />
        </>
    );
};

const StyledMenu = styled(Menu)(({ theme }) => ({
    "& .MuiPaper-root": {
        minWidth: 160,
        borderRadius: 6,
        boxShadow: theme.shadows[6],
    },
    "& .MuiList-root": {
        paddingBlock: 4,
    },
}));

const StyledMenuItem = styled(MenuItem)(({ theme }) => ({
    padding: theme.spacing(0.75, 1.5),
    "& .MuiListItemIcon-root": { minWidth: 28 },
    "& .MuiSvgIcon-root": { fontSize: "18px" },
    "& .MuiListItemText-primary": { fontSize: "13px" },
}));
