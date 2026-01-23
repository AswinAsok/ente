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
import React, { useCallback, useEffect, useMemo } from "react";
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
        mapDialogVisibilityProps,
        handleRenameCollection,
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

    const visibleMenuItems = useMemo(
        () => menuItems.filter((item) => item.key !== "sort"),
        [menuItems],
    );

    useEffect(() => {
        if (open && visibleMenuItems.length === 0) onClose();
    }, [open, visibleMenuItems.length, onClose]);

    const handleMenuItemClick = useCallback(
        (item: CollectionMenuItem) => {
            onClose();
            item.onClick();
        },
        [onClose],
    );

    const isMenuOpen = open && !!anchorPosition;

    return (
        <>
            <StyledMenu
                open={isMenuOpen}
                onClose={onClose}
                disableAutoFocusItem
                anchorReference="anchorPosition"
                anchorPosition={anchorPosition}
                slotProps={{
                    root: {
                        onContextMenu: (e: React.MouseEvent) =>
                            e.preventDefault(),
                    },
                }}
            >
                {visibleMenuItems.map((item) => {
                    const isDestructive =
                        item.color === "critical" || item.isDestructive;
                    return (
                        <StyledMenuItem
                            key={item.key}
                            onClick={() => handleMenuItemClick(item)}
                            sx={
                                isDestructive
                                    ? {
                                          color: "critical.main",
                                          "&:hover": {
                                              backgroundColor: "critical.main",
                                              color: "#fff",
                                          },
                                      }
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
        backgroundColor: "#1f1f1f",
        minWidth: 170,
        borderRadius: 9,
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.35)",
        marginTop: 4,
    },
    "& .MuiList-root": {
        padding: theme.spacing(0.5),
    },
    ...theme.applyStyles("dark", {
        "& .MuiPaper-root": {
            backgroundColor: "#161616",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.6)",
        },
    }),
}));

const StyledMenuItem = styled(MenuItem)(({ theme }) => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: theme.spacing(1, 1.5),
    borderRadius: 7,
    color: "#f5f5f5",
    fontSize: 13,
    "&:hover": { backgroundColor: "rgba(255, 255, 255, 0.08)" },
    "& .MuiListItemIcon-root": { minWidth: 0, color: "inherit" },
    "& .MuiListItemText-root": { margin: 0 },
    "& .MuiListItemText-primary": { color: "inherit", fontSize: "inherit" },
    "& svg": { fontSize: "16px" },
}));
