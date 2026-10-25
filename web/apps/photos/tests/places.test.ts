import type { Location } from "ente-base/types";
import type { EnteFile } from "ente-media/file";
import { deriveLibraryPlaces } from "ente-new/photos/services/search/places";
import type { LocationCityGroup } from "ente-photos-wasm";
import { expect, test, vi } from "vitest";

const photo = (
    id: number,
    latitude?: number,
    longitude?: number,
    creationTime = id * 1_000_000,
) => ({ id, metadata: { latitude, longitude, creationTime } }) as EnteFile;
const city = {
    name: "Bengaluru",
    country: "India",
    latitude: 12.97,
    longitude: 77.59,
};

test("maps Rust coordinate indices back to deduplicated photos and uses the newest cover", async () => {
    const older = photo(1, 12.97, 77.59);
    const latest = photo(2, 12.98, 77.59);
    const match = vi
        .fn<(coordinates: Location[]) => Promise<LocationCityGroup[]>>()
        .mockResolvedValue([
            { city, coordinateIndices: [0, 1] },
        ] satisfies LocationCityGroup[]);
    const places = await deriveLibraryPlaces(
        [older, latest, older, photo(3), photo(4, 0, 0), photo(5, 30, 40)],
        [],
        match,
    );
    expect(match).toHaveBeenCalledWith([
        { latitude: 12.97, longitude: 77.59 },
        { latitude: 12.98, longitude: 77.59 },
        { latitude: 30, longitude: 40 },
    ]);
    expect(places.map(({ name, fileCount }) => [name, fileCount])).toEqual([
        ["Bengaluru", 2],
    ]);
    expect(places[0]?.coverFile.id).toBe(2);
});

test("saved locations take precedence and do not require loading the city index", async () => {
    const match =
        vi.fn<(coordinates: Location[]) => Promise<LocationCityGroup[]>>();
    const places = await deriveLibraryPlaces(
        [photo(1, 12.97, 77.59)],
        [{ name: "Home", centerPoint: city, radius: 1 }],
        match,
    );
    expect(places.map(({ name }) => name)).toEqual(["Home"]);
    expect(match).not.toHaveBeenCalled();
});

test("passes edited GPS coordinates to Rust and handles groups returned out of photo order", async () => {
    const file = {
        ...photo(1, 48.85, 2.35),
        pubMagicMetadata: { data: { lat: 12.999, long: 77.59 } },
    } as EnteFile;
    const paris = {
        name: "Paris",
        country: "France",
        latitude: 48.85,
        longitude: 2.35,
    };
    const match = vi
        .fn<(coordinates: Location[]) => Promise<LocationCityGroup[]>>()
        .mockResolvedValue([
            { city: paris, coordinateIndices: [1] },
            { city, coordinateIndices: [0, 2] },
        ] satisfies LocationCityGroup[]);
    const places = await deriveLibraryPlaces(
        [file, photo(2, 48.85, 2.35), photo(3, 12.97, 77.59)],
        [],
        match,
    );
    expect(match.mock.calls[0]?.[0][0]).toEqual({
        latitude: 12.999,
        longitude: 77.59,
    });
    expect(
        places.map(({ name, fileCount, coverFile }) => [
            name,
            fileCount,
            coverFile.id,
        ]),
    ).toEqual([
        ["Bengaluru", 2, 3],
        ["Paris", 1, 2],
    ]);
});

test("keeps equally named cities in different countries distinct", async () => {
    const match = vi
        .fn<(coordinates: Location[]) => Promise<LocationCityGroup[]>>()
        .mockResolvedValue([
            { city: { ...city, name: "Springfield" }, coordinateIndices: [0] },
            {
                city: { ...city, name: "Springfield", country: "USA" },
                coordinateIndices: [1],
            },
        ] satisfies LocationCityGroup[]);
    const places = await deriveLibraryPlaces(
        [photo(1, 12, 77), photo(2, 40, -89)],
        [],
        match,
    );
    expect(places).toHaveLength(2);
    expect(places[0]?.id).not.toBe(places[1]?.id);
});
