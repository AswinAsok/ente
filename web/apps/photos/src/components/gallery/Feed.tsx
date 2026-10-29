import { buildFeedItems, type FeedItem } from "@/services/feed";
import {
    Add01Icon,
    ArrowTurnBackwardIcon,
    BubbleChatIcon,
    FavouriteIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
    Alert,
    Avatar,
    Box,
    Button,
    CircularProgress,
    Stack,
    styled,
    Typography,
} from "@mui/material";
import { ut } from "ente-base/i18n";
import log from "ente-base/log";
import { useResolvedContactAvatar } from "ente-contacts";
import { getAvatarColor } from "ente-gallery/utils/avatar-colors";
import type { Collection } from "ente-media/collection";
import type { EnteFile } from "ente-media/file";
import { ItemCard } from "ente-new/photos/components/Tiles";
import { FocusVisibleUnstyledButton } from "ente-new/photos/components/UnstyledButton";
import {
    getAnonProfiles,
    getCollectionSocialActivity,
    getSocialActivityCollectionIDs,
} from "ente-new/photos/services/social";
import { useEffect, useMemo, useState } from "react";

type SocialActivity = Awaited<ReturnType<typeof getCollectionSocialActivity>>;

export interface FeedProps {
    collections: Collection[];
    files: EnteFile[];
    userID: number;
    onOpenItem: (item: FeedItem) => void;
}

export const Feed = ({
    collections,
    files,
    userID,
    onOpenItem,
    onShareAlbum,
}: FeedProps & { onShareAlbum: () => void }) => {
    const [activity, setActivity] = useState<SocialActivity>({
        comments: [],
        reactions: [],
    });
    const [anonNames, setAnonNames] = useState(new Map<string, string>());
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [revision, setRevision] = useState(0);
    const [limit, setLimit] = useState(50);
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            setFailed(false);
            const comments: SocialActivity["comments"] = [];
            const reactions: SocialActivity["reactions"] = [];
            const names = new Map<string, string>();
            let hasFailure = false;
            let activityCollections = collections;
            try {
                const collectionIDs = await getSocialActivityCollectionIDs();
                activityCollections = collections.filter(({ id }) =>
                    collectionIDs.has(id),
                );
            } catch (error) {
                // Older servers can still serve individual collection diffs.
                log.warn("Could not load social update summary", error);
            }
            // Bound concurrent collection requests for accounts with many albums.
            for (
                let offset = 0;
                offset < activityCollections.length;
                offset += 4
            ) {
                if (cancelled) return;
                await Promise.all(
                    activityCollections
                        .slice(offset, offset + 4)
                        .map(async (collection) => {
                            try {
                                const data = await getCollectionSocialActivity(
                                    collection.id,
                                    collection.key,
                                );
                                comments.push(...data.comments);
                                reactions.push(...data.reactions);
                                if (
                                    [...data.comments, ...data.reactions].some(
                                        (item) => item.anonUserID,
                                    )
                                ) {
                                    try {
                                        const profiles = await getAnonProfiles(
                                            collection.id,
                                            collection.key,
                                        );
                                        for (const [id, name] of profiles)
                                            names.set(
                                                `${collection.id}:${id}`,
                                                name,
                                            );
                                    } catch (error) {
                                        log.warn(
                                            "Could not load feed participant names",
                                            error,
                                        );
                                    }
                                }
                            } catch (error) {
                                hasFailure = true;
                                log.warn(
                                    "Could not load collection feed",
                                    error,
                                );
                            }
                        }),
                );
            }
            if (cancelled) return;
            setActivity({ comments, reactions });
            setAnonNames(names);
            setFailed(hasFailure);
            setLoading(false);
        };
        void load();
        return () => {
            cancelled = true;
        };
    }, [collections, revision]);
    const items = useMemo(
        () =>
            buildFeedItems(
                collections,
                files,
                activity.comments,
                activity.reactions,
                userID,
            ),
        [collections, files, activity, userID],
    );
    const collectionsByID = useMemo(
        () =>
            new Map(
                collections.map((collection) => [collection.id, collection]),
            ),
        [collections],
    );
    return (
        <Stack
            component="section"
            aria-label={ut("Feed")}
            sx={{
                height: "100%",
                minHeight: 0,
                overflowY: "auto",
                p: { xs: "20px 15px", md: "36px" },
            }}
            aria-busy={loading}
        >
            <Stack
                sx={{
                    width: "100%",
                    maxWidth: 600,
                    mx: "auto",
                    gap: "24px",
                    pb: 4,
                    flex: 1,
                }}
            >
                <Stack
                    direction="row"
                    sx={{
                        alignItems: "center",
                        justifyContent: "space-between",
                        height: 54,
                        flexShrink: 0,
                    }}
                >
                    <Typography
                        component="h1"
                        variant="h3"
                        sx={{
                            fontFamily: '"Outfit Variable", Outfit, sans-serif',
                            lineHeight: "32px",
                        }}
                    >
                        {ut("Feed")}
                    </Typography>
                </Stack>
                {loading ? (
                    <Stack
                        role="status"
                        sx={{
                            flex: 1,
                            alignItems: "center",
                            justifyContent: "center",
                            minHeight: 200,
                        }}
                    >
                        <CircularProgress
                            size={24}
                            aria-label={ut("Loading feed…")}
                        />
                    </Stack>
                ) : (
                    <>
                        {failed && (
                            <Alert
                                severity="warning"
                                action={
                                    <Button
                                        color="inherit"
                                        onClick={() =>
                                            setRevision((value) => value + 1)
                                        }
                                    >
                                        {ut("Retry")}
                                    </Button>
                                }
                            >
                                {ut("Some activity could not be loaded.")}
                            </Alert>
                        )}
                        {!items.length && !failed && (
                            <Stack
                                role="status"
                                sx={{
                                    flex: 1,
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: 2,
                                    py: 6,
                                    textAlign: "center",
                                }}
                            >
                                <Box
                                    component="img"
                                    src="/images/feed-empty.png"
                                    alt=""
                                    sx={{ height: 122, width: "auto", mb: 1 }}
                                />
                                <Typography variant="h4">
                                    {ut("Share your memories")}
                                </Typography>
                                <Typography color="text.secondary">
                                    {ut(
                                        "Loved ones can view, react and add comments, without an account.",
                                    )}
                                </Typography>
                                <Button
                                    variant="contained"
                                    onClick={onShareAlbum}
                                >
                                    {ut("Share an album")}
                                </Button>
                            </Stack>
                        )}
                        {items.slice(0, limit).map((item) => (
                            <FeedRow
                                key={item.id}
                                item={item}
                                collection={collectionsByID.get(
                                    item.collectionID,
                                )!}
                                anonNames={anonNames}
                                userID={userID}
                                onOpenItem={onOpenItem}
                            />
                        ))}
                        {items.length > limit && (
                            <Button
                                fullWidth
                                onClick={() => setLimit((value) => value + 50)}
                            >
                                {ut("Show more")}
                            </Button>
                        )}
                    </>
                )}
            </Stack>
        </Stack>
    );
};

