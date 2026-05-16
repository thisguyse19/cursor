# Triple — Tasmania & Melbourne trip planner

A static, installable **Progressive Web App (PWA)** for a December 2026 group trip: day-by-day itineraries, maps, budget, checklist, accommodation, tips, and a **flight board** with optional live merge data. Content is loaded from JSON; personalization (edits, checklist, flights overlay) is stored in **localStorage** on each device.

## Deployment

- **Source branch:** `main` (production).
- **Last shipped app version:** `1.0.15` (see `content/trip-data.json` → `appVersion`).
- **GitHub Pages:** If Pages is enabled for this repository with source `main` (usually `/ (root)`), the site is available at:

  **`https://thisguyse19.github.io/cursor/`**

  (Replace with your actual username/org if different. Confirm under **GitHub → Settings → Pages**.)

- After each push to `main`, allow a short interval for Pages to rebuild. Hard-refresh or use the in-app **Update** bar if a new service worker is waiting.

## Features

| Area | Description |
|------|-------------|
| **Itinerary** | Three sections: Tasmania south, Tasmania east/west, Melbourne & Great Ocean Road; expandable day cards with timelines and imagery. |
| **Maps** | Leaflet maps for Tasmania loop and GOR; invalidates size after navigation. |
| **Stays** | Accommodation cards with images and copy from JSON. |
| **Budget** | Editable cost table, Chart.js pie/bar, per-person and group totals. |
| **Checklist** | Grouped items; sort by urgency, category, travel date, or status; progress bar; local state. |
| **Tips** | Packing and money tips from JSON. |
| **Flights** | Cards from `trip-data.json`, merged with user adds/hides/edits and optional `content/flights-live.json`; trip countdown banner; airline pickers (`js/airlines.js`); connection leg fields; horizontal timeline inside each card. |
| **Edit mode** | `contenteditable` on marked fields; history snapshots; diff and rollback; PDF export (html2canvas + print CSS). |
| **Auth** | Password gate (SHA-256); optional “remember me”. |
| **Updates** | `appVersion` + semver changelog in JSON; welcome and “What’s new” modals; smart merge when defaults change; conflict UI. |
| **PWA** | `manifest.webmanifest`, icons, splash screens, service worker cache and update UX. |

## Tech stack

- **HTML/CSS/JS** (no build step).
- **Charts:** Chart.js (CDN).
- **Maps:** Leaflet (CDN).
- **PDF / capture:** html2canvas (CDN).
- **Fonts:** Inter (Google Fonts).

## Repository layout

| Path | Role |
|------|------|
| `index.html` | Shell: layout, sections, modals, script tags. |
| `js/app.js` | All application logic (~2.1k lines). |
| `js/airlines.js` | `window.AIRLINE_OPTIONS` — airline names + IATA codes for flight form `<select>`s. |
| `styles/app.css` | Global styles, liquid-glass theme, responsive rules, print exclusions. |
| `styles/pdf-export.css` | Print-oriented overrides for PDF export. |
| `content/trip-data.json` | Itinerary, stays, costs, checklist, tips, flights seed, `tripCountdown`, `versions` / `appVersion`. |
| `content/flights-live.json` | Optional per-flight live fields keyed by flight `id` (merged in the UI). |
| `content/README.md` | Notes for editors maintaining JSON. |
| `sw.js` | Service worker: precache shell, network-first for `/content/*.json`, update messaging. |
| `manifest.webmanifest` | PWA metadata. |
| `icons/`, `splash/` | PWA and iOS assets. |
| `scripts/` | Helpers (`extract-trip-data.mjs`, `generate-pwa-assets.py`). |

## Local development

Static hosting is required (browsers block `fetch` for local JSON from `file://`).

```bash
# From repository root
python3 -m http.server 8080
# or
npx serve .
```

Open `http://localhost:8080` (or the URL your tool prints).

## Data & storage

### `content/trip-data.json` (high level)

