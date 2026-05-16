# Triple — Tasmania & Melbourne trip planner

**Triple** is a **static, installable web app** (PWA) for a December 2026 group trip to Tasmania and Melbourne. It bundles day-by-day itineraries, Leaflet maps, a budget with charts, a booking checklist, accommodation, tips, and a **flight board** with optional live data merge. Trip copy and structure live in JSON; personalization—edits, checklist state, custom flights, auth session—is stored in **`localStorage`** on each device only (no backend in this repo).

| | |
|---|---|
| **Production branch** | `main` |
| **Shipped app version** | `1.0.39` (`content/trip-data.json` → `appVersion`) |
| **Service worker cache id** | `triple-v49` (`sw.js` → `CACHE`) |
| **Example GitHub Pages URL** | `https://thisguyse19.github.io/cursor/` |

> Replace the hostname/path if your GitHub user, org, or Pages base path differs. Confirm under **Repository → Settings → Pages**.

---

## Table of contents

1. [Highlights](#highlights)
2. [Tech stack](#tech-stack)
3. [Repository layout](#repository-layout)
4. [Local development](#local-development)
5. [Content & data files](#content--data-files)
6. [Personalization & storage](#personalization--storage)
7. [Backup & restore](#backup--restore)
8. [Progressive Web App](#progressive-web-app)
9. [UI layout & tools](#ui-layout--tools)
10. [Security & privacy](#security--privacy)
11. [Release checklist](#release-checklist)
12. [JavaScript structure & globals](#javascript-structure--globals)
13. [Styles & theming](#styles--theming)
14. [Contributing / forking](#contributing--forking)
15. [License / usage](#license--usage)

---

## Highlights

| Area | What you get |
|------|----------------|
| **Itinerary** | Three sections (Tasmania south, Tasmania east/west, Melbourne & GOR) with expandable day cards, timelines, imagery, and narrative from JSON. |
| **Maps** | Full-width **Leaflet** sections (Tasmania loop, Great Ocean Road) with satellite-style tiles; size invalidated after page switches. |
| **Flight board** | Horizontally scrolled cards: route, structured legs, connection metadata, optional **mini satellite route map** (decorative—pan/zoom disabled so scrolling the page stays natural). Optional merge from `content/flights-live.json`. **Hide / Show** runs in **two phases**: shared fade on stack + “Add flight”, then height collapse (reverse when opening). Trip **countdown** banner. |
| **Stays, budget, tips** | Rendered from JSON; budget uses **Chart.js** (pie + bar) and an editable cost table in edit mode. |
| **Checklist** | Grouped items; sort by urgency, category, travel date, or status; progress bar; persisted checks. |
| **Edit mode** | `contenteditable` on marked fields; snapshot history, diff viewer, rollback, full revert modal, card hide-in-edit. |
| **PDF** | Landscape or portrait export via **html2canvas** + dedicated print CSS (`styles/pdf-export.css`). |
| **Auth** | Client-side password gate (SHA-256 compare); optional **Remember me** (token in `localStorage`). |
| **Versioning** | `appVersion` + `versions[]` changelog drives welcome / “What’s new”, sidebar pill, and **smart merge** when defaults change (conflict UI). |
| **Tools menu** | **PDF** and a **cog (⚙)** on mobile header and desktop sidebar open a menu: History, Revert all, Edit, Backup & restore (no bottom floating toolbar—avoids covering Safari drawer/modals). |
| **Add to Home Screen** | One-time, dismissible modal (wording avoids “PWA” jargon); preference stored in `localStorage` and included in backups. |
| **Updates** | Service worker precaches shell; floating **Update** strip when a new worker is waiting; trip JSON fetched **network-first** so data updates after deploy. |

---

## Tech stack

| Layer | Choices |
|-------|---------|
| **App** | Hand-authored **HTML / CSS / JavaScript** — no bundler or compile step. |
| **Charts** | [Chart.js](https://www.chartjs.org/) (CDN). |
| **Maps** | [Leaflet](https://leafletjs.com/) + Esri-style satellite tiles (CDN). |
| **PDF capture** | [html2canvas](https://html2canvas.hertzen.com/) (CDN). |
| **Fonts** | [Inter](https://fonts.google.com/specimen/Inter) (Google Fonts). |

---

## Repository layout

| Path | Role |
|------|------|
| `index.html` | Document shell: auth overlay, mobile header, sidebar, main column, modals, flight forms, hidden file input for restore. |
| `js/app.js` | All application logic (~3.3k+ lines): data load, rendering, flights, charts, auth, merge, SW helpers, tools menu, backup, onboarding. |
| `js/airlines.js` | `window.AIRLINE_OPTIONS` — airline labels + IATA codes for flight form selects. |
| `styles/app.css` | Global design system: CSS variables, glass surfaces, sidebar/drawer, main scroll column, flight board, modals, print exclusions for on-screen chrome. |
| `styles/pdf-export.css` | Print/PDF-specific overrides. |
| `content/trip-data.json` | Canonical trip payload: `appVersion`, `versions`, itinerary days, stays, costs, checklist, `clMeta`, tips, seed `flights`, `tripCountdown`, etc. |
| `content/airports.json` | IATA airport directory for flight form typeahead / validation (fetched with `cache: 'no-store'`). |
| `content/flights-live.json` | Optional keyed updates merged into built-in flight rows in the UI. |
| `content/README.md` | Notes for editors maintaining JSON. |
| `sw.js` | Service worker: precache shell assets, **network-first** for `/content/*.json`, skip-waiting messaging. |
| `manifest.webmanifest` | PWA manifest (`standalone`, icons, theme/background colors). |
| `icons/`, `splash/` | App icons and iOS launch images. |
| `scripts/` | Maintenance helpers (e.g. `extract-trip-data.mjs`, icon/airport build scripts). |

---

## Local development

Browsers block `fetch()` for local JSON from the **`file://`** protocol. Always use a static HTTP server from the repo root:

```bash
python3 -m http.server 8080
# or
npx serve .
```

Open the URL the tool_prints (e.g. `http://localhost:8080`). Without a server you will see a console error when loading `content/trip-data.json`.

---

## Content & data files

### `content/trip-data.json` (overview)

- **`appVersion`** — Compared with stored version for “What’s new”, merge, and changelog UX.
- **`versions`** — Changelog entries: `v`, `date`, `title`, `changes[]`, and exactly one entry with `"latest": true`.
- **`itinerary`** — `tas1`, `tas2`, `melb` day arrays.
- **`stays`**, **`costs`**, **`checklist`**, **`clMeta`**, **`tips`** — Section payloads.
- **`flights`** — Seed rows for the flight board (may be empty; user can add legs).
- **`tripCountdown`** — Label and date range fallback when the board is empty.

Editor-focused details: **`content/README.md`**.

### `content/airports.json`

Loaded at startup for airport search and flight validation. Regenerate with tooling in `scripts/` when refreshing the dataset.

### `content/flights-live.json` (optional)

If present and published, merged per flight `id` for live-style fields (times, status, gate, delays, etc.) without overwriting user edits wholesale.

---

## Personalization & storage

All of the below is **per browser / per device**.

### Keys backed up in **Backup & restore**

The app exports a JSON object whose `entries` map includes every key in **`TRIPLE_BACKUP_KEYS`** (`js/app.js`):

| Key | Purpose |
|-----|---------|
| `tripleFlightOverlay` | User flights, hidden built-in ids, per-flight edits. |
| `tripleFlightBoardCollapsed` | Whether the flight board stack is collapsed. |
| `checklistState` | Checked / dismissed checklist state. |
| `tripHistory` | Edit-mode snapshot history. |
| `tripFreshSnapshot` | Last fetched default snapshot for merge. |
| `tripAppVersion` | Last applied `appVersion` for merge logic. |
| `tripAuthToken` | Remember-me token (hash-derived material). |
| `tripWelcomeSeen` | Welcome modal dismissed. |
| `tripLastSeenVersion` | Last changelog version shown. |
| `tripAddToHomeDismissed` | “Add to Home Screen” tip dismissed. |
| `tripleClSort` | Checklist sort mode. |

Other keys may exist in `localStorage` from older builds; backup/export is defined by the list above.

### Flight overlay (inside `tripleFlightOverlay`)

- **`extras`** — User-added flights (`id` often prefixed `u-`).
- **`hidden`** — Built-in flight ids removed from the board.
- **`edits`** — Whitelisted patches for built-in rows (`FLIGHT_PATCH_KEYS` in `app.js`: airline, digits/no, airports, UTC times, connection fields, etc.).

---

## Backup & restore

- **In-app:** **⚙ → Backup & restore** — download a dated `.json` export or pick a file to restore (replaces keys above, then reloads when appropriate).
- **Login screen:** **Restore from backup…** uses the same file format; if the backup contains `tripAuthToken` and matches the device hash flow, the app can unlock after reload.

Format constants: `BACKUP_FORMAT` / `BACKUP_VERSION` in `js/app.js`.

---

## Progressive Web App

- **Install** — Safari: Share → Add to Home Screen; Chromium: install / add prompt when supported. The app uses `viewport-fit=cover`, `display: standalone` in the manifest, and safe-area CSS variables for notched devices.
- **Offline shell** — Precached: `index.html`, `styles/app.css`, `js/app.js`, `js/airlines.js`, manifest, core icons.
- **Fresh content** — Any URL matching `**/content/*.json` is handled **network-first** with `no-store` so trip data and airports update after each deploy without stale SW cache.
- **Updates** — When a waiting worker exists, an in-page **Update** control appears; activating it posts `SKIP_WAITING` and reloads once the new controller claims clients.

---

## UI layout & tools

- **Desktop:** Fixed **sidebar** (navigation, version pill, **↓ PDF**, **⚙**). Main column is the **only vertical scroll surface** (reduces iOS overscroll glitches).
- **Mobile:** **Top bar** (menu, title, PDF, cog). Sidebar becomes a **drawer**; the tools **dropdown** is positioned from the cog and closes on outside tap or Escape.
- **Scroll / viewport** — CSS uses `100svh` / `100lvh` in narrow layouts where needed; main column may share the page mesh background for consistent gutters on iOS.
- **Service worker strip** — Bottom-centered pill when an update is ready; JS adjusts `--main-scroll-pad-bottom` so content can scroll clear of it.

---

## Security & privacy

- The password gate uses **SHA-256** of the entered password compared to an embedded constant (suitable only for **casual privacy**, not server-grade secrets).
- **No trip edits, backups, or passwords are sent** to a server by this repository’s code—all persistence is local unless you add your own hosting/analytics.

---

## Release checklist

When shipping user-visible changes:

1. **`content/trip-data.json`**
   - Bump **`appVersion`** (semver).
   - Append one object to **`versions`** with `v`, `date` (`YYYY-MM-DD`), `title`, `changes[]`. Set **`"latest": true`** only on the new row; set **`"latest": false`** on every older row.
2. **`sw.js`**
   - Bump **`CACHE`** whenever precached shell files change (`index.html`, `styles/*.css`, `js/*.js`, manifest, icons in the precache list).
3. **README** (optional) — Refresh the version table at the top of this file for skimmability.

The full authoritative changelog is **`content/trip-data.json` → `versions`**.

---

## JavaScript structure & globals

`js/app.js` is a single global script (no ES modules). Inline `onclick` handlers rely on function declarations on `window`.

### Explicit `window` assignments (representative)

| Global | Role |
|--------|------|
| `submitAuth` | Password verify; dismiss auth; continue bootstrap. |
| `doExportPDF` | Run PDF pipeline after orientation choice. |
| `setClSort` | Checklist sort mode + re-render. |
| `doRevertAll` | Reset personalized content per app rules. |
| `openBackupModal` / `closeBackupModal` | Backup UI. |
| `doBackupDownload` | Trigger JSON download. |
| `startBackupRestore` / `startBackupRestoreFromLogin` | File-driven restore flows. |
| `removeFlightCard` | Remove user leg or hide built-in flight. |
| `openFlightAddModal` / `openFlightEditModal` / `closeFlightAddModal` | Flight modal lifecycle. |
| `submitFlightAdd` | Validate + save flight add/edit. |
| `toggleTopToolsMenu` / `closeTopToolsMenu` | Cog dropdown. |
| `dismissAddToHomeHint` | Permanently dismiss install tip. |

### Major functional areas (search `js/app.js` by name)

- **Bootstrap:** `loadTripData`, `loadAirports`, `refreshFlightsFromNetwork`, `checkAuth`, `init`, `DOMContentLoaded` wiring.
- **Navigation:** `showPage`, `toggleMobileMenu`, `closeMobileMenu`, `normalizeBodyScroll`.
- **Rendering:** `renderDays`, `renderStays`, `renderCostTable`, `renderChecklist`, `renderTips`, `renderFlights`, `initMaps`.
- **Flights:** merge helpers (`mergeLiveIntoFlight`, `enrichFlightRow`, `getEnrichedFlightRowsSorted`), form (`submitFlightAdd`, `populateAirlineSelect`, …), mini maps (`initFlightCardMiniMaps`), board toggle (`initFlightBoardSectionToggle`), countdown (`renderTripCountdownBanner`).
- **Edit / history / PDF:** `toggleEdit`, `captureSnapshot`, `openHistory`, `doRollback`, `exportPDF`, `doExportPDF`.
- **Version merge:** `checkVersionMerge`, conflict UI (`openConflictModal`, `saveConflictChoices`, …).
- **Chrome insets:** `setupMainChromeInsets`, `_safeBottomPx`.
- **Service worker:** `setupServiceWorkerUpdates`.
- **Onboarding:** `maybeShowOnboarding`, `openWhatsNewModal`, add-to-home scheduling helpers.
- **Modal scroll lock:** `modalBlockingOverlayCount`, `syncModalScrollLock`, `initModalScrollLockObservers`.

`js/airlines.js` exports **`window.AIRLINE_OPTIONS`**: `{ n: name, c: iata }[]` sorted by name in the UI, plus an “Other” path with a custom IATA field.

---

## Styles & theming

`styles/app.css` defines:

- **Design tokens** — Glass fills, blurs, radii, shadows, `--ios-blue`, safe-area `--safe-bottom`, page mesh variables shared by `html`, `body::before`, and `.main` where applicable.
- **Layout** — Sidebar, mobile header, drawer overlay, tools dropdown, flex main column.
- **Sections** — Day cards, stats, maps, budget, checklist, flight scroller/cards/dots, modals (including auth, backup, flight form, PDF, history, conflicts, welcome, what’s new, add-to-home).
- **Motion** — `prefers-reduced-motion` trims transitions (including flight board hide/show when reduced).
- **Print** — Hides on-screen-only chrome; see also `styles/pdf-export.css`.

---

## Contributing / forking

1. Follow the [**Release checklist**](#release-checklist).
2. Always verify with a **local HTTP server** so JSON and the service worker behave like production.
3. For content-only edits, prefer changing **`content/trip-data.json`** and reading **`content/README.md`**.

---

## License / usage

Private trip planner template—adjust repository metadata, license, and deployment target to match your project.
