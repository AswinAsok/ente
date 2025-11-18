# Sidebar search feature – full code (registry-based)

This file is a verbatim capture of the source that implements searchable sidebar actions. Each section is the full file content for traceability.

## `packages/new/photos/services/search/types.ts`
```ts
/**
 * @file types shared between the main thread interface to search (`index.ts`)
 * and the search worker that does the actual searching (`worker.ts`).
 */

import type { Location } from "ente-base/types";
import type { Collection } from "ente-media/collection";
import type { EnteFile } from "ente-media/file";
import { FileType } from "ente-media/file-type";
import type { Person } from "ente-new/photos/services/ml/people";
import type { LocationTag } from "../user-entity";

export type SidebarActionID =
    | "shortcuts.uncategorized"
    | "shortcuts.archive"
    | "shortcuts.hidden"
    | "shortcuts.trash"
    | "utility.account"
    | "utility.watchFolders"
    | "utility.deduplicate"
    | "utility.preferences"
    | "utility.help"
    | "utility.export"
    | "utility.logout"
    | "account.recoveryKey"
    | "account.twoFactor"
    | "account.passkeys"
    | "account.changePassword"
    | "account.changeEmail"
    | "account.deleteAccount"
    | "preferences.language"
    | "preferences.theme"
    | "preferences.customDomains"
    | "preferences.map"
    | "preferences.advanced"
    | "preferences.mlSearch"
    | "preferences.streamableVideos"
    | "help.helpCenter"
    | "help.blog"
    | "help.requestFeature"
    | "help.support"
    | "help.viewLogs"
    | "help.testUpload";

/**
 * A search suggestion.
 *
 * These (wrapped up in {@link SearchOption}s) are shown in the search results
 * dropdown, and can also be used to filter the list of files that are shown.
 */
export type SearchSuggestion = { label: string } & (
    | { type: "collection"; collectionID: number }
    | { type: "fileType"; fileType: FileType }
    | { type: "fileName"; fileIDs: number[] }
    | { type: "fileCaption"; fileIDs: number[] }
    | { type: "date"; dateComponents: SearchDateComponents }
    | { type: "location"; locationTag: LocationTag }
    | { type: "city"; city: City }
    | { type: "clip"; clipScoreForFileID: Map<number, number> }
    | { type: "person"; person: Person }
    | { type: "sidebarAction"; actionID: SidebarActionID; path: string[] }
);

/**
 * An option shown in the the search bar's select dropdown.
 *
 * The {@link SearchOption} wraps a {@link SearchSuggestion} with some metadata
 * used when showing a corresponding entry in the dropdown.
 *
 * If the user selects the option, then we will re-run the search using the
 * {@link suggestion} to filter the list of files shown to the user.
 */
export interface SearchOption {
    suggestion: SearchSuggestion;
    /**
     * The count of files that matched the search option when it was initially
     * computed.
     */
    fileCount: number;
    previewFiles: EnteFile[];
}

/**
 * The collections and files over which we should search.
 */
export interface SearchCollectionsAndFiles {
    collections: Collection[];
    /**
     * Unique files (by ID).
     *
     * @see {@link uniqueFilesByID}.
     */
    files: EnteFile[];
    /**
     * One entry per collection/file pair.
     *
     * Whenever the same file (ID) is in multiple collections, the
     * {@link collectionFiles} will have multiple entries with the same file ID,
     * one per collection in which that file (ID) occurs.
     */
    collectionFiles: EnteFile[];
}

export interface LabelledSearchDateComponents {
    components: SearchDateComponents;
    label: string;
}

export interface LabelledFileType {
    fileType: FileType;
    label: string;
}

/**
 * Various bits of static but locale specific data that the search worker needs
 * during searching.
 */
export interface LocalizedSearchData {
    locale: string;
    holidays: LabelledSearchDateComponents[];
    labelledFileTypes: LabelledFileType[];
}

/**
 * A parsed version of a potential natural language date time string.
 *
 * All attributes which were parsed will be set. The type doesn't enforce this,
 * but it is guaranteed that at least one attribute will be present.
 */
export interface SearchDateComponents {
    /**
     * The year, if the search string specified one. e.g. `2024`.
     */
    year?: number;
    /**
     * The month (1 to 12, with December being 12), if the search string
     * specified one.
     */
    month?: number;
    /**
     * The day of the month (1 to 31), if the search string specified one.
     */
    day?: number;
    /**
     * The day of the week (0 to 6, with Sunday being 0), if the search string
     * specified one.
     */
    weekday?: number;
    /**
     * The hour of the day (0 to 23, with 0 as midnight), if the search string
     * specified one.
     */
    hour?: number;
}

/**
 * A city as identified by a static dataset.
 *
 * Each city is represented by its latitude and longitude. The dataset does not
 * have information about the city's estimated radius.
 */
export type City = Location & {
    /** Name of the city. */
    name: string;
};
```

## `packages/new/photos/services/search/worker.ts`
```ts
import type { Component } from "chrono-node";
import * as chrono from "chrono-node";
import { expose } from "comlink";
import { HTTPError } from "ente-base/http";
import { logUnhandledErrorsAndRejectionsInWorker } from "ente-base/log-web";
import type { Location } from "ente-base/types";
import type { Collection } from "ente-media/collection";
import type { EnteFile } from "ente-media/file";
import {
    fileCreationPhotoDate,
    fileFileName,
    fileLocation,
} from "ente-media/file-metadata";
import { nullToUndefined } from "ente-utils/transform";
import { z } from "zod";
import type { NamedPerson } from "../ml/people";
import {
    pullUserEntities,
    savedLocationTags,
    type LocationTag,
} from "../user-entity";
import type {
    City,
    LabelledFileType,
    LabelledSearchDateComponents,
    LocalizedSearchData,
    SearchCollectionsAndFiles,
    SearchDateComponents,
    SearchSuggestion,
} from "./types";

/**
 * A web worker that runs the search asynchronously so that the main thread
 * remains responsive.
 */
export class SearchWorker {
    private locationTags: LocationTag[] = [];
    private cities: City[] = [];
    private collectionsAndFiles: SearchCollectionsAndFiles = {
        collections: [],
        files: [],
        collectionFiles: [],
    };
    private people: NamedPerson[] = [];

    /**
     * Fetch any state we might need when the actual search happens.
     *
     * @param masterKey The user's master key (as a base64 string). Web workers
     * do not have access to session storage so this key needs to be passed to
     * us explicitly.
     */
    async sync(masterKey: string) {
        // Let the cities fetch complete async. And do it only once per app
        // startup (this list is static and doesn't change).
        if (this.cities.length == 0) {
            void fetchCities().then((cs) => (this.cities = cs));
        }

        return pullUserEntities("location", masterKey)
            .then(() => savedLocationTags())
            .then((ts) => (this.locationTags = ts));
    }

    /**
     * Set the collections and files that we should search across.
     */
    setCollectionsAndFiles(cf: SearchCollectionsAndFiles) {
        this.collectionsAndFiles = cf;
    }

    /**
     * Set the (named) people that we should search across.
     */
    setPeople(people: NamedPerson[]) {
        this.people = people;
    }

    /**
     * Convert a search string into a list of {@link SearchSuggestion}s.
     */
    suggestionsForString(
        s: string,
        searchString: string,
        localizedSearchData: LocalizedSearchData,
    ) {
        return suggestionsForString(
            s,
            // Case insensitive word prefix match.  Note that \b doesn't work
            // with unicode characters, so we use instead a set of common
            // punctuation (and spaces) to discern the word boundary.
            new RegExp("(^|[\\s.,!?\"'-_])" + s, "i"),
            searchString,
            this.collectionsAndFiles,
            this.people,
            localizedSearchData,
            this.locationTags,
            this.cities,
        );
    }

    /**
     * Return {@link EnteFile}s that satisfy the given {@link suggestion}.
     */
    filterSearchableFiles(suggestion: SearchSuggestion) {
        return filterSearchableFiles(this.collectionsAndFiles, suggestion);
    }

    /**
     * Batched variant of {@link filterSearchableFiles}.
     */
    filterSearchableFilesMulti(suggestions: SearchSuggestion[]) {
        const cf = this.collectionsAndFiles;
        return suggestions
            .map((sg) => [filterSearchableFiles(cf, sg), sg] as const)
            .filter(([files]) => files.length);
    }
}

expose(SearchWorker);

logUnhandledErrorsAndRejectionsInWorker();

/**
 * @param s The normalized form of {@link searchString}.
 * @param searchString The original search string.
 */
const suggestionsForString = (
    s: string,
    re: RegExp,
    searchString: string,
    { collections, files }: SearchCollectionsAndFiles,
    people: NamedPerson[],
    { locale, holidays, labelledFileTypes }: LocalizedSearchData,
    locationTags: LocationTag[],
    cities: City[],
): [SearchSuggestion[], SearchSuggestion[]] => [
    [peopleSuggestions(re, people)].flat(),
    // . <-- clip suggestions will be inserted here by our caller.
    [
        fileTypeSuggestions(re, labelledFileTypes),
        dateSuggestions(s, re, locale, holidays),
        locationSuggestions(re, locationTags, cities),
        collectionSuggestions(re, collections),
        fileNameSuggestion(s, re, searchString, files),
        fileCaptionSuggestion(re, searchString, files),
    ].flat(),
];

const collectionSuggestions = (
    re: RegExp,
    collections: Collection[],
): SearchSuggestion[] =>
    collections
        .filter((c) => re.test(c.name))
        .map(({ id, name }) => ({
            type: "collection",
            collectionID: id,
            label: name,
        }));

const fileTypeSuggestions = (
    re: RegExp,
    labelledFileTypes: LabelledFileType[],
): SearchSuggestion[] =>
    labelledFileTypes
        .filter(({ label }) => re.test(label))
        .map(({ fileType, label }) => ({ type: "fileType", fileType, label }));

const fileNameSuggestion = (
    s: string,
    re: RegExp,
    searchString: string,
    files: EnteFile[],
): SearchSuggestion[] => {
    // Convert the search string to a number. This allows searching a file by
    // its exact (integral) ID.
    const sn = Number(s) || undefined;

    const fileIDs = files
        .filter((f) => f.id === sn || re.test(fileFileName(f)))
        .map((f) => f.id);

    return fileIDs.length
        ? [{ type: "fileName", fileIDs, label: searchString }]
        : [];
};

const fileCaptionSuggestion = (
    re: RegExp,
    searchString: string,
    files: EnteFile[],
): SearchSuggestion[] => {
    const fileIDs = files
        .filter((file) => {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            const caption = file.pubMagicMetadata?.data?.caption;
            return caption && re.test(caption);
        })
        .map((f) => f.id);

    return fileIDs.length
        ? [{ type: "fileCaption", fileIDs, label: searchString }]
        : [];
};

const peopleSuggestions = (
    re: RegExp,
    people: NamedPerson[],
): SearchSuggestion[] =>
    people
        .filter(({ name }) => re.test(name))
        .map((person) => ({ type: "person", person, label: person.name }));

const dateSuggestions = (
    s: string,
    re: RegExp,
    locale: string,
    holidays: LabelledSearchDateComponents[],
): SearchSuggestion[] =>
    parseDateComponents(s, re, locale, holidays).map(
        ({ components, label }) => ({
            type: "date",
            dateComponents: components,
            label,
        }),
    );

/**
 * Try to parse an arbitrary search string into sets of date components.
 *
 * e.g. "December 2022" will be parsed into a
 *
 *     [(year 2022, month 12, day undefined)]
 *
 * while "22 December 2022" will be parsed into
 *
 *     [(year 2022, month 12, day 22)]
 *
 * In addition, also return a formatted representation of the "best" guess at
 * the date that was intended by the search string.
 */
const parseDateComponents = (
    s: string,
    re: RegExp,
    locale: string,
    holidays: LabelledSearchDateComponents[],
): LabelledSearchDateComponents[] =>
    [
        parseChrono(s, locale),
        parseYearComponents(s),
        holidays.filter((h) => re.test(h.label)),
    ].flat();

const parseChrono = (
    s: string,
    locale: string,
): LabelledSearchDateComponents[] => {
    // Use the appropriate chrono parser based on locale
    // For US locales, use the default parser (MM/DD/YYYY)
    // For other locales, use the GB parser (DD/MM/YYYY)
    const isUSLocale =
        locale.toLowerCase().includes("en-us") || locale.toLowerCase() === "en";

    // Select the appropriate chrono instance based on locale
    let chronoInstance;
    if (isUSLocale) {
        // For US locale, use the default chrono parser (MM/DD/YYYY)
        chronoInstance = chrono;
    } else {
        // For non-US locales, use GB parser (DD/MM/YYYY) and add DD.MM.YYYY support
        chronoInstance = new chrono.Chrono(chrono.en.GB);

        // Add parser for DD.MM.YYYY format (common in Germany, Switzerland, etc.)
        // This format uses dots as separators instead of slashes
        chronoInstance.parsers.push({
            pattern: () => /\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b/,
            extract: (_context, match) => {
                if (!match[1] || !match[2] || !match[3]) return null;

                const day = parseInt(match[1]);
                const month = parseInt(match[2]);
                let year = parseInt(match[3]);

                // Handle 2-digit years
                if (year < 100) {
                    year = year > 50 ? 1900 + year : 2000 + year;
                }

                // Validate the date
                if (day < 1 || day > 31 || month < 1 || month > 12) {
                    return null;
                }

                return { day, month, year };
            },
        });
    }

    return chronoInstance
        .parse(s)
        .map((result) => {
            const p = result.start;
            const component = (s: Component) =>
                p.isCertain(s) ? nullToUndefined(p.get(s)) : undefined;

            const year = component("year");
            const month = component("month");
            const day = component("day");
            const weekday = component("weekday");
            const hour = component("hour");

            if (!year && !month && !day && !weekday && !hour) return undefined;
            const components = { year, month, day, weekday, hour };

            const format: Intl.DateTimeFormatOptions = {};
            if (year) format.year = "numeric";
            if (month) format.month = "long";
            if (day) format.day = "numeric";
            if (weekday) format.weekday = "long";
            if (hour) {
                format.hour = "numeric";
                format.dayPeriod = "short";
            }

            const formatter = new Intl.DateTimeFormat(locale, format);
            const label = formatter.format(p.date());
            return { components, label };
        })
        .filter((x) => x !== undefined);
};

/** chrono does not parse years like "2024", so do it manually. */
const parseYearComponents = (s: string): LabelledSearchDateComponents[] => {
    // s is already trimmed.
    if (s.length == 4) {
        const year = parseInt(s);
        if (year && year <= 9999) {
            const components = { year };
            return [{ components, label: s }];
        }
    }
    return [];
};

/**
 * Zod schema describing world_cities.json.
 *
 * The entries also have a country field which we don't currently use.
 */
const RemoteWorldCities = z.object({
    data: z.array(
        z.object({ city: z.string(), lat: z.number(), lng: z.number() }),
    ),
});

const fetchCities = async () => {
    const res = await fetch("https://assets.ente.io/world_cities.json");
    if (!res.ok) throw new HTTPError(res);
    return RemoteWorldCities.parse(await res.json()).data.map(
        ({ city, lat, lng }) => ({ name: city, latitude: lat, longitude: lng }),
    );
};

const locationSuggestions = (
    re: RegExp,
    locationTags: LocationTag[],
    cities: City[],
): SearchSuggestion[] => {
    const matchingLocationTags = locationTags.filter((t) => re.test(t.name));

    const matchingLocationTagLNames = new Set(
        matchingLocationTags.map((t) => t.name.toLowerCase()),
    );

    const matchingCities = cities
        .filter((c) => re.test(c.name))
        .filter((c) => !matchingLocationTagLNames.has(c.name.toLowerCase()));

    return [
        matchingLocationTags.map(
            (locationTag): SearchSuggestion => ({
                type: "location",
                locationTag,
                label: locationTag.name,
            }),
        ),
        matchingCities.map(
            (city): SearchSuggestion => ({
                type: "city",
                city,
                label: city.name,
            }),
        ),
    ].flat();
};

const filterSearchableFiles = (
    { files, collectionFiles }: SearchCollectionsAndFiles,
    suggestion: SearchSuggestion,
) => {
    if (suggestion.type == "sidebarAction") return [];

    return sortMatchesIfNeeded(
        (suggestion.type == "collection" ? collectionFiles : files).filter(
            (f) => isMatchingFile(f, suggestion),
        ),
        suggestion,
    );
};

/**
 * Return true if file satisfies the given {@link query}.
 */
const isMatchingFile = (file: EnteFile, suggestion: SearchSuggestion) => {
    switch (suggestion.type) {
        case "collection":
            return suggestion.collectionID === file.collectionID;

        case "fileType":
            return suggestion.fileType == file.metadata.fileType;

        case "fileName":
            return suggestion.fileIDs.includes(file.id);

        case "fileCaption":
            return suggestion.fileIDs.includes(file.id);

        case "date":
            return isDateComponentsMatch(
                suggestion.dateComponents,
                fileCreationPhotoDate(file),
            );

        case "location": {
            const location = fileLocation(file);
            if (!location) return false;

            return isInsideLocationTag(location, suggestion.locationTag);
        }

        case "city": {
            const location = fileLocation(file);
            if (!location) return false;

            return isInsideCity(location, suggestion.city);
        }

        case "clip":
            return suggestion.clipScoreForFileID.has(file.id);

        case "person":
            return suggestion.person.fileIDs.includes(file.id);

        case "sidebarAction":
            return false;
    }
};

const isDateComponentsMatch = (
    { year, month, day, weekday, hour }: SearchDateComponents,
    date: Date,
) => {
    // Components are guaranteed to have at least one attribute present, so
    // start by assuming true.
    let match = true;

    if (year) match = date.getFullYear() == year;
    // JS getMonth is 0-indexed.
    if (match && month) match = date.getMonth() + 1 == month;
    if (match && day) match = date.getDate() == day;
    if (match && weekday) match = date.getDay() == weekday;
    if (match && hour) match = date.getHours() == hour;

    return match;
};

const defaultCityRadius = 10;
const kmsPerDegree = 111.16;

const isInsideLocationTag = (location: Location, locationTag: LocationTag) =>
    isWithinRadius(location, locationTag.centerPoint, locationTag.radius);

const isInsideCity = (location: Location, city: City) =>
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

/**
 * A latitude specific scaling factor to apply to the radius of a location
 * search.
 *
 * The area bounded by the location tag becomes more elliptical with increase in
 * the magnitude of the latitude on the cartesian plane. When latitude is 0
 * degrees, the ellipse is a circle with a = b = r. When latitude increases, the
 * major axis (a) has to be scaled by the secant of the latitude.
 */
const radiusScaleFactor = (lat: number) => 1 / Math.cos(lat * (Math.PI / 180));

/**
 * Sort the files if necessary.
 *
 * Currently, only the CLIP results are sorted (by their score), in the other
 * cases the files are displayed chronologically (when displaying them in search
 * results) or arbitrarily (when showing them in the search option preview).
 */
const sortMatchesIfNeeded = (
    files: EnteFile[],
    suggestion: SearchSuggestion,
) => {
    if (suggestion.type != "clip") return files;
    // Sort CLIP matches by their corresponding scores.
    const score = ({ id }: EnteFile) => suggestion.clipScoreForFileID.get(id)!;
    return files.sort((a, b) => score(b) - score(a));
};
```

