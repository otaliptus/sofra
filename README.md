# Sofra

Sofra is a Turkish breakfast game. Build a plate in the 3D editor, photograph it, and hang the recipe on Sofra Panosu. The original 2D table still opens shared links beginning with `#sofra=`.

## Run locally

Use Node.js 22.13 or newer. From the repository root, run

```sh
npm ci
npm start
```

Open [the editor](http://127.0.0.1:4173/), [Pano](http://127.0.0.1:4173/pano), or [the original table](http://127.0.0.1:4173/table). Wrangler builds the site and runs the Worker locally. The start script applies migrations to the local D1 database under `.wrangler/state`.

## Where things live

| Area | Contents |
| --- | --- |
| `src/editor/` | Editor controls, shelf actions, drinks, music, undo and the private photo album |
| `src/scene/` | Three.js scene, food geometry, picking, lighting and camera |
| `src/pano/` | Public board, voting client, print worker and image cache |
| `src/table/` | Original 2D table, its layout and saved-link reader |
| `src/shared/` | Recipe format, ingredient shelf, artwork URLs and shared drawing and interaction code |
| `assets/`, `artwork/` | Runtime WebP files and thumbnails, plus the editable newspaper and artwork tools |
| `worker/`, `migrations/` | Cloudflare Worker, board API and D1 schema |
| `tests/`, `formal/` | Unit and browser regressions, TLA+ models and their runner |

The three HTML entry points live at the root. `npm run build` writes the deployable site to `dist/`, including content-addressed modules and artwork. Serve the repository root on loopback when working on native browser modules or regenerating the tea reflections.

## Checks

`npm test` runs the unit and SQLite integration tests. For the browser regressions, leave `npm start` running. In a second terminal, install Chromium once and run the suite.

```sh
npx playwright install chromium
npm run test:browser
```

Set `SOFRA_LOCAL_URL` to test a different loopback server. Model-checking instructions, board operations and the development history have their own guides. [TLA+ verification](formal/README.md) · [Pano operations](worker/README.md) · [Development history](docs/progress.md)