- **`appVersion`:** Compared with last seen version for What’s New and merge logic.
- **`versions`:** Changelog entries (semver, date, title, changes[], `latest`).
- **`itinerary`:** `tas1`, `tas2`, `melb` day arrays.
- **`stays`:** Accommodation entries.
- **`costs`:** Budget line items.
- **`checklist`:** Urgency groups and items.
- **`clMeta`:** Extra metadata per checklist item id.
- **`tips`:** Tip sections.
- **`flights`:** Seed flight rows for the board.
- **`tripCountdown`:** Fallback label/start/end when no flights are scheduled.

See **`content/README.md`** for editor-focused notes.

### localStorage keys (non-exhaustive)

| Key | Purpose |
|-----|---------|
| `tripleFlightOverlay` | User flights (`extras`), hidden built-in ids (`hidden`), per-id edits (`edits`). |
| `tripHistory` | Edit-mode snapshot history. |
| `tripWelcomeSeen` / `tripLastSeenVersion` | Onboarding and version prompts. |
| `checklistState` / similar | Checklist checked state (see `loadChecklistState` in `app.js`). |
| Auth | Hashed password verification and session flag (see `checkAuth` / `submitAuth`). |

### Flight overlay shape

Persisted JSON includes:

- **`extras`:** User-added flights (`id` prefixed with `u-`).
- **`hidden`:** Built-in flight ids removed from the board.
- **`edits`:** Patches for built-in flights (only keys in `FLIGHT_PATCH_KEYS`).

`FLIGHT_PATCH_KEYS` in `app.js` includes label, airline fields, airports, UTC times, `connectionKind`, connection airline/digits/airports/landing, etc. Notes were removed from the patch set and UI.

## Progressive Web App

- **Install:** “Add to Home Screen” on iOS / install prompt on supporting browsers.
- **`sw.js`:** Cache name bumped when shell assets change (e.g. `triple-v13`); precache includes `index.html`, `styles/app.css`, `js/airlines.js`, `js/app.js`, manifest, icons.
- **Trip JSON:** Fetched **network-first** with `no-store` so data updates after deploy without stale cache.
- **Updates:** `setupServiceWorkerUpdates` listens for waiting worker and can message `SKIP_WAITING`; UI bar may prompt to reload.

## Security notes

- The gate uses **SHA-256** of the entered password compared to an embedded hash (not a substitute for server-side auth — suitable only for casual privacy).
- All trip “edits” are **client-side only** and never sent to a server by this app.

---

## JavaScript API reference (`js/app.js`)

Functions below are **function declarations** in the global script (available to inline `onclick` handlers). A small set is also assigned explicitly to **`window`** for clarity.

### Explicit `window` exports

| Global | Function |
|--------|----------|
| `removeFlightCard` | Remove or hide a flight card by id. |
| `openFlightAddModal` | Open empty flight form. |
| `openFlightEditModal` | Open flight form populated from user or merged row. |
| `closeFlightAddModal` | Close flight modal and reset title/submit label. |
| `submitFlightAdd` | Validate and save flight (add or patch). |
| `submitAuth` | Validate password and dismiss auth overlay. |
| `doExportPDF` | Generate PDF after modal picks landscape/portrait. |
| `setClSort` | Set checklist sort mode and re-render. |
| `doRevertAll` | Clear edit history and restore defaults from DOM reset path. |

### Modal scroll lock

| Function | Role |
|----------|------|
| `modalBlockingOverlayCount` | Counts open `.modal-overlay.open` plus visible `#auth-overlay`. |
| `syncModalScrollLock` | Applies/removes `modal-scroll-lock` on `html`/`body` and restores scroll position. |
| `initModalScrollLockObservers` | Watches overlay/auth class changes and syncs lock. |
| `normalizeBodyScroll` | When no blocking overlay: clears stray `overflow`, `modal-scroll-lock`, and fixed-position leftovers (helps bottom toolbar stay fixed after nav). |

### Content loading & URL

| Function | Role |
|----------|------|
| `contentUrl(path)` | Resolve asset URL against `document.baseURI` (GitHub Pages–safe). |
| `loadTripData` | `fetch` `content/trip-data.json`, populate globals (`DAYS_*`, `STAYS`, `CHECKLIST`, `FLIGHTS`, `TRIP_COUNTDOWN_META`, etc.). |
| `refreshFlightsFromNetwork` | Optional `content/flights-live.json` into `FLIGHTS_LIVE`. |

