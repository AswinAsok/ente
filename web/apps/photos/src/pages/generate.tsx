import { AuthLoadingPage } from "@/components/auth/AuthLoadingPage";
import { RecoveryKeyForm } from "@/components/auth/forms/RecoveryKeyForm";
import { SetPasswordForm } from "@/components/auth/forms/SetPasswordForm";
import { PhotosAuthShell } from "@/components/PhotosAuthShell";
import AccountsGeneratePage from "ente-accounts/pages/generate";
import type React from "react";

function GeneratePage(): React.JSX.Element {
    return (
        <AccountsGeneratePage
            layout={PhotosAuthShell}
            passwordPresentation={SetPasswordForm}
            recoveryKeyPresentation={RecoveryKeyForm}
            loading={AuthLoadingPage}
        />
    );
}

export default GeneratePage;
