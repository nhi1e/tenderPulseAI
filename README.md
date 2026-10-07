# TenderPulse AI

## v15 company alias cleanup

- Groups 3M legal entities, country subsidiaries, and factories under `3M Company`.
- Removes portal metadata such as `Xuất xứ: Việt Nam` before building the company directory.
- Refreshes the saved company directory and overview cache so old raw aliases do not remain visible.

Live Medtronic market-intelligence dashboard for Vietnam public procurement award data.

## Included

- Live product searches through the Mua Sắm Công public search endpoint
- Accent-insensitive product autocomplete from the approved keyword master plus brands and models learned from live results
- Hospital autocomplete using exact portal names and organization IDs learned from live results and saved on the current device
- Market overview organized across 7 Sub-OUs
- 16 Vietnamese product-classification rules with keyword, confirmation, and exclusion baskets
- Staff-reviewed conflict decisions from 23.9: 137 confirmed classifications, 26 exclusions, and 4 unresolved rows held outside KPIs
- Date, hospital, brand, supplier, company, Sub-OU, and product-group filters
- Excel export for search and overview results, including one-click hospital exports
- Expandable hospital details with per-hospital product, result, unit, and value totals
- Covidien/LigaSure mapped to Medtronic and Ethicon mapped to Johnson & Johnson before KPI calculations
- Competitor aliases normalized before value-share and unit-share calculations
- One completed overview load per filter scope is cached for the current browser session
- Reload-snapshot control to clear the session cache and read the saved partitions again
- New-entry alerts for classified Mua Sắm Công records, with read state and Excel export
- A partitioned daily market snapshot for fast overview loading without repeated full live searches
- English interface by default with a persistent English/Vietnamese switch

The date range filters by `Ngày ban hành quyết định` (award-decision date), as confirmed by staff. Detailed exports retain both the decision date and the KQLCNT publication date for traceability. Product rows that match more than one rule are no longer assigned using a first-rule-wins shortcut: an exact reviewed decision is applied when available, otherwise the row remains outside KPI calculations until confirmed.

Autocomplete remains optional: users can still submit a custom product, brand, model, hospital name, or organization ID. The local suggestion directories update after each completed portal query and do not create additional Worker requests.

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

## Persistent market snapshot

The market overview checks `public/data/market-snapshot/manifest.json` first. When a ready snapshot covers the requested dates, the browser downloads only the matching year/Sub-OU partitions and applies the hospital, product-group, and company filters locally. Product search remains live. **Reload snapshot** clears the browser cache and reads the saved partitions again; it does not start a full portal scrape.

The snapshot retains the fields needed by every overview Excel export, including the original manufacturer, brand, model, technical configuration, bidder, buyer, TBMT, decision and publication dates, quantity, price, and location. It also stores the approved Sub-OU/product-group classification and normalized company.

### Fastest first import: existing raw Excel files

Do not commit the very large raw workbooks. Import them locally and commit only the generated classified partitions:

```bash
npm run data:import -- \
  --date-from 2023-01-01 \
  --date-to 2026-10-07 \
  "/path/raw-winning-bids-part-001.xlsx" \
  "/path/raw-winning-bids-part-002.xlsx"
```

Pass every raw part in the same command. The importer accepts the Vietnamese columns exported by the existing full-portal collector. It deduplicates source rows, applies the current staff-reviewed product and manufacturer rules, and writes:

- `manifest.json`: coverage and partition inventory
- `partitions/<year>/<sub-ou>.json`: dashboard and export records
- `daily-changes.json`: new, changed, and removed records for the future alert interface

Review the counts, then commit `public/data/market-snapshot`.

### Portal baseline and daily refresh

If the raw Excel baseline is unavailable, the collector can retrieve all medical-supply award rows directly. It splits the period into month-sized requests and refuses to save a partial snapshot if a request fails:

```bash
npm run data:full -- --date-from 2023-01-01 --date-to 2026-10-07
```

After a baseline exists, refresh only the recent rolling window:

```bash
npm run data:sync
```

The default lookback is 30 days so corrections to recently published portal records are detected. Override it with `--lookback 60` when needed.

When classification or manufacturer rules change, re-run them over the saved snapshot without contacting the portal:

```bash
npm run data:reclassify
```

The GitHub Actions workflow `.github/workflows/update-market-snapshot.yml` runs every day at 01:30 Vietnam time and commits changed snapshot files. It can also be started manually with `incremental` or `full` mode from the Actions tab. The repository must allow GitHub Actions to write contents.

The initial checked-in manifest is intentionally `empty`; until the first import or full sync is committed, the overview continues using the existing live-search fallback.

## New-entry alerts

Alerts are created only after an **incremental** snapshot refresh. A full/import baseline is deliberately ignored so the first deployment does not label every historical award as new.

Each incremental run:

1. rechecks the rolling portal window;
2. applies the approved classification, exclusion, hospital and manufacturer rules;
3. compares the classified record key and content hash with the saved snapshot;
4. sends only new and changed records to the protected alert endpoint;
5. stores deduplicated events in D1 and updates the dashboard notification badge.

The page falls back to the latest `daily-changes.json` when D1 is not configured, so the most recent incremental alerts remain visible on that browser. D1 adds persistent history and per-browser read state across deployments.

### One-time D1 setup

Create a small database for alert history and apply the generated migration:

```bash
npx wrangler login
npx wrangler d1 create tenderpulse-alerts
npx wrangler d1 execute tenderpulse-alerts --remote --file=drizzle/0000_tranquil_bastion.sql
```

In the Cloudflare Worker settings, add a D1 binding named `DB` pointing to `tenderpulse-alerts`. Also add an encrypted Worker secret named `ALERT_INGEST_TOKEN` with a long random value.

Add the same value to the GitHub repository secret `TENDERPULSE_ALERT_INGEST_TOKEN`. Optionally add a repository variable named `TENDERPULSE_ALERTS_URL` when the production endpoint is not:

```text
https://tenderpulseai.tnhile2004.workers.dev/api/alerts/ingest
```

The ingestion endpoint rejects requests without the matching bearer token. Repeated workflow runs are safe: each alert ID includes the classified content hash and D1 ignores duplicates.

To test publication manually after an incremental sync:

```bash
TENDERPULSE_ALERT_INGEST_TOKEN="your-token" npm run alerts:publish
```