### Flights: escaping, merge, sort

| Function | Role |
|----------|------|
| `flightEsc(s)` | Escape HTML for injected flight strings. |
| `formatFlightCardTime(dt)` | `toLocaleString` with medium date + short time. |
| `mergeLiveIntoFlight(base)` | Overlay `FLIGHTS_LIVE.updates[id]` onto a row (times, status, gate, delay, etc.). |
| `pickFlightPatch(obj)` | Whitelist object to `FLIGHT_PATCH_KEYS`. |
| `applyEditsToFlight(f)` | Merge `flightEdits[f.id]` for built-in rows. |
| `enrichFlightRow(f)` | `applyEditsToFlight` + `mergeLiveIntoFlight`. |
| `getEnrichedFlightRowsSorted` | Filter hidden, merge extras, sort by `departureUtc`. |
| `getTripStartDateFromFlights` | Calendar date of first departing flight (for countdown). |
| `getTripEndDate` | End date from `tripCountdown` meta or last flight arrival. |

### Flights: form helpers

| Function | Role |
|----------|------|
| `populateAirlineSelect(sel)` | Fill `<select>` from `AIRLINE_OPTIONS` (sorted by name) + “Other”. |
| `syncAirlineCustomVisibility(prefix)` | Toggle custom IATA input when “Other” selected. |
| `updateConnectionFormVisibility` | Show/hide `#flight-conn-block` from connection type. |
| `airlineNameFromSelect(prefix, code)` | Human-readable airline label for storage. |
| `readAirlineCode(prefix)` | IATA from select or custom field. |
| `setAirlineSelectFromModel(prefix, m)` | Populate select + digits from `airlineCode` / `flightDigits` / `flightNo`. |
| `deriveIataAndDigits(m)` | Parse IATA + digits from structured fields or combined `flightNo`. |
| `flightPillText` / `flightPillHtml` | Main leg pill (e.g. `JQ8`). |
| `connPillText` / `connPillHtml` | Connection pill. |
| `flightTimelineStripHtml(m)` | Scrollable strip: depart, en route pill, optional connection column, arrive. |

### Countdown banner

| Function | Role |
|----------|------|
| `calendarDiffDays(d0, d1)` | Whole-day difference in local calendars. |
| `tripCountdownState` | `{ until, totalDays, dayIndex, afterEnd, start, end, label }` or null. |
| `renderTripCountdownBanner` | Renders `#trip-countdown-banner`, starts 60s interval. |

### Flights: time & persistence

| Function | Role |
|----------|------|
| `isoToDatetimeLocal(iso)` | For `<input type="datetime-local">`. |
| `effectiveDepArr(f)` | Apply delay to dep/arrival for display. |
| `loadFlightOverlay` / `persistFlightOverlay` | Read/write `tripleFlightOverlay`. |
| `removeFlightCard` | Remove user leg or hide built-in + persist. |
| `flightCardHtml` | HTML string for one card. |
| `renderFlights` | Render grid, sync hint text, refresh countdown. |
| `openFlightAddModal` / `openFlightEditModal` / `closeFlightAddModal` | Modal lifecycle. |
| `getFlightFormSource` | Resolve row for editing (extra vs built-in + edits). |
| `submitFlightAdd` | Build patch, validate airline + digits, save. |

### Version sort

| Function | Role |
|----------|------|
| `compareVersionDesc(a, b)` | Semver compare for changelog ordering. |

### Checklist & rendering

| Function | Role |
|----------|------|
| `loadHistory` / `saveHistory` | Edit history array in localStorage. |
| `setClSort` | Active sort button + `renderChecklist`. |
| `getChecklistGroups` | Regroup checklist items by current sort. |
| `renderDays` | Inject day cards into a section container. |
| `renderStays` | Accommodation grid. |
| `renderCostTable` | Budget table from `COSTS` and editables. |
| `renderChecklist` | Full checklist DOM. |
| `toggleChecklistItem` | Checkbox handler + persist. |
| `updateChecklistProgress` | Progress bar width. |
| `loadChecklistState` / `resetChecklist` / `doResetChecklist` | Persisted checks + modal reset. |
| `showAlert` | Themed alert modal. |
| `renderTips` | Tips section. |

