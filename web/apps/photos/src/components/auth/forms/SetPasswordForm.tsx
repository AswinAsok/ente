import { Button } from "@/components/auth/primitives/Button";
import { Form } from "@/components/auth/primitives/Form";
import { FormFields } from "@/components/auth/primitives/FormFields";
import { FormFooter } from "@/components/auth/primitives/FormFooter";
import {
    Message,
    type MessageKind,
} from "@/components/auth/primitives/Message";
import { ScreenHeader } from "@/components/auth/primitives/ScreenHeader";
import { TextField } from "@/components/auth/primitives/TextField";
import { styled } from "@mui/material";
import type { NewPasswordPresentationProps } from "ente-accounts/components/NewPasswordForm";
import { estimatePasswordStrength } from "ente-accounts/utils/password";
import { pt } from "ente-base/i18n";
import { t } from "i18next";
import type React from "react";

export function SetPasswordForm({
    userEmail,
    password,
    confirmPassword,
    passwordError,
    confirmPasswordError,
    isSubmitting,
    isSubmitDisabled,
    submitButtonTitle,
    onPasswordChange,
    onConfirmPasswordChange,
    onSubmit,
}: NewPasswordPresentationProps): React.JSX.Element {
    const passwordStrength = password
        ? estimatePasswordStrength(password)
        : undefined;
    const passwordStrengthKind: MessageKind | undefined = passwordStrength
        ? passwordStrength === "weak"
            ? "error"
            : passwordStrength === "moderate"
              ? "warning"
              : "success"
        : undefined;

    return (
        <>
            <ScreenHeader
                title={t("set_password")}
                subtitle={pt(
                    "We don't store your password. If you forget it, the only way back to your photos is your recovery key.",
                )}
            />
            <Form onSubmit={onSubmit}>
                <HiddenEmail
                    name="email"
                    type="email"
                    autoComplete="username"
                    value={userEmail}
                    readOnly
                    tabIndex={-1}
                />
                <FormFields>
                    <PasswordField>
                        <TextField
                            name="password"
                            label={t("password")}
                            placeholder={pt("Choose a strong password")}
                            autoComplete="new-password"
                            showPasswordToggle
                            value={password}
                            onChange={onPasswordChange}
                            error={Boolean(passwordError)}
                            helperText={passwordError}
                            disabled={isSubmitting}
                            autoFocus
                        />
                        {passwordStrength && passwordStrengthKind && (
                            <Message kind={passwordStrengthKind}>
                                {t("password_strength", {
                                    context: passwordStrength,
                                })}
                            </Message>
                        )}
                    </PasswordField>
                    <TextField
                        name="confirmPassword"
                        label={t("confirm_password")}
                        placeholder={pt("Type it once more")}
                        autoComplete="new-password"
                        showPasswordToggle
                        value={confirmPassword}
                        onChange={onConfirmPasswordChange}
                        error={Boolean(confirmPasswordError)}
                        helperText={confirmPasswordError}
                        disabled={isSubmitting}
                    />
                </FormFields>
                <FormFooter>
                    <Button
                        fullWidth
                        type="submit"
                        loading={isSubmitting}
                        disabled={isSubmitDisabled}
                    >
                        {submitButtonTitle}
                    </Button>
                    {isSubmitting && (
                        <SubmittingMessage>
                            <Message>{t("key_generation_in_progress")}</Message>
                        </SubmittingMessage>
                    )}
                </FormFooter>
            </Form>
        </>
    );
}

const HiddenEmail = styled("input")({ display: "none" });

const PasswordField = styled("div")({
    display: "flex",
    flexDirection: "column",
    gap: "8px",
});

const SubmittingMessage = styled("div")({
    display: "flex",
    justifyContent: "center",
});
