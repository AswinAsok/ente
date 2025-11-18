# Sidebar search integration – change log & data flow

This document summarizes the code changes that enable the search bar to surface sidebar/navigation actions, plus flow sketches and rationale for new variables/functions.

## Files touched
- `packages/new/photos/services/search/types.ts`
  - `SidebarActionID` and `sidebarAction` suggestion variant.
- `packages/new/photos/services/search/worker.ts`
  - `filterSearchableFiles` bails on `sidebarAction`.
- `packages/new/photos/services/sidebar-search/registry.ts`
  - Single registry: catalog + matcher (`sidebarSearchOptionsForString`) + executor (`performSidebarAction`, now returning promises and using `then(() => ...)` for void-returning callbacks).
- `packages/new/photos/components/SearchBar.tsx`
  - Merges registry suggestions with photo suggestions; renders breadcrumb and settings icon; clears on select.
- `apps/photos/src/pages/gallery.tsx`
  - Branches on `sidebarAction`, opens sidebar, sets `pendingSidebarAction`.
- `apps/photos/src/components/Sidebar.tsx`
  - Passes context into registry `performSidebarAction`; keeps pending flags for nested drawers (Account/Preferences/Help) keyed by prefixed IDs.

## Data flow (text diagram)
```
User input
   ↓
SearchBar AsyncSelect.loadOptions
   ├─ sidebarSearchOptionsForString (registry match, sync)
   └─ searchOptionsForString (worker-backed photo search)
   ↓ merge
Dropdown options (includes sidebarAction)
   ↓ onChange
Gallery.handleSelectSearchOption
   ├─ collection/person → existing flows
   └─ sidebarAction → setPendingSidebarAction + showSidebar + exit search
   ↓
Sidebar uses pendingAction
   ├─ performSidebarAction() routes to handlers
   └─ sets pending<Drawer>Action for nested drawers as needed
Nested drawers (Account/Preferences/Help)
   └─ useEffect opens targeted sheet/toggle/action and clears pending
```

## Rationale for notable additions
- Registry (`registry.ts`) centralizes the catalog, matching, and execution, so adding a setting is a one-file change.
- `SidebarActionID` keeps the contract type-safe across SearchBar, Gallery, Sidebar, and registry.
- `pendingSidebarAction` (Gallery) bridges from selection to sidebar open.
- `pending*Action` flags in Sidebar let nested drawers react after mounting without race conditions.
- Breadcrumb rendering in SearchBar differentiates non-file results; early return in worker avoids file filtering.

## Behavioral notes
- Sidebar actions clear the search input and exit search mode for parity with collection/person selections.
- Desktop-only and dev-only catalog entries are filtered before display.
- Search options remain responsive because sidebar matching is lightweight and runs alongside the existing debounced photo search.
