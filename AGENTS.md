# AGENTS.md

## Cursor Cloud specific instructions

This is a single-file static HTML application (`index.html`) — a travel itinerary planner for Tasmania & Melbourne, December 2026. There is no build system, no package manager, and no backend.

### Running the application

Serve the project root with any static HTTP server:

```
npx serve -l 3000 /workspace
```

Or alternatively: `python3 -m http.server 3000`

The app is then available at `http://localhost:3000/`.

### Authentication bypass

The app has a client-side password overlay (SHA-256 hash check). To bypass it in development, run this in the browser console **before** interacting with the page:

```js
localStorage.setItem('tripAuthToken', '9172fe8ff387c2cc69d2a0bb8723a6544bf2252c60b18048f5e8a493b6aa6190');
```

Then reload the page. The onboarding modal can be dismissed by clicking "Let's go".

### Key notes

- All dependencies (Chart.js, Leaflet, html2canvas, Google Fonts) are loaded from public CDNs — internet access is required.
- There are no lint, test, or build steps — this is a raw HTML/CSS/JS file with no tooling.
- Edits made in the app's "Edit Mode" persist to `localStorage` only.
