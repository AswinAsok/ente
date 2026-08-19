import { Button } from "@/components/auth/primitives/Button";
import { Form } from "@/components/auth/primitives/Form";
import { FormFields } from "@/components/auth/primitives/FormFields";
import { FormFooter } from "@/components/auth/primitives/FormFooter";
import { Message } from "@/components/auth/primitives/Message";
import { OTPField } from "@/components/auth/primitives/OTPField";
import { ScreenHeader } from "@/components/auth/primitives/ScreenHeader";
import { TextLink } from "@/components/auth/primitives/TextLink";
import { styled } from "@mui/material";
import type { TwoFactorVerifyPresentationProps } from "ente-accounts/pages/two-factor/verify";
import { isHTTP401Error } from "ente-base/http";
import log from "ente-base/log";
import { useFormik } from "formik";
import { t } from "i18next";
import type React from "react";
import { useEffect } from "react";

export function TwoFactorForm({
    onSubmit,
    onRecover,
    onChangeEmail,
}: TwoFactorVerifyPresentationProps): React.JSX.Element {
    const {
        values,
        errors,
        handleSubmit,
        setFieldValue,
        submitForm,
        isSubmitting,
    } = useFormik({
        initialValues: { otp: "" },
        validateOnBlur: false,
        validateOnChange: false,
        onSubmit: async ({ otp }, { setFieldError, resetForm }) => {
            try {
                await onSubmit(otp);
                resetForm();
            } catch (error) {
                log.error("Failed to submit 2FA code", error);
                resetForm();
                setFieldError(
                    "otp",
                    isHTTP401Error(error)
                        ? t("incorrect_code")
                        : t("generic_error"),
                );
            }
        },
    });

    useEffect(() => {
        if (values.otp.length === 6 && !isSubmitting) {
            void submitForm();
        }
    }, [values.otp, isSubmitting, submitForm]);

    function handleCodeChange(otp: string) {
        void setFieldValue("otp", otp);
    }

    return (
        <>
            <ScreenHeader
                title={t("two_factor")}
                subtitle={t("enter_two_factor_otp")}
            />
            <Form onSubmit={handleSubmit}>
                <FormFields>
                    <OTPField
                        name="otp"
                        value={values.otp}
                        onChange={handleCodeChange}
                        error={Boolean(errors.otp)}
                        disabled={isSubmitting}
                        autoFocus
                    />
                    {errors.otp && <Message kind="error">{errors.otp}</Message>}
                </FormFields>
                <FormFooter>
                    <Button
                        fullWidth
                        type="submit"
                        loading={isSubmitting}
                        disabled={values.otp.length < 6}
                    >
                        {t("verify")}
                    </Button>
                    <FooterLinks>
                        <TextLink onClick={onRecover}>
                            {t("lost_2fa_device")}
                        </TextLink>
                        <TextLink onClick={onChangeEmail}>
                            {t("change_email")}
                        </TextLink>
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
