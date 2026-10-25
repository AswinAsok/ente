import { HTTPError } from "ente-base/http";
import type { Location } from "ente-base/types";
import { createLocationIndex, type LocationIndex } from "ente-photos-wasm";

let indexPromise: Promise<LocationIndex> | undefined;

export const groupLocationCities = async (coordinates: Location[]) => {
    const index = await (indexPromise ??= loadIndex().catch(
        (error: unknown) => {
            indexPromise = undefined;
            throw error;
        },
    ));
    return index.groupCities({ coordinates }).groups;
};

const loadIndex = async () => {
    const [cities, urbanCenters] = await Promise.all([
        fetchIndex(
            "cities.bin",
            "898dca892a71fd601ae8e75e5c55fd6d4591e4c98de335d9b33e7f076aa668f5",
        ),
        fetchIndex(
            "urban-centres.bin",
            "e981b0383e6502ede56b52d5be96cda66f53d7352492e677d8978467c106dab0",
        ),
    ]);
    return createLocationIndex(cities, urbanCenters);
};

const fetchIndex = async (name: string, sha256: string) => {
    const response = await fetch(
        `https://assets.ente.com/location/v2/${name}?v=${sha256}`,
        { cache: "force-cache" },
    );
    if (!response.ok) throw new HTTPError(response);
    const bytes = await response.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const actual = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
    ).join("");
    if (actual !== sha256) throw new Error(`Invalid location index: ${name}`);
    return new Uint8Array(bytes);
};
