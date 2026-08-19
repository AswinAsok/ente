import { AuthLoadingPage } from "@/components/auth/AuthLoadingPage";
import { PasskeyVerificationForm } from "@/components/auth/forms/PasskeyVerificationForm";
import { VerifyEmailForm } from "@/components/auth/forms/VerifyEmailForm";
import { PhotosAuthShell } from "@/components/PhotosAuthShell";
import AccountsVerifyPage from "ente-accounts/pages/verify";
import type React from "react";

function VerifyPage(): React.JSX.Element {
    return (
        <AccountsVerifyPage
            layout={PhotosAuthShell}
            presentation={VerifyEmailForm}
            passkeyPresentation={PasskeyVerificationForm}
            loading={AuthLoadingPage}
        />
    );
}

export default VerifyPage;
