import { CollectionsSortOptions } from "@/components/CollectionsSortOptions";
import { PeopleSortOptions } from "@/components/PeopleSortOptions";
import {
    matchesAlbumFilter,
    type AlbumFilter,
    type albumFilters,
} from "@/utils/album-filters";
import type { PeopleSortBy } from "@/utils/people-sort";
import { ArrowDown01Icon, PinIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import AddIcon from "@mui/icons-material/Add";
import {
    Box,
    ButtonBase,
    Divider,
    IconButton,
    Stack,
    Tooltip,
    useMediaQuery,
    useTheme,
} from "@mui/material";
import type { EnteFile } from "ente-media/file";
import { ItemCard } from "ente-new/photos/components/Tiles";
import {
    PseudoCollectionID,
    type CollectionSummary,
    type CollectionsSortBy,
} from "ente-new/photos/services/collection-summary";
import type { Person } from "ente-new/photos/services/ml/people";
import { wait } from "ente-utils/promise";
import { t } from "i18next";
import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import AutoSizer from "react-virtualized-auto-sizer";
import {
    FixedSizeList,
    VariableSizeList,
    areEqual,
    type ListChildComponentProps,
} from "react-window";
import {
    BarCard,
    BarThumbnail,
    CardText,
    CollectionBarCard,
    CollectionBarCardIcon_,
    NavigationEmptyState,
    NavigationFrame,
    type GalleryBarPresentationProps,
} from "./NavigationPrimitives";
import { PlacesList, type PlaceSelection } from "./PlacesList";
import type { GalleryBarMode } from "./reducer";
export type { GalleryBarPresentationProps } from "./NavigationPrimitives";

export interface GalleryBarImplProps extends GalleryBarPresentationProps {
    mode: GalleryBarMode;
    customNavigation?: React.ReactNode;
    placesFiles?: EnteFile[];
    selectedPlace?: PlaceSelection;
    onSelectPlace: (place: PlaceSelection | undefined) => void;
    albumFilter: AlbumFilter;
    albumSearchQuery: string;
    onAlbumSearchQueryChange: (query: string) => void;
    onShowAlbumOverview: (filter: AlbumFilter) => void;
    onShowPeopleOverview: () => void;
    collectionSummaries: CollectionSummary[];
    visibleAlbumFilters: typeof albumFilters;
    uncategorizedCollectionSummaryID: number;
    onShowCollectionSummary: (
        collectionSummaryID: number,
        isHiddenCollectionSummary?: boolean,
    ) => Promise<boolean>;
    activeCollectionID: number | undefined;
    onSelectCollectionID: (collectionID: number) => void;
    onCreateAlbum: () => void;
    collectionsSortBy: CollectionsSortBy;
    onChangeCollectionsSortBy: (by: CollectionsSortBy) => void;
    peopleSortBy: PeopleSortBy;
    onChangePeopleSortBy: (by: PeopleSortBy) => void;
    people: Person[];
    activePerson: Person | undefined;
    onSelectPerson: (personID: string) => void;
}

export const GalleryBarImpl: React.FC<GalleryBarImplProps> = ({
    mode,
    customNavigation,
    placesFiles,
    selectedPlace,
    onSelectPlace,
    albumFilter,
    albumSearchQuery,
    onAlbumSearchQueryChange,
    onShowAlbumOverview,
    onShowPeopleOverview,
    collectionSummaries,
    visibleAlbumFilters,
    uncategorizedCollectionSummaryID,
    onShowCollectionSummary,
    activeCollectionID,
    onSelectCollectionID,
    onCreateAlbum,
    collectionsSortBy,
    onChangeCollectionsSortBy,
    peopleSortBy,
    onChangePeopleSortBy,
    people,
    activePerson,
    onSelectPerson,
    collapsed,
    mobileDrawerProps,
}) => {
    const mobile = useMediaQuery(useTheme().breakpoints.down("md"));
    const listRef = useRef<FixedSizeList | null>(null);
    const albumListRef = useRef<VariableSizeList | null>(null);
    const [placesSearchQuery, setPlacesSearchQuery] = useState("");
    const [peopleSearchQuery, setPeopleSearchQuery] = useState("");
    const [groupExpanded, setGroupExpanded] = useState(true);
    const searchQuery = placesFiles
        ? placesSearchQuery
        : mode == "people"
          ? peopleSearchQuery
          : albumSearchQuery;
    const setSearchQuery = placesFiles
        ? setPlacesSearchQuery
        : mode == "people"
          ? setPeopleSearchQuery
          : onAlbumSearchQueryChange;
    const normalizedSearchQuery = searchQuery.trim().toLowerCase();
    const isSearching = !!normalizedSearchQuery;
    const matchingPeople = useMemo(
        () =>
            mode == "people" && isSearching
                ? people.filter((person) =>
                      person.name
                          ?.toLowerCase()
                          .includes(normalizedSearchQuery),
                  )
                : people,
        [mode, people, isSearching, normalizedSearchQuery],
    );
    const [viewportHeight, setViewportHeight] = useState(0);
    const [expandedAlbumFilter, setExpandedAlbumFilter] = useState<
        AlbumFilter | undefined
    >(albumFilter);
    const lastAlbumFilter = useRef(albumFilter);
    const displayedAlbumFilter =
        isSearching &&
        expandedAlbumFilter !== undefined &&
        !visibleAlbumFilters.some(({ value }) => value == expandedAlbumFilter)
            ? visibleAlbumFilters[0]?.value
            : expandedAlbumFilter;
    const displayedCollectionSummaries = useMemo(
        () =>
            mode == "albums"
                ? collectionSummaries.filter(
                      (cs) =>
                          displayedAlbumFilter !== undefined &&
                          matchesAlbumFilter(cs, displayedAlbumFilter),
                  )
                : collectionSummaries,
        [mode, collectionSummaries, displayedAlbumFilter],
    );

    useEffect(() => {
        // Heading clicks already set expansion; sync other group navigation.
        if (lastAlbumFilter.current == albumFilter) return;
        lastAlbumFilter.current = albumFilter;
        setExpandedAlbumFilter(albumFilter);
    }, [albumFilter]);
    useEffect(() => {
        setPeopleSearchQuery("");
        setGroupExpanded(true);
    }, [mode]);

    useEffect(() => {
        if (
            mode == "people" &&
            (mobile ? !mobileDrawerProps.open : collapsed)
        ) {
            setPeopleSearchQuery("");
        }
    }, [mode, mobile, mobileDrawerProps.open, collapsed]);

    const isPlacesView = !!placesFiles;
    useEffect(() => {
        if (!isPlacesView) setPlacesSearchQuery("");
    }, [isPlacesView]);

    useEffect(() => {
        if (isSearching) {
            listRef.current?.scrollTo(0);
            albumListRef.current?.scrollTo(0);
        }
    }, [searchQuery, isSearching]);

    const itemData = useMemo<ItemData>(
        () =>
            mode == "albums" ||
            mode == "hidden-albums" ||
            mode == "archive-albums"
                ? {
                      type: "collections",
                      collectionSummaries: displayedCollectionSummaries,
                      indented: mode == "albums" || mode == "hidden-albums",
                      activeCollectionID: activeCollectionID!,
                      onSelectCollectionID,
                  }
                : {
                      type: "people" as const,
                      people: matchingPeople,
                      activePerson,
                      onSelectPerson,
                  },
        [
            mode,
            displayedCollectionSummaries,
            activeCollectionID,
            onSelectCollectionID,
            matchingPeople,
            activePerson,
            onSelectPerson,
        ],
    );

    const title = placesFiles
        ? t("search_places")
        : mode == "people"
          ? t("people")
          : mode == "hidden-albums"
            ? t("hidden_albums")
            : mode == "archive-albums"
              ? t("section_archive")
              : t("albums");

    const albumShortcuts = [
        {
            id: uncategorizedCollectionSummaryID,
            label: t("section_uncategorized"),
            active: activeCollectionID == uncategorizedCollectionSummaryID,
        },
        {
            id: PseudoCollectionID.hiddenItems,
            label: t("section_hidden"),
            active: mode == "hidden-albums",
        },
        {
            id: PseudoCollectionID.archiveItems,
            label: t("section_archive"),
            active: mode == "archive-albums",
        },
        {
            id: PseudoCollectionID.trash,
            label: t("section_trash"),
            active: activeCollectionID == PseudoCollectionID.trash,
        },
    ].filter(({ label }) =>
        label.toLowerCase().includes(normalizedSearchQuery),
    );

    const items = (
        <Box sx={{ flex: 1, minHeight: 0, minWidth: 0 }}>
            <AutoSizer onResize={({ height }) => setViewportHeight(height)}>
                {({ width, height }) => (
                    <FixedSizeList
                        ref={listRef}
                        width={width}
                        height={height}
                        itemData={itemData}
                        itemKey={getItemKey}
                        itemCount={getItemCount(itemData)}
                        itemSize={mobile ? 46 : 50}
                        style={{ overflowX: "hidden" }}
                    >
                        {ListItem}
                    </FixedSizeList>
                )}
            </AutoSizer>
        </Box>
    );

    const searchEmptyState = <NavigationEmptyState />;

    const rowHeight = mobile ? 46 : 50;
    const albumNavigationRows: AlbumNavigationRow[] = [];
    for (const filter of visibleAlbumFilters) {
        albumNavigationRows.push({
            key: `filter-${filter.value}`,
            height: rowHeight,
            content: (
                <BarCard
                    aria-label={filter.title()}
                    aria-current={
                        activeCollectionID === undefined &&
                        albumFilter == filter.value
                            ? "page"
                            : undefined
                    }
                    aria-expanded={displayedAlbumFilter == filter.value}
                    onClick={() => {
                        lastAlbumFilter.current = filter.value;
                        setExpandedAlbumFilter(
                            displayedAlbumFilter == filter.value
                                ? undefined
                                : filter.value,
                        );
                        onShowAlbumOverview(filter.value);
                        mobileDrawerProps.onClose();
                    }}
                    sx={{ flexShrink: 0 }}
                >
                    <CardText>{filter.label()}</CardText>
                    <Box
                        component={HugeiconsIcon}
                        icon={ArrowDown01Icon}
                        size={16}
                        strokeWidth={1.8}
                        sx={{
                            color: "text.muted",
                            transform:
                                displayedAlbumFilter == filter.value
                                    ? undefined
                                    : "rotate(-90deg)",
                        }}
                    />
                </BarCard>
            ),
        });
        if (displayedAlbumFilter == filter.value) {
            for (const collectionSummary of displayedCollectionSummaries) {
                albumNavigationRows.push({
                    key: `collection-${collectionSummary.id}`,
                    height: rowHeight,
                    content: (
                        <CollectionBarCard
                            key={`${collectionSummary.id}-${collectionSummary.coverFile?.id}`}
                            collectionSummary={collectionSummary}
                            activeCollectionID={activeCollectionID}
                            onSelectCollectionID={onSelectCollectionID}
                            indented={
                                !collectionSummary.attributes.has("system")
                            }
                        />
                    ),
                });
            }
        }
    }
    if (visibleAlbumFilters.length && albumShortcuts.length) {
        albumNavigationRows.push({
            key: "shortcut-divider",
            height: 18,
            content: (
                <Divider
                    sx={{
                        mt: "8px",
                        height: "2px",
                        border: 0,
                        bgcolor: "divider",
                        opacity: 0.5,
                    }}
                />
            ),
        });
    }
    for (const { id, label, active } of albumShortcuts) {
        albumNavigationRows.push({
            key: `shortcut-${id}`,
            height: rowHeight,
            content: (
                <BarCard
                    aria-label={label}
                    aria-current={active ? "true" : undefined}
                    onClick={() => {
                        void onShowCollectionSummary(
                            id,
                            id == PseudoCollectionID.hiddenItems,
                        ).then(async (success) => {
                            if (!success || !mobile) return;
                            if (id == PseudoCollectionID.hiddenItems)
                                await wait(10);
                            mobileDrawerProps.onClose();
                        });
                    }}
                    sx={{ flexShrink: 0 }}
                >
                    <CardText>{label}</CardText>
                </BarCard>
            ),
        });
    }

    const albumRowSizes = albumNavigationRows
        .map(({ height }) => height)
        .join(",");
    const activeAlbumRowIndex = albumNavigationRows.findIndex(
        ({ key }) => key == `collection-${activeCollectionID}`,
    );
    useEffect(() => {
        albumListRef.current?.resetAfterIndex(0);
    }, [albumRowSizes]);

    useEffect(() => {
        if (isSearching) return;
        if (mode == "albums") {
            if (activeAlbumRowIndex != -1)
                albumListRef.current?.scrollToItem(
                    activeAlbumRowIndex,
                    "smart",
                );
            return;
        }
        if (!listRef.current) return;
        let i = -1;
        switch (mode) {
            case "hidden-albums":
            case "archive-albums":
                i = displayedCollectionSummaries.findIndex(
                    ({ id }) => id == activeCollectionID,
                );
                break;
            case "people":
                i = matchingPeople.findIndex(
                    ({ id }) => id == activePerson?.id,
                );
                break;
        }
        if (i != -1) listRef.current.scrollToItem(i, "smart");
    }, [
        mode,
        activeAlbumRowIndex,
        displayedCollectionSummaries,
        activeCollectionID,
        matchingPeople,
        activePerson,
        collapsed,
        mobile,
        mobileDrawerProps.open,
        viewportHeight,
        isSearching,
    ]);

    const isGroupOverview =
        activeCollectionID == PseudoCollectionID.hiddenItems;

    // Keep the other sections' navigation state while a section supplies its UI.
    if (customNavigation) return customNavigation;

    return (
        <NavigationFrame
            title={
                mode == "people" && !placesFiles ? (
                    <ButtonBase
                        onClick={() => {
                            setPeopleSearchQuery("");
                            onShowPeopleOverview();
                            mobileDrawerProps.onClose();
                        }}
                        sx={{
                            font: "inherit",
                            justifyContent: "flex-start",
                            borderRadius: 1,
                            "&:hover": { color: "text.muted" },
                            "&.Mui-focusVisible": {
                                outline: "2px solid",
                                outlineColor: "primary.main",
                                outlineOffset: 2,
                            },
                        }}
                    >
                        {title}
                    </ButtonBase>
                ) : (
                    title
                )
            }
            actions={
                <>
                    {!placesFiles &&
                        (mode != "people" ? (
                            <CollectionsSortOptions
                                variant="v2"
                                activeSortBy={collectionsSortBy}
                                onChangeSortBy={onChangeCollectionsSortBy}
                            />
                        ) : (
                            <PeopleSortOptions
                                variant="v2"
                                activeSortBy={peopleSortBy}
                                onChangeSortBy={onChangePeopleSortBy}
                            />
                        ))}
                    {!placesFiles &&
                        (mode == "albums" || mode == "hidden-albums") && (
                            <Tooltip title={t("new_album")}>
                                <IconButton
                                    aria-label={t("new_album")}
                                    aria-haspopup="dialog"
                                    onClick={() => {
                                        mobileDrawerProps.onClose();
                                        onCreateAlbum();
                                    }}
                                >
                                    <AddIcon sx={{ fontSize: 20 }} />
                                </IconButton>
                            </Tooltip>
                        )}
                </>
            }
            searchPlaceholder={t(
                placesFiles
                    ? "search_in_places"
                    : mode == "people"
                      ? "people_search_hint"
                      : "search_in_albums",
            )}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            mobileDrawerProps={mobileDrawerProps}
        >
            {placesFiles ? (
                <PlacesList
                    files={placesFiles}
                    searchQuery={placesSearchQuery}
                    selectedPlace={selectedPlace}
                    onSelectPlace={onSelectPlace}
                />
            ) : isSearching &&
              (mode == "albums"
                  ? !visibleAlbumFilters.length && !albumShortcuts.length
                  : !getItemCount(itemData)) ? (
                searchEmptyState
            ) : mode == "albums" ? (
                <Box
                    role="group"
                    aria-label={t("filter_albums")}
                    sx={{ flex: 1, minHeight: 0, minWidth: 0 }}
                >
                    <AutoSizer
                        onResize={({ height }) => setViewportHeight(height)}
                    >
                        {({ width, height }) => (
                            <VariableSizeList
                                ref={albumListRef}
                                width={width}
                                height={height}
                                itemData={albumNavigationRows}
                                itemCount={albumNavigationRows.length}
                                itemKey={(index, rows) => rows[index]!.key}
                                itemSize={(index) =>
                                    albumNavigationRows[index]!.height
                                }
                                style={{ overflowX: "hidden" }}
                            >
                                {AlbumNavigationItem}
                            </VariableSizeList>
                        )}
                    </AutoSizer>
                </Box>
            ) : mode == "hidden-albums" ? (
                <Stack
                    role="group"
                    aria-label={t("section_hidden")}
                    sx={{ flex: 1, minHeight: 0, minWidth: 0 }}
                >
                    <BarCard
                        aria-current={isGroupOverview ? "page" : undefined}
                        aria-expanded={isSearching || groupExpanded}
                        onClick={() => {
                            setGroupExpanded(
                                !isGroupOverview || !groupExpanded,
                            );
                            onSelectCollectionID(
                                PseudoCollectionID.hiddenItems,
                            );
                            mobileDrawerProps.onClose();
                        }}
                        sx={{ flexShrink: 0, height: rowHeight }}
                    >
                        <CardText>{t("section_hidden")}</CardText>
                        <Box
                            component={HugeiconsIcon}
                            icon={ArrowDown01Icon}
                            size={16}
                            strokeWidth={1.8}
                            sx={{
                                color: "text.muted",
                                transform:
                                    isSearching || groupExpanded
                                        ? undefined
                                        : "rotate(-90deg)",
                            }}
                        />
                    </BarCard>
                    {(isSearching || groupExpanded) && items}
                </Stack>
            ) : (
                items
            )}
        </NavigationFrame>
    );
};

interface AlbumNavigationRow {
    key: string;
    height: number;
    content: React.ReactNode;
}

const AlbumNavigationItem = memo(
    ({ data, index, style }: ListChildComponentProps<AlbumNavigationRow[]>) => (
        <div style={style}>{data[index]!.content}</div>
    ),
    areEqual,
);

type ItemData =
    | {
          type: "collections";
          collectionSummaries: CollectionSummary[];
          indented: boolean;
          activeCollectionID: number;
          onSelectCollectionID: (id: number) => void;
      }
    | {
          type: "people";
          people: Person[];
          activePerson: Person | undefined;
          onSelectPerson: (personID: string) => void;
      };

const getItemCount = (data: ItemData) => {
    switch (data.type) {
        case "collections": {
            return data.collectionSummaries.length;
        }
        case "people": {
            return data.people.length;
        }
    }
};

const getItemKey = (index: number, data: ItemData) => {
    switch (data.type) {
        case "collections": {
            const collectionSummary = data.collectionSummaries[index]!;
            return `${data.type}-${collectionSummary.id}-${collectionSummary.coverFile?.id}`;
        }
        case "people": {
            const person = data.people[index]!;
            return `${data.type}-${person.id}-${person.displayFaceID}`;
        }
    }
};

const ListItem = memo((props: ListChildComponentProps<ItemData>) => {
    const { data, index, style } = props;

    let card: React.ReactNode;

    switch (data.type) {
        case "collections": {
            const {
                collectionSummaries,
                activeCollectionID,
                onSelectCollectionID,
            } = data;
            const collectionSummary = collectionSummaries[index]!;
            card = (
                <CollectionBarCard
                    key={collectionSummary.id}
                    {...{
                        collectionSummary,
                        activeCollectionID,
                        onSelectCollectionID,
                    }}
                    indented={
                        data.indented &&
                        !collectionSummary.attributes.has("system")
                    }
                />
            );
            break;
        }

        case "people": {
            const { people, activePerson, onSelectPerson } = data;
            const person = people[index]!;
            card = (
                <PersonCard
                    key={person.id}
                    {...{ person, activePerson, onSelectPerson }}
                />
            );
            break;
        }
    }

    return <div style={style}>{card}</div>;
}, areEqual);

interface PersonCardProps {
    person: Person;
    activePerson: Person | undefined;
    onSelectPerson: (personID: string) => void;
}

const PersonCard: React.FC<PersonCardProps> = ({
    person,
    activePerson,
    onSelectPerson,
}) => (
    <BarCard
        aria-label={person.name || t("unnamed_person")}
        aria-current={activePerson?.id === person.id ? "true" : undefined}
        title={person.name || t("unnamed_person")}
        onClick={() => onSelectPerson(person.id)}
    >
        <Box
            aria-hidden
            sx={{ flexShrink: 0, borderRadius: "50%", overflow: "hidden" }}
        >
            <ItemCard
                TileComponent={BarThumbnail}
                coverFile={person.displayFaceFile}
                coverFaceID={person.displayFaceID}
            />
        </Box>
        <CardText>{person.name || t("unnamed_person")}</CardText>
        {person.isPinned && (
            <CollectionBarCardIcon_ aria-hidden>
                <HugeiconsIcon icon={PinIcon} size={14} />
            </CollectionBarCardIcon_>
        )}
    </BarCard>
);
