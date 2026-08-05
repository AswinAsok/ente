import CloseIcon from "@mui/icons-material/Close";
import SearchIcon from "@mui/icons-material/Search";
import {
    Dialog,
    InputAdornment,
    TextField,
    styled,
    type TextFieldProps,
} from "@mui/material";
import { useEffect, useRef } from "react";

export const AllItemsDialogColumnBreakpoint = 559;

export const AllItemsDialog = styled(Dialog)(({ theme }) => ({
    "& .MuiDialog-container": { justifyContent: "flex-end" },
    "& .MuiPaper-root": { maxWidth: "494px" },
    "& .MuiDialogTitle-root": { padding: theme.spacing(2) },
    "& .MuiDialogContent-root": { padding: theme.spacing(2) },
    [theme.breakpoints.down(AllItemsDialogColumnBreakpoint)]: {
        "& .MuiPaper-root": { width: "324px" },
        "& .MuiDialogContent-root": { padding: 6 },
    },
}));

interface AllItemsSearchFieldProps {
    placeholder: string;
    value: string;
    onChange: (value: string) => void;
    selectOnMount?: boolean;
}

export function AllItemsSearchField({
    placeholder,
    value,
    onChange,
    selectOnMount,
}: AllItemsSearchFieldProps) {
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!selectOnMount) return;

        const timeout = window.setTimeout(() => {
            inputRef.current?.focus();
            inputRef.current?.select();
        }, 0);

        return () => window.clearTimeout(timeout);
    }, [selectOnMount]);

    const handleChange: TextFieldProps["onChange"] = (event) => {
        onChange(event.target.value);
    };

    const handleClear = () => {
        onChange("");
        inputRef.current?.focus();
    };

    return (
        <TextField
            inputRef={inputRef}
            fullWidth
            size="small"
            placeholder={placeholder}
            value={value}
            onChange={handleChange}
            autoFocus
            slotProps={{
                input: {
                    startAdornment: (
                        <InputAdornment position="start">
                            <SearchIcon />
                        </InputAdornment>
                    ),
                    endAdornment: value && (
                        <InputAdornment
                            position="end"
                            sx={{ marginRight: "0 !important" }}
                        >
                            <CloseIcon
                                fontSize="small"
                                onClick={handleClear}
                                sx={{
                                    color: "stroke.muted",
                                    cursor: "pointer",
                                    "&:hover": { color: "text.base" },
                                }}
                            />
                        </InputAdornment>
                    ),
                },
            }}
            sx={{
                "& .MuiOutlinedInput-root": {
                    backgroundColor: "background.searchInput",
                    borderColor: "transparent",
                    "&:hover": { borderColor: "accent.light" },
                    "&.Mui-focused": {
                        borderColor: "accent.main",
                        boxShadow: "none",
                    },
                },
                "& .MuiInputBase-input": {
                    color: "text.base",
                    paddingTop: "8.5px !important",
                    paddingBottom: "8.5px !important",
                },
                "& .MuiInputAdornment-root": {
                    color: "stroke.muted",
                    marginTop: "0 !important",
                    marginRight: "8px",
                },
                "& .MuiOutlinedInput-notchedOutline": {
                    borderColor: "transparent",
                },
                "& .MuiInputBase-input::placeholder": {
                    color: "text.muted",
                    opacity: 1,
                },
            }}
        />
    );
}
