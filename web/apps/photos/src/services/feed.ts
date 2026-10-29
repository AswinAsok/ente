import type { Collection } from "ente-media/collection";
import type { EnteFile } from "ente-media/file";
import type { Comment } from "ente-new/photos/services/comment";
import type { UnifiedReaction } from "ente-new/photos/services/social";

export interface FeedItem {
    id: string;
    type:
        | "like"
        | "comment"
        | "reply"
        | "comment-like"
        | "reply-like"
        | "album"
        | "photos";
    collectionID: number;
    file?: EnteFile;
    commentID?: string;
    photoCount?: number;
    sharedFiles?: EnteFile[];
    actors?: { userID: number; anonID?: string }[];
    actorUserID: number;
    actorAnonID?: string;
    text?: string;
    createdAt: number;
}

/** Only visible collection memberships may resolve a feed item's photo. */
export const buildFeedItems = (
    collections: Collection[],
    files: EnteFile[],
    comments: Comment[],
    reactions: UnifiedReaction[],
    userID: number,
): FeedItem[] => {
    const filesByMembership = new Map(
        files.map((file) => [`${file.collectionID}:${file.id}`, file]),
    );
    const collectionIDs = new Set(collections.map(({ id }) => id));
    const commentsByID = new Map(
        comments.map((comment) => [comment.id, comment]),
    );
    const items: FeedItem[] = [];
    for (const collection of collections) {
        if (collection.owner.id != userID && collection.sharedAt) {
            items.push({
                id: `album:${collection.id}`,
                type: "album",
                collectionID: collection.id,
                actorUserID: collection.owner.id,
                createdAt: collection.sharedAt,
                file: files.find((file) => file.collectionID == collection.id),
                sharedFiles: files.filter(
                    (file) =>
                        file.collectionID == collection.id &&
                        (!file.collectionAddedAt ||
                            file.collectionAddedAt <= collection.sharedAt!),
                ),
            });
        }
    }
    const collectionsByID = new Map(
        collections.map((collection) => [collection.id, collection]),
    );
    const sharedFiles = files
        .filter((file) => {
            const collection = collectionsByID.get(file.collectionID);
            return (
                collection &&
                file.ownerID != userID &&
                (file.collectionAddedAt ?? 0) > 0 &&
                (!collection.sharedAt ||
                    file.collectionAddedAt! > collection.sharedAt)
            );
        })
        .sort(
            (a, b) =>
                b.collectionAddedAt! - a.collectionAddedAt! || b.id - a.id,
        );
    const sessions = new Map<string, { item: FeedItem; oldestTime: number }>();
    const seenFiles = new Set<number>();
    for (const file of sharedFiles) {
        // The same photo can be shared through several albums.
        if (seenFiles.has(file.id)) continue;
        seenFiles.add(file.id);
        const time = file.collectionAddedAt!;
        const key = `${file.collectionID}:${file.ownerID}`;
        const session = sessions.get(key);
        if (session && session.oldestTime - time <= 10 * 60 * 1_000_000) {
            session.item.photoCount = (session.item.photoCount ?? 1) + 1;
            session.item.sharedFiles!.push(file);
            session.oldestTime = time;
        } else {
            const item: FeedItem = {
                id: `photos:${file.collectionID}:${file.id}`,
                type: "photos",
                collectionID: file.collectionID,
                file,
                actorUserID: file.ownerID,
                createdAt: time,
                photoCount: 1,
                sharedFiles: [file],
            };
            items.push(item);
            sessions.set(key, { item, oldestTime: time });
        }
    }
    for (const comment of comments) {
        if (
            comment.isDeleted ||
            comment.userID == userID ||
            !collectionIDs.has(comment.collectionID)
        )
            continue;
        const file = filesByMembership.get(
            `${comment.collectionID}:${comment.fileID}`,
        );
        if (!file) continue;
        items.push({
            id: `comment:${comment.id}`,
            type: comment.parentCommentID ? "reply" : "comment",
            collectionID: comment.collectionID,
            file,
            commentID: comment.id,
            actorUserID: comment.userID,
            actorAnonID: comment.anonUserID,
            text: comment.text,
            createdAt: comment.createdAt,
        });
    }
    for (const reaction of reactions) {
        if (
            reaction.isDeleted ||
            reaction.userID == userID ||
            !collectionIDs.has(reaction.collectionID)
        )
            continue;
        const comment = reaction.commentID
            ? commentsByID.get(reaction.commentID)
            : undefined;
        if (
            reaction.commentID &&
            (!comment || comment.isDeleted || comment.userID != userID)
        )
            continue;
        const file = filesByMembership.get(
            `${reaction.collectionID}:${comment?.fileID ?? reaction.fileID}`,
        );
        if (!file) continue;
        items.push({
            id: `reaction:${reaction.id}`,
            type: comment
                ? comment.parentCommentID
                    ? "reply-like"
                    : "comment-like"
                : "like",
            collectionID: reaction.collectionID,
            file,
            commentID: comment?.id,
            actorUserID: reaction.userID,
            actorAnonID: reaction.anonUserID,
            text: comment?.text,
            createdAt: reaction.createdAt,
        });
    }
    items.sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
    const grouped = new Map<string, FeedItem>();
    for (const item of items) {
        const comment = item.commentID
            ? commentsByID.get(item.commentID)
            : undefined;
        const key =
            item.type == "album" || item.type == "photos"
                ? item.id
                : `${item.type}:${item.collectionID}:${item.type == "reply" ? comment?.parentCommentID : item.type == "comment-like" || item.type == "reply-like" ? item.commentID : item.file?.id}`;
        const existing = grouped.get(key);
        const actor = { userID: item.actorUserID, anonID: item.actorAnonID };
        if (existing) {
            if (
                !existing.actors!.some(
                    (other) =>
                        other.userID == actor.userID &&
                        other.anonID == actor.anonID,
                )
            )
                existing.actors!.push(actor);
        } else {
            grouped.set(key, { ...item, actors: [actor] });
        }
    }
    return [...grouped.values()];
};
