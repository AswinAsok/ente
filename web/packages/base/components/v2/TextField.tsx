import {
    FormControl,
    FormLabel,
    InputBase,
    type SxProps,
    type Theme,
} from "@mui/material";
import { ShowHidePasswordInputAdornment } from "ente-base/components/mui/PasswordInputAdornment";
import React, { useId, useState } from "react";
import { WarningMessage } from "./WarningMessage";

export interface TextFieldProps {
    label?: React.ReactNode;
    value: string;
    onChange: (
        event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => void;
    type?: React.HTMLInputTypeAttribute;
    placeholder?: string;
    required?: boolean;
    disabled?: boolean;
    error?: boolean;
    helperText?: string;
    autoFocus?: boolean;
    autoComplete?: string;
    name?: string;
    id?: string;
    showPasswordToggle?: boolean;
    multiline?: boolean;
    rows?: number;
}

export const TextField: React.FC<TextFieldProps> = ({
    label,
    value,
    onChange,
    type = "text",
    placeholder,
    required,
    disabled,
    error,
    helperText,
    autoFocus,
    autoComplete,
    name,
    id,
    showPasswordToggle,
    multiline,
    rows = 5,
}) => {
    const [showPassword, setShowPassword] = useState(false);
    const generatedID = useId();
    const inputID = id ?? generatedID;
    const helperTextID = `${inputID}-helper-text`;
    const inputType = showPasswordToggle
        ? showPassword
            ? "text"
            : "password"
        : type;
    const handleTogglePassword = () => setShowPassword((show) => !show);

    return (
        <FormControl
            disabled={disabled}
            error={error}
            required={required}
            sx={fieldOuterSx}
        >
            {label && (
                <FormLabel htmlFor={inputID} sx={labelSx}>
                    {label}
                </FormLabel>
            )}
            <InputBase
                id={inputID}
                value={value}
                onChange={onChange}
                type={multiline ? undefined : inputType}
                multiline={multiline}
                rows={multiline ? rows : undefined}
                placeholder={placeholder}
                required={required}
                disabled={disabled}
                autoFocus={autoFocus}
                autoComplete={autoComplete}
                name={name}
                aria-invalid={error || undefined}
                aria-describedby={helperText ? helperTextID : undefined}
                endAdornment={
                    showPasswordToggle ? (
                        <ShowHidePasswordInputAdornment
                            showPassword={showPassword}
                            onToggle={handleTogglePassword}
                            disabled={disabled}
                        />
                    ) : undefined
                }
                sx={fieldBoxSx(!!error, !!disabled, !!multiline)}
                slotProps={{
                    input: { sx: controlSx(!!disabled, !!multiline) },
                }}
            />
            {helperText && (
                <WarningMessage
                    id={helperTextID}
                    text={helperText}
                    kind={error ? "error" : "info"}
                />
            )}
        </FormControl>
    );
};

const fieldOuterSx = {
    display: "flex",
    flexDirection: "column",
    gap: "9px",
    width: "100%",
};

const labelSx: SxProps<Theme> = (theme) => ({
    fontSize: 12,
    lineHeight: "16px",
    fontWeight: 500,
    color: theme.vars.palette.text.muted,
});

const fieldBoxSx =
    (error: boolean, disabled: boolean, multiline: boolean): SxProps<Theme> =>
    (theme) => ({
        height: multiline ? "auto" : "52px",
        minHeight: multiline ? "112px" : undefined,
        borderRadius: 2,
        padding: multiline ? "16px" : "20px 16px",
        boxSizing: "border-box",
        backgroundColor: disabled
            ? theme.vars.palette.action.disabledBackground
            : theme.vars.palette.background.paper,
        display: "flex",
        alignItems: multiline ? "flex-start" : "center",
        gap: "8px",
        "& .MuiInputAdornment-root": { marginLeft: 0 },
        "& .MuiIconButton-root": {
            width: "20px",
            height: "20px",
            padding: 0,
            color: theme.vars.palette.text.faint,
        },
        boxShadow: disabled
            ? "none"
            : `inset 0 0 0 1px ${
                  error
                      ? theme.vars.palette.critical.main
                      : theme.vars.palette.stroke.faint
              }`,
        "&:focus-within": disabled
            ? {}
            : {
                  boxShadow: `inset 0 0 0 1px ${
                      error
                          ? theme.vars.palette.critical.main
                          : theme.vars.palette.accent.main
                  }`,
              },
    });

const controlSx =
    (disabled: boolean, multiline: boolean): SxProps<Theme> =>
    (theme) => ({
        fontSize: 14,
        lineHeight: "20px",
        fontWeight: 500,
        flex: 1,
        minWidth: 0,
        width: "100%",
        padding: 0,
        border: "none",
        outline: "none",
        background: "transparent",
        fontFamily: "inherit",
        ...(multiline ? { resize: "none" } : {}),
        color: disabled
            ? theme.vars.palette.action.disabled
            : theme.vars.palette.text.primary,
        "&::placeholder": { color: theme.vars.palette.text.faint, opacity: 1 },
    });
