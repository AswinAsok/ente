import { SignUpForm } from "@/components/auth/SignUpForm";
import { PhotosAuthShell } from "@/components/PhotosAuthShell";
import AccountsSignUpPage from "ente-accounts/pages/signup";
import type React from "react";

function SignUpPage(): React.JSX.Element {
    return (
        <AccountsSignUpPage
            layout={PhotosAuthShell}
            presentation={SignUpForm}
        />
    );
}

export default SignUpPage;