### Budget & charts

| Function | Role |
|----------|------|
| `getCostsByCategory` | Aggregate for charts. |
| `getTotalPP` | Per-person total helper. |
| `initCharts` / `updateCharts` | Chart.js pie + bar on Budget page. |

### Navigation & chrome

| Function | Role |
|----------|------|
| `showPage(id, btn)` | SPA-like page switch, scroll top, close drawer, map resize hooks, `normalizeBodyScroll`. |
| `toggleMobileMenu` / `closeMobileMenu` | Drawer + overlay; calls `normalizeBodyScroll`. |
| `toggleDay` | Accordion for day cards when not editing. |

### Edit mode, history, PDF

| Function | Role |
|----------|------|
| `captureSnapshot` / `applySnapshot` | Serialize/deserialize editable regions + deleted cards. |
| `toggleEdit` | Enter/exit edit mode, toast, push history. |
| `deleteCard` | Hide card in edit mode. |
| `formatDate` / `stripHTML` | Helpers for diff display. |
| `diffSnapshots` | Key-level diff for rollback UI. |
| `openHistory` / `closeHistory` | History modal. |
| `openDiff` / `closeDiff` | Diff modal + pending rollback index. |
| `doRollback` | Apply historical snapshot. |
| `confirmRevert` / `doRevertAll` | Wipe local personalized content per app logic. |
| `exportPDF` / `doExportPDF` | html2canvas capture + print window. |

### Version merge & conflicts

| Function | Role |
|----------|------|
| `openVersionModal` | Render changelog from `VERSIONS`. |
| `loadFreshSnap` | Snapshot defaults from server for merge. |
| `checkVersionMerge` | Compare saved edits to fresh defaults; may open conflict modal. |
| `showToast` / `showMergeToast` | Ephemeral messages. |
| `openConflictModal` | Show conflicting keys. |
| `chooseConflict` / `resolveAllConflicts` / `saveConflictChoices` | Conflict resolution + persist. |

### Bootstrap & maps

| Function | Role |
|----------|------|
| `init` | After auth: render pages, load overlays, maps, checklist, flights, merge check, onboarding. |
| `initMaps` | Leaflet setup for Tasmania and Melbourne + `invalidateSize` hooks. |

### Auth

| Function | Role |
|----------|------|
| `_hashInput` | SHA-256 helper. |
| `checkAuth` | Show/hide `#auth-overlay`. |
| `submitAuth` | Verify hash, set remember-me, `init` + `maybeShowOnboarding`. |

### Service worker & onboarding

| Function | Role |
|----------|------|
| `setupServiceWorkerUpdates` | Register SW, listen for updates, visibility refresh. |
| `maybeShowOnboarding` | Welcome vs What’s New from `localStorage` + `APP_VERSION`. |
| `openWhatsNewModal` | Renders latest changelog entry. |

### Event wiring

| `DOMContentLoaded` listener | Modal observers, SW setup, flight add button, airline `select` listeners, `loadTripData`, `checkAuth`, `init`. |

---

## `js/airlines.js`

Exports **`window.AIRLINE_OPTIONS`**: an array of `{ n: name, c: iata }`. `populateAirlineSelect` copies and sorts by `n` at build time. “Other” uses a blank value and the custom IATA field.

---

## `styles/app.css` (topics)

- CSS variables for glass surfaces, blurs, radii, iOS-accent blue (`--ios-blue`).
- Sidebar, mobile header (frosted, safe-area), main padding for toolbar.
- Day cards, stats, maps, budget, checklist, modals, auth.
- Flight board: horizontal scroller, cards, timeline strip, pills, countdown, connection form panel.
- Print media query hides chrome not needed on paper.

---

## Change history

The canonical changelog is **`content/trip-data.json` → `versions`**. The **sidebar version pill** and **Version history** modal read from this array. Summaries below mirror shipped releases.

### Release checklist (do this on every push that ships user-visible changes)

