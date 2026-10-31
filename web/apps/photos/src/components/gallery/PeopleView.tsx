import { sortPeople, type PeopleSortBy } from "@/utils/people-sort";
import type { Person } from "ente-new/photos/services/ml/people";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { PeopleNavigation } from "./PeopleNavigation";
import { PeopleOverview } from "./PeopleOverview";
import { useSectionNavigation } from "./section-navigation-context";

interface PeopleViewProps {
    view:
        | {
              visiblePeople: Person[];
              people: Person[];
              activePerson: Person | undefined;
          }
        | undefined;
    showOverview: boolean;
}

export const PeopleView = ({ view, showOverview }: PeopleViewProps) => {
    const [peopleSortBy, setPeopleSortBy] =
        useState<PeopleSortBy>("count-desc");
    const navigationSlot = useSectionNavigation();
    const people = view?.visiblePeople;
    const sortedPeople = useMemo(
        () => (people === undefined ? [] : sortPeople(people, peopleSortBy)),
        [people, peopleSortBy],
    );

    if (!view) return null;

    return (
        <>
            {navigationSlot.container &&
                createPortal(
                    <PeopleNavigation
                        {...navigationSlot.presentation}
                        people={sortedPeople}
                        activePerson={view.activePerson}
                        peopleSortBy={peopleSortBy}
                        onChangePeopleSortBy={setPeopleSortBy}
                    />,
                    navigationSlot.container,
                )}
            {showOverview && !view.activePerson && (
                <PeopleOverview
                    people={view.visiblePeople}
                    allPeople={view.people}
                    peopleSortBy={peopleSortBy}
                />
            )}
        </>
    );
};
