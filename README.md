# TenderPulse AI demo

This is a presentation-ready proof of concept for TenderPulse AI. The dashboard uses clearly labeled simulated tender records so it can be demonstrated before access to the real procurement source is confirmed.

## What is working

- Interactive filters for reporting period, product category, region, supplier, and business unit
- Awarded-value and estimated-market-share calculations
- Medtronic versus competitor comparison
- Tender-expiration opportunity list
- Rule-based demo insight that updates with the filters
- Responsive desktop and mobile layouts

The sidebar links are visual placeholders. This first demo intentionally implements only the Overview workflow.

## Run the dashboard

Use Node.js 22 or newer.

```bash
npm install
npm run dev
```

Open the local address printed by the development server. The dashboard runs immediately with in-browser demo data; PostgreSQL is not required for the visual demo.

## Run the FastAPI and PostgreSQL starter

Docker is the easiest option:

```bash
docker compose up --build
```

The API will be available at `http://localhost:8000`, with interactive API documentation at `http://localhost:8000/docs`.

Useful endpoints:

- `GET /health`
- `GET /api/tenders`
- `GET /api/dashboard`
- `GET /api/dashboard?region=North&business_unit=CST`

The backend creates the `tender_awards` table and inserts four simulated records when the database is empty.

## Technology

- Frontend: React, TypeScript, Next.js-compatible Vinext runtime
- API: Python and FastAPI
- Database: PostgreSQL with SQLAlchemy
- Charts: accessible inline SVG and CSS, with no chart dependency

## What comes after the stakeholder meeting

1. Inspect real procurement records and confirm whether they are HTML, Excel, PDF, or scanned documents.
2. Agree on the exact definition of tender validity and market share.
3. Replace the simulated records with a procurement-portal ingestion job.
4. Add normalization dictionaries for hospitals, suppliers, distributors, manufacturers, and products.
5. Connect the dashboard to the FastAPI endpoints.
6. Add user review for uncertain product and vendor matches.

The AI layer should be added only after the structured records and matching rules are validated. Numerical totals should always come from database queries rather than generated text.