## `packages/new/photos/services/sidebar-search/registry.ts`
```ts
import { isDesktop } from "ente-base/app";
import { isHLSGenerationSupported } from "ente-gallery/services/video";
import { isDevBuildAndUser } from "ente-new/photos/services/settings";
import { t } from "i18next";
import type { SearchOption, SidebarActionID } from "../search/types";

export interface SidebarAction {
    id: SidebarActionID;
    label: string;
    path: string[];
    keywords?: string[];
    available?: () => boolean;
}

export interface SidebarActionContext {
    // top-level sidebar controls
    onClose: () => void;
    onShowCollectionSummary: (
        collectionSummaryID: number,
        isHidden?: boolean,
    ) => Promise<void>;
    showAccount: () => void;
    showPreferences: () => void;
    showHelp: () => void;
    onShowExport: () => void;
    onLogout: () => void;
    onRouteToDeduplicate: () => Promise<unknown>;
    onShowWatchFolder: () => void;
    pseudoIDs: {
        uncategorized: number;
        archive: number;
        hidden: number;
        trash: number;
    };

    // nested drawer hooks
    setPendingAccountAction: (a: SidebarActionID | undefined) => void;
    setPendingPreferencesAction: (a: SidebarActionID | undefined) => void;
    setPendingHelpAction: (a: SidebarActionID | undefined) => void;
}

const shortcutsCategory = t("shortcuts", { defaultValue: "Shortcuts" });
const preferencesCategory = t("preferences");
const accountCategory = t("account");
const helpCategory = t("help");

export const sidebarActions: SidebarAction[] = [
    {
        id: "shortcuts.uncategorized",
        label: t("section_uncategorized"),
        path: [shortcutsCategory, t("section_uncategorized")],
        keywords: ["uncategorized", "ungrouped"],
    },
    {
        id: "shortcuts.archive",
        label: t("section_archive"),
        path: [shortcutsCategory, t("section_archive")],
        keywords: ["archive", "archived"],
    },
    {
        id: "shortcuts.hidden",
        label: t("section_hidden"),
        path: [shortcutsCategory, t("section_hidden")],
        keywords: ["hidden", "private"],
    },
    {
        id: "shortcuts.trash",
        label: t("section_trash"),
        path: [shortcutsCategory, t("section_trash")],
        keywords: ["trash", "bin", "deleted"],
    },
    {
        id: "utility.account",
        label: t("account"),
        path: [preferencesCategory, t("account")],
        keywords: ["profile", "user"],
    },
    {
        id: "utility.watchFolders",
        label: t("watch_folders"),
        path: [preferencesCategory, t("watch_folders")],
        keywords: ["watch", "folder", "desktop"],
        available: () => isDesktop,
    },
    {
        id: "utility.deduplicate",
        label: t("deduplicate_files"),
        path: [preferencesCategory, t("deduplicate_files")],
        keywords: ["duplicate", "dedupe"],
    },
    {
        id: "utility.preferences",
        label: t("preferences"),
        path: [preferencesCategory],
        keywords: ["settings"],
    },
    {
        id: "utility.help",
        label: t("help"),
        path: [helpCategory],
        keywords: ["support", "docs"],
    },
    {
        id: "utility.export",
        label: t("export_data"),
        path: [preferencesCategory, t("export_data")],
        keywords: ["export", "download"],
    },
    {
        id: "utility.logout",
        label: t("logout"),
        path: [preferencesCategory, t("logout")],
        keywords: ["sign out", "signout"],
    },
    {
        id: "account.recoveryKey",
        label: t("recovery_key"),
        path: [accountCategory, t("recovery_key")],
        keywords: ["recovery", "key", "backup"],
    },
    {
        id: "account.twoFactor",
        label: t("two_factor"),
        path: [accountCategory, t("two_factor")],
        keywords: ["2fa", "otp", "mfa"],
    },
    {
        id: "account.passkeys",
        label: t("passkeys"),
        path: [accountCategory, t("passkeys")],
        keywords: ["webauthn", "security key"],
    },
    {
        id: "account.changePassword",
        label: t("change_password"),
        path: [accountCategory, t("change_password")],
        keywords: ["password"],
    },
    {
        id: "account.changeEmail",
        label: t("change_email"),
        path: [accountCategory, t("change_email")],
        keywords: ["email"],
    },
    {
        id: "account.deleteAccount",
        label: t("delete_account"),
        path: [accountCategory, t("delete_account")],
        keywords: ["delete", "remove"],
    },
    {
        id: "preferences.language",
        label: t("language"),
        path: [preferencesCategory, t("language")],
        keywords: ["locale"],
    },
    {
        id: "preferences.theme",
        label: t("theme"),
        path: [preferencesCategory, t("theme")],
        keywords: ["appearance", "dark mode", "light mode"],
    },
    {
        id: "preferences.customDomains",
        label: t("custom_domains"),
        path: [preferencesCategory, t("custom_domains")],
        keywords: ["domain", "link"],
    },
    {
        id: "preferences.map",
        label: t("map"),
        path: [preferencesCategory, t("map")],
        keywords: ["maps", "location"],
    },
    {
        id: "preferences.advanced",
        label: t("advanced"),
        path: [preferencesCategory, t("advanced")],
        keywords: ["advanced", "proxy", "upload"],
    },
    {
        id: "preferences.mlSearch",
        label: t("ml_search"),
        path: [preferencesCategory, t("ml_search")],
        keywords: ["ml", "search", "magic"],
    },
    {
        id: "preferences.streamableVideos",
        label: t("streamable_videos"),
        path: [preferencesCategory, t("streamable_videos")],
        keywords: ["hls", "video", "stream"],
        available: () => isHLSGenerationSupported,
    },
    {
        id: "help.helpCenter",
        label: t("ente_help"),
        path: [helpCategory, t("ente_help")],
        keywords: ["help", "docs"],
    },
    {
        id: "help.blog",
        label: t("blog"),
        path: [helpCategory, t("blog")],
        keywords: ["news"],
    },
    {
        id: "help.requestFeature",
        label: t("request_feature"),
        path: [helpCategory, t("request_feature")],
        keywords: ["feature", "feedback"],
    },
    {
        id: "help.support",
        label: t("support"),
        path: [helpCategory, t("support")],
        keywords: ["contact", "support"],
    },
    {
        id: "help.viewLogs",
        label: t("view_logs"),
        path: [helpCategory, t("view_logs")],
        keywords: ["logs", "debug"],
    },
    {
        id: "help.testUpload",
        label: t("test_upload"),
        path: [helpCategory, t("test_upload")],
        keywords: ["test", "upload"],
        available: () => isDevBuildAndUser(),
    },
];

export const sidebarSearchOptionsForString = async (
    searchString: string,
): Promise<SearchOption[]> => {
    const normalized = searchString.trim().toLowerCase();
    if (!normalized) return [];

    return sidebarActions
        .filter(({ available }) => !available || available())
        .filter(({ label, path, keywords }) =>
            matchesSearch(normalized, label, path, keywords),
        )
        .map(({ id, label, path }) => ({
            suggestion: { type: "sidebarAction", actionID: id, path, label },
            fileCount: 0,
            previewFiles: [],
        }));
};

export const performSidebarAction = (
    actionID: SidebarActionID,
    ctx: SidebarActionContext,
): Promise<unknown> => {
    switch (actionID) {
        case "shortcuts.uncategorized":
            return ctx
                .onShowCollectionSummary(ctx.pseudoIDs.uncategorized, false)
                .then(() => ctx.onClose());
        case "shortcuts.archive":
            return ctx
                .onShowCollectionSummary(ctx.pseudoIDs.archive, false)
                .then(() => ctx.onClose());
        case "shortcuts.hidden":
            return ctx
                .onShowCollectionSummary(ctx.pseudoIDs.hidden, true)
                .then(() => ctx.onClose());
        case "shortcuts.trash":
            return ctx
                .onShowCollectionSummary(ctx.pseudoIDs.trash, false)
                .then(() => ctx.onClose());

        case "utility.account":
            ctx.showAccount();
            return Promise.resolve();
        case "utility.watchFolders":
            ctx.onShowWatchFolder();
            return Promise.resolve();
        case "utility.deduplicate":
            return ctx.onRouteToDeduplicate().then(() => ctx.onClose());
        case "utility.preferences":
            ctx.showPreferences();
            return Promise.resolve();
        case "utility.help":
            ctx.showHelp();
            return Promise.resolve();
        case "utility.export":
            ctx.onShowExport();
            ctx.onClose();
            return Promise.resolve();
        case "utility.logout":
            ctx.onLogout();
            return Promise.resolve();

        case "account.recoveryKey":
        case "account.twoFactor":
        case "account.passkeys":
        case "account.changePassword":
        case "account.changeEmail":
        case "account.deleteAccount":
            ctx.setPendingAccountAction(actionID);
            ctx.showAccount();
            return Promise.resolve();

        case "preferences.language":
        case "preferences.theme":
        case "preferences.customDomains":
        case "preferences.map":
        case "preferences.advanced":
        case "preferences.mlSearch":
        case "preferences.streamableVideos":
            ctx.setPendingPreferencesAction(actionID);
            ctx.showPreferences();
            return Promise.resolve();

        case "help.helpCenter":
        case "help.blog":
        case "help.requestFeature":
        case "help.support":
        case "help.viewLogs":
        case "help.testUpload":
            ctx.setPendingHelpAction(actionID);
            ctx.showHelp();
            return Promise.resolve();
    }

    return Promise.resolve();
};

const matchesSearch = (
    normalized: string,
    label: string,
    path: string[],
    keywords: string[] = [],
) => {
    const haystack = [label, ...path, ...keywords]
        .filter(Boolean)
        .map((s) => s.toLowerCase());

    const re = new RegExp("(^|[\\s.,!?\"'-_])" + escapeRegex(normalized));
    return haystack.some((h) => re.test(h));
};

const escapeRegex = (s: string) =>
    s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
```

## `packages/new/photos/components/SearchBar.tsx`
```tsx
import CalendarIcon from "@mui/icons-material/CalendarMonth";
import CloseIcon from "@mui/icons-material/Close";
import ImageIcon from "@mui/icons-material/Image";
import LocationIcon from "@mui/icons-material/LocationOn";
import SearchIcon from "@mui/icons-material/Search";
import SettingsIcon from "@mui/icons-material/Settings";
import {
    Box,
    Divider,
    IconButton,
    Stack,
    styled,
    Typography,
    useTheme,
    type Theme,
} from "@mui/material";
import { EnteLogo, EnteLogoBox } from "ente-base/components/EnteLogo";
import type { ButtonishProps } from "ente-base/components/mui";
import { useIsSmallWidth } from "ente-base/components/utils/hooks";
import {
    hlsGenerationStatusSnapshot,
    isHLSGenerationSupported,
} from "ente-gallery/services/video";
import { ItemCard, PreviewItemTile } from "ente-new/photos/components/Tiles";
import { isMLSupported, mlStatusSnapshot } from "ente-new/photos/services/ml";
import { searchOptionsForString } from "ente-new/photos/services/search";
import { sidebarSearchOptionsForString } from "ente-new/photos/services/sidebar-search/registry";
import type { SearchOption } from "ente-new/photos/services/search/types";
import { nullToUndefined } from "ente-utils/transform";
import { t } from "i18next";
import pDebounce from "p-debounce";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    components as SelectComponents,
    type ControlProps,
    type InputActionMeta,
    type InputProps,
    type OptionProps,
    type SelectInstance,
    type StylesConfig,
} from "react-select";
import AsyncSelect from "react-select/async";
import { SearchPeopleList } from "./PeopleList";
import { UnstyledButton } from "./UnstyledButton";
import {
    useHLSGenerationStatusSnapshot,
    useMLStatusSnapshot,
    usePeopleStateSnapshot,
} from "./utils/use-snapshot";

export interface SearchBarProps {
    /**
     * [Note: "Search mode"]
     *
     * On mobile sized screens, normally the search input areas is not
     * displayed. Clicking the search icon enters the "search mode", where we
     * show the search input area.
     *
     * On other screens, the search input is always shown even if we are not in
     * search mode.
     *
     * When we're in search mode,
     *
     * 1. Other icons from the navbar are hidden.
     * 2. Next to the search input there is a cancel button to exit search mode.
     */
    isInSearchMode: boolean;
    /**
     * Invoked when the user wants to enter "search mode".
     *
     * This scenario only arises when the search bar is in the mobile device
     * sized configuration, where the user needs to tap the search icon to enter
     * the search mode.
     */
    onShowSearchInput: () => void;
    /**
     * Set or clear the selected {@link SearchOption}.
     */
    onSelectSearchOption: (
        o: SearchOption | undefined,
        options?: { shouldExitSearchMode?: boolean },
    ) => void;
    /**
     * Called when the user selects the generic "People" header in the empty
     * state view.
     */
    onSelectPeople: () => void;
    /**
     * Called when the user selects a person shown in the empty state view.
     */
    onSelectPerson: (personID: string) => void;
}

/**
 * The search bar is a styled "select" element that allow the user to type in
 * the attached input field, and shows a list of matching suggestions in a
 * dropdown.
 *
 * When the search input is empty, it shows some general information in the
 * dropdown instead (e.g. the ML indexing status).
 *
 * When the search input is not empty, it shows these {@link SearchSuggestion}s.
 * Alongside each suggestion is shows a count of matching files, and some
 * previews.
 *
 * Selecting one of the these suggestions causes the gallery to shows a filtered
 * list of files that match that suggestion.
 */
export const SearchBar: React.FC<SearchBarProps> = ({
    isInSearchMode,
    onShowSearchInput,
    ...rest
}) => {
    const isSmallWidth = useIsSmallWidth();

    return (
        <Box sx={{ flex: 1, px: ["4px", "24px"] }}>
            {isSmallWidth && !isInSearchMode ? (
                <MobileSearchArea onSearch={onShowSearchInput} />
            ) : (
                <SearchInput {...{ isInSearchMode }} {...rest} />
            )}
        </Box>
    );
};

interface MobileSearchAreaProps {
    /** Called when the user presses the search button. */
    onSearch: () => void;
}

const MobileSearchArea: React.FC<MobileSearchAreaProps> = ({ onSearch }) => (
    <Stack direction="row" sx={{ alignItems: "center" }}>
        <EnteLogoBox
            sx={{
                // Move to the center.
                mx: "auto",
                // Offset on the left by the visual size of the search icon to
                // make it look visually centered.
                pl: "24px",
            }}
        >
            <EnteLogo height={15} />
        </EnteLogoBox>
        <IconButton onClick={onSearch}>
            <SearchIcon />
        </IconButton>
    </Stack>
);

const SearchInput: React.FC<Omit<SearchBarProps, "onShowSearchInput">> = ({
    isInSearchMode,
    onSelectSearchOption,
    onSelectPeople,
    onSelectPerson,
}) => {
    // A ref to the top level Select.
    const selectRef = useRef<SelectInstance<SearchOption> | null>(null);
    // The currently selected option.
    //
    // We need to use `null` instead of `undefined` to indicate missing values,
    // because using `undefined` instead moves the Select from being a controlled
    // component to an uncontrolled component.
    const [value, setValue] = useState<SearchOption | null>(null);
    // The contents of the input field associated with the select.
    const [inputValue, setInputValue] = useState("");

    const theme = useTheme();

    const styles = useMemo(() => createSelectStyles(theme), [theme]);
    const components = useMemo(() => ({ Control, Input, Option }), []);

    // Handle ctrl+K keyboard shortcut to focus search
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            // Check for ctrl+K (cmd+K on macOS)
            if ((event.metaKey || event.ctrlKey) && event.key === "k") {
                event.preventDefault();
                selectRef.current?.focus();
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, []);

    const handleChange = (value: SearchOption | null) => {
        const type = value?.suggestion.type;
        // Collection and people suggestions are handled differently - our
        // caller will switch to the corresponding view, dismissing search.
        if (type == "collection" || type == "person" || type == "sidebarAction") {
            setValue(null);
            setInputValue("");
        } else {
            setValue(value);
            setInputValue(value?.suggestion.label ?? "");
        }

        // Let our parent know the selection was changed.
        // When selecting an option, we should exit search mode if needed.
        onSelectSearchOption(nullToUndefined(value), {
            shouldExitSearchMode: true,
        });

        // The Select has a blurInputOnSelect prop, but that makes the input
        // field lose focus, not the entire menu (e.g. when pressing twice).
        //
        // We anyways need the ref so that we can blur on selecting a person
        // from the default options. So also use it to blur the entire Select
        // (including the menu) when the user selects an option.
        selectRef.current?.blur();
    };

    const handleInputChange = (value: string, actionMeta: InputActionMeta) => {
        if (actionMeta.action == "input-change") {
            setInputValue(value);

            // If the input is cleared, also clear the selected value.
            if (value === "") {
                setValue(null);
                setInputValue("");
                // Notify parent but don't exit search mode on mobile
                onSelectSearchOption(undefined, {
                    shouldExitSearchMode: false,
                });
            }
        }
    };

    const resetSearch = () => {
        // Dismiss the search menu if it is open.
        selectRef.current?.blur();

        // Clear all our state.
        setValue(null);
        setInputValue("");

        // Let our parent know and exit search mode entirely.
        onSelectSearchOption(undefined, { shouldExitSearchMode: true });
    };

    const handleSelectPeople = () => {
        resetSearch();
        onSelectPeople();
    };

    const handleSelectPerson = (personID: string) => {
        resetSearch();
        onSelectPerson(personID);
    };

    const handleFocus = () => {
        // A workaround to show the suggestions again for the current non-empty
        // search string if the user focuses back on the input field after
        // moving focus elsewhere.
        if (inputValue) {
            selectRef.current?.onInputChange(inputValue, {
                action: "set-value",
                prevInputValue: "",
            });
        }
    };

    return (
        <SearchInputWrapper>
            <AsyncSelect
                ref={selectRef}
                value={value}
                components={components}
                styles={styles}
                loadOptions={loadOptions}
                onChange={handleChange}
                inputValue={inputValue}
                onInputChange={handleInputChange}
                isClearable
                escapeClearsValue
                onFocus={handleFocus}
                placeholder={t("search_hint")}
                noOptionsMessage={({ inputValue }) =>
                    shouldShowEmptyState(inputValue) ? (
                        <EmptyState
                            onSelectPeople={handleSelectPeople}
                            onSelectPerson={handleSelectPerson}
                        />
                    ) : null
                }
            />

            {isInSearchMode && (
                <IconButton onClick={resetSearch}>
                    <CloseIcon />
                </IconButton>
            )}
        </SearchInputWrapper>
    );
};

const SearchInputWrapper = styled("div")`
    display: flex;
    width: 100%;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: transparent;
    max-width: 484px;
    margin: auto;
