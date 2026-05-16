# Triple — version history

**Shipped app version:** `1.0.39` (must match `content/trip-data.json` → `appVersion`).

This file lists every shipped version from newest to oldest. The **source of truth** is `content/trip-data.json` → `versions` (same strings power the in-app changelog, sidebar version pill, and “What’s new”).

After editing `versions` in JSON, regenerate this file:

```bash
node scripts/generate-version-md.mjs
```

---

## 1.0.39 — 2026-05-16 **· current release**

### Flight board show / hide timing

- Hide / Show on the flight board runs in two steps: content (cards, countdown, Add flight) fades out or in together, then the section height opens or closes — no staggered piecemeal hiding

## 1.0.38 — 2026-05-16

### Mobile bottom band + flight map gestures

- Narrow layouts use small viewport height (svh) for html/body in the browser, with lvh when installed, plus body/mesh background tweaks so a grey strip is less likely under iOS UI
- Main column uses a local (scrolled) mesh on phones — fixed backgrounds inside overflow scroll are brittle on WebKit
- Flight card satellite maps no longer pan, pinch-zoom, or double-tap zoom; touch drags pass vertically to the page

## 1.0.37 — 2026-05-16

### Scroll column background / safe inset

- Main column now shares the same fixed mesh as the page so iOS does not paint a flat grey band in the bottom padding / overscroll region
- Installed mode uses large viewport height (lvh) for body and sidebar to avoid a thin unpainted gutter with dvh; safe-area padding uses env() without an extra 34px floor, with JS still probing env when needed

## 1.0.36 — 2026-05-16

### Full-bleed background on mobile

- Removed the installed-app rule that lifted the page background off the bottom safe area (it left a bright strip); mesh gradient and html fallback color now cover the full viewport on phones and when added to the Home Screen

## 1.0.35 — 2026-05-16

### Add to Home Screen tip

- One-time modal after sign-in explains how to add the trip planner to your Home Screen for a full-screen app-like experience; dismissed permanently on this device

## 1.0.34 — 2026-05-16

### Trip tools cog menu

- Removed the bottom floating edit pill that overlapped Safari UI (drawer nav, modal close, etc.)
- PDF export lives beside a compact cog on the mobile top bar and in the sidebar; History, Revert, Edit, and Backup open from the cog dropdown
- Main scroll padding and SW update pill spacing no longer depend on a bottom toolbar

## 1.0.33 — 2026-05-16

### Restore backup from login

- Password screen includes Restore from backup — same JSON restore as in the app; page reloads and unlocks automatically if the backup contains a saved tripAuthToken (Remember me)

## 1.0.32 — 2026-05-16

### Update pill above edit bar

- Service-worker “new version” UI is a floating frosted pill centered above the edit toolbar with higher z-index so Update is tappable; --sw-update-bottom tracks the edit stack from the same anchor pass
- When the update pill is visible, main bottom padding grows so scrolled content can clear it; print hides the update UI

## 1.0.31 — 2026-05-16

### Scroll above edit bar

- Main column bottom padding matches the live edit toolbar height via --edit-toolbar-clearance so scrolled page ends sit above the bar, including when buttons wrap on narrow widths
- scroll-padding-bottom follows the same value for in-page jumps

## 1.0.30 — 2026-05-16

### PWA edit bar layout viewport

- Edit toolbar: anchor from window.innerHeight first — visualViewport alone was still placing the bar at the top (Safari over the sticky header) or in the notch band (standalone PWA); blend vv only when it agrees with a bottom placement
- Safe-bottom fallback via env() probe if --safe-bottom does not resolve; extra schedule on load/orientationchange; toolbar z-index above the SW update strip

## 1.0.29 — 2026-05-16

### PWA edit bar visualViewport

- Edit toolbar position is re-applied from window.visualViewport on load, resize, and when the bar resizes so iOS cannot leave it glued to the top when fixed+bottom breaks under overflow:hidden and the dynamic chrome

## 1.0.28 — 2026-05-16

### PWA edit bar bottom anchor