const FeedRow = ({
    item,
    collection,
    anonNames,
    userID,
    onOpenItem,
}: {
    item: FeedItem;
    collection: Collection;
    anonNames: Map<string, string>;
    userID: number;
    onOpenItem: (item: FeedItem) => void;
}) => {
    const shared = item.type == "album" || item.type == "photos";
    const actors = item.actors ?? [
        { userID: item.actorUserID, anonID: item.actorAnonID },
    ];
    const person =
        item.actorUserID == collection.owner.id
            ? collection.owner
            : collection.sharees.find(({ id }) => id == item.actorUserID);
    const contact = useResolvedContactAvatar({
        userID: item.actorAnonID ? undefined : item.actorUserID,
        email: person?.email,
    });
    const actor = item.actorAnonID
        ? (anonNames.get(`${item.collectionID}:${item.actorAnonID}`) ??
          ut("Guest"))
        : contact.primaryLabel;
    const own = item.file?.ownerID == userID;
    const action =
        item.type == "like"
            ? own
                ? ut("liked your photo")
                : ut("liked a photo")
            : item.type == "comment-like"
              ? ut("liked your comment")
              : item.type == "reply-like"
                ? ut("liked your reply")
                : item.type == "reply"
                  ? ut("replied to a comment")
                  : own
                    ? ut("commented on your photo")
                    : ut("commented on a photo");
    const sharedFiles = item.sharedFiles ?? (item.file ? [item.file] : []);
    const openHeader = () =>
        onOpenItem(shared ? { ...item, type: "album" } : item);
    return (
        <Stack
            component="article"
            direction="row"
            sx={{
                position: "relative",
                gap: "10px",
                minHeight: 73,
                flexShrink: 0,
                alignItems: "flex-start",
            }}
        >
            <Box
                aria-hidden
                sx={{
                    position: "relative",
                    width: 32,
                    height: 32,
                    flexShrink: 0,
                    bgcolor: "fill.faint",
                    borderRadius: "50%",
                    display: "grid",
                    placeItems: "center",
                    color: "text.secondary",
                }}
            >
                <ActivityIcon type={item.type} />
            </Box>
            <Stack sx={{ flex: 1, minWidth: 0, gap: "12px" }}>
                <Stack
                    direction="row"
                    sx={{ alignItems: "flex-start", gap: "12px" }}
                >
                    <FocusVisibleUnstyledButton
                        onClick={openHeader}
                        sx={{
                            flex: 1,
                            minWidth: 0,
                            textAlign: "left",
                            color: "text.primary",
                        }}
                    >
                        <Stack
                            component="span"
                            sx={{ alignItems: "flex-start", gap: "4px" }}
                        >
                            <Stack
                                component="span"
                                direction="row"
                                sx={{ height: 32, alignItems: "center" }}
                            >
                                {actors.slice(0, 2).map((entry) => (
                                    <ActorAvatar
                                        key={`${entry.userID}:${entry.anonID ?? ""}`}
                                        actor={entry}
                                        collection={collection}
                                        anonNames={anonNames}
                                    />
                                ))}
                            </Stack>
                            <Typography
                                component="span"
                                variant="small"
                                noWrap
                                sx={{
                                    maxWidth: "100%",
                                    fontWeight: 600,
                                    lineHeight: "17.81px",
                                }}
                            >
                                <Box
                                    component="span"
                                    sx={{
                                        display: "inline-block",
                                        verticalAlign: "bottom",
                                        maxWidth: shared
                                            ? "100%"
                                            : actors.length > 1
                                              ? 70
                                              : 175,
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                    }}
                                >
                                    {actor}
                                </Box>
                                {actors.length > 1 && (
                                    <Box
                                        component="span"
                                        sx={{
                                            fontWeight: 500,
                                            color: "text.secondary",
                                        }}
                                    >
                                        {" "}
                                        {actors.length == 2 ? (
                                            <>
                                                {ut("and")}{" "}
                                                <Box
                                                    component="span"
                                                    sx={{
                                                        color: "text.base",
                                                        fontWeight: 600,
                                                    }}
                                                >
                                                    {ut("1 other")}
                                                </Box>
                                            </>
                                        ) : (
                                            ut("and {{count}} others").replace(
                                                "{{count}}",
                                                String(actors.length - 1),
                                            )
                                        )}
                                    </Box>
                                )}
                            </Typography>
                            <Typography
                                component="span"
                                variant="mini"
                                sx={{
                                    color: "text.muted",
                                    fontWeight: 500,
                                    lineHeight: "17.81px",
                                }}
                            >
                                {shared ? (
                                    <>
                                        {item.type == "album"
                                            ? ut("shared")
                                            : item.photoCount == 1
                                              ? ut("added a memory to")
                                              : ut(
                                                    "added {{count}} memories to",
                                                ).replace(
                                                    "{{count}}",
                                                    String(item.photoCount),
                                                )}{" "}
                                        <Box
                                            component="span"
                                            sx={{
                                                color: "text.base",
                                                fontWeight: 700,
                                            }}
                                        >
                                            {collection.name}
                                        </Box>
                                        {item.type == "album"
                                            ? ` ${ut("with you")}`
                                            : ""}
                                    </>
                                ) : (
                                    action
                                )}
                            </Typography>
                        </Stack>
                    </FocusVisibleUnstyledButton>
                    {!shared && item.file && (
                        <FocusVisibleUnstyledButton
                            aria-label={ut("Open photo")}
                            onClick={() => onOpenItem(item)}
                            sx={{
                                width: 66,
                                height: 66,
                                flexShrink: 0,
                                borderRadius: "8px",
                                overflow: "hidden",
                            }}
                        >
                            <ItemCard
                                TileComponent={PhotoTile}
                                coverFile={item.file}
                            />
                        </FocusVisibleUnstyledButton>
                    )}
                </Stack>
                {shared && sharedFiles.length > 0 && (
                    <SharedPhotoGrid
                        item={item}
                        files={sharedFiles}
                        onOpenItem={onOpenItem}
                    />
                )}
            </Stack>
        </Stack>
    );
};

