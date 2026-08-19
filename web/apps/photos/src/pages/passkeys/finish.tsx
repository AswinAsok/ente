import { AuthLoadingPage } from "@/components/auth/AuthLoadingPage";
import AccountsPasskeyFinishPage from "ente-accounts/pages/passkeys/finish";
import type React from "react";

function PasskeyFinishPage(): React.JSX.Element {
    return <AccountsPasskeyFinishPage loading={AuthLoadingPage} />;
}

export default PasskeyFinishPage;
