"use client";

import { useMemo, useState } from "react";

type Tender = {
  id: string;
  period: "Q1 2026" | "Q2 2026";
  hospital: string;
  region: "North" | "Central" | "South";
  businessUnit: "CST" | "SI" | "NV";
  category: string;
  supplier: "Medtronic" | "Competitor A" | "Competitor B";
  awardedValue: number;
  expiry: string;
};

const AS_OF = new Date("2026-08-17T00:00:00");

const tenders: Tender[] = [
  { id: "TP-26041", period: "Q2 2026", hospital: "Bạch Mai Hospital", region: "North", businessUnit: "NV", category: "Neurovascular", supplier: "Competitor A", awardedValue: 3.4, expiry: "2026-09-06" },
  { id: "TP-26042", period: "Q2 2026", hospital: "Chợ Rẫy Hospital", region: "South", businessUnit: "CST", category: "Cardiac surgery", supplier: "Competitor A", awardedValue: 4.1, expiry: "2026-09-18" },
  { id: "TP-26043", period: "Q2 2026", hospital: "108 Military Central Hospital", region: "North", businessUnit: "CST", category: "Surgical instruments", supplier: "Medtronic", awardedValue: 3.2, expiry: "2026-10-29" },
  { id: "TP-26044", period: "Q2 2026", hospital: "University Medical Center HCMC", region: "South", businessUnit: "SI", category: "Surgical energy", supplier: "Competitor B", awardedValue: 2.9, expiry: "2026-08-24" },
  { id: "TP-26045", period: "Q2 2026", hospital: "Hữu nghị Việt Đức Hospital", region: "North", businessUnit: "CST", category: "Heart valves", supplier: "Medtronic", awardedValue: 5.7, expiry: "2027-02-12" },
  { id: "TP-26046", period: "Q2 2026", hospital: "Huế Central Hospital", region: "Central", businessUnit: "SI", category: "Laparoscopic instruments", supplier: "Medtronic", awardedValue: 4.4, expiry: "2026-10-16" },
  { id: "TP-26047", period: "Q2 2026", hospital: "Đà Nẵng Hospital", region: "Central", businessUnit: "SI", category: "Surgical staplers", supplier: "Competitor A", awardedValue: 3.8, expiry: "2026-11-03" },
  { id: "TP-26048", period: "Q2 2026", hospital: "115 People’s Hospital", region: "South", businessUnit: "NV", category: "Flow diverters", supplier: "Medtronic", awardedValue: 2.5, expiry: "2026-11-11" },
  { id: "TP-26049", period: "Q2 2026", hospital: "Hanoi Heart Hospital", region: "North", businessUnit: "CST", category: "Cardiac surgery", supplier: "Competitor B", awardedValue: 3.8, expiry: "2027-01-08" },
  { id: "TP-26050", period: "Q2 2026", hospital: "Cần Thơ Central Hospital", region: "South", businessUnit: "NV", category: "Embolization coils", supplier: "Competitor B", awardedValue: 2.1, expiry: "2027-03-20" },
  { id: "TP-26051", period: "Q2 2026", hospital: "National Children’s Hospital", region: "North", businessUnit: "SI", category: "Surgical energy", supplier: "Medtronic", awardedValue: 2.2, expiry: "2027-04-14" },
  { id: "TP-26052", period: "Q2 2026", hospital: "Thống Nhất Hospital", region: "South", businessUnit: "CST", category: "Heart valves", supplier: "Medtronic", awardedValue: 4.7, expiry: "2027-05-02" },
  { id: "TP-26053", period: "Q2 2026", hospital: "Đà Nẵng C Hospital", region: "Central", businessUnit: "NV", category: "Neurovascular", supplier: "Competitor A", awardedValue: 2.6, expiry: "2027-01-29" },
  { id: "TP-26054", period: "Q2 2026", hospital: "Saint Paul Hospital", region: "North", businessUnit: "SI", category: "Surgical staplers", supplier: "Competitor B", awardedValue: 1.7, expiry: "2027-03-05" },
  { id: "TP-26055", period: "Q2 2026", hospital: "Hanoi Medical University Hospital", region: "North", businessUnit: "CST", category: "Surgical instruments", supplier: "Competitor A", awardedValue: 1.5, expiry: "2027-06-11" },
  { id: "TP-26012", period: "Q1 2026", hospital: "Bạch Mai Hospital", region: "North", businessUnit: "CST", category: "Cardiac surgery", supplier: "Medtronic", awardedValue: 4.1, expiry: "2026-12-18" },
  { id: "TP-26013", period: "Q1 2026", hospital: "Chợ Rẫy Hospital", region: "South", businessUnit: "CST", category: "Heart valves", supplier: "Competitor A", awardedValue: 5.3, expiry: "2027-01-16" },
  { id: "TP-26014", period: "Q1 2026", hospital: "Huế Central Hospital", region: "Central", businessUnit: "SI", category: "Surgical energy", supplier: "Medtronic", awardedValue: 2.8, expiry: "2026-12-22" },
  { id: "TP-26015", period: "Q1 2026", hospital: "Đà Nẵng Hospital", region: "Central", businessUnit: "NV", category: "Neurovascular", supplier: "Competitor B", awardedValue: 3.6, expiry: "2027-02-05" },
  { id: "TP-26016", period: "Q1 2026", hospital: "115 People’s Hospital", region: "South", businessUnit: "NV", category: "Flow diverters", supplier: "Medtronic", awardedValue: 2.1, expiry: "2027-03-11" },
  { id: "TP-26017", period: "Q1 2026", hospital: "108 Military Central Hospital", region: "North", businessUnit: "SI", category: "Surgical instruments", supplier: "Competitor A", awardedValue: 4.7, expiry: "2027-01-30" },
  { id: "TP-26018", period: "Q1 2026", hospital: "Thống Nhất Hospital", region: "South", businessUnit: "CST", category: "Cardiac surgery", supplier: "Competitor B", awardedValue: 3.9, expiry: "2027-04-09" },
];

