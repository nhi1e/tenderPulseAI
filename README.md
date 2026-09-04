# TenderPulse AI

Live Medtronic market-intelligence dashboard for Vietnam public procurement award data.

## Included

- Live product searches through the Mua Sắm Công public search endpoint
- Market overview organized across 7 Sub-OUs
- 196 Vietnamese keyword-master rules with automatic exclusions
- Date, brand, supplier, company, Sub-OU, and product-group filters
- Excel export for search and overview results
- Expandable hospital details
- One completed overview load per filter scope is cached for the current browser session
- Force-refresh control to bypass and replace the session cache
- English interface by default with a persistent English/Vietnamese switch

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The application must have internet access to retrieve live results from Mua Sắm Công.

## Production build

```bash
npm run build
npm run start
```

The live search requires the server/API routes. A static-only host such as GitHub Pages cannot run them.

## Cloudflare Worker deployment

```bash
npm run build
npx wrangler login
npx wrangler deploy --config dist/server/wrangler.json
```

Keep the generated `dist/server` Worker and `dist/client` assets together. Deploying only `dist/client` removes the live API routes.

The overview loads Sub-OUs sequentially. Each keyword seed is retrieved in batches of no more than three portal pages per Worker invocation, then deduplicated and aggregated in the browser. This keeps broad groups such as Suture, A&I, and ES within Cloudflare's per-invocation resource budget. The existing 25-page safety limit still applies to exceptionally large individual keyword searches; the dashboard marks those results as limited rather than presenting them as complete.
