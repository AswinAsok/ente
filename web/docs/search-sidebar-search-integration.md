# SearchBar + Sidebar navigation search

How the global search bar (`packages/new/photos/components/SearchBar.tsx`) now surfaces sidebar/navigation actions that live in `apps/photos/src/components/Sidebar.tsx` and its nested drawers. This reflects the current implementation (registry-based) rather than a proposal.

## What changed (quick map)
- Suggestions include a new `sidebarAction` variant (`packages/new/photos/services/search/types.ts`).
- The search worker ignores `sidebarAction` when filtering files (`worker.ts`).
- A registry at `packages/new/photos/services/sidebar-search/registry.ts` owns:
  - The catalog of actions (Shortcuts, Utility, Account, Preferences, Help) with optional availability guards.
  - Matching (`sidebarSearchOptionsForString`) that returns breadcrumbed search options.
  - Execution (`performSidebarAction`) that opens the right drawer/route and sets pending flags.
- `SearchBar.tsx` merges registry options with photo search options, renders breadcrumbs with a settings icon, and clears the input when a sidebar action is chosen.
- `gallery.tsx` branches on `sidebarAction`: it shows the sidebar, records a `pendingSidebarAction`, and exits search mode.
- `Sidebar.tsx` consumes the pending action, calls the registry executor with a context (collection pseudo IDs, router hook, modal/show helpers), and passes pending IDs down to Account/Preferences/Help drawers which react via `useEffect`.

## Current sidebar surface indexed
- Shortcuts: Uncategorized, Archive, Hidden, Trash (pseudo collections).
- Utility: Account, Watch folders (desktop only), Deduplicate, Preferences, Help, Export data, Logout.
- Account drawer: Recovery key, Two-factor, Passkeys, Change password, Change email, Delete account.
- Preferences drawer: Language, Theme, Custom domains, Map, Advanced, ML search, Streamable videos (guarded by HLS capability).
- Help drawer: Help center, Blog, Request feature, Support, View logs, Test upload (dev builds only).

## Data flow (text sketch)
```
User input → SearchBar.loadOptions (debounced)
   ├─ sidebarSearchOptionsForString (registry match; availability filters)
   └─ searchOptionsForString (existing photo search)
   ↓ merged options
AsyncSelect onChange
   ├─ collection/person → existing flows
   └─ sidebarAction → setPendingSidebarAction + showSidebar + exit search
Sidebar receives pendingAction
   └─ performSidebarAction(ctx) routes to shortcut/help/account/preferences/utility handlers
Nested drawers useEffect on pending*Action → open target drawer/action → clear pending
```

## UX/behavioral notes
- Sidebar actions clear the search input (consistent with collection/person selections).
- Breadcrumbs (e.g. `Preferences > Advanced`) help distinguish settings vs file results.
- Platform/dev-gated actions are filtered before rendering; no-op matches return an empty list.
- Execution favors opening existing drawers/toggles instead of silently mutating state.
