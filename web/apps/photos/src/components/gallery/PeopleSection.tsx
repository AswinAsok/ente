import { sortPeople } from "@/utils/people-sort";
import { useMemo } from "react";
import { GalleryMedia } from "./GalleryMedia";
import { GallerySectionLayout } from "./GallerySectionLayout";
import { PeopleHeader } from "./PeopleHeader";
import { PeopleNavigation } from "./PeopleNavigation";
import { PeopleOverview } from "./PeopleOverview";
import type { GallerySectionProps } from "./section-types";

export const PeopleSection = ({
    library,
    operations,
    navigation,
    preferences,
    presentation,
}: GallerySectionProps) => {
    const view =
        navigation.view?.type == "people" ? navigation.view : undefined;
    const people = useMemo(
        () => sortPeople(view?.visiblePeople ?? [], preferences.peopleSortBy),
        [view?.visiblePeople, preferences.peopleSortBy],
    );
    const activePerson = view?.activePerson;
    return (
        <GallerySectionLayout
            presentation={presentation}
            navigation={
                <PeopleNavigation
                    {...presentation}
                    people={people}
                    activePerson={activePerson}
                    peopleSortBy={preferences.peopleSortBy}
                    onChangePeopleSortBy={preferences.setPeopleSortBy}
                />
            }
        >
            {!library.isFirstLoad && !activePerson ? (
                <PeopleOverview
                    people={view?.visiblePeople ?? []}
                    allPeople={view?.people ?? []}
                    peopleSortBy={preferences.peopleSortBy}
                />
            ) : (
                <GalleryMedia
                    {...{ library, operations, navigation }}
                    header={{
                        component: activePerson ? (
                            <PeopleHeader
                                person={activePerson}
                                people={view.visiblePeople}
                            />
                        ) : (
                            <></>
                        ),
                        height: 72,
                    }}
                    source={{
                        mode: "people",
                        modePlus: "people",
                        files: library.filteredFiles,
                        activeCollectionID: undefined,
                        activePersonID: activePerson?.id,
                        activeCollectionSummary: undefined,
                        disableGrouping: false,
                    }}
                />
            )}
        </GallerySectionLayout>
    );
};
