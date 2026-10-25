import CloseIcon from "@mui/icons-material/Close";
import SearchIcon from "@mui/icons-material/Search";
import {
    Box,
    ButtonBase,
    CircularProgress,
    Drawer,
    IconButton,
    InputBase,
    Stack,
    Typography,
    styled,
} from "@mui/material";
import type { ModalVisibilityProps } from "ente-base/components/utils/modal";
import { ut } from "ente-base/i18n";
import log from "ente-base/log";
import type { EnteFile } from "ente-media/file";
import { ItemCard } from "ente-new/photos/components/Tiles";
import { placesForFiles } from "ente-new/photos/services/search";
import type { LibraryPlace } from "ente-new/photos/services/search/types";
import { useEffect, useState } from "react";

export const PlacesSidebar: React.FC<{
    files: EnteFile[];
    selectedPlace: LibraryPlace | undefined;
    onSelectPlace: (place: LibraryPlace | undefined) => void;
    mobile: boolean;
    mobileDrawerProps: ModalVisibilityProps;
}> = ({ files, selectedPlace, onSelectPlace, mobile, mobileDrawerProps }) => {
    const [query, setQuery] = useState("");
    const [places, setPlaces] = useState<LibraryPlace[]>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setFailed(false);
        void placesForFiles(files)
            .then((places) => {
                if (!cancelled) setPlaces(places);
            })
            .catch((e: unknown) => {
                log.warn("Failed to load library places", e);
                if (!cancelled) setFailed(true);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [files]);
    const select = (place: LibraryPlace | undefined) => {
        onSelectPlace(place);
        mobileDrawerProps.onClose();
    };
    const matchingPlaces = places.filter((place) =>
        place.name
            .toLocaleLowerCase()
            .includes(query.trim().toLocaleLowerCase()),
    );
    const content = (
        <Stack sx={{ height: "100%", minHeight: 0, px: "16px", gap: "16px" }}>
            <Stack
                direction="row"
                sx={{ alignItems: "center", justifyContent: "space-between" }}
            >
                <Typography
                    component="h2"
                    sx={{
                        fontFamily: '"Outfit Variable", sans-serif',
                        fontWeight: 600,
                        fontSize: 24,
                        lineHeight: "32px",
                    }}
                >
                    {ut("Places")}
                </Typography>
                {mobile && (
                    <IconButton
                        aria-label={ut("Close")}
                        onClick={mobileDrawerProps.onClose}
                    >
                        <CloseIcon />
                    </IconButton>
                )}
            </Stack>
            <Stack
                direction="row"
                sx={{
                    alignItems: "center",
                    bgcolor: "background.paper",
                    height: 52,
                    flexShrink: 0,
                    borderRadius: "16px",
                    px: "16px",
                    gap: "8px",
                }}
            >
                <SearchIcon sx={{ fontSize: 18, color: "text.muted" }} />
                <InputBase
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={ut("Search in Places")}
                    inputProps={{ "aria-label": ut("Search in Places") }}
                    sx={{ flex: 1, minWidth: 0, fontSize: 14 }}
                />
            </Stack>
            <Stack
                sx={{ overflowY: "auto", minHeight: 0, gap: "8px", pb: "16px" }}
            >
                <PlaceRow
                    selected={!selectedPlace}
                    onClick={() => select(undefined)}
                >
                    <Box
                        sx={{
                            width: 36,
                            height: 36,
                            position: "relative",
                            overflow: "hidden",
                            flexShrink: 0,
                        }}
                    >
                        <Box
                            component="img"
                            src="/images/places-map.png"
                            alt=""
                            sx={{
                                position: "absolute",
                                width: "123.53%",
                                height: "123.53%",
                                left: "-11.76%",
                                top: "-11.76%",
                            }}
                        />
                    </Box>
                    <PlaceName>{ut("Your map")}</PlaceName>
                </PlaceRow>
                {loading ? (
                    <Box role="status" sx={{ p: 2, textAlign: "center" }}>
                        <CircularProgress
                            size={20}
                            aria-label={ut("Loading places")}
                        />
                    </Box>
                ) : failed ? (
                    <Typography
                        role="status"
                        sx={{ p: 1.5, fontSize: 14, color: "text.muted" }}
                    >
                        {ut("Unable to load places. Please try again later.")}
                    </Typography>
                ) : matchingPlaces.length ? (
                    matchingPlaces.map((place) => (
                        <PlaceRow
                            key={place.id}
                            selected={place.id === selectedPlace?.id}
                            onClick={() => select(place)}
                        >
                            <ItemCard
                                TileComponent={PlaceThumbnail}
                                coverFile={place.coverFile}
                            />
                            <PlaceName>{place.name}</PlaceName>
                        </PlaceRow>
                    ))
                ) : (
                    <Typography
                        role="status"
                        sx={{ p: 1.5, fontSize: 14, color: "text.muted" }}
                    >
                        {query.trim()
                            ? ut("No places found")
                            : ut(
                                  "Places from your geotagged photos will appear here",
                              )}
                    </Typography>
                )}
            </Stack>
        </Stack>
    );
    return mobile ? (
        <Drawer
            {...mobileDrawerProps}
            anchor="left"
            slotProps={{
                paper: {
                    sx: {
                        width: "100%",
                        py: "16px",
                        bgcolor: "background.default",
                    },
                },
            }}
        >
            {content}
        </Drawer>
    ) : (
        content
    );
};

const PlaceRow = styled(ButtonBase, {
    shouldForwardProp: (prop) => prop !== "selected",
})<{ selected: boolean }>(({ theme, selected }) => ({
    width: "100%",
    minHeight: 48,
    flexShrink: 0,
    padding: "6px 12px",
    borderRadius: 12,
    display: "flex",
    justifyContent: "flex-start",
    gap: 12,
    textAlign: "left",
    backgroundColor: selected
        ? theme.vars.palette.background.paper
        : "transparent",
    "&:hover": { backgroundColor: theme.vars.palette.fill.faint },
    "&.Mui-focusVisible": {
        outline: `2px solid ${theme.vars.palette.accent.main}`,
        outlineOffset: -2,
    },
}));
const PlaceThumbnail = styled("div")({
    width: 36,
    height: 36,
    flexShrink: 0,
    borderRadius: 12,
    overflow: "hidden",
    "& > img": { width: "100%", height: "100%", objectFit: "cover" },
});

const PlaceName = styled(Typography)(({ theme }) => ({
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontFamily: '"Inter Variable", Inter, sans-serif',
    fontSize: 14,
    fontWeight: 500,
    lineHeight: "20px",
    letterSpacing: 0,
    [theme.breakpoints.down("md")]: { fontSize: 13 },
}));
