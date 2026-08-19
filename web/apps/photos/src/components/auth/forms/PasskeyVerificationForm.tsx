import { Button } from "@/components/auth/primitives/Button";
import { FormFooter } from "@/components/auth/primitives/FormFooter";
import { Message } from "@/components/auth/primitives/Message";
import { ScreenHeader } from "@/components/auth/primitives/ScreenHeader";
import { TextLink } from "@/components/auth/primitives/TextLink";
import { CircularProgress, styled } from "@mui/material";
import type { VerifyingPasskeyPresentationProps } from "ente-accounts/components/LoginComponents";
import { pt } from "ente-base/i18n";
import { t } from "i18next";
import type React from "react";

export function PasskeyVerificationForm({
    email,
    verificationStatus,
    onRetry,
    onCheckStatus,
    onRecover,
    onChangeEmail,
}: VerifyingPasskeyPresentationProps): React.JSX.Element {
    const statusText =
        verificationStatus === "waiting"
            ? t("waiting_for_verification")
            : verificationStatus === "pending"
              ? t("verification_still_pending")
              : pt("Checking verification status…");

    return (
        <>
            <ScreenHeader title={pt("Verify your passkey")} subtitle={email} />
            <Status>
                {verificationStatus === "checking" && (
                    <CircularProgress
                        size={20}
                        sx={{ color: "var(--photos-auth-primary)" }}
                    />
                )}
                <Message>{statusText}</Message>
            </Status>
            <FormFooter>
                <Actions>
                    <Button fullWidth variant="secondary" onClick={onRetry}>
                        {t("try_again")}
                    </Button>
                    <Button fullWidth onClick={onCheckStatus}>
                        {t("check_status")}
                    </Button>
                </Actions>
                <FooterLinks>
                    <TextLink onClick={onRecover}>
                        {t("recover_account")}
                    </TextLink>
                    <TextLink onClick={onChangeEmail}>
                        {t("change_email")}
                    </TextLink>
                </FooterLinks>
            </FormFooter>
        </>
    );
}

const Status = styled("div")({
    minHeight: "52px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
});

const Actions = styled("div")({ display: "flex", gap: "12px" });

const FooterLinks = styled("div")({
    display: "flex",
    justifyContent: "space-between",
    gap: "16px",
});
