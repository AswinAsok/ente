import type { Location } from "ente-base/types";
import type { EnteFile } from "ente-media/file";
import {
    fileCreationPhotoSortTime,
    fileLocation,
} from "ente-media/file-metadata";
import type { LocationCityGroup } from "ente-photos-wasm";
import type { LocationTag } from "../user-entity";
import type { City, LibraryPlace } from "./types";

export const deriveLibraryPlaces = async (
    files: EnteFile[],
    tags: LocationTag[],
    groupCities: (coordinates: Location[]) => Promise<LocationCityGroup[]>,
): Promise<LibraryPlace[]> => {
    const places = new Map<string, LibraryPlace>();
    const add = (
        id: string,
        name: string,
        center: Location,
        file: EnteFile,
    ) => {
        const place = places.get(id);
        if (place) {
            place.fileCount++;
            if (
                fileCreationPhotoSortTime(file) >
                fileCreationPhotoSortTime(place.coverFile)
            )
                place.coverFile = file;
        } else {
            places.set(id, { id, name, center, fileCount: 1, coverFile: file });
        }
    };
    const seen = new Set<number>();
    const cityFiles: EnteFile[] = [];
    const coordinates: Location[] = [];
    for (const file of files) {
        if (seen.has(file.id)) continue;
        const location = fileLocation(file);
        if (!location) continue;
        seen.add(file.id);
        const tag = tags.find((tag) => isInsideLocationTag(location, tag));
        if (tag) {
            add(
                `tag:${tag.name}:${tag.centerPoint.latitude}:${tag.centerPoint.longitude}`,
                tag.name,
                tag.centerPoint,
                file,
            );
        } else {
            cityFiles.push(file);
            coordinates.push(location);
        }
    }
    if (coordinates.length) {
        for (const { city, coordinateIndices } of await groupCities(
            coordinates,
        )) {
            const id = `city:${city.country}:${city.name}:${city.latitude}:${city.longitude}`;
            for (const index of coordinateIndices) {
                const file = cityFiles[index];
                if (file) add(id, city.name, city, file);
            }
        }
    }
    return [...places.values()].sort(
        (a, b) => b.fileCount - a.fileCount || a.name.localeCompare(b.name),
    );
};

const defaultCityRadius = 10;
const kmsPerDegree = 111.16;

export const isInsideLocationTag = (
    location: Location,
    locationTag: LocationTag,
) => isWithinRadius(location, locationTag.centerPoint, locationTag.radius);

export const isInsideCity = (location: Location, city: City) =>
    isWithinRadius(location, city, defaultCityRadius);

const isWithinRadius = (
    location: Location,
    center: Location,
    radius: number,
) => {
    const a = (radius * radiusScaleFactor(center.latitude)) / kmsPerDegree;
    const b = radius / kmsPerDegree;
    const x = center.latitude - location.latitude;
    const y = center.longitude - location.longitude;
    return (x * x) / (a * a) + (y * y) / (b * b) <= 1;
};

const radiusScaleFactor = (lat: number) => 1 / Math.cos(lat * (Math.PI / 180));