`;

const loadOptions = pDebounce(async (input: string) => {
    const [sidebarActions, photoOptions] = await Promise.all([
        sidebarSearchOptionsForString(input),
        searchOptionsForString(input),
    ]);
    return [...sidebarActions, ...photoOptions];
}, 250);

const createSelectStyles = (
    theme: Theme,
): StylesConfig<SearchOption, false> => ({
    container: (style) => ({ ...style, flex: 1 }),
    control: (style, { isFocused }) => ({
        ...style,
        backgroundColor: theme.vars.palette.background.searchInput,
        borderColor: isFocused ? theme.vars.palette.accent.main : "transparent",
        boxShadow: "none",
        ":hover": {
            borderColor: theme.vars.palette.accent.light,
            cursor: "text",
        },
    }),
    input: (styles) => ({
        ...styles,
        color: theme.vars.palette.text.base,
        overflowX: "hidden",
    }),
    menu: (style) => ({
        ...style,
        // Suppress the default margin at the top.
        marginTop: "1px",
        // Give an opaque and elevated surface color to the menu to override the
        // default (transparent).
        backgroundColor: theme.vars.palette.background.elevatedPaper,
    }),
    option: (style, { isFocused }) => ({
        ...style,
        padding: 0,
        backgroundColor: "transparent !important",
        "& :hover": { cursor: "pointer" },
        // Elevate the focused option further.
        "& .option-contents": isFocused
            ? { backgroundColor: theme.vars.palette.fill.fainter }
            : {},
        "&:last-child .MuiDivider-root": { display: "none" },
    }),
    placeholder: (style) => ({
        ...style,
        color: theme.vars.palette.text.muted,
        whiteSpace: "nowrap",
        overflowX: "hidden",
    }),
    // Hide some things we don't need.
    dropdownIndicator: (style) => ({ ...style, display: "none" }),
    indicatorSeparator: (style) => ({ ...style, display: "none" }),
    clearIndicator: (style) => ({ ...style, display: "none" }),
});

const Control = ({ children, ...props }: ControlProps<SearchOption, false>) => {
    // The shortcut UI element will be shown once the search bar supports searching the settings as well.
    // const isMac =
    //     typeof navigator !== "undefined" &&
    //     navigator.userAgent.toUpperCase().includes("MAC");
    // const shortcutKey = isMac ? "⌘ K" : "Ctrl + K";

    // const hasValue =
    //     props.getValue().length > 0 || props.selectProps.inputValue;

    return (
        <SelectComponents.Control {...props}>
            <Stack
                direction="row"
                sx={{
                    alignItems: "center",
                    // Fill the entire control (the control uses display flex).
                    flex: 1,
                }}
            >
                <Box
                    sx={{
                        display: "inline-flex",
                        // Match the default padding of the ValueContainer to make
                        // the icon look properly spaced and aligned.
                        pl: "8px",
                        color: "stroke.muted",
                    }}
                >
                    {iconForOption(props.getValue()[0])}
                </Box>
                {children}
                {/* {!hasValue && (
                    <Box
                        sx={{
                            display: ["none", "none", "inline-flex"],
                            alignItems: "center",
                            pr: "8px",
                            color: "text.faint",
                            fontSize: "12px",
                            fontFamily: "monospace",
                            border: "1px solid",
                            borderColor: "stroke.faint",
                            borderRadius: "4px",
                            px: "6px",
                            py: "2px",
                            mr: "8px",
                        }}
                    >
                        {shortcutKey}
                    </Box>
                )} */}
            </Stack>
        </SelectComponents.Control>
    );
};

const iconForOption = (option: SearchOption | undefined) => {
    switch (option?.suggestion.type) {
        case "fileName":
            return <ImageIcon />;
        case "date":
            return <CalendarIcon />;
        case "location":
        case "city":
            return <LocationIcon />;
        case "sidebarAction":
            return <SettingsIcon />;
        default:
            return <SearchIcon />;
    }
};

/**
 * A custom input for react-select that is always visible.
 *
 * This is a workaround to allow the search string to be always displayed, and
 * editable, even after the user has moved focus away from it.
 */
const Input: React.FC<InputProps<SearchOption, false>> = (props) => (
    <SelectComponents.Input {...props} isHidden={false} />
);

/**
 * A preflight check for whether or not we should show the EmptyState.
 *
 * react-select seems to only suppress showing anything at all in the menu if we
 * return `null` from the function passed to `noOptionsMessage`. Returning
 * `false`, or returning `null` from the EmptyState itself doesn't work and
 * causes a empty div to be shown instead.
 */
const shouldShowEmptyState = (inputValue: string) => {
    // Don't show empty state if the user has entered search input.
    if (inputValue) return false;

    // Don't show empty state if there is no ML related information AND we're
    // not processing videos.

    if (!isMLSupported && !isHLSGenerationSupported) {
        // Neither of ML or HLS generation is supported on current client. This
        // is the code path for web.
        return false;
    }

    const mlStatus = mlStatusSnapshot();
    const vpStatus = hlsGenerationStatusSnapshot();
    if (
        (!mlStatus || mlStatus.phase == "disabled") &&
        (!vpStatus?.enabled || vpStatus.status != "processing")
    ) {
        // ML is either not supported or currently disabled AND video processing
        // is either not supported or currently not happening. Don't show the
        // empty state.
        return false;
    }

    // Show it otherwise.
    return true;
};

/**
 * The view shown in the menu area when the user has not typed anything in the
 * search box.
 */
const EmptyState: React.FC<
    Pick<SearchBarProps, "onSelectPeople" | "onSelectPerson">
> = ({ onSelectPeople, onSelectPerson }) => {
    const mlStatus = useMLStatusSnapshot();
    const people = usePeopleStateSnapshot()?.visiblePeople;
    const vpStatus = useHLSGenerationStatusSnapshot();

    let label: string | undefined;
    switch (mlStatus?.phase) {
        case undefined:
        case "disabled":
        case "done":
            // If ML is not running, see if video processing is.
            if (vpStatus?.enabled && vpStatus.status == "processing") {
                label = t("processing_videos_status");
            }
            break;
        case "scheduled":
            label = t("indexing_scheduled");
            break;
        case "indexing":
            label = t("indexing_photos");
            break;
        case "fetching":
            label = t("indexing_fetching");
            break;
        case "clustering":
            label = t("indexing_people");
            break;
    }

    // If ML is disabled and we're not video processing, then don't show the
    // empty state content.
    if ((!mlStatus || mlStatus.phase == "disabled") && !label) {
        return <></>;
    }

    return (
        <Box sx={{ textAlign: "left" }}>
            {people && people.length > 0 && (
                <>
                    <SearchPeopleHeader onClick={onSelectPeople} />
                    <SearchPeopleList {...{ people, onSelectPerson }} />
                </>
            )}
            {label && (
                <Typography variant="mini" sx={{ mt: "5px", mb: "4px" }}>
                    {label}
                </Typography>
            )}
        </Box>
    );
};

const SearchPeopleHeader: React.FC<ButtonishProps> = ({ onClick }) => (
    <UnstyledButton {...{ onClick }}>
        <Typography
            sx={{ color: "text.muted", ":hover": { color: "text.base" } }}
        >
            {t("people")}
        </Typography>
    </UnstyledButton>
);

const Option: React.FC<OptionProps<SearchOption, false>> = (props) => (
    <SelectComponents.Option {...props}>
        <OptionContents data={props.data} />
        <Divider sx={{ mx: 2, my: 1 }} />
    </SelectComponents.Option>
);

const OptionContents = ({ data: option }: { data: SearchOption }) => {
    if (option.suggestion.type === "sidebarAction") {
        return (
            <Stack className="option-contents" sx={{ gap: "4px", px: 2, py: 1 }}>
                <Typography variant="mini" sx={{ color: "text.muted" }}>
                    {labelForOption(option)}
                </Typography>
                <Typography
                    sx={{
                        color: "text.base",
                        fontWeight: "medium",
                        wordBreak: "break-word",
                    }}
                >
                    {option.suggestion.label}
                </Typography>
                <Typography sx={{ color: "text.muted" }}>
                    {option.suggestion.path.join(" > ")}
                </Typography>
            </Stack>
        );
    }

    return (
        <Stack className="option-contents" sx={{ gap: "4px", px: 2, py: 1 }}>
            <Typography variant="mini" sx={{ color: "text.muted" }}>
                {labelForOption(option)}
            </Typography>
            <Stack
                direction="row"
                sx={{
                    gap: 1,
                    alignItems: "center",
                    justifyContent: "space-between",
                }}
            >
                <Box>
                    <Typography
                        sx={{
                            color: "text.base",
                            fontWeight: "medium",
                            wordBreak: "break-word",
                        }}
                    >
                        {option.suggestion.label}
                    </Typography>
                    <Typography sx={{ color: "text.muted" }}>
                        {t("photos_count", { count: option.fileCount })}
                    </Typography>
                </Box>

                <Stack direction="row" sx={{ gap: 1 }}>
                    {option.previewFiles.map((file) => (
                        <ItemCard
                            key={file.id}
                            coverFile={file}
                            TileComponent={PreviewItemTile}
                        />
                    ))}
                </Stack>
            </Stack>
        </Stack>
    );
};

const labelForOption = (option: SearchOption) => {
    switch (option.suggestion.type) {
        case "collection":
            return t("album");

        case "fileType":
            return t("file_type");

        case "fileName":
            return t("file_name");

        case "fileCaption":
            return t("description");

        case "date":
            return t("date");

        case "location":
            return t("location");

        case "city":
            return t("location");

        case "clip":
            return t("magic");

        case "person":
            return t("people");

        case "sidebarAction":
            return t("settings", { defaultValue: "Settings" });
    }
};
```