const ActorAvatar = ({
    actor,
    collection,
    anonNames,
}: {
    actor: { userID: number; anonID?: string };
    collection: Collection;
    anonNames: Map<string, string>;
}) => {
    const person =
        actor.userID == collection.owner.id
            ? collection.owner
            : collection.sharees.find(({ id }) => id == actor.userID);
    const contact = useResolvedContactAvatar({
        userID: actor.anonID ? undefined : actor.userID,
        email: person?.email,
    });
    const label = actor.anonID
        ? (anonNames.get(`${collection.id}:${actor.anonID}`) ?? ut("Guest"))
        : contact.primaryLabel;
    return (
        <Avatar
            alt={label}
            src={actor.anonID ? undefined : contact.avatarURL}
            sx={{
                width: 28,
                height: 28,
                fontSize: 12,
                fontWeight: 500,
                bgcolor: getAvatarColor(person?.email ?? label),
                color: "white",
                border: "1px solid",
                borderColor: "background.default",
                "& + &": { ml: "-7px" },
            }}
        >
            {label.slice(0, 1).toUpperCase()}
        </Avatar>
    );
};

const ActivityIcon = ({ type }: { type: FeedItem["type"] }) => {
    const icon =
        type == "like"
            ? FavouriteIcon
            : type == "photos" || type == "album"
              ? Add01Icon
              : type == "reply" || type == "reply-like"
                ? ArrowTurnBackwardIcon
                : BubbleChatIcon;
    return (
        <Box
            sx={{
                position: "relative",
                display: "flex",
                color: type == "like" ? "#08C225" : "text.base",
            }}
        >
            <HugeiconsIcon
                icon={icon}
                size={18}
                strokeWidth={1.8}
                fill={type == "like" ? "currentColor" : "none"}
            />
            {(type == "comment-like" || type == "reply-like") && (
                <Box
                    sx={{
                        position: "absolute",
                        right: -2,
                        bottom: -2,
                        display: "flex",
                        color: "#08C225",
                    }}
                >
                    <HugeiconsIcon
                        icon={FavouriteIcon}
                        size={10}
                        strokeWidth={1.8}
                        fill="currentColor"
                    />
                </Box>
            )}
        </Box>
    );
};

