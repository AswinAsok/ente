import {
    Checkbox as MuiCheckbox,
    type SxProps,
    type Theme,
} from "@mui/material";
import React from "react";

export interface CheckboxProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
    id?: string;
}

export const Checkbox: React.FC<CheckboxProps> = ({
    checked,
    onChange,
    disabled,
    id,
}) => {
    const handleChange = (
        _: React.ChangeEvent<HTMLInputElement>,
        value: boolean,
    ) => onChange(value);

    return (
        <MuiCheckbox
            id={id}
            checked={checked}
            disabled={disabled}
            onChange={handleChange}
            sx={checkboxSx}
        />
    );
};

const checkboxSx: SxProps<Theme> = (theme) => ({
    width: "16px",
    height: "16px",
    padding: 0,
    flex: "0 0 16px",
    color: theme.vars.palette.text.faint,
    "&.Mui-checked": { color: theme.vars.palette.accent.main },
    "&.Mui-disabled": { color: theme.vars.palette.action.disabled },
    "& .MuiSvgIcon-root": { fontSize: "16px" },
});