const trendByUnit: Record<string, number[]> = {
  All: [27, 28, 29.5, 29, 31, 32.5],
  CST: [34, 35, 36, 38, 39.5, 41.6],
  SI: [29, 28.5, 28, 27.4, 26.8, 26.3],
  NV: [20, 21, 21.5, 22, 23, 23.8],
};

const money = (value: number) => `VND ${value.toFixed(1)}B`;

function daysUntil(date: string) {
  return Math.ceil((new Date(`${date}T00:00:00`).getTime() - AS_OF.getTime()) / 86_400_000);
}

function displayDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${date}T00:00:00`));
}

function HeartbeatIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M3 17h6l2.5-7 4.2 14L20 5l3.2 12H29" fill="none" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrendChart({ values }: { values: number[] }) {
  const left = 42;
  const right = 596;
  const top = 20;
  const bottom = 190;
  const min = 15;
  const max = 50;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
  const points = values.map((value, index) => ({
    x: left + index * ((right - left) / (values.length - 1)),
    y: bottom - ((value - min) / (max - min)) * (bottom - top),
    value,
  }));
  const line = points.map((point, index) => `${index ? "L" : "M"}${point.x} ${point.y}`).join(" ");
  const area = `${line} L${right} ${bottom} L${left} ${bottom} Z`;

  return (
    <svg className="trend-chart" viewBox="0 0 620 235" role="img" aria-label={`Medtronic market share changes from ${values[0]} percent in January to ${values[5]} percent in June`}>
      {[20, 30, 40, 50].map((tick) => {
        const y = bottom - ((tick - min) / (max - min)) * (bottom - top);
        return (
          <g key={tick}>
            <line x1={left} x2={right} y1={y} y2={y} className="grid-line" />
            <text x={left - 9} y={y + 4} textAnchor="end" className="axis-label">{tick}%</text>
          </g>
        );
      })}
      <path d={area} className="trend-area" />
      <path d={line} className="trend-line" />
      {points.map((point, index) => (
        <g key={months[index]}>
          <circle cx={point.x} cy={point.y} r="4.5" className="trend-dot" />
          <text x={point.x} y="222" textAnchor="middle" className="axis-label">{months[index]}</text>
          {index === points.length - 1 && <text x={point.x - 2} y={point.y - 13} textAnchor="end" className="chart-value">{point.value}%</text>}
        </g>
      ))}
    </svg>
  );
}

export default function Home() {
  const [period, setPeriod] = useState("Q2 2026");
  const [category, setCategory] = useState("All categories");
  const [region, setRegion] = useState("All regions");
  const [supplier, setSupplier] = useState("All suppliers");
  const [businessUnit, setBusinessUnit] = useState("All");

  const categories = useMemo(() => Array.from(new Set(tenders.map((tender) => tender.category))).sort(), []);
  const filtered = useMemo(() => tenders.filter((tender) =>
    tender.period === period &&
    (category === "All categories" || tender.category === category) &&
    (region === "All regions" || tender.region === region) &&
    (supplier === "All suppliers" || tender.supplier === supplier) &&
    (businessUnit === "All" || tender.businessUnit === businessUnit)
  ), [period, category, region, supplier, businessUnit]);

  const totalValue = filtered.reduce((sum, tender) => sum + tender.awardedValue, 0);
  const medtronicValue = filtered.filter((tender) => tender.supplier === "Medtronic").reduce((sum, tender) => sum + tender.awardedValue, 0);
  const marketShare = totalValue ? (medtronicValue / totalValue) * 100 : 0;
  const expiring = filtered.filter((tender) => {
    const days = daysUntil(tender.expiry);
    return days >= 0 && days <= 90;
  }).sort((a, b) => a.expiry.localeCompare(b.expiry));
  const supplierTotals = ["Medtronic", "Competitor A", "Competitor B"].map((name) => ({
    name,
    value: filtered.filter((tender) => tender.supplier === name).reduce((sum, tender) => sum + tender.awardedValue, 0),
  })).sort((a, b) => b.value - a.value);
  const highestSupplierTotal = Math.max(...supplierTotals.map((item) => item.value), 1);
  const trend = trendByUnit[businessUnit] ?? trendByUnit.All;
  const trendDelta = trend[trend.length - 1] - trend[0];
  const competitorExpiries = expiring.filter((tender) => tender.supplier !== "Medtronic").length;
  const summary = filtered.length === 0
    ? "No tender awards match the selected filters. Widen the filters to continue the analysis."
    : competitorExpiries > 0
      ? `Medtronic represents ${marketShare.toFixed(1)}% of recorded award value in this view. ${competitorExpiries} competitor-held ${competitorExpiries === 1 ? "agreement is" : "agreements are"} due to expire within 90 days.`
      : `Medtronic represents ${marketShare.toFixed(1)}% of recorded award value in this view. No competitor-held agreements in the filtered dataset expire within 90 days.`;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-icon"><HeartbeatIcon /></span><span>TenderPulse</span></div>
        <nav aria-label="Main navigation">
          <button type="button" className="nav-item active"><span>⌂</span> Overview</button>
          <button type="button" className="nav-item"><span>⌕</span> Tender explorer</button>
          <button type="button" className="nav-item"><span>◎</span> Competitors</button>
          <button type="button" className="nav-item"><span>◷</span> Opportunities</button>
        </nav>
        <div className="sidebar-note"><span className="status-dot" />Demo dataset<small>Simulated procurement records</small></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div><p className="eyebrow">Tender intelligence</p><h1>Overview</h1></div>
          <div className="sync-state"><span className="status-dot" /> Demo data ready</div>
        </header>

        <section className="filter-panel" aria-label="Dashboard filters">
          <label><span>Reporting period</span><select value={period} onChange={(event) => setPeriod(event.target.value)}><option>Q2 2026</option><option>Q1 2026</option></select></label>
          <label><span>Product category</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option>All categories</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>Region</span><select value={region} onChange={(event) => setRegion(event.target.value)}><option>All regions</option><option>North</option><option>Central</option><option>South</option></select></label>
          <label><span>Supplier</span><select value={supplier} onChange={(event) => setSupplier(event.target.value)}><option>All suppliers</option><option>Medtronic</option><option>Competitor A</option><option>Competitor B</option></select></label>
          <label><span>Business unit</span><select value={businessUnit} onChange={(event) => setBusinessUnit(event.target.value)}><option>All</option><option>CST</option><option>SI</option><option>NV</option></select></label>
        </section>

        <section className="stat-grid" aria-label="Key metrics">
          <article className="stat-card"><p>Total awarded value</p><strong>{money(totalValue)}</strong><span>{filtered.length} recorded awards</span></article>
          <article className="stat-card"><p>Medtronic awarded value</p><strong>{money(medtronicValue)}</strong><span>Based on matched products</span></article>
          <article className="stat-card"><p>Estimated market share</p><strong>{marketShare.toFixed(1)}%</strong><span>Share of recorded value</span></article>
          <article className="stat-card accent-stat"><p>Expiring within 90 days</p><strong>{expiring.length}</strong><span>{money(expiring.reduce((sum, tender) => sum + tender.awardedValue, 0))} currently awarded</span></article>
        </section>

        <section className="chart-grid">
          <article className="panel trend-panel">
            <div className="panel-heading"><div><h2>Medtronic market-share trend</h2><p>Share of recorded award value</p></div><span className={`delta ${trendDelta < 0 ? "negative" : ""}`}>{trendDelta >= 0 ? "+" : ""}{trendDelta.toFixed(1)} pts</span></div>
            <TrendChart values={trend} />
          </article>
          <article className="panel competitor-panel">
            <div className="panel-heading"><div><h2>Awarded value by company</h2><p>Billions of Vietnamese dong</p></div></div>
            <div className="bar-list">
              {supplierTotals.map((item) => <div className="bar-row" key={item.name}><div className="bar-meta"><span>{item.name}</span><strong>{money(item.value)}</strong></div><div className="bar-track"><span className={item.name === "Medtronic" ? "medtronic-bar" : "competitor-bar"} style={{ width: `${(item.value / highestSupplierTotal) * 100}%` }} /></div></div>)}
            </div>
          </article>
        </section>

        <section className="panel opportunity-panel">
          <div className="panel-heading"><div><h2>Upcoming tender expirations</h2><p>Possible opportunities during the next 90 days</p></div><span className="muted-label">As of 17 Aug 2026</span></div>
          {expiring.length ? (
            <div className="table-wrap"><table><thead><tr><th>Hospital</th><th>Product category</th><th>Current holder</th><th>Expires</th><th>Time left</th></tr></thead><tbody>
              {expiring.map((tender) => <tr key={tender.id}><td><strong>{tender.hospital}</strong><small>{tender.id}</small></td><td>{tender.category}</td><td><span className={`holder ${tender.supplier === "Medtronic" ? "held" : "open"}`}>{tender.supplier}</span></td><td>{displayDate(tender.expiry)}</td><td><span className="days-pill">{daysUntil(tender.expiry)} days</span></td></tr>)}
            </tbody></table></div>
          ) : <div className="empty-state">No tender expirations match these filters.</div>}
        </section>

        <section className="insight" aria-label="AI-generated summary"><span className="spark">✦</span><div><strong>AI summary</strong><p>{summary}</p></div><span className="demo-chip">Demo insight</span></section>
      </section>
    </main>
  );
}