## `apps/photos/src/pages/gallery.tsx`
```tsx
// TODO: Audit this file (the code here is mostly fine, but needs revisiting
// the file it depends on have been audited and their interfaces fixed).
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-floating-promises */
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import FileUploadOutlinedIcon from "@mui/icons-material/FileUploadOutlined";
import MenuIcon from "@mui/icons-material/Menu";
import { IconButton, Link, Stack, Typography } from "@mui/material";
import { AuthenticateUser } from "components/AuthenticateUser";
import { GalleryBarAndListHeader } from "components/Collections/GalleryBarAndListHeader";
import { DownloadStatusNotifications } from "components/DownloadStatusNotifications";
import type { FileListHeaderOrFooter } from "components/FileList";
import { FileListWithViewer } from "components/FileListWithViewer";
import { FixCreationTime } from "components/FixCreationTime";
import { Sidebar } from "components/Sidebar";
import { Upload } from "components/Upload";
import { sessionExpiredDialogAttributes } from "ente-accounts/components/utils/dialog";
import {
    getAndClearIsFirstLogin,
    getAndClearJustSignedUp,
} from "ente-accounts/services/accounts-db";
import { stashRedirect } from "ente-accounts/services/redirect";
import { isSessionInvalid } from "ente-accounts/services/session";
import { ensureLocalUser } from "ente-accounts/services/user";
import type { MiniDialogAttributes } from "ente-base/components/MiniDialog";
import { NavbarBase } from "ente-base/components/Navbar";
import { SingleInputDialog } from "ente-base/components/SingleInputDialog";
import { CenteredRow } from "ente-base/components/containers";
import { TranslucentLoadingOverlay } from "ente-base/components/loaders";
import type { ButtonishProps } from "ente-base/components/mui";
import { FocusVisibleButton } from "ente-base/components/mui/FocusVisibleButton";
import { errorDialogAttributes } from "ente-base/components/utils/dialog";
import { useIsSmallWidth } from "ente-base/components/utils/hooks";
import { useModalVisibility } from "ente-base/components/utils/modal";
import { useBaseContext } from "ente-base/context";
import log from "ente-base/log";
import {
    clearSessionStorage,
    haveMasterKeyInSession,
    masterKeyFromSession,
} from "ente-base/session";
import { savedAuthToken } from "ente-base/token";
import { FullScreenDropZone } from "ente-gallery/components/FullScreenDropZone";
import { type UploadTypeSelectorIntent } from "ente-gallery/components/Upload";
import { useSaveGroups } from "ente-gallery/components/utils/save-groups";
import { type Collection } from "ente-media/collection";
import { type EnteFile } from "ente-media/file";
import { type ItemVisibility } from "ente-media/file-metadata";
import {
    CollectionSelector,
    type CollectionSelectorAttributes,
} from "ente-new/photos/components/CollectionSelector";
import { Export } from "ente-new/photos/components/Export";
import { PlanSelector } from "ente-new/photos/components/PlanSelector";
import {
    SearchBar,
    type SearchBarProps,
} from "ente-new/photos/components/SearchBar";
import {
    SelectedFileOptions,
    type CollectionOp,
    type FileOp,
} from "ente-new/photos/components/SelectedFileOptions";
import { WhatsNew } from "ente-new/photos/components/WhatsNew";
import {
    GalleryEmptyState,
    PeopleEmptyState,
    SearchResultsHeader,
    type RemotePullOpts,
} from "ente-new/photos/components/gallery";
import {
    findCollectionCreatingUncategorizedIfNeeded,
    performCollectionOp,
    validateKey,
} from "ente-new/photos/components/gallery/helpers";
import {
    useGalleryReducer,
    type GalleryBarMode,
} from "ente-new/photos/components/gallery/reducer";
import { notifyOthersFilesDialogAttributes } from "ente-new/photos/components/utils/dialog-attributes";
import { useIsOffline } from "ente-new/photos/components/utils/use-is-offline";
import {
    usePeopleStateSnapshot,
    useUserDetailsSnapshot,
} from "ente-new/photos/components/utils/use-snapshot";
import { shouldShowWhatsNew } from "ente-new/photos/services/changelog";
import {
    addToFavoritesCollection,
    createAlbum,
    removeFromCollection,
    removeFromFavoritesCollection,
} from "ente-new/photos/services/collection";
import {
    haveOnlySystemCollections,
    PseudoCollectionID,
} from "ente-new/photos/services/collection-summary";
import exportService from "ente-new/photos/services/export";
import { updateFilesVisibility } from "ente-new/photos/services/file";
import {
    savedCollectionFiles,
    savedCollections,
    savedTrashItems,
} from "ente-new/photos/services/photos-fdb";
import {
    postPullFiles,
    prePullFiles,
    pullFiles,
} from "ente-new/photos/services/pull";
import {
    filterSearchableFiles,
    updateSearchCollectionsAndFiles,
} from "ente-new/photos/services/search";
import type {
    SearchOption,
    SidebarActionID,
} from "ente-new/photos/services/search/types";
import { initSettings } from "ente-new/photos/services/settings";
import {
    redirectToCustomerPortal,
    savedUserDetailsOrTriggerPull,
    verifyStripeSubscription,
} from "ente-new/photos/services/user-details";
import { usePhotosAppContext } from "ente-new/photos/types/context";
import { PromiseQueue } from "ente-utils/promise";
import { t } from "i18next";
import { useRouter, type NextRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FileWithPath } from "react-dropzone";
import { Trans } from "react-i18next";
import { uploadManager } from "services/upload-manager";
import {
    getSelectedFiles,
    performFileOp,
    type SelectedState,
} from "utils/file";

/**
 * The default view for logged in users.
 *
 * I heard you like ASCII art.
 *
 *        Navbar / Search         ^
 *     ---------------------      |
 *          Gallery Bar         sticky
 *     ---------------------   ---/---
 *       Photo List Header    scrollable
 *     ---------------------      |
 *           Photo List           v
 */
const Page: React.FC = () => {
    const { logout, showMiniDialog, onGenericError } = useBaseContext();
    const { showLoadingBar, hideLoadingBar, watchFolderView } =
        usePhotosAppContext();

    const isOffline = useIsOffline();
    const [state, dispatch] = useGalleryReducer();

    const [isFirstLoad, setIsFirstLoad] = useState(false);
    const [selected, setSelected] = useState<SelectedState>({
        ownCount: 0,
        count: 0,
        collectionID: 0,
        context: { mode: "albums", collectionID: PseudoCollectionID.all },
    });
    const [blockingLoad, setBlockingLoad] = useState(false);
    const [shouldDisableDropzone, setShouldDisableDropzone] = useState(false);
    const [dragAndDropFiles, setDragAndDropFiles] = useState<FileWithPath[]>(
        [],
    );
    const [isFileViewerOpen, setIsFileViewerOpen] = useState(false);

    /**
     * A queue to serialize calls to {@link remoteFilesPull}.
     */
    const remoteFilesPullQueue = useRef(new PromiseQueue<void>());
    /**
     * A queue to serialize calls to {@link remotePull}.
     */
    const remotePullQueue = useRef(new PromiseQueue<void>());

    const [uploadTypeSelectorView, setUploadTypeSelectorView] = useState(false);
    const [uploadTypeSelectorIntent, setUploadTypeSelectorIntent] =
        useState<UploadTypeSelectorIntent>("upload");

    // If the fix creation time dialog is being shown, then the list of files on
    // which it should act.
    const [fixCreationTimeFiles, setFixCreationTimeFiles] = useState<
        EnteFile[]
    >([]);
    const [fileListHeader, setFileListHeader] = useState<
        FileListHeaderOrFooter | undefined
    >(undefined);

    const [openCollectionSelector, setOpenCollectionSelector] = useState(false);
    const [collectionSelectorAttributes, setCollectionSelectorAttributes] =
        useState<CollectionSelectorAttributes | undefined>();
    const [pendingSidebarAction, setPendingSidebarAction] =
        useState<SidebarActionID | undefined>(undefined);

    const userDetails = useUserDetailsSnapshot();
    const peopleState = usePeopleStateSnapshot();

    const { saveGroups, onAddSaveGroup, onRemoveSaveGroup } = useSaveGroups();
    const [, setPostCreateAlbumOp] = useState<CollectionOp | undefined>(
        undefined,
    );

    /**
     * The last time (epoch milliseconds) when we prompted the user for their
     * password when opening the hidden section.
     *
     * This is used to implement a grace window, where we don't reprompt them
     * for their password for the same purpose again and again.
     */
    const lastAuthenticationForHiddenTimestamp = useRef<number>(0);

    const { show: showSidebar, props: sidebarVisibilityProps } =
        useModalVisibility();
    const { show: showPlanSelector, props: planSelectorVisibilityProps } =
        useModalVisibility();
    const { show: showWhatsNew, props: whatsNewVisibilityProps } =
        useModalVisibility();
    const { show: showFixCreationTime, props: fixCreationTimeVisibilityProps } =
        useModalVisibility();
    const { show: showExport, props: exportVisibilityProps } =
        useModalVisibility();
    const {
        show: showAuthenticateUser,
        props: authenticateUserVisibilityProps,
    } = useModalVisibility();
    const { show: showAlbumNameInput, props: albumNameInputVisibilityProps } =
        useModalVisibility();

    const onAuthenticateCallback = useRef<(() => void) | undefined>(undefined);

    const authenticateUser = useCallback(
        () =>
            new Promise<void>((resolve) => {
                onAuthenticateCallback.current = resolve;
                showAuthenticateUser();
            }),
        [],
    );

    // Local aliases.
    const {
        user,
        favoriteFileIDs,
        collectionNameByID,
        fileNormalCollectionIDs,
        normalCollectionSummaries,
        pendingFavoriteUpdates,
        pendingVisibilityUpdates,
        isInSearchMode,
        filteredFiles,
    } = state;

    // Derived aliases.
    const barMode = state.view?.type ?? "albums";
    const activeCollectionID =
        state.view?.type == "people"
            ? undefined
            : state.view?.activeCollectionSummaryID;
    const activeCollection =
        state.view?.type == "people" ? undefined : state.view?.activeCollection;
    const activeCollectionSummary =
        state.view?.type == "people"
            ? undefined
            : state.view?.activeCollectionSummary;
    const activePerson =
        state.view?.type == "people" ? state.view.activePerson : undefined;
    const activePersonID = activePerson?.id;

    // TODO: Move into reducer
    const barCollectionSummaries = useMemo(
        () =>
            barMode == "hidden-albums"
                ? state.hiddenCollectionSummaries
                : state.normalCollectionSummaries,
        [
            barMode,
            state.hiddenCollectionSummaries,
            state.normalCollectionSummaries,
        ],
    );

    if (process.env.NEXT_PUBLIC_ENTE_TRACE) console.log("render", state);

    const router = useRouter();

    useEffect(() => {
        const electron = globalThis.electron;
        let syncIntervalID: ReturnType<typeof setInterval> | undefined;

        void (async () => {
            if (!haveMasterKeyInSession() || !(await savedAuthToken())) {
                // If we don't have master key or auth token, reauthenticate.
                stashRedirect("/gallery");
                router.push("/");
                return;
            }

            if (!(await validateKey())) {
                // If we have credentials but they can't be decrypted, reset.
                //
                // This code is never expected to run, it is only kept as a
                // safety valve.
                logout();
                return;
            }

            // We are logged in and everything looks fine. Proceed with page
            // load initialization.

            // One time inits.
            preloadImage("/images/subscription-card-background");
            initSettings();
            setupSelectAllKeyBoardShortcutHandler();

            // Show the initial state while the rest of the sequence proceeds.
            dispatch({ type: "showAll" });

            // If this is the user's first login on this client, then show them
            // a message informing the that the initial load might take time.
            setIsFirstLoad(getAndClearIsFirstLogin());

            // If the user created a new account on this client, show them the
            // plan options.
            if (getAndClearJustSignedUp()) {
                showPlanSelector();
            }

            // Initialize the reducer.
            const user = ensureLocalUser();
            const userDetails = await savedUserDetailsOrTriggerPull();
            dispatch({
                type: "mount",
                user,
                familyData: userDetails?.familyData,
                collections: await savedCollections(),
                collectionFiles: await savedCollectionFiles(),
                trashItems: await savedTrashItems(),
            });

            // Fetch data from remote.
            await remotePull();

            // Clear the first load message if needed.
            setIsFirstLoad(false);

            // Start the interval that does a periodic pull.
            syncIntervalID = setInterval(
                () => remotePull({ silent: true }),
                5 * 60 * 1000 /* 5 minutes */,
            );

            if (electron) {
                electron.onMainWindowFocus(() => remotePull({ silent: true }));
                if (await shouldShowWhatsNew(electron)) showWhatsNew();
            }
        })();

        return () => {
            clearInterval(syncIntervalID);
            if (electron) electron.onMainWindowFocus(undefined);
        };
    }, []);

    useEffect(() => {
        // Only act on updates after the initial mount has completed.
        if (state.user && userDetails) {
            dispatch({ type: "setUserDetails", userDetails });
        }
    }, [state.user, userDetails]);

    useEffect(() => {
        if (typeof activeCollectionID == "undefined" || !router.isReady) {
            return;
        }
        let collectionURL = "";
        if (activeCollectionID !== PseudoCollectionID.all) {
            // TODO: Is this URL param even used?
            collectionURL = `?collection=${activeCollectionID}`;
        }
        const href = `/gallery${collectionURL}`;
        router.push(href, undefined, { shallow: true });
    }, [activeCollectionID, router.isReady]);

    useEffect(() => {
        if (router.isReady && haveMasterKeyInSession()) {
            handleSubscriptionCompletionRedirectIfNeeded(
                showMiniDialog,
                showLoadingBar,
                router,
            );
        }
    }, [router.isReady]);

    useEffect(() => {
        updateSearchCollectionsAndFiles(
            state.collections,
            state.collectionFiles,
            state.hiddenCollectionIDs,
            state.hiddenFileIDs,
        );
    }, [
        state.collections,
        state.collectionFiles,
        state.hiddenCollectionIDs,
        state.hiddenFileIDs,
    ]);

    useEffect(() => {
        dispatch({ type: "setPeopleState", peopleState });
    }, [peopleState]);

    useEffect(() => {
        if (isInSearchMode && state.searchSuggestion) {
            setFileListHeader({
                component: (
                    <SearchResultsHeader
                        searchSuggestion={state.searchSuggestion}
                        fileCount={state.searchResults?.length ?? 0}
                    />
                ),
                height: 104,
            });
        }
    }, [isInSearchMode, state.searchSuggestion, state.searchResults]);

    useEffect(() => {
        const pendingSearchSuggestion = state.pendingSearchSuggestions.at(-1);
        if (!state.isRecomputingSearchResults && pendingSearchSuggestion) {
            dispatch({ type: "updatingSearchResults" });
            filterSearchableFiles(pendingSearchSuggestion).then(
                (searchResults) => {
                    dispatch({ type: "setSearchResults", searchResults });
                },
            );
        }
    }, [state.isRecomputingSearchResults, state.pendingSearchSuggestions]);

    const selectAll = (e: KeyboardEvent) => {
        // Don't intercept Ctrl/Cmd + a if the user is typing in a text field.
        if (
            e.target instanceof HTMLInputElement ||
            e.target instanceof HTMLTextAreaElement
        ) {
            return;
        }

        // Prevent the browser's default select all handling (selecting all the
        // text in the gallery).
        e.preventDefault();

        // Don't select all if:
        if (
            // - We haven't fetched the user yet;
            !user ||
            // - There is nothing to select;
            !filteredFiles.length ||
            // - Any of the modals are open.
            uploadTypeSelectorView ||
            openCollectionSelector ||
            sidebarVisibilityProps.open ||
            planSelectorVisibilityProps.open ||
            fixCreationTimeVisibilityProps.open ||
            exportVisibilityProps.open ||
            authenticateUserVisibilityProps.open ||
            albumNameInputVisibilityProps.open ||
            isFileViewerOpen
        ) {
            return;
        }

        // Create a selection with everything based on the current context.
        const selected = {
            ownCount: 0,
            count: 0,
            collectionID: activeCollectionID,
            context:
                barMode == "people" && activePersonID
                    ? { mode: "people" as const, personID: activePersonID }
                    : {
                          mode: barMode as "albums" | "hidden-albums",
                          collectionID: activeCollectionID!,
                      },
        };

        filteredFiles.forEach((item) => {
            if (item.ownerID === user.id) {
                selected.ownCount++;
            }
            selected.count++;
            // @ts-expect-error Selection code needs type fixing
            selected[item.id] = true;
        });
        setSelected(selected);
    };

    const clearSelection = () => {
        if (!selected.count) {
            return;
        }
        setSelected({
            ownCount: 0,
            count: 0,
            collectionID: 0,
            context: undefined,
        });
    };

    const keyboardShortcutHandlerRef = useRef({ selectAll, clearSelection });

    useEffect(() => {
        keyboardShortcutHandlerRef.current = { selectAll, clearSelection };
    }, [selectAll, clearSelection]);

    const showSessionExpiredDialog = useCallback(
        () => showMiniDialog(sessionExpiredDialogAttributes(logout)),
        [showMiniDialog, logout],
    );

    // [Note: Visual feedback to acknowledge user actions]
    //
    // In some infrequent cases, we want to acknowledge some user action (e.g.
    // pressing a keyboard shortcut which doesn't have an immediate on-screen
    // impact). In these cases, we tickle the loading bar at the top to
    // acknowledge that their action.
    const handleVisualFeedback = useCallback(() => {
        showLoadingBar();
        setTimeout(hideLoadingBar, 0);
    }, [showLoadingBar, hideLoadingBar]);

    /**
     * Pull latest collections, collection files and trash items from remote.
     *
     * This wraps the vanilla {@link pullFiles} with two adornments:
     *
     * 1. Any local database updates due to the pull are also reflected in state
     *    updates to the Gallery's reducer.
     *
     * 2. Parallel calls are serialized so that there is only one invocation of
     *    the underlying {@link pullFiles} at a time.
     *
     * [Note: Full remote pull vs files pull]
     *
     * For interactive operations, if we know that our operation will not have
     * other transitive effects beyond collections, collection files and trash,
     * this is a better option as compared to a full remote pull since it
     * involves a lesser number of API requests (and thus, time).
     */
    const remoteFilesPull = useCallback(
        () =>
            remoteFilesPullQueue.current.add(() =>
                pullFiles({
                    onSetCollections: (collections) =>
                        dispatch({ type: "setCollections", collections }),
                    onSetCollectionFiles: (collectionFiles) =>
                        dispatch({
                            type: "setCollectionFiles",
                            collectionFiles,
                        }),
                    onSetTrashedItems: (trashItems) =>
                        dispatch({ type: "setTrashItems", trashItems }),
                    onDidUpdateCollectionFiles: () =>
                        exportService.onLocalFilesUpdated(),
                }),
            ),
        [],
    );

    /**
     * Perform a serialized full remote pull, also updating our component state
     * to match the updates to the local database.
     *
     * See {@link remoteFilesPull} for the general concept. This is a similar
     * wrapper over the full remote pull sequence which also adds pre-flight
     * checks (e.g. to ensure that the user's session has not expired).
     *
     * This method will usually not throw; exceptions during the pull itself are
     * caught. This is so that this promise can be unguardedly awaited without
     * failing the main operations it forms the tail end of: the remote changes
     * would've already been successfully applied, and possibly transient pull
     * failures should get resolved on the next retry.
     */
    const remotePull = useCallback(
        async (opts?: RemotePullOpts) =>
            remotePullQueue.current.add(async () => {
                const { silent } = opts ?? {};

                // Pre-flight checks.
                if (!navigator.onLine) return;
                if (await isSessionInvalid()) {
                    showSessionExpiredDialog();
                    return;
                }
                if (!(await masterKeyFromSession())) {
                    clearSessionStorage();
                    router.push("/credentials");
                    return;
                }

                // The pull itself.
                try {
                    if (!silent) showLoadingBar();
                    await prePullFiles();
                    await remoteFilesPull();
                    await postPullFiles();
                } catch (e) {
                    log.error("Remote pull failed", e);
                } finally {
                    dispatch({ type: "clearUnsyncedState" });
                    if (!silent) hideLoadingBar();
                }
            }),
        [
            showLoadingBar,
            hideLoadingBar,
            router,
            showSessionExpiredDialog,
            remoteFilesPull,
        ],
    );

    const setupSelectAllKeyBoardShortcutHandler = () => {
        const handleKeyUp = (e: KeyboardEvent) => {
            switch (e.key) {
                case "Escape":
                    keyboardShortcutHandlerRef.current.clearSelection();
                    break;
                case "a":
                    if (e.ctrlKey || e.metaKey) {
                        keyboardShortcutHandlerRef.current.selectAll(e);
                    }
                    break;
            }
        };
        document.addEventListener("keydown", handleKeyUp);
        return () => {
            document.removeEventListener("keydown", handleKeyUp);
        };
    };

    const handleRemoveFilesFromCollection = (collection: Collection) => {
        void (async () => {
            showLoadingBar();
            let notifyOthersFiles = false;
            try {
                setOpenCollectionSelector(false);
                const selectedFiles = getSelectedFiles(selected, filteredFiles);
                const processedCount = await removeFromCollection(
                    collection,
                    selectedFiles,
                );
                notifyOthersFiles = processedCount != selectedFiles.length;
                clearSelection();
                await remotePull({ silent: true });
            } catch (e) {
                onGenericError(e);
            } finally {
                hideLoadingBar();
            }

            if (notifyOthersFiles) {
                showMiniDialog(notifyOthersFilesDialogAttributes());
            }
        })();
    };

    const createOnSelectForCollectionOp =
        (op: CollectionOp) => (selectedCollection: Collection) => {
            void (async () => {
                showLoadingBar();
                try {
                    setOpenCollectionSelector(false);
                    const selectedFiles = getSelectedFiles(
                        selected,
                        filteredFiles,
                    );
                    const userFiles = selectedFiles.filter(
                        // If a selection is happening, there must be a user.
                        (f) => f.ownerID == user!.id,
                    );
                    const sourceCollectionID = selected.collectionID;
                    if (userFiles.length > 0) {
                        await performCollectionOp(
                            op,
                            selectedCollection,
                            userFiles,
                            sourceCollectionID,
                        );
                    }
                    // See: [Note: Add and move of non-user files]
                    if (userFiles.length != selectedFiles.length) {
                        showMiniDialog(notifyOthersFilesDialogAttributes());
                    }
                    clearSelection();
                    await remotePull({ silent: true });
                } catch (e) {
                    onGenericError(e);
                } finally {
                    hideLoadingBar();
                }
            })();
        };

    const createOnCreateForCollectionOp = useCallback(
        (op: CollectionOp) => {
            setPostCreateAlbumOp(op);
            return showAlbumNameInput;
        },
        [showAlbumNameInput],
    );

    const handleAlbumNameSubmit = useCallback(
        async (name: string) => {
            const collection = await createAlbum(name);
            setPostCreateAlbumOp((postCreateAlbumOp) => {
                // The function returned by createHandleCollectionOp does its
                // own progress and error reporting, defer to that.
                createOnSelectForCollectionOp(postCreateAlbumOp!)(collection);
                return undefined;
            });
        },
        [createOnSelectForCollectionOp],
    );

    const createFileOpHandler = (op: FileOp) => () => {
        void (async () => {
            showLoadingBar();
            try {
                // When hiding use all non-hidden files instead of the filtered
                // files since we want to move all files copies to the hidden
                // collection.
                const opFiles =
                    op == "hide"
                        ? state.collectionFiles.filter(
                              (f) => !state.hiddenFileIDs.has(f.id),
                          )
                        : filteredFiles;
                const selectedFiles = getSelectedFiles(selected, opFiles);
                const toProcessFiles =
                    op == "download"
                        ? selectedFiles
                        : selectedFiles.filter(
                              // There'll be a user if files are being selected.
                              (file) => file.ownerID == user!.id,
                          );
                if (toProcessFiles.length > 0) {
                    await performFileOp(
                        op,
                        toProcessFiles,
                        onAddSaveGroup,
                        handleMarkTempDeleted,
                        () => dispatch({ type: "clearTempDeleted" }),
                        (files) => dispatch({ type: "markTempHidden", files }),
                        () => dispatch({ type: "clearTempHidden" }),
                        (files) => {
                            setFixCreationTimeFiles(files);
                            showFixCreationTime();
                        },
                    );
                }
                // Apart from download, the other operations currently only work
                // on the user's own files.
                //
                // See: [Note: Add and move of non-user files].
                if (toProcessFiles.length != selectedFiles.length) {
                    showMiniDialog(notifyOthersFilesDialogAttributes());
                }
                clearSelection();
                await remotePull({ silent: true });
            } catch (e) {
                onGenericError(e);
            } finally {
                hideLoadingBar();
            }
        })();
    };

    const handleSelectSearchOption = (
        searchOption: SearchOption | undefined,
        options?: { shouldExitSearchMode?: boolean },
    ) => {
        if (searchOption) {
            const type = searchOption.suggestion.type;
            if (type == "collection") {
                dispatch({
                    type: "showCollectionSummary",
                    collectionSummaryID: searchOption.suggestion.collectionID,
                });
            } else if (type == "person") {
                dispatch({
                    type: "showPerson",
                    personID: searchOption.suggestion.person.id,
                });
            } else if (type == "sidebarAction") {
                setPendingSidebarAction(searchOption.suggestion.actionID);
                showSidebar();
                const shouldExitSearchMode =
                    options?.shouldExitSearchMode ?? true;
                dispatch({ type: "exitSearch", shouldExitSearchMode });
            } else {
                dispatch({
                    type: "enterSearchMode",
                    searchSuggestion: searchOption.suggestion,
                });
            }
        } else {
            // Pass shouldExitSearchMode to the reducer (defaults to true for backward compatibility)
            const shouldExitSearchMode = options?.shouldExitSearchMode ?? true;
            dispatch({ type: "exitSearch", shouldExitSearchMode });
        }
    };

    const openUploader = (intent?: UploadTypeSelectorIntent) => {
        if (uploadManager.isUploadInProgress()) return;
        setUploadTypeSelectorView(true);
        setUploadTypeSelectorIntent(intent ?? "upload");
    };

    const handleShowCollectionSummaryWithID = useCallback(
        (collectionSummaryID: number | undefined) => {
            // Trigger a pull of the latest data from remote when opening the trash.
            //
            // This is needed for a specific scenario:
            //
            // 1. User deletes a collection, selecting the option to delete files.
            // 2. Museum acks, and then client does a trash pull.
            //
            // This trash pull will not contain the files that belonged to the
            // collection that got deleted because the collection deletion is a
            // asynchronous operation.
            //
            // So the user might not see the entry for the just deleted file if they
            // were to go to the trash meanwhile (until the next pull happens). To
            // avoid this, we trigger a trash pull whenever it is opened.
            if (collectionSummaryID == PseudoCollectionID.trash) {
                void remoteFilesPull();
            }

            dispatch({ type: "showCollectionSummary", collectionSummaryID });
        },
        [],
    );

    /**
     * Switch to gallery view to show a collection or pseudo-collection.
     *
     * @param collectionSummaryID The ID of the {@link CollectionSummary} to
     * show. If not provided, show the "All" section.
     *
     * @param isHidden If `true`, then any reauthentication as appropriate
     * before switching to the hidden section of the app is performed first
     * before before switching to the relevant collection or pseudo-collection.
     */
    const showCollectionSummary = useCallback(
        async (
            collectionSummaryID: number | undefined,
            isHiddenCollectionSummary: boolean | undefined,
        ) => {
            const lastAuthAt = lastAuthenticationForHiddenTimestamp.current;
            if (
                isHiddenCollectionSummary &&
                barMode != "hidden-albums" &&
                Date.now() - lastAuthAt > 5 * 60 * 1e3 /* 5 minutes */
            ) {
                await authenticateUser();
                lastAuthenticationForHiddenTimestamp.current = Date.now();
            }
            handleShowCollectionSummaryWithID(collectionSummaryID);
        },
        [authenticateUser, handleShowCollectionSummaryWithID, barMode],
    );

    const handleSidebarShowCollectionSummary = showCollectionSummary;

    const handleDownloadStatusNotificationsShowCollectionSummary = useCallback(
        (
            collectionSummaryID: number | undefined,
            isHiddenCollectionSummary: boolean | undefined,
        ) => {
            void showCollectionSummary(
                collectionSummaryID,
                isHiddenCollectionSummary,
            );
        },
        [showCollectionSummary],
    );

    const handleChangeBarMode = (mode: GalleryBarMode) =>
        mode == "people"
            ? dispatch({ type: "showPeople" })
            : dispatch({ type: "showAlbums" });

    const handleFileViewerToggleFavorite = useCallback(
        async (file: EnteFile) => {
            const fileID = file.id;
            const isFavorite = favoriteFileIDs.has(fileID);

            dispatch({ type: "addPendingFavoriteUpdate", fileID });
            try {
                const action = isFavorite
                    ? removeFromFavoritesCollection
                    : addToFavoritesCollection;
                await action([file]);
                dispatch({
                    type: "unsyncedFavoriteUpdate",
                    fileID,
                    isFavorite: !isFavorite,
                });
            } finally {
                dispatch({ type: "removePendingFavoriteUpdate", fileID });
            }
        },
        [user, favoriteFileIDs],
    );

    const handleFileViewerFileVisibilityUpdate = useCallback(
        async (file: EnteFile, visibility: ItemVisibility) => {
            const fileID = file.id;
            dispatch({ type: "addPendingVisibilityUpdate", fileID });
            try {
                await updateFilesVisibility([file], visibility);
                // [Note: Interactive updates to file metadata]
                //
                // 1. Update the remote metadata.
                //
                // 2. Construct a fake a metadata object with the updates
                //    reflected in it.
                //
                // 3. The caller (eventually) triggers a remote pull in the
                //    background, but meanwhile uses this updated metadata.
                //
                // TODO: Replace with files pull?
                dispatch({
                    type: "unsyncedPrivateMagicMetadataUpdate",
                    fileID,
                    privateMagicMetadata: {
                        ...file.magicMetadata,
                        count: file.magicMetadata?.count ?? 0,
                        version: (file.magicMetadata?.version ?? 0) + 1,
                        data: { ...file.magicMetadata?.data, visibility },
                    },
                });
            } finally {
                dispatch({ type: "removePendingVisibilityUpdate", fileID });
            }
        },
        [],
    );

    const handleMarkTempDeleted = useCallback(
        (files: EnteFile[]) => dispatch({ type: "markTempDeleted", files }),
        [],
    );

    const handleSelectCollection = useCallback(
        (collectionID: number) =>
            dispatch({
                type: "showCollectionSummary",
                collectionSummaryID: collectionID,
            }),
        [],
    );

    const handleSelectPerson = useCallback(
        (personID: string) => dispatch({ type: "showPerson", personID }),
        [],
    );

    const handleOpenCollectionSelector = useCallback(
        (attributes: CollectionSelectorAttributes) => {
            setCollectionSelectorAttributes(attributes);
            setOpenCollectionSelector(true);
        },
        [],
    );

    const handleCloseCollectionSelector = useCallback(
        () => setOpenCollectionSelector(false),
        [],
    );

    const showAppDownloadFooter =
        state.collectionFiles.length < 30 && !isInSearchMode;

    const fileListFooter = useMemo(
        () => (showAppDownloadFooter ? createAppDownloadFooter() : undefined),
        [showAppDownloadFooter],
    );

    const showSelectionBar =
        selected.count > 0 && selected.collectionID === activeCollectionID;

    if (!user) {
        // Don't render until we dispatch "mount" with the logged in user.
        //
        // Tag: [Note: Gallery children can assume user]
        return <div></div>;
    }

    return (
        <FullScreenDropZone
            message={
                watchFolderView ? t("watch_folder_dropzone_hint") : undefined
            }
            disabled={shouldDisableDropzone}
            onDrop={setDragAndDropFiles}
        >
            {blockingLoad && <TranslucentLoadingOverlay />}
            <PlanSelector
                {...planSelectorVisibilityProps}
                setLoading={(v) => setBlockingLoad(v)}
            />
            <CollectionSelector
                open={openCollectionSelector}
                onClose={handleCloseCollectionSelector}
                attributes={collectionSelectorAttributes}
                collectionSummaries={normalCollectionSummaries}
                collectionForCollectionSummaryID={(id) =>
                    findCollectionCreatingUncategorizedIfNeeded(
                        state.collections,
                        id,
                    )
                }
            />
            <DownloadStatusNotifications
                {...{ saveGroups, onRemoveSaveGroup }}
                onShowCollectionSummary={
                    handleDownloadStatusNotificationsShowCollectionSummary
                }
            />
            <FixCreationTime
                {...fixCreationTimeVisibilityProps}
                files={fixCreationTimeFiles}
                onRemotePull={remotePull}
            />
            <NavbarBase
                sx={[
                    {
                        mb: "12px",
                        px: "24px",
                        "@media (width < 720px)": { px: "4px" },
                    },
                    showSelectionBar && { borderColor: "accent.main" },
                ]}
            >
                {showSelectionBar ? (
                    <SelectedFileOptions
                        barMode={barMode}
                        isInSearchMode={isInSearchMode}
                        collection={
                            isInSearchMode ? undefined : activeCollection
                        }
                        collectionSummary={
                            isInSearchMode ? undefined : activeCollectionSummary
                        }
                        selectedFileCount={selected.count}
                        selectedOwnFileCount={selected.ownCount}
                        onClearSelection={clearSelection}
                        onRemoveFilesFromCollection={
                            handleRemoveFilesFromCollection
                        }
                        onOpenCollectionSelector={handleOpenCollectionSelector}
                        {...{
                            createOnCreateForCollectionOp,
                            createOnSelectForCollectionOp,
                            createFileOpHandler,
                        }}
                    />
                ) : barMode == "hidden-albums" ? (
                    <HiddenSectionNavbarContents
                        onBack={() => dispatch({ type: "showAlbums" })}
                    />
                ) : (
                    <NormalNavbarContents
                        {...{ isInSearchMode }}
                        onSidebar={showSidebar}
                        onUpload={openUploader}
                        onShowSearchInput={() =>
                            dispatch({ type: "enterSearchMode" })
                        }
                        onSelectSearchOption={handleSelectSearchOption}
                        onSelectPeople={() => dispatch({ type: "showPeople" })}
                        onSelectPerson={handleSelectPerson}
                    />
                )}
            </NavbarBase>
            {isFirstLoad && <FirstLoadMessage />}
            {isOffline && <OfflineMessage />}

            <GalleryBarAndListHeader
                {...{
                    user,
                    // TODO: These are incorrect assertions, the types of the
                    // component need to be updated.
                    activeCollection: activeCollection!,
                    activeCollectionID: activeCollectionID!,
                    activePerson,
                    setFileListHeader,
                    saveGroups,
                    onAddSaveGroup,
                }}
                mode={barMode}
                shouldHide={isInSearchMode}
                barCollectionSummaries={barCollectionSummaries}
                emailByUserID={state.emailByUserID}
                shareSuggestionEmails={state.shareSuggestionEmails}
                people={
                    (state.view?.type == "people"
                        ? state.view.visiblePeople
                        : undefined) ?? []
                }
                onChangeMode={handleChangeBarMode}
                setBlockingLoad={setBlockingLoad}
                setActiveCollectionID={handleShowCollectionSummaryWithID}
                onRemotePull={remotePull}
                onSelectPerson={handleSelectPerson}
            />

            <Upload
                {...{
                    user,
                    dragAndDropFiles,
                    uploadTypeSelectorIntent,
                    uploadTypeSelectorView,
                }}
                isFirstUpload={haveOnlySystemCollections(
                    normalCollectionSummaries,
                )}
                activeCollection={activeCollection}
                closeUploadTypeSelector={setUploadTypeSelectorView.bind(
                    null,
                    false,
                )}
                setLoading={setBlockingLoad}
                setShouldDisableDropzone={setShouldDisableDropzone}
                onRemotePull={remotePull}
                onRemoteFilesPull={remoteFilesPull}
                onOpenCollectionSelector={handleOpenCollectionSelector}
                onCloseCollectionSelector={handleCloseCollectionSelector}
                onUploadFile={(file) => dispatch({ type: "uploadFile", file })}
                onShowPlanSelector={showPlanSelector}
                onShowSessionExpiredDialog={showSessionExpiredDialog}
            />
            <Sidebar
                {...sidebarVisibilityProps}
                pendingAction={pendingSidebarAction}
                onActionHandled={() => setPendingSidebarAction(undefined)}
                normalCollectionSummaries={normalCollectionSummaries}
                uncategorizedCollectionSummaryID={
                    state.uncategorizedCollectionSummaryID
                }
                onShowPlanSelector={showPlanSelector}
                onShowCollectionSummary={handleSidebarShowCollectionSummary}
                onShowExport={showExport}
                onAuthenticateUser={authenticateUser}
            />
            <WhatsNew {...whatsNewVisibilityProps} />
            {!isInSearchMode &&
            !isFirstLoad &&
            !state.collectionFiles.length &&
            activeCollectionID === PseudoCollectionID.all ? (
                <GalleryEmptyState
                    isUploadInProgress={uploadManager.isUploadInProgress()}
                    onUpload={openUploader}
                />
            ) : !isInSearchMode &&
              !isFirstLoad &&
              state.view?.type == "people" &&
              !state.view.activePerson ? (
                <PeopleEmptyState />
            ) : (
                <FileListWithViewer
                    mode={barMode}
                    modePlus={isInSearchMode ? "search" : barMode}
                    header={fileListHeader}
                    footer={fileListFooter}
                    user={user}
                    files={filteredFiles}
                    enableDownload={true}
                    disableGrouping={state.searchSuggestion?.type == "clip"}
                    enableSelect={true}
                    selected={selected}
                    setSelected={setSelected}
                    // TODO: Incorrect assertion, need to update the type
                    activeCollectionID={activeCollectionID!}
                    activePersonID={activePerson?.id}
                    isInIncomingSharedCollection={activeCollectionSummary?.attributes.has(
                        "sharedIncoming",
                    )}
                    isInHiddenSection={barMode == "hidden-albums"}
                    {...{
                        favoriteFileIDs,
                        collectionNameByID,
                        fileNormalCollectionIDs,
                        pendingFavoriteUpdates,
                        pendingVisibilityUpdates,
                        onAddSaveGroup,
                    }}
                    emailByUserID={state.emailByUserID}
                    onToggleFavorite={handleFileViewerToggleFavorite}
                    onFileVisibilityUpdate={
                        handleFileViewerFileVisibilityUpdate
                    }
                    onMarkTempDeleted={handleMarkTempDeleted}
                    onSetOpenFileViewer={setIsFileViewerOpen}
                    onRemotePull={remotePull}
                    onRemoteFilesPull={remoteFilesPull}
                    onVisualFeedback={handleVisualFeedback}
                    onSelectCollection={handleSelectCollection}
                    onSelectPerson={handleSelectPerson}
                />
            )}
            <Export {...exportVisibilityProps} {...{ collectionNameByID }} />
            <AuthenticateUser
                {...authenticateUserVisibilityProps}
                onAuthenticate={onAuthenticateCallback.current!}
            />
            <SingleInputDialog
                {...albumNameInputVisibilityProps}
                title={t("new_album")}
                label={t("album_name")}
                submitButtonTitle={t("create")}
                onSubmit={handleAlbumNameSubmit}
            />
        </FullScreenDropZone>
    );
};

export default Page;

const FirstLoadMessage: React.FC = () => (
    <CenteredRow>
        <Typography variant="small" sx={{ color: "text.muted" }}>
            {t("initial_load_delay_warning")}
        </Typography>
    </CenteredRow>
);

const OfflineMessage: React.FC = () => (
    <Typography
        variant="small"
        sx={{ bgcolor: "background.paper", p: 2, mb: 1, textAlign: "center" }}
    >
        {t("offline_message")}
    </Typography>
);

/**
 * Preload all three variants of a responsive image.
 */
const preloadImage = (imgBasePath: string) => {
    const srcset: string[] = [];
    for (let i = 1; i <= 3; i++) srcset.push(`${imgBasePath}/${i}x.png ${i}x`);
    new Image().srcset = srcset.join(",");
};

type NormalNavbarContentsProps = SearchBarProps & {
    /**
     * Called when the user activates the sidebar icon.
     */
    onSidebar: () => void;
    /**
     * Called when the user activates the upload button.
     */
    onUpload: () => void;
};

const NormalNavbarContents: React.FC<NormalNavbarContentsProps> = ({
    onSidebar,
    onUpload,
    ...props
}) => (
    <>
        {!props.isInSearchMode && <SidebarButton onClick={onSidebar} />}
        <SearchBar {...props} />
        {!props.isInSearchMode && <UploadButton onClick={onUpload} />}
    </>
);

const SidebarButton: React.FC<ButtonishProps> = ({ onClick }) => (
    <IconButton {...{ onClick }}>
        <MenuIcon />
    </IconButton>
);

const UploadButton: React.FC<ButtonishProps> = ({ onClick }) => {
    const disabled = uploadManager.isUploadInProgress();
    const isSmallWidth = useIsSmallWidth();

    const icon = <FileUploadOutlinedIcon />;

    return (
        <>
            {isSmallWidth ? (
                <IconButton {...{ onClick, disabled }}>{icon}</IconButton>
            ) : (
                <FocusVisibleButton
                    color="secondary"
                    startIcon={icon}
                    {...{ onClick, disabled }}
                >
                    {t("upload")}
                </FocusVisibleButton>
            )}
        </>
    );
};

interface HiddenSectionNavbarContentsProps {
    onBack: () => void;
}

const HiddenSectionNavbarContents: React.FC<
    HiddenSectionNavbarContentsProps
> = ({ onBack }) => (
    <Stack
        direction="row"
        sx={(theme) => ({
            gap: "24px",
            flex: 1,
            alignItems: "center",
            background: theme.vars.palette.background.default,
        })}
    >
        <IconButton onClick={onBack}>
            <ArrowBackIcon />
        </IconButton>
        <Typography sx={{ flex: 1 }}>{t("section_hidden")}</Typography>
    </Stack>
);

/**
 * When the payments app redirects back to us after a plan purchase or update
 * completes, it sets various query parameters to relay the status of the action
 * back to us.
 *
 * Check if these query parameters exist, and if so, act on them appropriately.
 */
const handleSubscriptionCompletionRedirectIfNeeded = async (
    showMiniDialog: (attributes: MiniDialogAttributes) => void,
    showLoadingBar: () => void,
    router: NextRouter,
) => {
    const { session_id: sessionID, status, reason } = router.query;

    if (status == "success") {
        try {
            const subscription = await verifyStripeSubscription(sessionID);
            showMiniDialog({
                title: t("thank_you"),
                message: (
                    <Trans
                        i18nKey="subscription_purchase_success"
                        values={{ date: subscription.expiryTime }}
                    />
                ),
                continue: { text: t("ok") },
                cancel: false,
            });
        } catch (e) {
            log.error("Subscription verification failed", e);
            showMiniDialog(
                errorDialogAttributes(t("subscription_verification_error")),
            );
        }
    } else if (status == "fail") {
        log.error(`Subscription purchase failed`, reason);
        switch (reason) {
            case "canceled":
                showMiniDialog({
                    message: t("subscription_purchase_cancelled"),
                    continue: { text: t("ok"), color: "primary" },
                    cancel: false,
                });
                break;
            case "requires_payment_method":
                showMiniDialog({
                    title: t("update_payment_method"),
                    message: t("update_payment_method_message"),
                    continue: {
                        text: t("update_payment_method"),
                        action: () => {
                            showLoadingBar();
                            return redirectToCustomerPortal();
                        },
                    },
                });
                break;
            case "authentication_failed":
                showMiniDialog({
                    title: t("update_payment_method"),
                    message: t("payment_method_authentication_failed"),
                    continue: {
                        text: t("update_payment_method"),
                        action: () => {
                            showLoadingBar();
                            return redirectToCustomerPortal();
                        },
                    },
                });
                break;
            default:
                showMiniDialog(
                    errorDialogAttributes(t("subscription_purchase_failed")),
                );
        }
    }
};

const createAppDownloadFooter = (): FileListHeaderOrFooter => ({
    component: (
        <Typography
            variant="small"
            sx={{
                alignSelf: "flex-end",
                marginInline: "auto",
                marginBlock: 0.75,
                textAlign: "center",
                color: "text.faint",
            }}
        >
            <Trans
                i18nKey={"install_mobile_app"}
                components={{
                    a: (
                        <Link
                            href="https://play.google.com/store/apps/details?id=io.ente.photos"
                            target="_blank"
                            rel="noopener"
                        />
                    ),
                    b: (
                        <Link
                            href="https://apps.apple.com/in/app/ente-photos/id1542026904"
                            target="_blank"
                            rel="noopener"
                        />
                    ),
                }}
            />
        </Typography>
    ),
    height: 90,
});
```

