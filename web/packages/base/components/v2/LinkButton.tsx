import { ButtonBase, type SxProps, type Theme } from "@mui/material";
import React from "react";

export interface LinkButtonProps {
    onClick: React.MouseEventHandler<HTMLButtonElement>;
    children: React.ReactNode;
    disabled?: boolean;
    regular?: boolean;
}

export const LinkButton: React.FC<LinkButtonProps> = ({
    onClick,
    children,
    disabled,
    regular,
}) => (
    <ButtonBase
        type="button"
        disableRipple
        onClick={onClick}
        disabled={disabled}
        sx={linkButtonSx(!!regular)}
    >
        {children}
    </ButtonBase>
);

const linkButtonSx =
    (regular: boolean): SxProps<Theme> =>
    (theme) => ({
        fontSize: 14,
        lineHeight: "20px",
        fontWeight: regular ? 500 : 600,
        gap: "4px",
        color: theme.vars.palette.accent.main,
        textDecoration: "none",
        cursor: "pointer",
        "&:focus-visible": {
            outline: `1px solid ${theme.vars.palette.accent.main}`,
            outlineOffset: "2px",
            borderRadius: 0.5,
        },
        "&:disabled": {
            color: theme.vars.palette.action.disabled,
            cursor: "not-allowed",
        },
    });
