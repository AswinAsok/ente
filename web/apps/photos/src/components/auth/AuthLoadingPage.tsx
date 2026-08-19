import { PhotosAuthShell } from "@/components/PhotosAuthShell";
import { CircularProgress, styled } from "@mui/material";
import type React from "react";

export function AuthLoadingPage(): React.JSX.Element {
    return (
        <PhotosAuthShell>
            <LoadingRoot>
                <CircularProgress
                    size={28}
                    sx={{ color: "var(--photos-auth-primary)" }}
                />
            </LoadingRoot>
        </PhotosAuthShell>
    );
}

const LoadingRoot = styled("div")({
    minHeight: "120px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
});
