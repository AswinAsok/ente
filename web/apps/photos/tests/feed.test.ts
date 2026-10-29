import type { Collection } from "ente-media/collection";
import type { EnteFile } from "ente-media/file";
import type { Comment } from "ente-new/photos/services/comment";
import type { UnifiedReaction } from "ente-new/photos/services/social";
import { describe, expect, test } from "vitest";
import { buildFeedItems } from "../src/services/feed";

const collection = (id: number, ownerID = 1, sharedAt?: number) =>
    ({ id, owner: { id: ownerID }, sharedAt }) as Collection;
const file = (
    id: number,
    collectionID = 10,
    ownerID = 1,
    collectionAddedAt?: number,
) => ({ id, collectionID, ownerID, collectionAddedAt }) as EnteFile;
const comment = (overrides: Partial<Comment> = {}): Comment => ({
    id: "comment",
    collectionID: 10,
    fileID: 100,
    userID: 2,
    text: "Hello",
    isDeleted: false,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
});
const reaction = (
    overrides: Partial<UnifiedReaction> = {},
): UnifiedReaction => ({
    id: "reaction",
    collectionID: 10,
    fileID: 100,
    userID: 2,
    reactionType: "LIKE",
    isDeleted: false,
    createdAt: 2000,
    updatedAt: 2000,
    ...overrides,
});

describe("account feed", () => {
    test("does not expose activity through a hidden or removed collection membership", () => {
        // The file is visible in another album, but its activity belongs to 10.
        expect(
            buildFeedItems(
                [collection(10), collection(20)],
                [file(100, 20)],
                [comment()],
                [reaction()],
                1,
            ),
        ).toEqual([]);
        expect(
            buildFeedItems(
                [collection(20)],
                [file(100)],
                [comment()],
                [reaction()],
                1,
            ),
        ).toEqual([]);
    });
    test("excludes self activity, tombstones, and likes on other people's comments", () => {
        const comments = [
            comment({ id: "self", userID: 1 }),
            comment({ id: "deleted", isDeleted: true }),
            comment({ id: "other" }),
        ];
        const reactions = [
            reaction({ id: "self-like", userID: 1 }),
            reaction({ id: "deleted-like", isDeleted: true }),
            reaction({ id: "other-comment-like", commentID: "other" }),
            reaction({ id: "my-comment-like", commentID: "self" }),
        ];
        const items = buildFeedItems(
            [collection(10)],
            [file(100)],
            comments,
            reactions,
            1,
        );
        expect(items.map(({ id }) => id)).toEqual([
            "reaction:my-comment-like",
            "comment:other",
        ]);
        expect(items[0]).toMatchObject({
            type: "comment-like",
            commentID: "self",
            file: { id: 100 },
        });
    });
    test("groups incoming photos into upload sessions without repeating initial album contents", () => {
        const minute = 60 * 1_000_000;
        const items = buildFeedItems(
            [collection(10, 2, minute)],
            [
                file(100, 10, 2, minute),
                file(101, 10, 2, 2 * minute),
                file(102, 10, 2, 3 * minute),
                file(103, 10, 2, 20 * minute),
                file(104, 10, 1, 21 * minute),
            ],
            [],
            [],
            1,
        );
        expect(
            items.map(({ type, photoCount, createdAt }) => ({
                type,
                photoCount,
                createdAt,
            })),
        ).toEqual([
            { type: "photos", photoCount: 1, createdAt: 20 * minute },
            { type: "photos", photoCount: 2, createdAt: 3 * minute },
            { type: "album", photoCount: undefined, createdAt: minute },
        ]);
    });
    test("sorts replies, photo likes, and comments newest first with navigation targets", () => {
        const items = buildFeedItems(
            [collection(10)],
            [file(100)],
            [
                comment({
                    id: "reply",
                    parentCommentID: "parent",
                    createdAt: 3000,
                }),
                comment(),
            ],
            [reaction()],
            1,
        );
        expect(items.map(({ type }) => type)).toEqual([
            "reply",
            "like",
            "comment",
        ]);
        expect(items[0]).toMatchObject({
            commentID: "reply",
            collectionID: 10,
            file: { id: 100 },
        });
    });
});

test("combines activity on a photo and keeps distinct anonymous actors", () => {
    const items = buildFeedItems(
        [collection(10)],
        [file(100)],
        [],
        [
            reaction({ id: "first", userID: 2, createdAt: 100 }),
            reaction({ id: "second", userID: 3, createdAt: 200 }),
            reaction({
                id: "anon1",
                userID: 0,
                anonUserID: "guest-a",
                createdAt: 300,
            }),
            reaction({
                id: "anon2",
                userID: 0,
                anonUserID: "guest-b",
                createdAt: 400,
            }),
        ],
        1,
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
        id: "reaction:anon2",
        actors: [
            { userID: 0, anonID: "guest-b" },
            { userID: 0, anonID: "guest-a" },
            { userID: 3 },
            { userID: 2 },
        ],
    });
});
