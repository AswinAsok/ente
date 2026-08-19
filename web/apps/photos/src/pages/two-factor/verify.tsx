import { TwoFactorForm } from "@/components/auth/forms/TwoFactorForm";
import { PhotosAuthShell } from "@/components/PhotosAuthShell";
import AccountsTwoFactorVerifyPage from "ente-accounts/pages/two-factor/verify";
import type React from "react";

function TwoFactorVerifyPage(): React.JSX.Element {
    return (
        <AccountsTwoFactorVerifyPage
            layout={PhotosAuthShell}
            presentation={TwoFactorForm}
        />
    );
}

export default TwoFactorVerifyPage;