- Edit toolbar: fixed outer strip uses left/right 0 with flex-centered inner pill so WebKit does not drop bottom positioning
- Layered bottom fallbacks (12px → env → --safe-bottom) and cascaded --safe-bottom definitions so a bad max()/custom property cannot invalidate the whole offset

## 1.0.27 — 2026-05-16

### PWA edit bar positioning

- Fix edit toolbar jumping to the top on iOS: avoid transform on the fixed toolbar and center it with left/right insets plus auto margins instead

## 1.0.26 — 2026-05-16

### PWA floating edit bar

- Edit controls sit in a centered frosted pill above the home-indicator zone instead of a full-width bar that fought WebKit’s safe-area painting
- Installed standalone/fullscreen: page gradient is clipped above the bottom inset so the system home strip can render over a transparent layer; shared --safe-bottom drives toolbar position and scroll padding

## 1.0.25 — 2026-05-16

### PWA bottom toolbar safe area

- Edit toolbar uses a minimum bottom inset in standalone/fullscreen mode so the frosted bar stays flush with the home indicator when env(safe-area-inset-bottom) incorrectly reads 0
- Main scroll padding on narrow installed PWAs matches the same inset so content does not sit under a taller toolbar

## 1.0.24 — 2026-05-16

### Maps: Leaflet + satellite

- Replaced MapLibre with Leaflet and Esri World Imagery — raster tiles do not depend on WebGL, fixing blank black maps when maplibregl.supported() was false (common on iOS PWA)
- Trip maps and flight cards keep great-circle routes, glow polylines, and numbered markers; tile layers use crossOrigin for cleaner PDF captures

## 1.0.23 — 2026-05-16

### Map imagery fix

- Satellite maps default to Mercator so Esri tiles paint reliably; use the globe control on trip maps for 3D globe when you want it
- Upgraded MapLibre, switched Esri endpoint, removed sky layer and heavy raster brightness filters that could show a blank black canvas on some devices
- Flight card mini maps use the same Mercator satellite base

## 1.0.22 — 2026-05-16

### Globe satellite maps

- Trip maps and flight-card routes use MapLibre GL with a 3D globe, darkened Esri World Imagery satellite, and atmosphere sky — pan, zoom, rotate, and tilt like a flight-tracker app
- Great-circle paths with a soft cyan glow on flight cards; main trip maps keep numbered stops, dashed day-trip legs, and orange GOR routing
- PDF map snapshots read from the WebGL canvas for sharper exports

## 1.0.21 — 2026-05-16

### iOS PWA bottom toolbar

- Edit toolbar sits flush with the home indicator on iPhone — opaque fill under the safe-area inset fixes the frosted bar gap WebKit sometimes shows in standalone mode
- Older iOS safe-area values use the constant() fallback alongside env()
- Viewport root uses min-height: -webkit-fill-available so height aligns with the visible screen edge on iOS

## 1.0.20 — 2026-05-16

### Mini route map on every flight card

- Each flight card includes a small map with the path between stops (and via hubs for connections), using the same OpenStreetMap tiles as the trip maps
- Airport lookup file now stores coordinates so routes draw worldwide for any IATA code

## 1.0.19 — 2026-05-16

### Springy drawer, flight hide polish, instant remembered auth

- Mobile drawer and flight-board expand/collapse use spring-style easing (native-feel overshoot)
- Hiding Your flights also hides the + Add flight control
- Remembered login: password gate is suppressed before first paint — no flash on PWA launch

## 1.0.18 — 2026-05-16

### Airline search, flight board toggle & motion polish

- Airline field uses the same frosted quick-type list as airports (main and connection flights)
- Hide / Show pill beside Your flights collapses the countdown and card carousel (saved on this device)
- Smoother modal, auth, drawer, tooltips, suggestion lists, and update bar motion; lighter press feedback on key controls
- Respects Reduce Motion for heavy animations

## 1.0.17 — 2026-05-16

### Airport quick-search & automatic route titles

