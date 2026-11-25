# Sofra state machines

The checks below ran with Java 17 and TLC 2.19 from the TLA+ tools 1.7.4 release. Each row gives the distinct states or input cases TLC checked.

| Model | Checked behavior | Bound | Count |
| --- | --- | --- | ---: |
| Foto and album | A late encode, save or publish completion cannot take over a newer visit. Publishing requires the form. | Two outstanding operations, arbitrarily many visits and either completion order | 79 |
| Pano detail | Reads and writes belong to the visit that started them. Report and removal each require their own confirmation. | Two outstanding operations, including reopening the same recipe | 101 |
| Pointer gestures | Only the owning finger and surface can finish a gesture. Release commits. Cancellation and loss of capture relinquish ownership. | Twelve gesture kinds, five surfaces, two pointer IDs, four event types, one gesture per controller | 25 |
| Radio | A fresh or hidden page is silent. Playback requires an explicit request. Returning to the page cannot grant consent. | Playback intent, visibility, denial and source exhaustion | 5 |
| Bread | Closing requires a base and a closable loaf. Moving, removing and restoring either half preserve the expected toppings and survive a recipe round trip. | All four breads, present/absent base and extras, valid cover positions and base spread, six edit events, one representative pose | 456 |
| Vote ledger | Daily receipts prevent duplicate votes. Counts agree with accepted votes across pruning and Monday rollover. Removal clears the recipe's scores and preserves spent daily quota. | One recipe, one author, two voters, three Istanbul days, two accepted daily votes and two daily publications | 489 |

## How the models connect to the game

The runner reads the photo, detail and radio transition tables from the shipped JavaScript. Each accepted transition creates a fresh object. An asynchronous callback must present that same object to update the current view. The workflow model represents outstanding objects with slots and permits slot reuse after the original promise settles. It also checks eventual settlement under weak fairness for each outstanding operation. The browser and server must eventually deliver a completion for that liveness assumption to hold.

For pointer gestures, the runner evaluates the production terminal-event handler and checks its decisions against an independent ownership rule. Rotation, drawing, shelf placement, peeling and straw handling each apply the resulting commit or cancellation in their own handler. For bread, the runner executes the production reducer and recipe reader for every projected input and event. TLC compares the results with separate postconditions. One step covers the finite bread rules because every valid projected input is included.

The ledger specifies atomic database operations. Its vote audit set retains earlier days so it can check scores after receipts expire. The Worker integration test exercises the actual request handler, scheduled cleanup and SQL migrations against in-memory SQLite. It uses a local D1 adapter, a permissive rate-limit stub and a cache stub. Other tests cover the production quota values and transaction rollback.

Chromium checks the boundaries between these components. It delays two PNG encodes, an IndexedDB save notification, a publish response and a vote response. It also releases pointer capture during an orbit and exercises actual browser audio playback with a local silent recording.

## Reproduce

Download the release's `tla2tools.jar`. The SHA-256 of the tested artifact is `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88`. The runner uses a temporary directory for generated modules and state graphs. [Official TLA+ tools release](https://github.com/tlaplus/tlaplus/releases/tag/v1.7.4)

```sh
TLA2TOOLS_JAR=/path/to/tla2tools.jar npm run verify:models
TLA2TOOLS_JAR=/path/to/tla2tools.jar npm run verify:models -- --negative-control
node --test
```

Set `JAVA` to a Java executable if needed. The negative control removes the visit check in a temporary copy of the model and requires TLC to produce a counterexample. The shortest observed failure was capture A, dismiss, capture B, then completion of A opening its preview while B was still pending.

To run the browser regressions, build the game and serve the build on loopback in one terminal.

```sh
npm run build
python3 -m http.server 4211 --bind 127.0.0.1 --directory dist
```

With Playwright and its Chromium browser installed, run the following in another terminal. The script intercepts all board writes. Use `SOFRA_LOCAL_URL` for a different local port and `PLAYWRIGHT_PATH` for a Playwright installation outside the project.

```sh
node formal/browser.mjs
```

## Coverage boundary

The remaining stateful components include undo checkpoints and draft import, album storage, shelf direction detection, drink animation and media seek/fallback. Their data and browser behavior have partial test coverage. The formal models abstract animation timing, hit-testing geometry, simultaneous gestures on different surfaces, network and database service failures, cache propagation and multi-recipe contention. These checks establish the listed properties within their bounds. Safari lifecycle delivery and WebGL rendering on individual devices still depend on the browser and hardware.
