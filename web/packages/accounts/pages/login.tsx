import { AccountsPageContents } from "ente-accounts/components/layouts/centered-paper";
import {
    LoginContents,
    type LoginPresentationProps,
} from "ente-accounts/components/LoginContents";
import { savedPartialLocalUser } from "ente-accounts/services/accounts-db";
import { LoadingIndicator } from "ente-base/components/loaders";
import { customAPIHost } from "ente-base/origins";
import { useRouter } from "next/router";
import React, { useCallback, useEffect, useState } from "react";

export interface LoginPageProps {
    layout?: React.ComponentType<React.PropsWithChildren>;
    presentation?: React.ComponentType<LoginPresentationProps>;
}

const Page: React.FC<LoginPageProps> = ({
    layout: Layout = AccountsPageContents,
    presentation,
}) => {
    const [loading, setLoading] = useState(true);
    const [host, setHost] = useState<string | undefined>(undefined);

    const router = useRouter();

    useEffect(() => {
        void customAPIHost().then(setHost);
        if (savedPartialLocalUser()?.email) void router.replace("/verify");
        setLoading(false);
    }, [router]);

    const onSignUp = useCallback(() => void router.push("/signup"), [router]);

    return loading ? (
        <LoadingIndicator />
    ) : (
        <Layout>
            <LoginContents {...{ host, onSignUp, presentation }} />
        </Layout>
    );
};

export default Page;
