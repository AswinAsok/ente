import { AuthLoadingPage } from "@/components/auth/AuthLoadingPage";
import { RecoverTwoFactorForm } from "@/components/auth/forms/RecoveryForm";
import { PhotosAuthShell } from "@/components/PhotosAuthShell";
import AccountsTwoFactorRecoverPage from "ente-accounts/pages/two-factor/recover";
import type React from "react";

function PasskeyRecoverPage(): React.JSX.Element {
    return (
        <AccountsTwoFactorRecoverPage
            twoFactorType="passkey"
            layout={PhotosAuthShell}
            presentation={RecoverTwoFactorForm}
            loading={AuthLoadingPage}
        />
    );
}

export default PasskeyRecoverPage;
