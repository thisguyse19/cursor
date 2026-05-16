# Trip content (data)

Editable trip data lives here as JSON so you do not have to touch the UI shell or application logic.

## Files

| File | Purpose |
|------|---------|
| `trip-data.json` | **Single source of truth** for itinerary days, stays, checklist, budget rows, tips, version history metadata, and `appVersion`. |

## Updating content

1. Edit `trip-data.json` in any editor (VS Code, etc.). Valid JSON only: double-quoted strings, no trailing commas.
2. Bump `appVersion` when you ship meaningful changes (the app compares this for merge / “What’s new”).
3. **Run the site with a local HTTP server** (required): `python3 -m http.server` or `npx serve` from the repo root. Opening `index.html` directly (`file://`) will not load JSON because of browser `fetch` rules.

4. **GitHub Pages:** the repo includes an empty `.nojekyll` file so Jekyll does not skip or alter static assets. Data is loaded with URLs resolved from `document.baseURI` so paths work for project pages (`/repo/`).

## Regenerating `trip-data.json` from legacy HTML

If you ever restore an old single-file `index.html` that still contains the inline `const DAYS_TAS1 = …` blocks, run:

```bash
node scripts/extract-trip-data.mjs path/to/that.html
```

## Markdown (optional, next step)

For long narrative copy (e.g. intro essays), you can add `.md` files under `content/pages/` later and teach `js/app.js` to `fetch` them and render into a container. Structured lists (days, costs, checklist) should stay in JSON for reliability.
