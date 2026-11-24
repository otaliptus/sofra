# Sofra Panosu

Run `npm install` and `npm start` for a local board, API, D1 database and game. Local votes and posts live under `.wrangler/state`. Run `node --test` for the recipe, ranking and quota regression tests.

## Publishing and votes

The board stores a normalized recipe, camera framing and a plain-text title. The browser renders visible photos using the game's food assets. An anonymous HttpOnly cookie identifies the publishing or voting browser. A private removal link can take down a post from another device. Clearing cookies loses browser ownership and vote history.

A browser can vote once on each other person's recipe per Istanbul calendar day. Weekly votes accumulate from Monday. All-time scores survive cleanup of old vote receipts. First pages are cached for up to 20 seconds. The individual post always checks its current visibility.

Each browser can publish up to 10 recipes per Istanbul calendar day. The daily total includes recipes the author later removes.

The daily and weekly boards include recipes published or voted on during that period. Recipes with votes lead, followed by new recipes with zero votes in reverse publication order. All-time rankings include every visible recipe.

## Moderating the board

Open the sofra-pano database in the Cloudflare D1 console using an account with D1 access. This query lists reports for visible posts.

```sql
SELECT id, title, reports FROM moderation_queue ORDER BY reports DESC;
```

Open the post at `/pano?p=<id>` to review the recipe. To take a reviewed post off the board, replace the placeholder with its exact ID.

```sql
UPDATE posts SET hidden = 1 WHERE id = '<reviewed-post-id>';
```

Setting `hidden = 0` restores the post. Hiding the post blocks its permalink and voting immediately. Previously cached lists expire within 20 seconds.

## Free-tier operation

The board uses Workers Static Assets, a Worker rate-limit binding and one D1 database. The game, feed UI and food art ship as static assets. Rendering happens in visitors' browsers. Daily publication, voting and report budgets are enforced in the same database transaction as each action. Current global budgets are 100 posts, 1,500 votes and 150 reports per day, with a 220 MiB recipe budget that reserves 3 KiB per post for overhead. Smaller per-browser and per-network limits also apply. These are application settings. Cloudflare quotas are shared across the account.

Apply new migrations with `npx wrangler d1 migrations apply sofra-pano --remote` before deploying with `npx wrangler deploy`. The daily scheduled job clears expired voting receipts, old period scores and quota counters.

HTML page opens use one Worker request to issue a fresh content-security-policy nonce for the Cloudflare bot check. Scripts, styles and food art use static asset delivery.
