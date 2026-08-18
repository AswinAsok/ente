import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import ErrorOutlinedIcon from "@mui/icons-material/ErrorOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { Box, type Theme } from "@mui/material";
import React from "react";

export interface WarningMessageProps {
    text: React.ReactNode;
    kind?: "error" | "warning" | "success" | "info";
    note?: boolean;
}

const kinds = {
    error: {
        color: (theme: Theme) => theme.vars.palette.critical.main,
        Icon: ErrorOutlinedIcon,
    },
    warning: {
        color: (theme: Theme) => theme.vars.palette.warning.main,
        Icon: WarningAmberIcon,
    },
    success: {
        color: (theme: Theme) => theme.vars.palette.success.main,
        Icon: CheckCircleOutlinedIcon,
    },
    info: {
        color: (theme: Theme) => theme.vars.palette.text.muted,
        Icon: InfoOutlinedIcon,
    },
};

export const WarningMessage: React.FC<WarningMessageProps> = ({
    text,
    kind = "info",
    note,
}) => {
    const { color, Icon } = kinds[kind];
    return (
        <Box
            component="span"
            sx={(theme) => ({
                fontSize: 12,
                lineHeight: "16px",
                fontWeight: 500,
                display: "inline-flex",
                alignItems: note ? "flex-start" : "center",
                gap: note ? "8px" : "4px",
                color: color(theme),
            })}
        >
            <Icon aria-hidden sx={{ fontSize: "14px", flexShrink: 0 }} />
            <span>{text}</span>
        </Box>
    );
};
