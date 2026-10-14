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
- Daily alerts for newly posted, still-open tender invitations matched against approved product keywords in the portal “goods” field
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
- `daily-changes.json`: new, changed, and removed award records for snapshot auditing

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

The checked-in manifest describes the latest saved snapshot. If no ready snapshot is available, the overview continues using the existing live-search fallback.

## Open tender invitation alerts

The alert panel tracks open tender invitations (Thông báo mời thầu chưa đóng thầu), not awarded-result records (KQLCNT). The daily GitHub Actions workflow searches the official Mua Sắm Công portal’s `goods` field using the approved inclusion keywords in `data/classification-rules.json`, and keeps only notices whose bid-closing time is still in the future.

The first run creates a baseline and does not alert on notices already present. Later daily runs compare stable notice IDs and content hashes, then publish newly found or changed active notices to `public/data/open-tender-alerts/alerts.json`. The Worker serves that feed at `/api/open-tender-alerts`; read/unread status is saved in each browser’s local storage. Excel export includes the notice number, package title, buyer, posting and closing times, matched goods keywords, and portal link.

The workflow runs daily at 01:30 Vietnam time and can also be started manually from GitHub Actions. To run a first baseline locally:

```bash
npm run alerts:sync -- --baseline
```

To run a later incremental scan locally:

```bash
npm run alerts:sync
```

To populate the alert feed once with currently open notices posted during the past week, run:

```bash
npm run alerts:sync -- --lookback 7 --backfill
```

This records the fetched notices as seen, so later daily runs report only new or changed notices. Use `--baseline` instead when you want the first scan to stay silent.
