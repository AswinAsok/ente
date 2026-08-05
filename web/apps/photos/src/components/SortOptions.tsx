import { ArrowDown02Icon, ArrowUp02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import SortIcon from "@mui/icons-material/Sort";
import {
    IconButton,
    MenuItem,
    Stack,
    Typography,
    styled,
    type IconButtonProps,
    type MenuProps,
} from "@mui/material";
import Menu from "@mui/material/Menu";
import React, { useRef, useState } from "react";

interface SortOptionsMenuProps<T> {
    ariaID: string;
    onChangeSortBy: (sortBy: T) => void;
    children: (onSelect: (sortBy: T) => void) => React.ReactNode;
    ariaLabel?: string;
    triggerButtonSx?: IconButtonProps["sx"];
    triggerIconSx?: React.ComponentProps<typeof SortIcon>["sx"];
    menuSx?: MenuProps["sx"];
    menuPaperSx?: NonNullable<MenuProps["slotProps"]>["paper"];
}

export function SortOptionsMenu<T>({
    ariaID,
    onChangeSortBy,
    children,
    ariaLabel,
    triggerButtonSx,
    triggerIconSx,
    menuSx,
    menuPaperSx,
}: SortOptionsMenuProps<T>) {
    const [anchorEl, setAnchorEl] = useState<MenuProps["anchorEl"]>();
    const pendingSortByRef = useRef<T | undefined>(undefined);

    const handleOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
        setAnchorEl(event.currentTarget);
    };

    const handleClose = () => {
        setAnchorEl(undefined);
    };

    const handleSelect = (sortBy: T) => {
        pendingSortByRef.current = sortBy;
        handleClose();
    };

    const handleExited = () => {
        const nextSortBy = pendingSortByRef.current;
        if (nextSortBy !== undefined) {
            pendingSortByRef.current = undefined;
            onChangeSortBy(nextSortBy);
        }
    };

    return (
        <>
            <IconButton
                onClick={handleOpen}
                aria-controls={anchorEl ? ariaID : undefined}
                aria-haspopup="true"
                aria-expanded={anchorEl ? "true" : undefined}
                aria-label={ariaLabel}
                sx={triggerButtonSx}
            >
                <SortIcon sx={triggerIconSx} />
            </IconButton>
            <StyledMenu
                id={ariaID}
                sx={menuSx}
                {...(anchorEl && { anchorEl })}
                open={!!anchorEl}
                onClose={handleClose}
                slotProps={{
                    paper: menuPaperSx ?? {},
                    list: { disablePadding: true, "aria-labelledby": ariaID },
                    transition: { onExited: handleExited },
                }}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                transformOrigin={{ vertical: "top", horizontal: "right" }}
            >
                {children(handleSelect)}
            </StyledMenu>
        </>
    );
}

interface SortCategoryOptionProps<T> {
    category: T;
    activeCategory: T;
    activeAscending: boolean;
    onClick: (category: T) => void;
    label: string;
    directionLabel?: string;
}

export function SortCategoryOption<T>({
    category,
    activeCategory,
    activeAscending,
    onClick,
    label,
    directionLabel,
}: SortCategoryOptionProps<T>) {
    const isSelected = category === activeCategory;
    const arrowIcon = activeAscending ? ArrowUp02Icon : ArrowDown02Icon;

    const handleClick = () => {
        onClick(category);
    };

    return (
        <StyledMenuItem onClick={handleClick}>
            <Stack direction="row" sx={{ alignItems: "center" }}>
                <Typography
                    sx={{
                        color: isSelected ? "text.primary" : "text.secondary",
                    }}
                >
                    {label}
                </Typography>
                {isSelected && (
                    <Stack
                        direction="row"
                        sx={{
                            alignItems: "center",
                            ml: 1,
                            gap: 0.75,
                            color: "text.muted",
                        }}
                    >
                        {directionLabel && <Typography>•</Typography>}
                        {directionLabel && (
                            <Typography sx={{ fontSize: "0.9rem" }}>
                                {directionLabel}
                            </Typography>
                        )}
                        <HugeiconsIcon
                            icon={arrowIcon}
                            size={19}
                            color="currentColor"
                        />
                    </Stack>
                )}
            </Stack>
        </StyledMenuItem>
    );
}

const StyledMenu = styled(Menu)(({ theme }) => ({
    "& .MuiPaper-root": {
        backgroundColor: theme.vars.palette.background.elevatedPaper,
        minWidth: 220,
        width: 220,
        borderRadius: 12,
        boxShadow: theme.vars.palette.boxShadow.menu,
        marginTop: 6,
    },
    "& .MuiList-root": { padding: theme.spacing(1) },
}));

const StyledMenuItem = styled(MenuItem)(({ theme }) => ({
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: theme.spacing(1.5, 2),
    borderRadius: 8,
    color: theme.vars.palette.text.base,
    fontSize: 15,
    "&:hover": { backgroundColor: theme.vars.palette.fill.faintHover },
    "& .MuiListItemIcon-root": { minWidth: 0, color: "inherit" },
    "& .MuiListItemText-root": { margin: 0 },
    "& .MuiListItemText-primary": { color: "inherit", fontSize: "inherit" },
}));