- World IATA airport index bundled as content/airports.json for fast offline lookup
- Add / edit flight: From and To moved to the top — type a city, airport name, or code to see a frosted suggestion list (same for connection From and Connect at)
- Manual trip label field removed; cards show an automatic title from origin city to final city (e.g. Singapore to Hobart), including connections

## 1.0.16 — 2026-05-16

### Flights layout, connections detail, countdown & PWA spacing

- Next-flight countdown: slim blue bar — days or hours until departure, “Enjoy your trip!” under one hour, muted line after the trip ends
- No sample flights in bundled data — board starts empty; dotted hint “Add your first flight above.” when you have no legs yet
- Flight board stack so the countdown bar and cards share the same width; full-width cards in the scroller
- Sidebar header respects safe-area-inset-top so the month badge clears the status bar when the drawer is open on iPhone
- Flight legs show weekday + date beside times; header date lines up with the leg time column
- Flight numbers support up to 4 digits; connection form stores both connection departure and arrival in UTC (connDepartureUtc + connArrivalUtc)
- Connecting itineraries: “Xh Ym connection time” from first-leg landing to second-leg departure; second segment uses the same arrow rows as the first; layover wording is scheduled (not “Landed”) for upcoming travel
- Header flight pill sized for typical 3-letter + 4-digit codes
- Live flights JSON still merges into cards on load; status line can appear under the board when the live file is or is not used

## 1.0.15 — 2026-05-16

### Flight board polish — airlines, connections, native chrome

- Status bar / PWA theme aligned with the frosted header (light theme-color, translucent status bar, safe-area padding)
- Countdown follows the first scheduled flight and refreshes every minute
- Flight timeline scrolls inside each card; non-direct itineraries show a connection column
- Add/edit flight uses airline picklists plus flight digits (e.g. JQ8); connection airline, route, and landing time; notes removed from the form and cards
- Navigation clears stuck scroll-lock so the bottom edit bar stays fixed to the viewport
- Tighter departure/arrival pickers and slimmer cards/countdown; controls use iOS-style blue, corner radius, and tap feedback

## 1.0.14 — 2026-05-16

### Scroll lock on all modals

- Background scroll is frozen whenever any dialog is open (including auth, version history, conflicts, and the rest), not only the flight form

## 1.0.13 — 2026-05-16

### Flights timeline strip, connections, calmer buttons, pinned toolbar

- Flight cards scroll horizontally with snap and a day-style timeline (depart / arrive, carrier & number between)
- Add/edit flight: connection type menu, optional via airport and connection notes; shown compactly on the card
- Softer button styling; edit toolbar is a frosted bar fixed to the bottom safe area (iOS-style), content padded above it
- Flight modal locks page scroll while open; viewport disallows pinch-zoom; reduced glass on controls overall
- Removed the old gate-merge blurb under Your flights

## 1.0.12 — 2026-05-16

### PWA content refresh, flight UI, liquid-glass buttons

- Installed app: trip and flight content now loads network-first so Update + reload shows the same data as in the browser (no stale JSON cache)
- Flight add/edit modal fits narrow screens without sideways scrolling; overlay scrolls vertically only
- Flight card Edit sits beside Remove — the delete control no longer stacks on top of Edit
- Toolbar, sidebar nav, auth unlock, checklist filters, modals, and other controls use consistent liquid-glass buttons

## 1.0.11 — 2026-05-16

### Flights — Trip countdown, edit, readable forms

- One trip countdown to day one (days only) with a clear card; during the trip it shows which day you are on out of 15
- Flight cards focus on route and times; edit opens the same form with your values (saved on device)
- Add / edit flight modal uses high-contrast inputs so labels and fields stay readable on the glass panel

## 1.0.10 — 2026-05-16

### Flight Board — UX & Add Fix

- Add flight opens reliably — button is wired as soon as the page loads (not only after data init)
- Flight section layout: more space above the add control; liquid-glass styling on the add button
- Safer modal open when fields are missing in edge cases

## 1.0.9 — 2026-05-16

### Flight Board & Live File

