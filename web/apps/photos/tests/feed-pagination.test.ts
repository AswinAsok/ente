import {
    getCollectionSocialActivity,
    getSocialActivityCollectionIDs,
} from "ente-new/photos/services/social";
import { afterEach, expect, test, vi } from "vitest";

vi.mock("ente-base/crypto", () => ({ decryptBoxBytes: vi.fn() }));
vi.mock("ente-base/http", () => ({
    authenticatedRequestHeaders: () => Promise.resolve({}),
    ensureOk: (response: Response) => {
        if (!response.ok) throw new Error("Request failed");
    },
}));
vi.mock("ente-base/origins", () => ({
    apiURL: (path: string, params: Record<string, string | number> = {}) =>
        Promise.resolve(
            `https://example.test${path}?${new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]))}`,
        ),
}));

afterEach(() => vi.unstubAllGlobals());

const tombstone = (id: string, updatedAt: number) => ({
    id,
    collectionID: 10,
    userID: 2,
    isDeleted: true,
    createdAt: 1,
    updatedAt,
});

test("advances independent cursors past pages containing deleted reactions", async () => {
    const fetch = vi
        .fn()
        .mockResolvedValueOnce(
            Response.json({
                comments: [tombstone("c", 100)],
                reactions: [tombstone("r", 200)],
                hasMoreComments: false,
                hasMoreReactions: true,
            }),
        )
        .mockResolvedValueOnce(
            Response.json({
                comments: [],
                reactions: [tombstone("r2", 300)],
                hasMoreComments: false,
                hasMoreReactions: false,
            }),
        );
    vi.stubGlobal("fetch", fetch);
    const result = await getCollectionSocialActivity(10, "key");
    expect(fetch).toHaveBeenCalledTimes(2);
    const secondURL = new URL(fetch.mock.calls[1]![0] as string);
    expect(secondURL.searchParams.get("commentsSinceTime")).toBe("100");
    expect(secondURL.searchParams.get("reactionsSinceTime")).toBe("200");
    expect(secondURL.searchParams.has("fileID")).toBe(false);
    expect(result.comments).toMatchObject([{ id: "c", isDeleted: true }]);
    expect(result.reactions).toEqual([]);
});

test("stops rather than looping if the server reports more data without advancing", async () => {
    const fetch = vi
        .fn()
        .mockResolvedValue(
            Response.json({
                comments: [],
                reactions: [],
                hasMoreComments: true,
                hasMoreReactions: false,
            }),
        );
    vi.stubGlobal("fetch", fetch);
    await expect(getCollectionSocialActivity(10, "key")).rejects.toThrow(
        "did not advance",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
});

test("only requests activity for albums with comment or reaction updates", async () => {
    vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
            Response.json({
                updates: [
                    { collectionID: 10, commentsUpdatedAt: 100 },
                    { collectionID: 20, reactionsUpdatedAt: 200 },
                    { collectionID: 30, anonProfilesUpdatedAt: 300 },
                    {
                        collectionID: 40,
                        commentsUpdatedAt: 0,
                        reactionsUpdatedAt: null,
                    },
                ],
            }),
        ),
    );
    expect(await getSocialActivityCollectionIDs()).toEqual(new Set([10, 20]));
});

test("accepts the server's null update list for accounts without activity", async () => {
    vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(Response.json({ updates: null })),
    );
    expect(await getSocialActivityCollectionIDs()).toEqual(new Set());
});
