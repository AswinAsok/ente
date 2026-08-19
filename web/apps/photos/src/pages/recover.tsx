import { RecoverAccountForm } from "@/components/auth/forms/RecoveryForm";
import { PhotosAuthShell } from "@/components/PhotosAuthShell";
import AccountsRecoverPage from "ente-accounts/pages/recover";
import type React from "react";

function RecoverPage(): React.JSX.Element {
    return (
        <AccountsRecoverPage
            layout={PhotosAuthShell}
            presentation={RecoverAccountForm}
        />
    );
}

export default RecoverPage;