- Trip overview now includes flight cards with route, times, and live-style status merged from a flights file fetched on each launch
- Countdown (or “in flight” / “arrived”) for every departure and arrival using your device clock
- Add your own flights with + Add flight — saved only on this device alongside checklist progress
- Hide cards you do not need with the remove control on each card

## 1.0.8 — 2026-05-16

### PWA, Icons & In-App Updates

- Add to Home Screen on iPhone and iPad — opens like its own app with the Triple name, themed icon, and launch screens that match the trip planner look
- Icons use a lowercase “triple” wordmark in Inter on a frosted liquid-glass pill over the mesh background
- Offline-friendly shell — core pages and styles are cached so revisits feel snappy; trip data still loads from the live site when you are online
- When a new build is published, a bottom bar can offer Update — one tap reloads to the latest version without reinstalling the shortcut; your checklist, edits, and history stay on this device
- Favicon and web manifest tuned for bookmarks and install prompts on other browsers

## 1.0.7 — 2026-05-16

### Softer Glass — Hero & Sidebar

- Hero titles no longer sit in a frosted panel — text uses the photo gradient plus shadow for readability, so nothing “cuts into” the top of the image or the mobile header area
- Sidebar links are flat again with simple hover/active tints and spacing between rows — no stacked glass tiles on each button

## 1.0.6 — 2026-05-16

### Liquid Glass UI

- Richer frosted-glass surfaces across cards, sidebar, hero content, maps, modals, and controls — layered blur, specular borders, and soft mesh background
- Navigation pills, checklist sort chips, and route bars use translucent “liquid” styling to match Apple-style depth
- Print view still uses flat white panels for clean hardcopy output

## 1.0.5 — 2026-05-15

### Itinerary Update — Return Flight Details

- Day 15 updated: evening departure 22:35 MEL→SIN, landing Singapore 03:20 — full last day in Melbourne now available
- Jordan noted as arriving Dec 5 (2 days early, free & easy) before group lands Dec 7
- Checklist return flight updated with specific departure time and landing details

## 1.0.4 — 2026-05-11

### Onboarding & Tooltips

- First-time welcome popup — introduces key features to new visitors after login
- What's New popup — shows changes since your last visit whenever the app is updated
- Fixed tooltip conflict on mobile — touch devices now show only the tap popup, not both the CSS and JS tooltips simultaneously

## 1.0.3 — 2026-05-11

### Edit Mode Toast

- Toast notification on entering Edit mode — reminds you that edits are saved locally for your device only

## 1.0.2 — 2026-05-11

### Mobile Fixes

- Touch-friendly tooltips on mobile — tap any underlined tooltip to show a small floating popup that auto-dismisses after 3 seconds
- PDF export now works on iOS Safari — uses an inline iframe instead of a popup window, bypassing Safari's popup blocker

## 1.0.1 — 2026-05-11

### Polish & Fixes

- Added subtle fade-in and scale animation for all popup modals and the auth overlay
- Removed inconsistent flag (🇦🇺) and city (🏙) emoji icons from Car Rental section leg sub-headers

## 1.0 — 2026-05-11

### Initial Release

- Complete 15-day Tasmania & Melbourne trip planner for December 2026
- Day-by-day itinerary with activities, timelines, images, and costs
- Interactive Leaflet maps — Tasmania clockwise loop and GOR route
- Budget breakdown with editable cost table and per-person/group totals
- Booking checklist sortable by Urgency, Category, Travel Date, or Status
- Accommodation guide across 8 stays with neighbourhood tips and pricing
- Travel tips, packing guide, and money-saving advice section
- PDF export — Landscape or Portrait — includes maps, checklist, and budget
- Edit mode with field-level contenteditable, full history and rollback
- Password protection using SHA-256 hashing with Remember me option
- Mobile-responsive layout with slide-in drawer navigation
- Car rental details for both Tasmania (HBA) and Melbourne (Tullamarine) legs
- Themed modals for all dialogs — no browser default prompts or alerts
- Custom thin scrollbars styled to match the app theme
- Smart update merge — preserves your edits when the app is updated
- Version history pill in sidebar with full changelog

