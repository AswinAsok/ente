import type { EnteFile } from "ente-media/file";
import { deriveLibraryPlaces } from "ente-new/photos/services/search/places";
import { expect, test } from "vitest";

const photo = (
    id: number,
    latitude?: number,
    longitude?: number,
    creationTime = id * 1_000_000,
) => ({ id, metadata: { latitude, longitude, creationTime } }) as EnteFile;
const cities = [
    { name: "Bangalore", latitude: 12.97, longitude: 77.59 },
    { name: "Paris", latitude: 48.85, longitude: 2.35 },
];

test("groups real locations, deduplicates memberships, and uses the latest cover", () => {
    const older = photo(1, 12.97, 77.59);
    const latest = photo(2, 12.98, 77.59);
    const places = deriveLibraryPlaces(
        [
            older,
            latest,
            older,
            photo(3, 48.85, 2.35),
            photo(4),
            photo(5, 0, 0),
            photo(6, 30, 40),
        ],
        cities,
        [],
    );
    expect(places.map(({ name, fileCount }) => [name, fileCount])).toEqual([
        ["Bangalore", 2],
        ["Paris", 1],
    ]);
    expect(places[0]?.coverFile.id).toBe(2);
});

test("prefers a saved place over a nearby city", () => {
    const places = deriveLibraryPlaces([photo(1, 12.97, 77.59)], cities, [
        { name: "Home", centerPoint: cities[0]!, radius: 1 },
    ]);
    expect(places.map(({ name }) => name)).toEqual(["Home"]);
});

test("uses edited GPS coordinates and chooses the closest city across grid cells", () => {
    const file = {
        ...photo(1, 48.85, 2.35),
        pubMagicMetadata: { data: { lat: 12.999, long: 77.59 } },
    } as EnteFile;
    const places = deriveLibraryPlaces(
        [file],
        [...cities, { name: "Nearby", latitude: 13.001, longitude: 77.59 }],
        [],
    );
    expect(places[0]?.name).toBe("Nearby");
});