## `apps/photos/src/components/Sidebar.tsx`
```tsx
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import CategoryIcon from "@mui/icons-material/Category";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import HealthAndSafetyIcon from "@mui/icons-material/HealthAndSafety";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import NorthEastIcon from "@mui/icons-material/NorthEast";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import {
    Box,
    Dialog,
    DialogContent,
    Divider,
    IconButton,
    Link,
    Skeleton,
    Stack,
    styled,
    TextField,
    Tooltip,
    useColorScheme,
} from "@mui/material";
import Typography from "@mui/material/Typography";
import { WatchFolder } from "components/WatchFolder";
import { RecoveryKey } from "ente-accounts/components/RecoveryKey";
import { openAccountsManagePasskeysPage } from "ente-accounts/services/passkey";
import { isDesktop } from "ente-base/app";
import { EnteLogo, EnteLogoBox } from "ente-base/components/EnteLogo";
import { LinkButton } from "ente-base/components/LinkButton";
import {
    RowButton,
    RowButtonDivider,
    RowButtonEndActivityIndicator,
    RowButtonGroup,
    RowButtonGroupHint,
    RowSwitch,
} from "ente-base/components/RowButton";
import { SpacedRow } from "ente-base/components/containers";
import { DialogCloseIconButton } from "ente-base/components/mui/DialogCloseIconButton";
import { FocusVisibleButton } from "ente-base/components/mui/FocusVisibleButton";
import { LoadingButton } from "ente-base/components/mui/LoadingButton";
import {
    SidebarDrawer,
    TitledNestedSidebarDrawer,
    type NestedSidebarDrawerVisibilityProps,
} from "ente-base/components/mui/SidebarDrawer";
import { useIsSmallWidth } from "ente-base/components/utils/hooks";
import {
    useModalVisibility,
    type ModalVisibilityProps,
} from "ente-base/components/utils/modal";
import { useBaseContext } from "ente-base/context";
import { isHTTPErrorWithStatus } from "ente-base/http";
import {
    getLocaleInUse,
    setLocaleInUse,
    supportedLocales,
    ut,
    type SupportedLocale,
} from "ente-base/i18n";
import log from "ente-base/log";
import { savedLogs } from "ente-base/log-web";
import { customAPIHost } from "ente-base/origins";
import { saveStringAsFile } from "ente-base/utils/web";
import {
    isHLSGenerationSupported,
    toggleHLSGeneration,
} from "ente-gallery/services/video";
import { DeleteAccount } from "ente-new/photos/components/DeleteAccount";
import { DropdownInput } from "ente-new/photos/components/DropdownInput";
import { MLSettings } from "ente-new/photos/components/sidebar/MLSettings";
import { TwoFactorSettings } from "ente-new/photos/components/sidebar/TwoFactorSettings";
import { downloadAppDialogAttributes } from "ente-new/photos/components/utils/download";
import {
    useHLSGenerationStatusSnapshot,
    useSettingsSnapshot,
    useUserDetailsSnapshot,
} from "ente-new/photos/components/utils/use-snapshot";
import {
    PseudoCollectionID,
    type CollectionSummaries,
} from "ente-new/photos/services/collection-summary";
import exportService from "ente-new/photos/services/export";
import { isMLSupported } from "ente-new/photos/services/ml";
import {
    isDevBuildAndUser,
    pullSettings,
    updateCFProxyDisabledPreference,
    updateCustomDomain,
    updateMapEnabled,
} from "ente-new/photos/services/settings";
import type { SidebarActionID } from "ente-new/photos/services/search/types";
import {
    performSidebarAction as performSidebarRegistryAction,
    type SidebarActionContext,
} from "ente-new/photos/services/sidebar-search/registry";
import {
    familyAdminEmail,
    hasExceededStorageQuota,
    isFamilyAdmin,
    isPartOfFamily,
    isSubscriptionActive,
    isSubscriptionActivePaid,
    isSubscriptionCancelled,
    isSubscriptionFree,
    isSubscriptionPastDue,
    isSubscriptionStripe,
    leaveFamily,
    pullUserDetails,
    redirectToCustomerPortal,
    userDetailsAddOnBonuses,
    type UserDetails,
} from "ente-new/photos/services/user-details";
import { usePhotosAppContext } from "ente-new/photos/types/context";
import { initiateEmail, openURL } from "ente-new/photos/utils/web";
import { wait } from "ente-utils/promise";
import { useFormik } from "formik";
import { t } from "i18next";
import { useRouter } from "next/router";
import React, {
    useCallback,
    useEffect,
    useMemo,
    useState,
    type MouseEventHandler,
} from "react";
import { Trans } from "react-i18next";
import { testUpload } from "../../tests/upload.test";
import { SubscriptionCard } from "./SubscriptionCard";

type SidebarProps = ModalVisibilityProps & {
    /**
     * Optional search-triggered sidebar action to perform.
     */
    pendingAction?: SidebarActionID;
    /**
     * Called after a pending sidebar action has been handled.
     */
    onActionHandled?: (actionID: SidebarActionID) => void;
    /**
     * Information about non-hidden collections and pseudo-collections.
     *
     * These are used to obtain data about the archive, hidden and trash
     * "section" entries shown within the shortcut section of the sidebar.
     */
    normalCollectionSummaries: CollectionSummaries;
    /**
     * The ID of the collection summary that should be shown when the user
     * activates the "Uncategorized" section shortcut.
     */
    uncategorizedCollectionSummaryID: number;
    /**
     * Called when the plan selection modal should be shown.
     */
    onShowPlanSelector: () => void;
    /**
     * Called when the collection summary with the given {@link collectionID}
     * should be shown.
     *
     * @param collectionSummaryID The ID of the {@link CollectionSummary} to
     * switch to.
     *
     * @param isHiddenCollectionSummary If `true`, then any reauthentication as
     * appropriate before switching to the hidden section of the app is
     * performed first before showing the collection summary.
     *
     * @return A promise that fullfills after any needed reauthentication has
     * been peformed (The view transition might still be in progress).
     */
    onShowCollectionSummary: (
        collectionSummaryID: number,
        isHiddenCollectionSummary?: boolean,
    ) => Promise<void>;
    /**
     * Called when the export dialog should be shown.
     */
    onShowExport: () => void;
    /**
     * Called when the user should be authenticated again.
     *
     * This will be invoked before sensitive actions, and the action will only
     * proceed if the promise returned by this function is fulfilled.
     *
     * On errors or if the user cancels the reauthentication, the promise will
     * not settle.
     */
    onAuthenticateUser: () => Promise<void>;
};

export const Sidebar: React.FC<SidebarProps> = ({
    open,
    onClose,
    pendingAction,
    onActionHandled,
    normalCollectionSummaries,
    uncategorizedCollectionSummaryID,
    onShowPlanSelector,
    onShowCollectionSummary,
    onShowExport,
    onAuthenticateUser,
}) => {
    const router = useRouter();
    const { show: showHelp, props: helpVisibilityProps } = useModalVisibility();
    const { show: showAccount, props: accountVisibilityProps } =
        useModalVisibility();
    const { show: showPreferences, props: preferencesVisibilityProps } =
        useModalVisibility();
    const { watchFolderView, setWatchFolderView } = usePhotosAppContext();
    const { showMiniDialog, logout } = useBaseContext();

    const [pendingAccountAction, setPendingAccountAction] =
        useState<AccountAction>();
    const [pendingPreferencesAction, setPendingPreferencesAction] =
        useState<PreferencesAction>();
    const [pendingHelpAction, setPendingHelpAction] =
        useState<HelpAction>();

    const handleLogout = useCallback(
        () =>
            showMiniDialog({
                message: t("logout_message"),
                continue: {
                    text: t("logout"),
                    color: "critical",
                    action: logout,
                },
                buttonDirection: "row",
            }),
        [logout, showMiniDialog],
    );

    const handleOpenUncategorizedSection = useCallback(
        () =>
            void onShowCollectionSummary(uncategorizedCollectionSummaryID).then(
                onClose,
            ),
        [onClose, onShowCollectionSummary, uncategorizedCollectionSummaryID],
    );

    const handleOpenTrashSection = useCallback(
        () =>
            void onShowCollectionSummary(PseudoCollectionID.trash).then(
                onClose,
            ),
        [onClose, onShowCollectionSummary],
    );

    const handleOpenArchiveSection = useCallback(
        () =>
            void onShowCollectionSummary(PseudoCollectionID.archiveItems).then(
                onClose,
            ),
        [onClose, onShowCollectionSummary],
    );

    const handleOpenHiddenSection = useCallback(
        () =>
            void onShowCollectionSummary(PseudoCollectionID.hiddenItems, true)
                // See: [Note: Workarounds for unactionable ARIA warnings]
                .then(() => wait(10))
                .then(onClose),
        [onClose, onShowCollectionSummary],
    );

    const handleOpenWatchFolder = useCallback(
        () => setWatchFolderView(true),
        [setWatchFolderView],
    );
    const handleCloseWatchFolder = useCallback(
        () => setWatchFolderView(false),
        [setWatchFolderView],
    );

    const showCollectionSummaryWithWorkarounds = useCallback(
        (collectionSummaryID: number, isHidden?: boolean) => {
            const action = onShowCollectionSummary(collectionSummaryID, isHidden);
            return isHidden ? action.then(() => wait(10)) : action;
        },
        [onShowCollectionSummary],
    );

    const performSidebarAction = useCallback(
        async (actionID: SidebarActionID) =>
            performSidebarRegistryAction(actionID, {
                onClose,
                onShowCollectionSummary: showCollectionSummaryWithWorkarounds,
                showAccount,
                showPreferences,
                showHelp,
                onShowExport,
                onLogout: handleLogout,
                onRouteToDeduplicate: () => router.push("/duplicates"),
                onShowWatchFolder: handleOpenWatchFolder,
                pseudoIDs: {
                    uncategorized: uncategorizedCollectionSummaryID,
                    archive: PseudoCollectionID.archiveItems,
                    hidden: PseudoCollectionID.hiddenItems,
                    trash: PseudoCollectionID.trash,
                },
                setPendingAccountAction: (a) =>
                    setPendingAccountAction(a as AccountAction | undefined),
                setPendingPreferencesAction: (a) =>
                    setPendingPreferencesAction(a as PreferencesAction | undefined),
                setPendingHelpAction: (a) =>
                    setPendingHelpAction(a as HelpAction | undefined),
            } as SidebarActionContext),
        [
            handleLogout,
            handleOpenWatchFolder,
            onClose,
            showCollectionSummaryWithWorkarounds,
            onShowExport,
            router,
            showAccount,
            showHelp,
            showPreferences,
            uncategorizedCollectionSummaryID,
        ],
    );

    useEffect(() => {
        if (!pendingAction) return;
        void performSidebarAction(pendingAction).finally(() =>
            onActionHandled?.(pendingAction),
        );
    }, [pendingAction, performSidebarAction, onActionHandled]);

    return (
        <RootSidebarDrawer open={open} onClose={onClose}>
            <HeaderSection onCloseSidebar={onClose} />
            <UserDetailsSection sidebarOpen={open} {...{ onShowPlanSelector }} />
            <Stack sx={{ gap: 0.5, mb: 3 }}>
                <ShortcutSection
                    onCloseSidebar={onClose}
                    {...{
                        normalCollectionSummaries,
                        uncategorizedCollectionSummaryID,
                        onShowCollectionSummary,
                    }}
                />
                <UtilitySection
                    onCloseSidebar={onClose}
                    {...{
                        onShowExport,
                        onAuthenticateUser,
                        showAccount,
                        accountVisibilityProps,
                        showPreferences,
                        preferencesVisibilityProps,
                        showHelp,
                        helpVisibilityProps,
                        watchFolderView,
                        onShowWatchFolder: handleOpenWatchFolder,
                        onCloseWatchFolder: handleCloseWatchFolder,
                        pendingAccountAction,
                        onAccountActionHandled: setPendingAccountAction,
                        pendingPreferencesAction,
                        onPreferencesActionHandled: setPendingPreferencesAction,
                        pendingHelpAction,
                        onHelpActionHandled: setPendingHelpAction,
                        onRouteToDeduplicate: () => router.push("/duplicates"),
                    }}
                />
                <Divider sx={{ my: "2px" }} />
                <ExitSection onLogout={handleLogout} />
                <InfoSection />
            </Stack>
        </RootSidebarDrawer>
    );
};

const RootSidebarDrawer = styled(SidebarDrawer)(({ theme }) => ({
    "& .MuiPaper-root": { padding: theme.spacing(1.5) },
}));

interface SectionProps {
    onCloseSidebar: SidebarProps["onClose"];
}

type AccountAction = Extract<
    SidebarActionID,
    | "account.recoveryKey"
    | "account.twoFactor"
    | "account.passkeys"
    | "account.changePassword"
    | "account.changeEmail"
    | "account.deleteAccount"
>;

type PreferencesAction = Extract<
    SidebarActionID,
    | "preferences.language"
    | "preferences.theme"
    | "preferences.customDomains"
    | "preferences.map"
    | "preferences.advanced"
    | "preferences.mlSearch"
    | "preferences.streamableVideos"
>;

type HelpAction = Extract<
    SidebarActionID,
    | "help.helpCenter"
    | "help.blog"
    | "help.requestFeature"
    | "help.support"
    | "help.viewLogs"
    | "help.testUpload"
>;

const HeaderSection: React.FC<SectionProps> = ({ onCloseSidebar }) => (
    <SpacedRow sx={{ mt: "6px", pl: "12px" }}>
        <EnteLogoBox>
            <EnteLogo height={16} />
        </EnteLogoBox>
        <IconButton
            aria-label={t("close")}
            onClick={onCloseSidebar}
            color="secondary"
        >
            <CloseIcon fontSize="small" />
        </IconButton>
    </SpacedRow>
);

type UserDetailsSectionProps = Pick<SidebarProps, "onShowPlanSelector"> & {
    sidebarOpen: boolean;
};

const UserDetailsSection: React.FC<UserDetailsSectionProps> = ({
    sidebarOpen,
    onShowPlanSelector,
}) => {
    const userDetails = useUserDetailsSnapshot();
    const {
        show: showManageMemberSubscription,
        props: manageMemberSubscriptionVisibilityProps,
    } = useModalVisibility();

    useEffect(() => {
        if (sidebarOpen) void pullUserDetails();
    }, [sidebarOpen]);

    const isNonAdminFamilyMember = useMemo(
        () =>
            userDetails &&
            isPartOfFamily(userDetails) &&
            !isFamilyAdmin(userDetails),
        [userDetails],
    );

    const handleSubscriptionCardClick = () => {
        if (isNonAdminFamilyMember) {
            showManageMemberSubscription();
        } else {
            if (
                userDetails &&
                isSubscriptionStripe(userDetails.subscription) &&
                isSubscriptionPastDue(userDetails.subscription)
            ) {
                // TODO: This makes an API request, so the UI should indicate
                // the await.
                //
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                redirectToCustomerPortal();
            } else {
                onShowPlanSelector();
            }
        }
    };

    return (
        <>
            <Box sx={{ px: 0.5, mt: 1.5, pb: 1.5, mb: 1 }}>
                <Typography sx={{ px: 1, pb: 1, color: "text.muted" }}>
                    {userDetails ? (
                        userDetails.email
                    ) : (
                        <Skeleton animation="wave" />
                    )}
                </Typography>

                <SubscriptionCard
                    userDetails={userDetails}
                    onClick={handleSubscriptionCardClick}
                />
                {userDetails && (
                    <SubscriptionStatus
                        {...{ userDetails, onShowPlanSelector }}
                    />
                )}
            </Box>
            {isNonAdminFamilyMember && userDetails && (
                <ManageMemberSubscription
                    {...manageMemberSubscriptionVisibilityProps}
                    {...{ userDetails }}
                />
            )}
        </>
    );
};

type SubscriptionStatusProps = Pick<SidebarProps, "onShowPlanSelector"> & {
    userDetails: UserDetails;
};

const SubscriptionStatus: React.FC<SubscriptionStatusProps> = ({
    userDetails,
    onShowPlanSelector,
}) => {
    const hasAMessage = useMemo(() => {
        if (isPartOfFamily(userDetails) && !isFamilyAdmin(userDetails)) {
            return false;
        }
        if (
            isSubscriptionActivePaid(userDetails.subscription) &&
            !isSubscriptionCancelled(userDetails.subscription)
        ) {
            return false;
        }
        return true;
    }, [userDetails]);

    const handleClick: MouseEventHandler<HTMLSpanElement> = useCallback(
        (e) => {
            e.stopPropagation();

            if (isSubscriptionActive(userDetails.subscription)) {
                if (hasExceededStorageQuota(userDetails)) {
                    onShowPlanSelector();
                }
            } else {
                if (
                    isSubscriptionStripe(userDetails.subscription) &&
                    isSubscriptionPastDue(userDetails.subscription)
                ) {
                    // eslint-disable-next-line @typescript-eslint/no-floating-promises
                    redirectToCustomerPortal();
                } else {
                    onShowPlanSelector();
                }
            }
        },
        [onShowPlanSelector, userDetails],
    );

    if (!hasAMessage) {
        return <></>;
    }

    const hasAddOnBonus = userDetailsAddOnBonuses(userDetails).length > 0;

    let message: React.ReactNode;
    if (!hasAddOnBonus) {
        if (isSubscriptionActive(userDetails.subscription)) {
            if (isSubscriptionFree(userDetails.subscription)) {
                message = t("subscription_info_free");
            } else if (isSubscriptionCancelled(userDetails.subscription)) {
                message = t("subscription_info_renewal_cancelled", {
                    date: userDetails.subscription.expiryTime,
                });
            }
        } else {
            message = (
                <Trans
                    i18nKey={"subscription_info_expired"}
                    components={{ a: <LinkButton onClick={handleClick} /> }}
                />
            );
        }
    }

    if (!message && hasExceededStorageQuota(userDetails)) {
        message = (
            <Trans
                i18nKey={"subscription_info_storage_quota_exceeded"}
                components={{ a: <LinkButton onClick={handleClick} /> }}
            />
        );
    }

    if (!message) return <></>;

    return (
        <Box sx={{ px: 1, pt: 0.5 }}>
            <Typography
                variant="small"
                onClick={handleClick}
                sx={{ color: "text.muted" }}
            >
                {message}
            </Typography>
        </Box>
    );
};

type ManageMemberSubscriptionProps = ModalVisibilityProps & {
    userDetails: UserDetails;
};

const ManageMemberSubscription: React.FC<ManageMemberSubscriptionProps> = ({
    open,
    onClose,
    userDetails,
}) => {
    const { showMiniDialog } = useBaseContext();
    const fullScreen = useIsSmallWidth();

    const confirmLeaveFamily = () =>
        showMiniDialog({
            title: t("leave_family_plan"),
            message: t("leave_family_plan_confirm"),
            continue: {
                text: t("leave"),
                color: "critical",
                action: leaveFamily,
            },
        });

    return (
        <Dialog {...{ open, onClose, fullScreen }} maxWidth="xs" fullWidth>
            <SpacedRow sx={{ p: "20px 8px 12px 16px" }}>
                <Stack>
                    <Typography variant="h3">{t("subscription")}</Typography>
                    <Typography sx={{ color: "text.muted" }}>
                        {t("family_plan")}
                    </Typography>
                </Stack>
                <DialogCloseIconButton {...{ onClose }} />
            </SpacedRow>
            <DialogContent>
                <Stack sx={{ alignItems: "center", mx: 2 }}>
                    <Box sx={{ mb: 4 }}>
                        <Typography sx={{ color: "text.muted" }}>
                            {t("subscription_info_family")}
                        </Typography>
                        <Typography>
                            {familyAdminEmail(userDetails) ?? ""}
                        </Typography>
                    </Box>
                    <img
                        height={256}
                        src="/images/family-plan/1x.png"
                        srcSet="/images/family-plan/2x.png 2x, /images/family-plan/3x.png 3x"
                    />
                    <FocusVisibleButton
                        fullWidth
                        variant="outlined"
                        color="critical"
                        onClick={confirmLeaveFamily}
                    >
                        {t("leave_family_plan")}
                    </FocusVisibleButton>
                </Stack>
            </DialogContent>
        </Dialog>
    );
};

type ShortcutSectionProps = SectionProps &
    Pick<
        SidebarProps,
        | "normalCollectionSummaries"
        | "uncategorizedCollectionSummaryID"
        | "onShowCollectionSummary"
    >;

const ShortcutSection: React.FC<ShortcutSectionProps> = ({
    onCloseSidebar,
    normalCollectionSummaries,
    uncategorizedCollectionSummaryID,
    onShowCollectionSummary,
}) => {
    const handleOpenUncategorizedSection = () =>
        void onShowCollectionSummary(uncategorizedCollectionSummaryID).then(
            onCloseSidebar,
        );

    const handleOpenTrashSection = () =>
        void onShowCollectionSummary(PseudoCollectionID.trash).then(
            onCloseSidebar,
        );

    const handleOpenArchiveSection = () =>
        void onShowCollectionSummary(PseudoCollectionID.archiveItems).then(
            onCloseSidebar,
        );

    const handleOpenHiddenSection = () =>
        void onShowCollectionSummary(PseudoCollectionID.hiddenItems, true)
            // See: [Note: Workarounds for unactionable ARIA warnings]
            .then(() => wait(10))
            .then(onCloseSidebar);

    const summaryCaption = (summaryID: number) =>
        normalCollectionSummaries.get(summaryID)?.fileCount.toString();

    return (
        <>
            <RowButton
                startIcon={<CategoryIcon />}
                label={t("section_uncategorized")}
                caption={summaryCaption(uncategorizedCollectionSummaryID)}
                onClick={handleOpenUncategorizedSection}
            />
            <RowButton
                startIcon={<ArchiveOutlinedIcon />}
                label={t("section_archive")}
                caption={summaryCaption(PseudoCollectionID.archiveItems)}
                onClick={handleOpenArchiveSection}
            />
            <RowButton
                startIcon={<VisibilityOffIcon />}
                label={t("section_hidden")}
                caption={
                    <LockOutlinedIcon
                        sx={{
                            verticalAlign: "middle",
                            fontSize: "19px !important",
                        }}
                    />
                }
                onClick={handleOpenHiddenSection}
            />
            <RowButton
                startIcon={<DeleteOutlineIcon />}
                label={t("section_trash")}
                caption={summaryCaption(PseudoCollectionID.trash)}
                onClick={handleOpenTrashSection}
            />
        </>
    );
};

type UtilitySectionProps = SectionProps &
    Pick<SidebarProps, "onShowExport" | "onAuthenticateUser"> & {
        showAccount: () => void;
        accountVisibilityProps: NestedSidebarDrawerVisibilityProps;
        showPreferences: () => void;
        preferencesVisibilityProps: NestedSidebarDrawerVisibilityProps;
        showHelp: () => void;
        helpVisibilityProps: NestedSidebarDrawerVisibilityProps;
        watchFolderView: boolean;
        onShowWatchFolder: () => void;
        onCloseWatchFolder: () => void;
        pendingAccountAction?: AccountAction;
        onAccountActionHandled: (action?: AccountAction) => void;
        pendingPreferencesAction?: PreferencesAction;
        onPreferencesActionHandled: (action?: PreferencesAction) => void;
        pendingHelpAction?: HelpAction;
        onHelpActionHandled: (action?: HelpAction) => void;
        onRouteToDeduplicate: () => void;
    };

const UtilitySection: React.FC<UtilitySectionProps> = ({
    onCloseSidebar,
    onShowExport,
    onAuthenticateUser,
    showAccount,
    accountVisibilityProps,
    showPreferences,
    preferencesVisibilityProps,
    showHelp,
    helpVisibilityProps,
    watchFolderView,
    onShowWatchFolder,
    onCloseWatchFolder,
    pendingAccountAction,
    onAccountActionHandled,
    pendingPreferencesAction,
    onPreferencesActionHandled,
    pendingHelpAction,
    onHelpActionHandled,
    onRouteToDeduplicate,
}) => {
    const { showMiniDialog } = useBaseContext();

    const handleExport = () =>
        isDesktop
            ? onShowExport()
            : showMiniDialog(downloadAppDialogAttributes());

    return (
        <>
            <RowButton
                variant="secondary"
                label={t("account")}
                onClick={showAccount}
            />
            {isDesktop && (
                <RowButton
                    variant="secondary"
                    label={t("watch_folders")}
                    onClick={onShowWatchFolder}
                />
            )}
            <RowButton
                variant="secondary"
                label={t("deduplicate_files")}
                onClick={onRouteToDeduplicate}
            />
            <RowButton
                variant="secondary"
                label={t("preferences")}
                onClick={showPreferences}
            />
            <RowButton
                variant="secondary"
                label={t("help")}
                onClick={showHelp}
            />
            <RowButton
                variant="secondary"
                label={t("export_data")}
                endIcon={
                    exportService.isExportInProgress() && (
                        <RowButtonEndActivityIndicator />
                    )
                }
                onClick={handleExport}
            />
            <Help
                {...helpVisibilityProps}
                onRootClose={onCloseSidebar}
                pendingAction={pendingHelpAction}
                onActionHandled={onHelpActionHandled}
            />
            {isDesktop && (
                <WatchFolder
                    open={watchFolderView}
                    onClose={onCloseWatchFolder}
                />
            )}
            <Account
                {...accountVisibilityProps}
                onRootClose={onCloseSidebar}
                pendingAction={pendingAccountAction}
                onActionHandled={onAccountActionHandled}
                {...{ onAuthenticateUser }}
            />
            <Preferences
                {...preferencesVisibilityProps}
                onRootClose={onCloseSidebar}
                pendingAction={pendingPreferencesAction}
                onActionHandled={onPreferencesActionHandled}
            />
        </>
    );
};

const ExitSection: React.FC<{ onLogout: () => void }> = ({ onLogout }) => (
    <>
        <RowButton
            variant="secondary"
            color="critical"
            label={t("logout")}
            onClick={onLogout}
        />
    </>
);

const InfoSection: React.FC = () => {
    const [appVersion, setAppVersion] = useState("");
    const [host, setHost] = useState<string | undefined>("");

    useEffect(() => {
        void globalThis.electron?.appVersion().then(setAppVersion);
        void customAPIHost().then(setHost);
    }, []);

    return (
        <>
            <Stack
                sx={{
                    p: "24px 18px 16px 18px",
                    gap: "24px",
                    color: "text.muted",
                }}
            >
                {appVersion && (
                    <Typography variant="mini">{appVersion}</Typography>
                )}
                {host && <Typography variant="mini">{host}</Typography>}
            </Stack>
        </>
    );
};

type AccountProps = NestedSidebarDrawerVisibilityProps &
    Pick<SidebarProps, "onAuthenticateUser"> & {
        pendingAction?: AccountAction;
        onActionHandled?: (action?: AccountAction) => void;
    };

const Account: React.FC<AccountProps> = ({
    open,
    onClose,
    onRootClose,
    onAuthenticateUser,
    pendingAction,
    onActionHandled,
}) => {
    const { showMiniDialog } = useBaseContext();

    const router = useRouter();

    const { show: showRecoveryKey, props: recoveryKeyVisibilityProps } =
        useModalVisibility();
    const { show: showTwoFactor, props: twoFactorVisibilityProps } =
        useModalVisibility();
    const { show: showDeleteAccount, props: deleteAccountVisibilityProps } =
        useModalVisibility();

    const handleRootClose = () => {
        onClose();
        onRootClose();
    };

    const handleChangePassword = () => router.push("/change-password");
    const handleChangeEmail = () => router.push("/change-email");

    const handlePasskeys = async () => {
        onRootClose();
        await openAccountsManagePasskeysPage();
    };

    useEffect(() => {
        if (!open || !pendingAction) return;
        switch (pendingAction) {
            case "account.recoveryKey":
                showRecoveryKey();
                break;
            case "account.twoFactor":
                showTwoFactor();
                break;
            case "account.passkeys":
                void handlePasskeys();
                break;
            case "account.changePassword":
                handleChangePassword();
                break;
            case "account.changeEmail":
                handleChangeEmail();
                break;
            case "account.deleteAccount":
                showDeleteAccount();
                break;
        }
        onActionHandled?.();
    }, [
        handleChangeEmail,
        handleChangePassword,
        handlePasskeys,
        open,
        onActionHandled,
        pendingAction,
        showDeleteAccount,
        showRecoveryKey,
        showTwoFactor,
    ]);

    return (
        <TitledNestedSidebarDrawer
            {...{ open, onClose }}
            onRootClose={handleRootClose}
            title={t("account")}
        >
            <Stack sx={{ px: 2, py: 1, gap: 3 }}>
                <RowButtonGroup>
                    <RowButton
                        endIcon={
                            <HealthAndSafetyIcon
                                sx={{ color: "accent.main" }}
                            />
                        }
                        label={t("recovery_key")}
                        onClick={showRecoveryKey}
                    />
                </RowButtonGroup>
                <RowButtonGroup>
                    <RowButton
                        label={t("two_factor")}
                        onClick={showTwoFactor}
                    />
                    <RowButtonDivider />
                    <RowButton label={t("passkeys")} onClick={handlePasskeys} />
                </RowButtonGroup>
                <RowButtonGroup>
                    <RowButton
                        label={t("change_password")}
                        onClick={handleChangePassword}
                    />
                    <RowButtonDivider />
                    <RowButton
                        label={t("change_email")}
                        onClick={handleChangeEmail}
                    />
                </RowButtonGroup>
                <RowButtonGroup>
                    <RowButton
                        color="critical"
                        label={t("delete_account")}
                        onClick={showDeleteAccount}
                    />
                </RowButtonGroup>
            </Stack>
            <RecoveryKey
                {...recoveryKeyVisibilityProps}
                {...{ showMiniDialog }}
            />
            <TwoFactorSettings
                {...twoFactorVisibilityProps}
                onRootClose={onRootClose}
            />
            <DeleteAccount
                {...deleteAccountVisibilityProps}
                {...{ onAuthenticateUser }}
            />
        </TitledNestedSidebarDrawer>
    );
};

type PreferencesProps = NestedSidebarDrawerVisibilityProps & {
    pendingAction?: PreferencesAction;
    onActionHandled?: (action?: PreferencesAction) => void;
};

const Preferences: React.FC<PreferencesProps> = ({
    open,
    onClose,
    onRootClose,
    pendingAction,
    onActionHandled,
}) => {
    const { show: showDomainSettings, props: domainSettingsVisibilityProps } =
        useModalVisibility();
    const { show: showMapSettings, props: mapSettingsVisibilityProps } =
        useModalVisibility();
    const {
        show: showAdvancedSettings,
        props: advancedSettingsVisibilityProps,
    } = useModalVisibility();
    const { show: showMLSettings, props: mlSettingsVisibilityProps } =
        useModalVisibility();

    const hlsGenStatusSnapshot = useHLSGenerationStatusSnapshot();
    const isHLSGenerationEnabled = !!hlsGenStatusSnapshot?.enabled;

    useEffect(() => {
        if (open) void pullSettings();
    }, [open]);

    useEffect(() => {
        if (!open || !pendingAction) return;
        switch (pendingAction) {
            case "preferences.customDomains":
                showDomainSettings();
                break;
            case "preferences.map":
                showMapSettings();
                break;
            case "preferences.advanced":
                showAdvancedSettings();
                break;
            case "preferences.mlSearch":
                showMLSettings();
                break;
            case "preferences.language":
            case "preferences.theme":
            case "preferences.streamableVideos":
                break;
        }
        onActionHandled?.();
    }, [
        open,
        onActionHandled,
        pendingAction,
        showAdvancedSettings,
        showDomainSettings,
        showMLSettings,
        showMapSettings,
    ]);

    const handleRootClose = () => {
        onClose();
        onRootClose();
    };

    return (
        <TitledNestedSidebarDrawer
            {...{ open, onClose }}
            onRootClose={handleRootClose}
            title={t("preferences")}
        >
            <Stack sx={{ px: 2, py: 1, gap: 3 }}>
                <LanguageSelector />
                <ThemeSelector />
                <Divider sx={{ my: "2px", opacity: 0.1 }} />
                {isMLSupported && (
                    <RowButtonGroup>
                        <RowButton
                            endIcon={<ChevronRightIcon />}
                            label={t("ml_search")}
                            onClick={showMLSettings}
                        />
                    </RowButtonGroup>
                )}
                <RowButton
                    label={t("custom_domains")}
                    endIcon={
                        <Stack
                            direction="row"
                            sx={{ alignSelf: "stretch", alignItems: "center" }}
                        >
                            <Box
                                sx={{
                                    width: "8px",
                                    bgcolor: "stroke.faint",
                                    alignSelf: "stretch",
                                    mr: 0.5,
                                }}
                            />
                            <Box
                                sx={{
                                    width: "8px",
                                    bgcolor: "stroke.muted",
                                    alignSelf: "stretch",
                                    mr: 0.5,
                                }}
                            />
                            <Box
                                sx={{
                                    width: "8px",
                                    bgcolor: "stroke.base",
                                    alignSelf: "stretch",
                                    opacity: 0.3,
                                    mr: 1.5,
                                }}
                            />
                            <ChevronRightIcon />
                        </Stack>
                    }
                    onClick={showDomainSettings}
                />
                <RowButton
                    endIcon={<ChevronRightIcon />}
                    label={t("map")}
                    onClick={showMapSettings}
                />
                <RowButton
                    endIcon={<ChevronRightIcon />}
                    label={t("advanced")}
                    onClick={showAdvancedSettings}
                />
                {isHLSGenerationSupported && (
                    <RowButtonGroup>
                        <RowSwitch
                            label={t("streamable_videos")}
                            checked={isHLSGenerationEnabled}
                            onClick={() => void toggleHLSGeneration()}
                        />
                    </RowButtonGroup>
                )}
            </Stack>
            <DomainSettings
                {...domainSettingsVisibilityProps}
                onRootClose={onRootClose}
            />
            <MapSettings
                {...mapSettingsVisibilityProps}
                onRootClose={onRootClose}
            />
            <AdvancedSettings
                {...advancedSettingsVisibilityProps}
                onRootClose={onRootClose}
            />
            <MLSettings
                {...mlSettingsVisibilityProps}
                onRootClose={handleRootClose}
            />
        </TitledNestedSidebarDrawer>
    );
};

const LanguageSelector = () => {
    const locale = getLocaleInUse();

    const updateCurrentLocale = (newLocale: SupportedLocale) => {
        void setLocaleInUse(newLocale).then(() => {
            // [Note: Changing locale causes a full reload]
            //
            // A full reload is needed because we use the global `t` instance
            // instead of the useTranslation hook.
            //
            // We also rely on this behaviour by caching various formatters in
            // module static variables that not get updated if the i18n.language
            // changes unless there is a full reload.
            window.location.reload();
        });
    };

    const options = supportedLocales.map((locale) => ({
        label: localeName(locale),
        value: locale,
    }));

    return (
        <Stack sx={{ gap: 1 }}>
            <Typography variant="small" sx={{ px: 1, color: "text.muted" }}>
                {t("language")}
            </Typography>
            <DropdownInput
                options={options}
                selected={locale}
                onSelect={updateCurrentLocale}
            />
        </Stack>
    );
};

/**
 * Human readable name for each supported locale.
 */
const localeName = (locale: SupportedLocale) => {
    switch (locale) {
        case "en-US":
            return "English";
        case "fr-FR":
            return "Français";
        case "de-DE":
            return "Deutsch";
        case "zh-CN":
            return "中文";
        case "nl-NL":
            return "Nederlands";
        case "es-ES":
            return "Español";
        case "pt-PT":
            return "Português";
        case "pt-BR":
            return "Português Brasileiro";
        case "ru-RU":
            return "Русский";
        case "pl-PL":
            return "Polski";
        case "it-IT":
            return "Italiano";
        case "lt-LT":
            return "Lietuvių kalba";
        case "uk-UA":
            return "Українська";
        case "vi-VN":
            return "Tiếng Việt";
        case "ja-JP":
            return "日本語";
        case "ar-SA":
            return "اَلْعَرَبِيَّةُ";
        case "tr-TR":
            return "Türkçe";
        case "cs-CZ":
            return "čeština";
        case "el-GR":
            return "Ελληνικά";
    }
};

const ThemeSelector = () => {
    const { mode, setMode } = useColorScheme();

    // During SSR, mode is always undefined.
    if (!mode) return null;

    return (
        <Stack sx={{ gap: 1 }}>
            <Typography variant="small" sx={{ px: 1, color: "text.muted" }}>
                {t("theme")}
            </Typography>
            <DropdownInput
                options={[
                    { label: t("system"), value: "system" },
                    { label: t("light"), value: "light" },
                    { label: t("dark"), value: "dark" },
                ]}
                selected={mode}
                onSelect={setMode}
            />
        </Stack>
    );
};

const DomainSettings: React.FC<NestedSidebarDrawerVisibilityProps> = ({
    open,
    onClose,
    onRootClose,
}) => {
    const handleRootClose = () => {
        onClose();
        onRootClose();
    };

    return (
        <TitledNestedSidebarDrawer
            {...{ open, onClose }}
            onRootClose={handleRootClose}
            title={t("custom_domains")}
            caption={t("custom_domains_desc")}
        >
            <DomainSettingsContents />
        </TitledNestedSidebarDrawer>
    );
};

// Separate component to reset state on going back.
const DomainSettingsContents: React.FC = () => {
    const { customDomain, customDomainCNAME } = useSettingsSnapshot();

    const formik = useFormik({
        initialValues: { domain: customDomain ?? "" },
        onSubmit: async (values, { setFieldError }) => {
            const domain = values.domain;
            const setValueFieldError = (message: string) =>
                setFieldError("domain", message);

            try {
                await updateCustomDomain(domain);
            } catch (e) {
                log.error(`Failed to submit input ${domain}`, e);
                if (isHTTPErrorWithStatus(e, 400)) {
                    setValueFieldError(t("invalid_domain"));
                } else if (isHTTPErrorWithStatus(e, 402)) {
                    setValueFieldError(t("sharing_disabled_for_free_accounts"));
                } else if (isHTTPErrorWithStatus(e, 409)) {
                    setValueFieldError(t("already_linked_domain"));
                } else {
                    setValueFieldError(t("generic_error"));
                }
            }
        },
    });

    return (
        <Stack sx={{ px: 2, py: "12px" }}>
            <DomainItem title={t("link_your_domain")} ordinal={t("num_1")}>
                <form onSubmit={formik.handleSubmit}>
                    <TextField
                        name="domain"
                        value={formik.values.domain}
                        onChange={formik.handleChange}
                        type={"text"}
                        fullWidth
                        autoFocus={true}
                        margin="dense"
                        disabled={formik.isSubmitting}
                        error={!!formik.errors.domain}
                        helperText={formik.errors.domain ?? t("domain_help")}
                        label={t("domain")}
                        placeholder={ut("photos.example.org")}
                        sx={{ mb: 2 }}
                    />
                    <LoadingButton
                        fullWidth
                        type="submit"
                        loading={formik.isSubmitting}
                        color="accent"
                    >
                        {customDomain ? t("update") : t("save")}
                    </LoadingButton>
                </form>
            </DomainItem>
            <Divider sx={{ mt: 4, mb: 2, opacity: 0.5 }} />
            <DomainItem title={t("add_dns_entry")} ordinal={t("num_2")}>
                <Typography sx={{ color: "text.muted" }}>
                    <Trans
                        i18nKey="add_dns_entry_hint"
                        components={{
                            b: (
                                <Typography
                                    component="span"
                                    sx={{
                                        fontWeight: "bold",
                                        color: "text.base",
                                    }}
                                />
                            ),
                        }}
                        values={{ host: customDomainCNAME }}
                    />
                </Typography>
                <Typography sx={{ color: "text.muted", mt: 3 }}>
                    <Trans
                        i18nKey="custom_domains_help"
                        components={{
                            a: (
                                <Link
                                    href="https://ente.io/help/photos/features/sharing-and-collaboration/custom-domains/"
                                    target="_blank"
                                    rel="noopener"
                                    color="accent"
                                />
                            ),
                        }}
                    />
                </Typography>
            </DomainItem>
        </Stack>
    );
};

interface DomainSectionProps {
    title: string;
    ordinal: string;
}

const DomainItem: React.FC<React.PropsWithChildren<DomainSectionProps>> = ({
    title,
    ordinal,
    children,
}) => (
    <Stack>
        <Stack
            direction="row"
            sx={{ alignItems: "center", justifyContent: "space-between" }}
        >
            <Typography variant="h6">{title}</Typography>
            <Typography
                variant="h1"
                sx={{
                    minWidth: "28px",
                    textAlign: "center",
                    color: "stroke.faint",
                }}
            >
                {ordinal}
            </Typography>
        </Stack>
        {children}
    </Stack>
);

const MapSettings: React.FC<NestedSidebarDrawerVisibilityProps> = ({
    open,
    onClose,
    onRootClose,
}) => {
    const { mapEnabled } = useSettingsSnapshot();
    const [errorMessage, setErrorMessage] = useState<string | undefined>();

    const handleToggle = useCallback(() => {
        setErrorMessage(undefined);
        void updateMapEnabled(!mapEnabled).catch(() => {
            setErrorMessage(t("generic_error"));
        });
    }, [mapEnabled]);

    const handleRootClose = () => {
        onClose();
        onRootClose();
    };

    return (
        <TitledNestedSidebarDrawer
            {...{ open, onClose }}
            onRootClose={handleRootClose}
            title={t("map")}
        >
            <Stack sx={{ px: 2, py: "20px" }}>
                <RowButtonGroup>
                    <RowSwitch
                        label={t("enabled")}
                        checked={mapEnabled}
                        onClick={handleToggle}
                    />
                </RowButtonGroup>
                <RowButtonGroupHint>
                    {t("maps_privacy_notice")}
                </RowButtonGroupHint>
                {errorMessage && (
                    <Typography
                        variant="small"
                        sx={{
                            color: "critical.main",
                            mt: 0.5,
                            textAlign: "center",
                        }}
                    >
                        {errorMessage}
                    </Typography>
                )}
            </Stack>
        </TitledNestedSidebarDrawer>
    );
};

const AdvancedSettings: React.FC<NestedSidebarDrawerVisibilityProps> = ({
    open,
    onClose,
    onRootClose,
}) => {
    const { cfUploadProxyDisabled } = useSettingsSnapshot();
    const [isAutoLaunchEnabled, setIsAutoLaunchEnabled] = useState(false);

    const electron = globalThis.electron;

    const refreshAutoLaunchEnabled = useCallback(async () => {
        return electron
            ?.isAutoLaunchEnabled()
            .then((enabled) => setIsAutoLaunchEnabled(enabled));
    }, [electron]);

    useEffect(
        () => void refreshAutoLaunchEnabled(),
        [refreshAutoLaunchEnabled],
    );

    const handleRootClose = () => {
        onClose();
        onRootClose();
    };

    const toggleProxy = () =>
        void updateCFProxyDisabledPreference(!cfUploadProxyDisabled);

    const toggleAutoLaunch = () =>
        void electron?.toggleAutoLaunch().then(refreshAutoLaunchEnabled);

    return (
        <TitledNestedSidebarDrawer
            {...{ open, onClose }}
            onRootClose={handleRootClose}
            title={t("advanced")}
        >
            <Stack sx={{ px: 2, py: "20px", gap: 3 }}>
                <Stack>
                    <RowButtonGroup>
                        <RowSwitch
                            label={t("faster_upload")}
                            checked={!cfUploadProxyDisabled}
                            onClick={toggleProxy}
                        />
                    </RowButtonGroup>
                    <RowButtonGroupHint>
                        {t("faster_upload_description")}
                    </RowButtonGroupHint>
                </Stack>
                {electron && (
                    <RowButtonGroup>
                        <RowSwitch
                            label={t("open_ente_on_startup")}
                            checked={isAutoLaunchEnabled}
                            onClick={toggleAutoLaunch}
                        />
                    </RowButtonGroup>
                )}
            </Stack>
        </TitledNestedSidebarDrawer>
    );
};

type HelpProps = NestedSidebarDrawerVisibilityProps & {
    pendingAction?: HelpAction;
    onActionHandled?: (action?: HelpAction) => void;
};

const Help: React.FC<HelpProps> = ({
    open,
    onClose,
    onRootClose,
    pendingAction,
    onActionHandled,
}) => {
    const { showMiniDialog } = useBaseContext();

    const handleRootClose = () => {
        onClose();
        onRootClose();
    };

    const handleHelp = () => openURL("https://ente.io/help/photos/");

    const handleBlog = () => openURL("https://ente.io/blog/");

    const handleRequestFeature = () =>
        openURL("https://github.com/ente-io/ente/discussions");

    const handleSupport = () => initiateEmail("support@ente.io");

    const confirmViewLogs = () =>
        showMiniDialog({
            title: t("view_logs"),
            message: <Trans i18nKey={"view_logs_message"} />,
            continue: { text: t("view_logs"), action: viewLogs },
        });

    const viewLogs = async () => {
        log.info("Viewing logs");
        const electron = globalThis.electron;
        if (electron) {
            await electron.openLogDirectory();
        } else {
            saveStringAsFile(savedLogs(), `ente-web-logs-${Date.now()}.txt`);
        }
    };

    useEffect(() => {
        if (!open || !pendingAction) return;
        switch (pendingAction) {
            case "help.helpCenter":
                handleHelp();
                break;
            case "help.blog":
                handleBlog();
                break;
            case "help.requestFeature":
                handleRequestFeature();
                break;
            case "help.support":
                handleSupport();
                break;
            case "help.viewLogs":
                confirmViewLogs();
                break;
            case "help.testUpload":
                if (isDevBuildAndUser()) {
                    void testUpload();
                }
                break;
        }
        onActionHandled?.();
    }, [
        confirmViewLogs,
        handleBlog,
        handleHelp,
        handleRequestFeature,
        handleSupport,
        open,
        onActionHandled,
        pendingAction,
    ]);

    return (
        <TitledNestedSidebarDrawer
            {...{ open, onClose }}
            onRootClose={handleRootClose}
            title={t("help")}
        >
            <Stack sx={{ px: 2, py: 1, gap: 3 }}>
                <RowButtonGroup>
                    <RowButton
                        endIcon={<InfoOutlinedIcon />}
                        label={t("ente_help")}
                        onClick={handleHelp}
                    />
                </RowButtonGroup>
                <RowButtonGroup>
                    <RowButton
                        endIcon={<NorthEastIcon />}
                        label={t("blog")}
                        onClick={handleBlog}
                    />
                    <RowButtonDivider />
                    <RowButton
                        endIcon={<NorthEastIcon />}
                        label={t("request_feature")}
                        onClick={handleRequestFeature}
                    />
                </RowButtonGroup>
                <RowButtonGroup>
                    <RowButton
                        endIcon={<ChevronRightIcon />}
                        label={
                            <Tooltip title="support@ente.io">
                                <Typography sx={{ fontWeight: "medium" }}>
                                    {t("support")}
                                </Typography>
                            </Tooltip>
                        }
                        onClick={handleSupport}
                    />
                </RowButtonGroup>
            </Stack>
            <Stack sx={{ px: "16px" }}>
                <RowButton
                    variant="secondary"
                    label={
                        <Typography variant="mini" color="text.muted">
                            {t("view_logs")}
                        </Typography>
                    }
                    onClick={confirmViewLogs}
                />
                {isDevBuildAndUser() && (
                    <RowButton
                        variant="secondary"
                        label={
                            <Typography variant="mini" color="text.muted">
                                {ut("Test upload")}
                            </Typography>
                        }
                        onClick={testUpload}
                    />
                )}
            </Stack>
        </TitledNestedSidebarDrawer>
    );
};
```

