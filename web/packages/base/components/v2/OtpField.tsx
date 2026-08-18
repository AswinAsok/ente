import { Box, type SxProps, type Theme } from "@mui/material";
import { t } from "i18next";
import React, { useRef, useState } from "react";

export interface OtpFieldProps {
    value: string;
    onChange: (value: string) => void;
    error?: boolean;
    autoFocus?: boolean;
}

export const OtpField: React.FC<OtpFieldProps> = ({
    value,
    onChange,
    error,
    autoFocus,
}) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [focused, setFocused] = useState(false);
    const digits = value.replace(/\D/g, "").slice(0, 6);

    const moveCaretToEnd = () => {
        const input = inputRef.current;
        input?.setSelectionRange(input.value.length, input.value.length);
    };
    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        onChange(event.target.value.replace(/\D/g, "").slice(0, 6));
    };
    const handleFocus = () => {
        setFocused(true);
        moveCaretToEnd();
    };
    const handleBlur = () => setFocused(false);
    const handleClick = () => {
        inputRef.current?.focus();
        moveCaretToEnd();
    };

    return (
        <Box sx={otpRootSx} onClick={handleClick}>
            {Array.from({ length: 6 }, (_, index) => (
                <Box
                    key={index}
                    component="span"
                    sx={otpCellSx(!!error, focused && index == digits.length)}
                >
                    {digits[index] ?? ""}
                </Box>
            ))}
            <Box
                component="input"
                ref={inputRef}
                value={digits}
                onChange={handleChange}
                onFocus={handleFocus}
                onBlur={handleBlur}
                onClick={moveCaretToEnd}
                autoFocus={autoFocus}
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                aria-label={t("verification_code")}
                sx={otpInputSx}
            />
        </Box>
    );
};

const otpRootSx = {
    position: "relative",
    display: "flex",
    gap: "8px",
    width: "100%",
    containerType: "inline-size",
    cursor: "text",
};

const otpCellSx =
    (error: boolean, active: boolean): SxProps<Theme> =>
    (theme) => ({
        fontFamily: '"Outfit Variable", sans-serif',
        fontSize: "clamp(20px, 6.6cqi, 30px)",
        lineHeight: 1,
        fontWeight: 600,
        aspectRatio: "44 / 52",
        borderRadius: 2,
        boxSizing: "border-box",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "1 1 0",
        minWidth: 0,
        backgroundColor: theme.vars.palette.background.paper,
        color: theme.vars.palette.text.primary,
        boxShadow: `inset 0 0 0 1px ${
            error
                ? theme.vars.palette.critical.main
                : active
                  ? theme.vars.palette.accent.main
                  : theme.vars.palette.stroke.faint
        }`,
    });

const otpInputSx = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    padding: 0,
    border: "none",
    opacity: 0,
    cursor: "text",
};
