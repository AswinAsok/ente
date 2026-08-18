import {
    LoadingButton,
    type LoadingButtonProps,
} from "ente-base/components/mui/LoadingButton";

export type ButtonProps = LoadingButtonProps;

export function Button({ variant = "v2", ...props }: ButtonProps) {
    return <LoadingButton variant={variant} {...props} />;
}
