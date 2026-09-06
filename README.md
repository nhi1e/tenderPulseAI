# TenderPulse AI

Live Medtronic market-intelligence dashboard for Vietnam public procurement award data.

## Included

- Live product searches through the Mua Sắm Công public search endpoint
- Market overview organized across 7 Sub-OUs
- 196 Vietnamese keyword-master rules with automatic exclusions
- Date, hospital, brand, supplier, company, Sub-OU, and product-group filters
- Excel export for search and overview results, including one-click hospital exports
- Expandable hospital details with per-hospital product, result, unit, and value totals
- Covidien/LigaSure mapped to Medtronic and Ethicon mapped to Johnson & Johnson before KPI calculations
- Competitor aliases normalized before value-share and unit-share calculations
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

The live search requires the Cloudflare Worker proxy. A static-only host such as GitHub Pages cannot run it.

## Cloudflare Worker deployment

```bash
npm run build
npx wrangler login
npx wrangler deploy --config dist/server/wrangler.json
```

Keep the generated `dist/server` Worker and `dist/client` assets together. Deploying only `dist/client` removes live data access.

### Cloudflare Free architecture

Cloudflare Workers Free allows very little CPU time per request, so the deployed Worker deliberately does not parse thousands of award rows, classify 196 keyword rules, aggregate the dashboard, or generate Excel files.

- `/api/portal-search-page` validates one request, retrieves one page from the public portal, and streams the JSON response.
- Successful portal pages are cached at the Cloudflare edge for 30 minutes. **Force refresh** bypasses that cache and replaces it.
- The browser requests pages in small batches and displays progress while it classifies, deduplicates, and aggregates results locally.
- Excel workbooks are generated in the browser from the already-loaded filtered records, including the per-hospital exports.
- The completed overview is also cached in `sessionStorage`, so returning to the tab during the same browser session does not repeat the full load.

This removes the former `/api/winning-bids` and `/api/market-overview/segment` CPU bottlenecks that caused HTTP 503 errors for larger Sub-OUs on the Free plan. An individual search is capped at 25 portal pages; the interface marks the result as limited if the portal reports more pages.
