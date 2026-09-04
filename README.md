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

The overview loads Sub-OUs sequentially and limits pages per keyword seed so broad groups such as Suture and ES stay within Cloudflare Worker request and memory budgets. When a portal result set exceeds that bound, the dashboard marks the affected Sub-OU as limited rather than presenting it as complete.
