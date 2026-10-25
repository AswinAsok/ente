import type { Location } from "ente-base/types";
import type { EnteFile } from "ente-media/file";
import {
    fileCreationPhotoSortTime,
    fileLocation,
} from "ente-media/file-metadata";
import type { LocationTag } from "../user-entity";
import type { City, LibraryPlace } from "./types";
export const deriveLibraryPlaces = (
    files: EnteFile[],
    cities: City[],
    tags: LocationTag[],
): LibraryPlace[] => {
    const cells = new Map<string, City[]>();
    for (const city of cities) {
        const key = `${Math.floor(city.latitude)}:${Math.floor(city.longitude)}`;
        const cell = cells.get(key) ?? [];
        cell.push(city);
        cells.set(key, cell);
    }
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
            ) {
                place.coverFile = file;
            }
        } else {
            places.set(id, { id, name, center, fileCount: 1, coverFile: file });
        }
    };
    const seen = new Set<number>();
    for (const file of files) {
        if (seen.has(file.id)) continue;
        seen.add(file.id);
        const location = fileLocation(file);
        if (!location) continue;
        const tag = tags.find((tag) => isInsideLocationTag(location, tag));
        if (tag) {
            add(
                `tag:${tag.name}:${tag.centerPoint.latitude}:${tag.centerPoint.longitude}`,
                tag.name,
                tag.centerPoint,
                file,
            );
            continue;
        }
        let nearest: City | undefined;
        let distance = Infinity;
        const lat = Math.floor(location.latitude);
        const lng = Math.floor(location.longitude);
        const latitudeSpan = Math.min(
            180,
            Math.ceil(radiusScaleFactor(location.latitude)),
        );
        for (let x = lat - latitudeSpan; x <= lat + latitudeSpan; x++) {
            for (let y = lng - 1; y <= lng + 1; y++) {
                const wrapped = ((((y + 180) % 360) + 360) % 360) - 180;
                for (const city of cells.get(`${x}:${wrapped}`) ?? []) {
                    if (!isInsideCity(location, city)) continue;
                    const d =
                        (city.latitude - location.latitude) ** 2 +
                        ((city.longitude - location.longitude) /
                            radiusScaleFactor(location.latitude)) **
                            2;
                    if (d < distance) {
                        nearest = city;
                        distance = d;
                    }
                }
            }
        }
        if (nearest)
            add(
                `city:${nearest.name}:${nearest.latitude}:${nearest.longitude}`,
                nearest.name,
                nearest,
                file,
            );
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
