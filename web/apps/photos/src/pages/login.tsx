import { LoginForm } from "@/components/auth/forms/LoginForm";
import { PhotosAuthShell } from "@/components/PhotosAuthShell";
import AccountsLoginPage from "ente-accounts/pages/login";
import type React from "react";

function LoginPage(): React.JSX.Element {
    return (
        <AccountsLoginPage layout={PhotosAuthShell} presentation={LoginForm} />
    );
}

export default LoginPage;
