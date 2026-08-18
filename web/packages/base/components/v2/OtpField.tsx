import { styled } from "@mui/material";
import React from "react";
import OtpInput, { type InputProps } from "react-otp-input";

export interface OtpFieldProps {
    value: string;
    onChange: (value: string) => void;
    error?: boolean;
    autoFocus?: boolean;
}

export function OtpField({ value, onChange, error, autoFocus }: OtpFieldProps) {
    const digits = value.replace(/\D/g, "").slice(0, 6);

    const handleChange = (nextValue: string) => {
        onChange(nextValue.replace(/\D/g, "").slice(0, 6));
    };

    const renderInput = (inputProps: InputProps, index: number) => (
        <OtpInputCell
            {...inputProps}
            autoComplete={index === 0 ? "one-time-code" : "off"}
            name={index === 0 ? "otp" : undefined}
            pattern="[0-9]*"
            aria-invalid={error || undefined}
            hasError={!!error}
        />
    );

    return (
        <OtpInput
            value={digits}
            onChange={handleChange}
            numInputs={6}
            shouldAutoFocus={autoFocus}
            inputType="tel"
            renderInput={renderInput}
            containerStyle={otpContainerStyle}
            skipDefaultStyles
        />
    );
}

const otpContainerStyle: React.CSSProperties = {
    display: "flex",
    gap: "8px",
    width: "100%",
    containerType: "inline-size",
};

const OtpInputCell = styled("input", {
    shouldForwardProp: (prop) => prop !== "hasError",
})<{ hasError: boolean }>(({ theme, hasError }) => ({
    fontFamily: '"Outfit Variable", sans-serif',
    fontSize: "clamp(20px, 6.6cqi, 30px)",
    lineHeight: 1,
    fontWeight: 600,
    aspectRatio: "44 / 52",
    border: 0,
    borderRadius: "8px",
    boxSizing: "border-box",
    flex: "1 1 0",
    minWidth: 0,
    padding: 0,
    textAlign: "center",
    backgroundColor: theme.vars.palette.background.paper,
    color: theme.vars.palette.text.primary,
    boxShadow: `inset 0 0 0 1px ${
        hasError
            ? theme.vars.palette.critical.main
            : theme.vars.palette.stroke.faint
    }`,
    outline: 0,
    "&:focus": {
        boxShadow: hasError
            ? `inset 0 0 0 1px ${theme.vars.palette.critical.main}, 0 0 0 2px ${theme.vars.palette.accent.main}`
            : `inset 0 0 0 1px ${theme.vars.palette.accent.main}`,
    },
}));