const SharedPhotoGrid = ({
    item,
    files,
    onOpenItem,
}: {
    item: FeedItem;
    files: EnteFile[];
    onOpenItem: (item: FeedItem) => void;
}) => {
    const visibleFiles = files.slice(0, 4);
    const count = visibleFiles.length;
    return (
        <Box
            sx={{
                width: "100%",
                maxWidth: 300,
                aspectRatio: "1",
                display: "grid",
                gridTemplateColumns: count < 3 ? "1fr" : "1fr 1fr",
                gridTemplateRows: count == 1 ? "1fr" : "1fr 1fr",
                gap: "2px",
                border: "1px solid",
                borderColor: "divider",
                borderRadius: "13px",
                overflow: "hidden",
            }}
        >
            {visibleFiles.map((file, index) => (
                <Box
                    key={file.id}
                    sx={{
                        position: "relative",
                        minHeight: 0,
                        minWidth: 0,
                        gridColumn:
                            count == 3 && index == 2 ? "span 2" : undefined,
                    }}
                >
                    <FocusVisibleUnstyledButton
                        aria-label={ut("Open photo")}
                        onClick={() =>
                            onOpenItem({ ...item, type: "photos", file })
                        }
                        sx={{ display: "block", width: "100%", height: "100%" }}
                    >
                        <ItemCard TileComponent={PhotoTile} coverFile={file} />
                    </FocusVisibleUnstyledButton>
                    {index == 3 && files.length > 4 && (
                        <FocusVisibleUnstyledButton
                            aria-label={ut("Open album")}
                            onClick={() =>
                                onOpenItem({ ...item, type: "album" })
                            }
                            sx={{
                                position: "absolute",
                                bottom: 6,
                                right: 6,
                                bgcolor: "rgba(0,0,0,.6)",
                                borderRadius: "100px",
                                color: "white",
                                px: "8px",
                                py: "4px",
                                fontSize: 13,
                                fontWeight: 600,
                            }}
                        >
                            +{files.length - 4}
                        </FocusVisibleUnstyledButton>
                    )}
                </Box>
            ))}
        </Box>
    );
};

const PhotoTile = styled("div")({
    width: "100%",
    height: "100%",
    overflow: "hidden",
    "& > img": {
        width: "100%",
        height: "100%",
        objectFit: "cover",
        display: "block",
    },
});