1. **`content/trip-data.json`**
   - Increment **`appVersion`** (semver, e.g. `1.0.17`).
   - Append one object to **`versions`** with `v`, `date` (ISO `YYYY-MM-DD`), `title`, and `changes` (string array). Set **`"latest": true`** only on the new entry; set **`"latest": false`** on every older entry.
2. **`sw.js`** — bump the **`CACHE`** constant whenever you change precached shell assets (`index.html`, `styles/app.css`, `js/app.js`, etc.) so installed PWAs pick up the new bundle.
3. Optionally mirror the same title and bullets in this README **Change history** section so the doc stays skimmable.

### 1.0 — Initial Release (2026-05-11)

- Full 15-day planner, maps, budget, checklist, tips, PDF export, edit mode with history, password gate, mobile nav, car rental, themed modals, thin scrollbars, smart merge, version pill.

### 1.0.1 — Polish & Fixes (2026-05-11)

- Modal animations; removed inconsistent emoji from car rental headers.

### 1.0.2 — Mobile Fixes (2026-05-11)

- Tap tooltips; PDF on iOS via iframe.

### 1.0.3 — Edit Mode Toast (2026-05-11)

- Toast when entering edit mode.

### 1.0.4 — Onboarding & Tooltips (2026-05-11)

- Welcome + What’s New; fixed dual tooltips on touch.

### 1.0.5 — Return flight details (2026-05-15)

- Day 15 MEL→SIN timing; Jordan early arrival note; checklist flight item.

### 1.0.6 — Liquid Glass UI (2026-05-16)

- Frosted surfaces, mesh background, print still flat.

### 1.0.7 — Softer glass hero & sidebar (2026-05-16)

- Hero text on gradient; flatter sidebar rows.

### 1.0.8 — PWA & in-app updates (2026-05-16)

- Installability, icons, launch screens, offline shell, update bar, favicon/manifest.

### 1.0.9 — Flight board & live file (2026-05-16)

- Flight cards + optional live JSON merge; countdown per leg concepts; add/hide flights.

### 1.0.10 — Flight add fix (2026-05-16)

- Early wire-up for add button; layout and modal hardening.

### 1.0.11 — Trip countdown & edit (2026-05-16)

- Trip-level countdown; flight edit form; readable modal fields.

### 1.0.12 — PWA content refresh & flight UI (2026-05-16)

- Network-first trip JSON; modal fit; glass buttons.

### 1.0.13 — Timeline strip & connections (2026-05-16)

- Horizontal flight scroller; connection type + via/notes; pinned toolbar; modal scroll lock.

### 1.0.14 — Scroll lock on all modals (2026-05-16)

- Background scroll frozen for all dialogs including auth.

### 1.0.15 — Flight board polish (2026-05-16)

- Light `theme-color` + translucent status bar + safe-area header alignment.
- Countdown from first flight, **1-minute** refresh.
- Timeline scroll **inside** cards; connection column for non-direct trips.
- Airline picklists + digit flight numbers (e.g. **JQ8**); structured connection fields; **notes removed** from flight UI.
- `normalizeBodyScroll` on nav/drawer close for **fixed bottom toolbar**.
- Slimmer cards/countdown; iOS-style primary buttons.

### 1.0.16 — Flights layout, connections, countdown & PWA (2026-05-16) — **current**

- Version history workflow documented; keep **`versions[]`** in sync with every release (see checklist above).
- Thin blue **next-flight** countdown (days / hours / “Enjoy your trip!”); dotted placeholder when there are no flights; bundled **`flights`** defaults to empty.
- Flight board stack width; legs show **dates**; **connection** layover duration + second-leg rows; **conn dep/arr** times in the form; pills and digits widened for real flight codes.
- Sidebar **safe-area** so the badge clears the notch; optional live-merge caption under the board.

---

## Contributing / forking

1. Follow the **Release checklist** in **Change history** (bump `appVersion`, append `versions`, set `latest` flags, bump `sw.js` `CACHE` when needed).
2. Run a local HTTP server to verify `fetch` of JSON.

## License / usage

Private trip planner; adjust the repository description and license to match your intent.
