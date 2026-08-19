import { Button } from "@/components/auth/primitives/Button";
import { Form } from "@/components/auth/primitives/Form";
import { FormFields } from "@/components/auth/primitives/FormFields";
import { FormFooter } from "@/components/auth/primitives/FormFooter";
import { ScreenHeader } from "@/components/auth/primitives/ScreenHeader";
import { TextField } from "@/components/auth/primitives/TextField";
import { TextLink } from "@/components/auth/primitives/TextLink";
import { styled } from "@mui/material";
import type { RecoverAccountPresentationProps } from "ente-accounts/pages/recover";
import type { TwoFactorRecoverPresentationProps } from "ente-accounts/pages/two-factor/recover";
import { pt } from "ente-base/i18n";
import log from "ente-base/log";
import { useFormik } from "formik";
import { t } from "i18next";
import type React from "react";

export function RecoverAccountForm(
    props: RecoverAccountPresentationProps,
): React.JSX.Element {
    return (
        <RecoveryForm
            {...props}
            title={t("recover_account")}
            subtitle={pt(
                "Enter the recovery key you saved when you created your account.",
            )}
        />
    );
}

export function RecoverTwoFactorForm(
    props: TwoFactorRecoverPresentationProps,
): React.JSX.Element {
    return (
        <RecoveryForm
            {...props}
            title={t("recover_two_factor")}
            subtitle={pt(
                "Enter your recovery key to regain access to your account.",
            )}
        />
    );
}

interface RecoveryFormProps extends RecoverAccountPresentationProps {
    title: React.ReactNode;
    subtitle: React.ReactNode;
}

function RecoveryForm({
    title,
    subtitle,
    onSubmit,
    onNoRecoveryKey,
    onBack,
}: RecoveryFormProps): React.JSX.Element {
    const formik = useFormik({
        initialValues: { recoveryKey: "" },
        onSubmit: async ({ recoveryKey }, { setFieldError }) => {
            function setRecoveryKeyError(message: string) {
                setFieldError("recoveryKey", message);
            }

            if (!recoveryKey) {
                setRecoveryKeyError(t("required"));
                return;
            }

            try {
                await onSubmit(recoveryKey, setRecoveryKeyError);
            } catch (error) {
                log.error("Failed to submit recovery key", error);
                setRecoveryKeyError(t("generic_error"));
            }
        },
    });

    return (
        <>
            <ScreenHeader title={title} subtitle={subtitle} />
            <Form onSubmit={formik.handleSubmit}>
                <FormFields>
                    <TextField
                        name="recoveryKey"
                        label={t("recovery_key")}
                        placeholder={pt("Paste your 24-word recovery key")}
                        value={formik.values.recoveryKey}
                        onChange={formik.handleChange}
                        autoComplete="off"
                        multiline
                        rows={5}
                        autoFocus
                        disabled={formik.isSubmitting}
                        error={Boolean(formik.errors.recoveryKey)}
                        helperText={formik.errors.recoveryKey}
                    />
                </FormFields>
                <FormFooter>
                    <Button
                        fullWidth
                        type="submit"
                        loading={formik.isSubmitting}
                    >
                        {t("recover")}
                    </Button>
                    <FooterLinks>
                        <TextLink onClick={onNoRecoveryKey}>
                            {t("no_recovery_key_title")}
                        </TextLink>
                        <TextLink onClick={onBack}>{t("go_back")}</TextLink>
                    </FooterLinks>
                </FormFooter>
            </Form>
        </>
    );
}

const FooterLinks = styled("div")({
    display: "flex",
    justifyContent: "space-between",
    gap: "16px",
});
