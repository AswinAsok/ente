import { LoginForm } from "@/components/auth/LoginForm";
import { PhotosAuthShell } from "@/components/PhotosAuthShell";
import AccountsLoginPage from "ente-accounts/pages/login";
import type React from "react";

function LoginPage(): React.JSX.Element {
    return (
        <AccountsLoginPage layout={PhotosAuthShell} presentation={LoginForm} />
    );
}

export default LoginPage;
