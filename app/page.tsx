"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Building2, CheckCircle2, ChevronRight, CircleAlert,
  Database, Download, Filter, LoaderCircle, Search, Sparkles, Trophy,
} from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { OverviewHospital, OverviewNamedValue, OverviewSubOu, OverviewTender } from "@/lib/market-overview";

type NamedValue = { name: string; value: number };
type SearchFilters = {
  dateFrom: string;
  dateTo: string;
  hospital: string;
  brand: string;
  supplier: string;
  company: string;
};
type WinningBidRecord = {
  id?: string; tenThietBi?: string; donViTinh?: string; khoiLuongDouble?: number;
  khoiLuong?: number | string; kyMaHieu?: string; nhanHieu?: string;
  hangSanXuat?: string; chungLoai?: string; cauHinh?: string; donGia?: number;
  donGiaDuThau?: number; winningName?: string[] | string; maTbmt?: string;
  tenCdtBmt?: string; ngayDangTaiKqlcnt?: string;
};
type ProductData = {
  keyword: string; group: string; fetchedAt: string; truncated: boolean;
  filters: SearchFilters;
  lineItems: number; totalElements: number; totalValue: number; totalQuantity: number;
  tenders: number; hospitals: number; medtronicValue: number; medtronicShare: number;
  medtronicQuantity: number; medtronicQuantityShare: number; dateRange: string;
  trend: { month: string; value: number }[]; manufacturers: NamedValue[];
  topHospitals: NamedValue[]; topProducts: NamedValue[]; topSuppliers: NamedValue[];
  insight: string; qualityNote: string;
};

type OverviewFilterState = {
  dateFrom: string;
  dateTo: string;
  hospital: string;
  subOu: string;
  productGroup: string;
  company: string;
};
type KeywordCatalogItem = { subOu: string; productGroups: string[]; keywords: string[] };
type ActivityItem = { id: string; keyword: string; searchedAt: string; filters: SearchFilters };

const subOuOrder = ["VS&D", "Endo Stapling", "Open Stapling", "Hernia", "Suture", "A&I", "ES"];

const suggestions = [
  { name: "Tay dao hàn mạch", group: "VS&D" },
  { name: "Tay dao siêu âm", group: "VS&D" },
  { name: "Dao mổ siêu âm", group: "VS&D" },
  { name: "Lưới thoát vị", group: "Thoát vị" },
];

function emptyFilters(): SearchFilters {
  return { dateFrom: "", dateTo: "", hospital: "", brand: "", supplier: "", company: "all" };
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").trim().toLowerCase();
}
function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const source = String(value ?? "").trim().replace(/\s/g, "");
  if (!source) return 0;
  if (/^-?\d{1,3}([.,]\d{3})+$/.test(source)) return Number(source.replace(/[.,]/g, "")) || 0;
  return Number(source.replace(",", ".")) || 0;
}
function formatVnd(value: number) {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tỷ VND`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} triệu VND`;
  return `${Math.round(value).toLocaleString("vi-VN")} VND`;
}
function formatList(value: string[] | string | undefined) {
  return Array.isArray(value) ? value.filter(Boolean).join("; ") : value || "";
}
function formatDownloadDate(date: Date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}
function filenameSlug(value: string) {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "ket-qua";
}
function dateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function defaultOverviewFilters(): OverviewFilterState {
  const today = new Date();
  return {
    dateFrom: `${today.getFullYear()}-01-01`,
    dateTo: dateInputValue(today),
    hospital: "",
    subOu: "all",
    productGroup: "all",
    company: "all",
  };
}
function parseDate(value: string | undefined) {
  if (!value) return null;
  const iso = new Date(value);
  if (!Number.isNaN(iso.getTime())) return iso;
  const [day, month, year] = value.slice(0, 10).split("/").map(Number);
  return day && month && year ? new Date(year, month - 1, day) : null;
}
function valueOf(record: WinningBidRecord) {
  return toNumber(record.khoiLuongDouble ?? record.khoiLuong) * toNumber(record.donGia ?? record.donGiaDuThau);
}
function companyOf(record: WinningBidRecord) {
  const searchable = normalize([record.tenThietBi, record.nhanHieu, record.hangSanXuat, record.chungLoai, record.kyMaHieu, record.cauHinh].filter(Boolean).join(" | "));
  if (/covidien|coviden|medtronic|ligasure/.test(searchable)) return "Medtronic";
  if (/johnson.{0,5}johnson|ethicon|harmonic/.test(searchable)) return "Johnson & Johnson / Ethicon";
  if (/applied medical|applied/.test(searchable)) return "Applied Medical";
  if (/b[. ]?braun|aesculap/.test(searchable)) return "B. Braun / Aesculap";
  if (/olympus/.test(searchable)) return "Olympus";
  if (/miconvey/.test(searchable)) return "Miconvey";
  if (/innolcon/.test(searchable)) return "Innolcon";
  return record.hangSanXuat?.trim() || "Chưa xác định / cần kiểm tra";
}
function groupFor(keyword: string) {
  const value = normalize(keyword);
  if (/luoi|hernia/.test(value)) return "Thoát vị";
  if (/dao|ligasure|han mach|sieu am|vessel/.test(value)) return "VS&D · Vessel Sealing & Dissector";
  return "Nhóm tìm kiếm tùy chỉnh";
}
function topBy(records: WinningBidRecord[], key: (record: WinningBidRecord) => string, metric: (record: WinningBidRecord) => number) {
  const totals = new Map<string, number>();
  for (const record of records) {
    const name = key(record).trim() || "Chưa xác định / cần kiểm tra";
    totals.set(name, (totals.get(name) || 0) + metric(record));
  }
  return [...totals.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5);
}

function summarize(keyword: string, fetchedAt: string, records: WinningBidRecord[], totalElements: number, truncated: boolean, filters: SearchFilters): ProductData {
  const totalValue = records.reduce((sum, record) => sum + valueOf(record), 0);
  const totalQuantity = records.reduce((sum, record) => sum + toNumber(record.khoiLuongDouble ?? record.khoiLuong), 0);
  const medtronicRecords = records.filter((record) => companyOf(record) === "Medtronic");
  const medtronicValue = medtronicRecords.reduce((sum, record) => sum + valueOf(record), 0);
  const medtronicQuantity = medtronicRecords.reduce((sum, record) => sum + toNumber(record.khoiLuongDouble ?? record.khoiLuong), 0);
  const dated = records.map((record) => ({ record, date: parseDate(record.ngayDangTaiKqlcnt) }))
    .filter((item): item is { record: WinningBidRecord; date: Date } => item.date !== null)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const months = new Map<string, { month: string; value: number }>();
  for (const item of dated) {
    const key = `${item.date.getFullYear()}-${String(item.date.getMonth() + 1).padStart(2, "0")}`;
    const current = months.get(key) || { month: `T${item.date.getMonth() + 1}/${String(item.date.getFullYear()).slice(-2)}`, value: 0 };
    current.value += valueOf(item.record);
    months.set(key, current);
  }
  const trend = [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([, value]) => value);
  const units = new Set(records.map((record) => normalize(record.donViTinh || "")).filter(Boolean));
  const missingManufacturerValue = records.filter((record) => !record.hangSanXuat?.trim()).reduce((sum, record) => sum + valueOf(record), 0);
  const missingShare = totalValue ? (missingManufacturerValue / totalValue) * 100 : 0;
  const firstDate = dated.at(0)?.date;
  const lastDate = dated.at(-1)?.date;
  const dateRange = firstDate && lastDate ? `${firstDate.toLocaleDateString("vi-VN")}–${lastDate.toLocaleDateString("vi-VN")}` : "Tất cả thời gian có dữ liệu";
  const medtronicShare = totalValue ? (medtronicValue / totalValue) * 100 : 0;
  const medtronicQuantityShare = totalQuantity ? (medtronicQuantity / totalQuantity) * 100 : 0;
  return {
    keyword, group: groupFor(keyword), fetchedAt, truncated, filters, lineItems: records.length, totalElements,
    totalValue, totalQuantity,
    tenders: new Set(records.map((record) => record.maTbmt).filter(Boolean)).size,
    hospitals: new Set(records.map((record) => record.tenCdtBmt).filter(Boolean)).size,
    medtronicValue, medtronicShare, medtronicQuantity, medtronicQuantityShare, dateRange,
    trend: trend.length ? trend : [{ month: "Chưa có ngày đăng tải", value: 0 }],
    manufacturers: topBy(records, companyOf, valueOf),
    topHospitals: topBy(records, (record) => record.tenCdtBmt || "", valueOf),
    topProducts: topBy(records, (record) => record.kyMaHieu || record.chungLoai || record.nhanHieu || record.tenThietBi || "", (record) => toNumber(record.khoiLuongDouble ?? record.khoiLuong)),
    topSuppliers: topBy(records, (record) => formatList(record.winningName), valueOf),
    insight: medtronicValue ? `Các nhãn sản phẩm liên quan đến Medtronic chiếm khoảng ${medtronicShare.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}% giá trị trúng thầu ghi nhận trong kết quả tìm kiếm trực tiếp này.` : "Chưa có bản ghi nào được phân loại là Medtronic từ các trường sản phẩm hiện có.",
    qualityNote: `Dữ liệu có ${units.size} loại đơn vị tính; ${missingShare.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}% giá trị trúng thầu không có thông tin hãng sản xuất. Thị phần công ty vẫn là ước tính cho tới khi danh sách tên quy đổi được xác nhận.`,
  };
}

function TrendChart({ data }: { data: ProductData["trend"] }) {
  const width = 720, height = 220;
  const padding = { top: 18, right: 16, bottom: 34, left: 42 };
  const max = Math.max(...data.map((point) => point.value), 1);
  const x = (index: number) => data.length === 1 ? width / 2 : padding.left + (index * (width - padding.left - padding.right)) / (data.length - 1);
  const y = (value: number) => padding.top + (1 - value / max) * (height - padding.top - padding.bottom);
  const points = data.map((point, index) => `${x(index)},${y(point.value)}`);
  const area = `${points.join(" ")} ${x(data.length - 1)},${height - padding.bottom} ${x(0)},${height - padding.bottom}`;
  return <svg className="trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Diễn biến giá trị trúng thầu">
    {[0, .5, 1].map((ratio) => { const lineY = padding.top + ratio * (height - padding.top - padding.bottom); return <g key={ratio}><line className="chart-gridline" x1={padding.left} x2={width - padding.right} y1={lineY} y2={lineY} /><text className="chart-axis" x="0" y={lineY + 4}>{((max * (1 - ratio)) / 1_000_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 0 })} tỷ</text></g>; })}
    <polygon className="chart-area" points={area} /><polyline className="chart-line" points={points.join(" ")} />
    {data.map((point, index) => <g key={`${point.month}-${index}`}><circle className="chart-dot" cx={x(index)} cy={y(point.value)} r="3" />{(index === 0 || index === data.length - 1 || index === Math.floor(data.length / 2)) && <text className="chart-axis chart-month" x={x(index)} y={height - 10} textAnchor={index === 0 ? "start" : index === data.length - 1 ? "end" : "middle"}>{point.month}</text>}</g>)}
  </svg>;
}

function ProductSearch({ compact = false, loading, error, onSearch }: { compact?: boolean; loading: boolean; error?: string; onSearch: (query: string) => void }) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => !query ? suggestions : suggestions.filter((item) => normalize(item.name).includes(normalize(query))), [query]);
  const submit = () => { if (query.trim() && !loading) onSearch(query.trim()); };
  return <div className={compact ? "search-shell search-shell-compact" : "search-shell"}>
    <Command shouldFilter={false} className="product-command">
      <form onSubmit={(event) => { event.preventDefault(); submit(); }}><div className="search-input-row">
        <CommandInput value={query} onValueChange={setQuery} placeholder="Tìm theo tên sản phẩm, brand hoặc model…" aria-label="Tìm kiếm sản phẩm trực tiếp" />
        <button className="search-button" type="submit" disabled={loading || !query.trim()}>{loading ? <LoaderCircle className="spin" /> : <Search />}<span>{loading ? "Đang tìm…" : "Tìm kiếm"}</span></button>
      </div></form>
      {!compact && <CommandList className="search-suggestions"><CommandEmpty>Nhấn Tìm kiếm để tra cứu từ khóa này.</CommandEmpty><CommandGroup heading={query ? "Từ khóa gợi ý" : "Thử tìm một sản phẩm"}>{visible.map((item) => <CommandItem key={item.name} value={item.name} onSelect={() => onSearch(item.name)} className="product-option"><span className="option-icon"><Database /></span><span><strong>{item.name}</strong><small>{item.group} · tra cứu trực tiếp trên cổng</small></span><ChevronRight className="option-arrow" /></CommandItem>)}</CommandGroup></CommandList>}
    </Command>
    {!compact && error && <p className="search-message">{error}</p>}
  </div>;
}

function Brand() {
  return <div className="brand" aria-label="TenderPulse AI phân tích Medtronic"><span className="brand-name">TenderPulse <b>AI</b></span><span className="brand-divider" /><span className="company-label">MEDTRONIC MARKET INTELLIGENCE</span></div>;
}
function SearchHome({ loading, error, onSearch }: { loading: boolean; error?: string; onSearch: (query: string) => void }) {
  return <main className="home-page"><section className="search-hero">
    <div className="company-pill"><CheckCircle2 /> Góc nhìn công ty: Medtronic</div><h1>Tìm kiếm sản phẩm.<br /><span>Xem vị thế của Medtronic.</span></h1>
    <p>Mỗi lượt tìm kiếm sẽ lấy dữ liệu trúng thầu công khai mới nhất và tính toán dashboard trực tiếp từ kết quả trả về.</p>
    <ProductSearch loading={loading} error={error} onSearch={onSearch} />
    <div className="keyword-row"><span>Từ khóa phổ biến</span>{suggestions.slice(0, 4).map((item) => <button key={item.name} onClick={() => onSearch(item.name)} disabled={loading}>{item.name}</button>)}</div>
    <div className="source-line"><Database /> Dữ liệu trực tiếp từ Mua Sắm Công</div>
  </section><div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" /></main>;
}
function RankingPanel({ eyebrow, title, items, currency = true, company = false }: { eyebrow: string; title: string; items: NamedValue[]; currency?: boolean; company?: boolean }) {
  const max = Math.max(...items.map((item) => item.value), 1);
  return <article className="panel manufacturer-panel"><div className="panel-heading"><div><span className="panel-eyebrow">{eyebrow}</span><h2>{title}</h2></div></div><div className="rank-list">{items.map((item, index) => <div className={`rank-row ${company && item.name.includes("Medtronic") ? "is-company" : ""}`} key={item.name}><div className="rank-label"><span>{index + 1}</span><strong>{item.name}</strong><em>{currency ? formatVnd(item.value) : `${Math.round(item.value).toLocaleString("vi-VN")} sản phẩm`}</em></div><div className="rank-track"><span style={{ width: `${(item.value / max) * 100}%` }} /></div></div>)}</div></article>;
}

function FilterBar({ initial, loading, onApply }: { initial: SearchFilters; loading: boolean; onApply: (filters: SearchFilters) => void }) {
  const [filters, setFilters] = useState<SearchFilters>(initial);
  const update = (field: keyof SearchFilters, value: string) => setFilters((current) => ({ ...current, [field]: value }));
  const hasFilters = Object.entries(filters).some(([key, value]) => key === "company" ? value !== "all" : Boolean(value));

  return <form className="filter-bar" onSubmit={(event) => { event.preventDefault(); onApply(filters); }}>
    <div className="filter-title"><Filter /><span>Bộ lọc<small>Gửi trực tiếp tới cổng</small></span></div>
    <label className="filter-field"><small>TỪ NGÀY</small><input type="date" value={filters.dateFrom} max={filters.dateTo || undefined} onChange={(event) => update("dateFrom", event.target.value)} /></label>
    <label className="filter-field"><small>ĐẾN NGÀY</small><input type="date" value={filters.dateTo} min={filters.dateFrom || undefined} onChange={(event) => update("dateTo", event.target.value)} /></label>
    <label className="filter-field"><small>BỆNH VIỆN / CHỦ ĐẦU TƯ</small><input type="text" value={filters.hospital} onChange={(event) => update("hospital", event.target.value)} placeholder="Nhập tên hoặc mã" /></label>
    <label className="filter-field"><small>BRAND / HÃNG SẢN XUẤT</small><input type="text" value={filters.brand} onChange={(event) => update("brand", event.target.value)} placeholder="Ví dụ: LigaSure" /></label>
    <label className="filter-field"><small>NHÀ THẦU TRÚNG</small><input type="text" value={filters.supplier} onChange={(event) => update("supplier", event.target.value)} placeholder="Nhập tên hoặc mã" /></label>
    <div className="filter-field"><small>CÔNG TY</small><Select value={filters.company} onValueChange={(value) => update("company", value)}><SelectTrigger className="company-select"><SelectValue /></SelectTrigger><SelectContent>
      <SelectItem value="all">Tất cả công ty</SelectItem><SelectItem value="medtronic">Medtronic</SelectItem><SelectItem value="ethicon">J&amp;J / Ethicon</SelectItem><SelectItem value="applied">Applied Medical</SelectItem><SelectItem value="bbraun">B. Braun / Aesculap</SelectItem><SelectItem value="olympus">Olympus</SelectItem><SelectItem value="miconvey">Miconvey</SelectItem><SelectItem value="innolcon">Innolcon</SelectItem>
    </SelectContent></Select></div>
    <div className="filter-actions"><button className="apply-filter" type="submit" disabled={loading}>{loading ? <LoaderCircle className="spin" /> : <Search />}Áp dụng</button><button className="clear-filter" type="button" disabled={loading || !hasFilters} onClick={() => { const cleared = emptyFilters(); setFilters(cleared); onApply(cleared); }}>Xóa lọc</button></div>
  </form>;
}

function Dashboard({ product, loading, error, onBack, onSearch }: { product: ProductData; loading: boolean; error?: string; onBack: () => void; onSearch: (query: string, filters?: SearchFilters) => void }) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string>();

  async function downloadExcel() {
    setExporting(true);
    setExportError(undefined);
    try {
      const response = await fetch("/api/winning-bids/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: product.keyword, filters: product.filters }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || "Không thể tạo file Excel.");
      }

      const file = await response.blob();
      const downloadUrl = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `${formatDownloadDate(new Date())}-${filenameSlug(product.keyword)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);
    } catch (caught) {
      setExportError(caught instanceof Error ? caught.message : "Không thể tạo file Excel.");
    } finally {
      setExporting(false);
    }
  }

  return <main className="dashboard-page"><div className="search-result-toolbar"><div className="topbar-product-search"><ProductSearch compact loading={loading} onSearch={(query) => onSearch(query, product.filters)} /></div><button className="new-search" onClick={onBack}><ArrowLeft /> Trang tìm kiếm</button></div><section className="dashboard-shell">
    {loading && <div className="live-banner"><LoaderCircle className="spin" /> Đang lấy dữ liệu mới nhất từ cổng…</div>}{error && <div className="live-banner live-banner-error"><CircleAlert /> {error}</div>}
    {exportError && <div className="live-banner live-banner-error"><CircleAlert /> {exportError}</div>}
    <div className="dashboard-heading"><div><div className="result-kicker"><span>TỔNG QUAN THỊ TRƯỜNG MEDTRONIC</span><i /><span>{product.group}</span></div><h1>{product.keyword}</h1><p>{product.lineItems.toLocaleString("vi-VN")} dòng kết quả · {product.dateRange} · Cập nhật lúc {new Date(product.fetchedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</p></div><button className="export-button" type="button" disabled={loading || exporting} onClick={downloadExcel}>{exporting ? <LoaderCircle className="spin" /> : <Download />}<span>{exporting ? "Đang tạo Excel…" : "Xuất Excel"}</span></button></div>
    <FilterBar key={product.fetchedAt} initial={product.filters} loading={loading} onApply={(filters) => onSearch(product.keyword, filters)} />
    <div className="metric-grid">
      <article className="metric-card"><div className="metric-icon blue"><Trophy /></div><span>Tổng giá trị trúng thầu</span><strong>{formatVnd(product.totalValue)}</strong><small>Tính trực tiếp từ kết quả tìm kiếm</small></article>
      <article className="metric-card company-metric"><div className="metric-icon company"><CheckCircle2 /></div><span>Giá trị Medtronic trúng</span><strong>{formatVnd(product.medtronicValue)}</strong><small>Chiếm {product.medtronicShare.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}% giá trị thị trường</small></article>
      <article className="metric-card"><div className="metric-icon violet"><Database /></div><span>Thị phần Medtronic theo số lượng</span><strong>{product.medtronicQuantityShare.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%</strong><small>{Math.round(product.medtronicQuantity).toLocaleString("vi-VN")} / {Math.round(product.totalQuantity).toLocaleString("vi-VN")} sản phẩm ghi nhận</small></article>
      <article className="metric-card"><div className="metric-icon green"><Database /></div><span>Số TBMT có kết quả</span><strong>{product.tenders.toLocaleString("vi-VN")}</strong><small>Tính theo Mã TBMT riêng biệt</small></article>
      <article className="metric-card"><div className="metric-icon blue"><Building2 /></div><span>Số bệnh viện / chủ đầu tư</span><strong>{product.hospitals.toLocaleString("vi-VN")}</strong><small>{product.totalElements.toLocaleString("vi-VN")} kết quả trên cổng</small></article>
    </div>
    <div className="dashboard-grid">
      <article className="panel trend-panel"><div className="panel-heading"><div><span className="panel-eyebrow">GIÁ TRỊ TRÚNG THẦU</span><h2>Diễn biến giá trị theo thời gian</h2></div><span className="panel-period">Kết quả hiện tại · VND</span></div><TrendChart data={product.trend} /></article>
      <article className="panel company-panel"><div className="company-panel-head"><span>MEDTRONIC</span><CheckCircle2 /></div><p>Vị thế công ty ước tính</p><div className="company-share">{product.medtronicShare.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}<small>%</small></div><div className="share-track"><span style={{ width: `${Math.min(product.medtronicShare, 100)}%` }} /></div><strong>{formatVnd(product.medtronicValue)} giá trị ghi nhận</strong></article>
      <RankingPanel eyebrow="SO SÁNH CẠNH TRANH" title="Giá trị trúng thầu theo công ty" items={product.manufacturers} company /><RankingPanel eyebrow="NHU CẦU KHÁCH HÀNG" title="Top 5 bệnh viện theo giá trị trúng thầu" items={product.topHospitals} />
      <RankingPanel eyebrow="NHU CẦU SẢN PHẨM" title="Top 5 model theo số lượng trúng" items={product.topProducts} currency={false} /><RankingPanel eyebrow="NHÀ THẦU" title="Top 5 nhà thầu trúng theo giá trị" items={product.topSuppliers} />
    </div>
    <div className="insight-grid"><article className="insight-card"><div className="insight-icon"><Sparkles /></div><div><span>NHẬN ĐỊNH TENDERPULSE</span><p>{product.insight}</p></div></article><article className="quality-card"><CircleAlert /><div><span>LƯU Ý CHẤT LƯỢNG DỮ LIỆU</span><p>{product.qualityNote}</p></div></article></div>
    <p className="dashboard-footnote">{product.truncated ? `Kết quả trên cổng vượt giới hạn an toàn; dashboard được tính từ ${product.lineItems.toLocaleString("vi-VN")} bản ghi đầu tiên.` : "Toàn bộ số liệu được tính sau mỗi lượt tìm kiếm từ dữ liệu trúng thầu từ Mua Sắm Công"}</p>
  </section></main>;
}

function percent(value: number) {
  return `${value.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
}

function mergeNamedValues(slices: OverviewSubOu[], select: (slice: OverviewSubOu) => OverviewNamedValue[]) {
  const totals = new Map<string, OverviewNamedValue>();
  slices.flatMap(select).forEach((entry) => {
    const current = totals.get(entry.name) || { name: entry.name, value: 0, units: 0 };
    current.value += entry.value;
    current.units += entry.units;
    totals.set(entry.name, current);
  });
  return [...totals.values()].sort((left, right) => right.value - left.value);
}

function mergeHospitals(slices: OverviewSubOu[]) {
  const totals = new Map<string, OverviewHospital>();
  slices.flatMap((slice) => slice.hospitals).forEach((entry) => {
    const current = totals.get(entry.name) || { name: entry.name, value: 0, units: 0, products: 0, tenders: 0 };
    current.value += entry.value;
    current.units += entry.units;
    current.products += entry.products;
    current.tenders += entry.tenders;
    totals.set(entry.name, current);
  });
  return [...totals.values()].sort((left, right) => right.value - left.value);
}

function mergeTenders(slices: OverviewSubOu[]) {
  const totals = new Map<string, OverviewTender>();
  slices.flatMap((slice) => slice.tenders).forEach((entry) => {
    const current = totals.get(entry.id) || { id: entry.id, hospital: entry.hospital, value: 0, products: 0 };
    current.value += entry.value;
    current.products += entry.products;
    totals.set(entry.id, current);
  });
  return [...totals.values()].sort((left, right) => right.value - left.value);
}

function OverviewFilterBar({ filters, catalog, loading, onApply }: {
  filters: OverviewFilterState;
  catalog: KeywordCatalogItem[];
  loading: boolean;
  onApply: (filters: OverviewFilterState) => void;
}) {
  const [draft, setDraft] = useState(filters);
  const update = (field: keyof OverviewFilterState, value: string) => {
    setDraft((current) => {
      const next = { ...current, [field]: value };
      if (field === "subOu") next.productGroup = "all";
      return next;
    });
  };
  const groups = catalog
    .filter((item) => draft.subOu === "all" || item.subOu === draft.subOu)
    .flatMap((item) => item.productGroups)
    .filter((name, index, values) => values.indexOf(name) === index);

  return <form className="overview-filter" onSubmit={(event) => { event.preventDefault(); onApply(draft); }}>
    <label><span>Từ ngày</span><input type="date" value={draft.dateFrom} max={draft.dateTo || undefined} onChange={(event) => update("dateFrom", event.target.value)} /></label>
    <label><span>Đến ngày</span><input type="date" value={draft.dateTo} min={draft.dateFrom || undefined} onChange={(event) => update("dateTo", event.target.value)} /></label>
    <label><span>Bệnh viện</span><input type="text" value={draft.hospital} onChange={(event) => update("hospital", event.target.value)} placeholder="Tất cả bệnh viện" /></label>
    <label><span>Sub-OU</span><select value={draft.subOu} onChange={(event) => update("subOu", event.target.value)}><option value="all">Tất cả</option>{subOuOrder.map((name) => <option value={name} key={name}>{name}</option>)}</select></label>
    <label><span>Nhóm sản phẩm</span><select value={draft.productGroup} onChange={(event) => update("productGroup", event.target.value)}><option value="all">Tất cả</option>{groups.map((name) => <option value={name} key={name}>{name}</option>)}</select></label>
    <label><span>Công ty</span><select value={draft.company} onChange={(event) => update("company", event.target.value)}><option value="all">Tất cả</option><option value="medtronic">Medtronic</option><option value="ethicon">J&amp;J / Ethicon</option><option value="bbraun">B. Braun / Aesculap</option><option value="applied">Applied Medical</option><option value="olympus">Olympus</option></select></label>
    <button className="overview-apply" type="submit" disabled={loading}>{loading ? "Đang cập nhật…" : "Áp dụng"}</button>
  </form>;
}

function MarketOverview() {
  const initialFilters = useMemo(defaultOverviewFilters, []);
  const [filters, setFilters] = useState(initialFilters);
  const [catalog, setCatalog] = useState<KeywordCatalogItem[]>([]);
  const [slices, setSlices] = useState<OverviewSubOu[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string>();
  const [updatedAt, setUpdatedAt] = useState<string>();
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  const [showAllHospitals, setShowAllHospitals] = useState<Set<string>>(new Set());
  const started = useRef(false);

  async function loadOverview(nextFilters: OverviewFilterState, availableCatalog = catalog) {
    setLoading(true);
    setError(undefined);
    setSlices([]);
    setFilters(nextFilters);
    const matchingCatalog = availableCatalog.length ? availableCatalog : subOuOrder.map((subOu) => ({ subOu, productGroups: [], keywords: [] }));
    const targets = matchingCatalog
      .filter((item) => nextFilters.subOu === "all" || item.subOu === nextFilters.subOu)
      .filter((item) => nextFilters.productGroup === "all" || item.productGroups.includes(nextFilters.productGroup))
      .map((item) => item.subOu);
    const failures: string[] = [];

    for (let index = 0; index < targets.length; index += 2) {
      const batch = targets.slice(index, index + 2);
      const responses = await Promise.allSettled(batch.map(async (subOu) => {
        const response = await fetch("/api/market-overview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...nextFilters, subOu }),
        });
        const data = await response.json() as { error?: string; fetchedAt?: string; slice?: OverviewSubOu };
        if (!response.ok || !data.slice) throw new Error(data.error || `Không thể cập nhật ${subOu}.`);
        if (data.fetchedAt) setUpdatedAt(data.fetchedAt);
        return data.slice;
      }));
      responses.forEach((result, batchIndex) => {
        if (result.status === "fulfilled") {
          setSlices((current) => [...current, result.value].sort((left, right) => subOuOrder.indexOf(left.name) - subOuOrder.indexOf(right.name)));
        } else {
          failures.push(batch[batchIndex]);
        }
      });
    }
    if (failures.length) setError(`Chưa thể tải: ${failures.join(", ")}. Các Sub-OU còn lại vẫn được hiển thị.`);
    setLoading(false);
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        const response = await fetch("/api/market-overview", { cache: "no-store" });
        const data = await response.json() as { catalog?: KeywordCatalogItem[] };
        const nextCatalog = data.catalog || [];
        setCatalog(nextCatalog);
        await loadOverview(initialFilters, nextCatalog);
      } catch {
        setError("Không thể tải danh mục từ khóa.");
      }
    })();
  }, [initialFilters]);

  const totals = useMemo(() => {
    const marketSize = slices.reduce((sum, slice) => sum + slice.marketSize, 0);
    const units = slices.reduce((sum, slice) => sum + slice.totalUnits, 0);
    const medtronicValue = slices.reduce((sum, slice) => sum + slice.medtronicValue, 0);
    const medtronicUnits = slices.reduce((sum, slice) => sum + slice.medtronicUnits, 0);
    const hospitals = mergeHospitals(slices);
    const tenders = mergeTenders(slices);
    return {
      marketSize,
      medtronicValueShare: marketSize ? (medtronicValue / marketSize) * 100 : 0,
      medtronicUnitShare: units ? (medtronicUnits / units) * 100 : 0,
      hospitals,
      tenders,
      suppliers: mergeNamedValues(slices, (slice) => slice.suppliers).filter((entry) => entry.name !== "Chưa xác định"),
    };
  }, [slices]);
  const hasWarnings = slices.some((slice) => slice.truncated || slice.failedQueries.length);

  async function exportExcel() {
    setExporting(true);
    try {
      const response = await fetch("/api/market-overview/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filters, slices }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || "Không thể tạo file Excel.");
      }
      const file = await response.blob();
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = response.headers.get("X-Export-Filename") || `${formatDownloadDate(new Date())}-tong-quan-thi-truong.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể tạo file Excel.");
    } finally {
      setExporting(false);
    }
  }

  const toggleRow = (name: string) => setOpenRows((current) => {
    const next = new Set(current);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });
  const toggleAllHospitals = (name: string) => setShowAllHospitals((current) => {
    const next = new Set(current);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });

  return <main className="overview-page"><section className="overview-shell">
    <div className="overview-heading"><div><h1>Tổng quan thị trường</h1><p>Dữ liệu trúng thầu được phân loại theo bộ 196 từ khóa và điều kiện loại trừ.</p></div><div className="overview-actions"><span>{updatedAt ? `Cập nhật ${new Date(updatedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}` : "Đang chuẩn bị dữ liệu"}</span><button type="button" onClick={exportExcel} disabled={loading || exporting || !slices.length}>{exporting ? "Đang tạo…" : "Xuất Excel"}</button></div></div>
    <OverviewFilterBar key={`${filters.dateFrom}-${filters.dateTo}-${filters.subOu}-${filters.productGroup}-${filters.company}`} filters={filters} catalog={catalog} loading={loading} onApply={loadOverview} />
    {error && <div className="overview-notice error-notice">{error}</div>}
    {hasWarnings && <div className="overview-notice">Một số truy vấn bị giới hạn hoặc chưa hoàn tất. Không dùng các dòng này làm số liệu cuối cùng cho đến khi cập nhật đủ.</div>}
    <div className="overview-metrics">
      <article><span>Market size</span><strong>{formatVnd(totals.marketSize)}</strong><small>Giá trị trúng thầu trong phạm vi lọc</small></article>
      <article><span>Thị phần Medtronic · giá trị</span><strong>{percent(totals.medtronicValueShare)}</strong><small>Covidien và LigaSure được quy đổi vào Medtronic</small></article>
      <article><span>Thị phần Medtronic · số lượng</span><strong>{percent(totals.medtronicUnitShare)}</strong><small>Tính theo số lượng sản phẩm ghi nhận</small></article>
      <article><span>Số KQLCNT</span><strong>{totals.tenders.length.toLocaleString("vi-VN")}</strong><small>Mã TBMT riêng biệt</small></article>
      <article><span>Bệnh viện trúng thầu</span><strong>{totals.hospitals.filter((item) => item.name !== "Chưa xác định").length.toLocaleString("vi-VN")}</strong><small>Có thể mở theo từng Sub-OU</small></article>
    </div>

    <section className="subou-section"><div className="section-title"><div><h2>Phân tích theo Sub-OU</h2><p>Chọn số bệnh viện ở cuối mỗi dòng để xem chi tiết sản phẩm.</p></div>{loading && <span className="loading-label">Đang tải dữ liệu trực tiếp…</span>}</div>
      <div className="subou-table-wrap"><table className="subou-table"><thead><tr><th>Sub-OU</th><th>Market size</th><th>Medtronic share</th><th>Top 3 đối thủ</th><th>KQLCNT</th><th>Bệnh viện</th></tr></thead><tbody>
        {slices.map((slice, index) => <Fragment key={slice.name}>
          <tr className={openRows.has(slice.name) ? "is-open" : ""}>
            <td><span className="subou-index">{String(index + 1).padStart(2, "0")}</span><div><strong>{slice.name}</strong><small>{slice.productCount.toLocaleString("vi-VN")} sản phẩm</small></div></td>
            <td><strong>{formatVnd(slice.marketSize)}</strong><small>{Math.round(slice.totalUnits).toLocaleString("vi-VN")} đơn vị</small></td>
            <td><strong>{percent(slice.medtronicValueShare)} <em>giá trị</em></strong><small>{percent(slice.medtronicUnitShare)} số lượng</small></td>
            <td><div className="competitor-stack">{slice.competitors.length ? slice.competitors.map((item, rank) => <div key={item.name}><span>{rank + 1}. {item.name}</span><b>{percent(slice.marketSize ? (item.value / slice.marketSize) * 100 : 0)}</b><small>{percent(slice.totalUnits ? (item.units / slice.totalUnits) * 100 : 0)} unit</small></div>) : <span>Chưa đủ dữ liệu</span>}</div></td>
            <td><strong>{slice.tenderCount.toLocaleString("vi-VN")}</strong></td>
            <td><button className="hospital-expand" type="button" onClick={() => toggleRow(slice.name)} aria-expanded={openRows.has(slice.name)}><span><strong>{slice.hospitalCount.toLocaleString("vi-VN")}</strong><small>bệnh viện</small></span><b>{openRows.has(slice.name) ? "Thu gọn" : "Xem"}</b></button></td>
          </tr>
          {openRows.has(slice.name) && <tr className="hospital-detail-row"><td colSpan={6}><div className="hospital-detail"><div className="hospital-detail-head"><div><strong>Bệnh viện thuộc {slice.name}</strong><span>Số sản phẩm là số model/mã hiệu riêng biệt sau phân loại.</span></div><button type="button" onClick={() => toggleRow(slice.name)}>Đóng</button></div><div className="hospital-mini-table"><div className="hospital-mini-head"><span>Bệnh viện / chủ đầu tư</span><span>Sản phẩm</span><span>KQLCNT</span><span>Số lượng</span><span>Giá trị</span></div>{slice.hospitals.slice(0, showAllHospitals.has(slice.name) ? undefined : 8).map((hospital) => <div className="hospital-mini-row" key={hospital.name}><strong>{hospital.name}</strong><span>{hospital.products.toLocaleString("vi-VN")}</span><span>{hospital.tenders.toLocaleString("vi-VN")}</span><span>{Math.round(hospital.units).toLocaleString("vi-VN")}</span><span>{formatVnd(hospital.value)}</span></div>)}</div>{slice.hospitals.length > 8 && <button className="show-more-hospitals" type="button" onClick={() => toggleAllHospitals(slice.name)}>{showAllHospitals.has(slice.name) ? "Hiện 8 bệnh viện đầu" : `Xem toàn bộ ${slice.hospitals.length} bệnh viện`}</button>}</div></td></tr>}
        </Fragment>)}
        {!slices.length && !loading && <tr><td className="empty-overview" colSpan={6}>Không có dữ liệu phù hợp với bộ lọc hiện tại.</td></tr>}
      </tbody></table></div>
    </section>

    <div className="overview-bottom-grid">
      <OverviewList title="Top 5 nhà phân phối theo market size" rows={totals.suppliers.slice(0, 5)} />
      <OverviewList title="Top 5 bệnh viện theo market size" rows={totals.hospitals.slice(0, 5)} meta={(row) => `${(row as OverviewHospital).products} sản phẩm`} />
      <article className="overview-list"><h3>Top 5 KQLCNT theo giá trị</h3><div>{totals.tenders.slice(0, 5).map((tender, index) => <div className="overview-list-row" key={tender.id}><span>{index + 1}</span><div><strong>{tender.id}</strong><small>{tender.hospital} · {tender.products} sản phẩm</small></div><b>{formatVnd(tender.value)}</b></div>)}</div></article>
    </div>
  </section></main>;
}

function OverviewList({ title, rows, meta }: { title: string; rows: OverviewNamedValue[]; meta?: (row: OverviewNamedValue) => string }) {
  return <article className="overview-list"><h3>{title}</h3><div>{rows.map((row, index) => <div className="overview-list-row" key={row.name}><span>{index + 1}</span><div><strong>{row.name}</strong><small>{meta ? meta(row) : `${Math.round(row.units).toLocaleString("vi-VN")} đơn vị`}</small></div><b>{formatVnd(row.value)}</b></div>)}</div></article>;
}

function SearchExperience({ resume, onActivity }: { resume?: ActivityItem; onActivity: (activity: ActivityItem) => void }) {
  const [selectedProduct, setSelectedProduct] = useState<ProductData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  async function searchLive(keyword: string, filters: SearchFilters = emptyFilters()) {
    setLoading(true); setError(undefined);
    try {
      const response = await fetch("/api/winning-bids", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keyword, filters }) });
      const data = await response.json() as { error?: string; keyword?: string; fetchedAt?: string; records?: WinningBidRecord[]; totalElements?: number; truncated?: boolean };
      if (!response.ok) throw new Error(data.error || "Không thể thực hiện tìm kiếm trực tiếp.");
      const records = data.records || [];
      if (!records.length) throw new Error(`Không tìm thấy dữ liệu trúng thầu hiện tại cho “${keyword}”.`);
      setSelectedProduct(summarize(data.keyword || keyword, data.fetchedAt || new Date().toISOString(), records, data.totalElements || records.length, Boolean(data.truncated), filters));
      onActivity({ id: `${Date.now()}-${filenameSlug(keyword)}`, keyword, searchedAt: new Date().toISOString(), filters });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Không thể thực hiện tìm kiếm trực tiếp."); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    if (resume) void searchLive(resume.keyword, resume.filters);
  }, [resume?.id]);
  if (!selectedProduct) return <SearchHome loading={loading} error={error} onSearch={searchLive} />;
  return <Dashboard product={selectedProduct} loading={loading} error={error} onBack={() => { setSelectedProduct(null); setError(undefined); }} onSearch={searchLive} />;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState("overview");
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [resume, setResume] = useState<ActivityItem>();
  const [showActivity, setShowActivity] = useState(false);
  const localReady = useRef(false);

  useEffect(() => {
    const storedTab = window.localStorage.getItem("tenderpulse.active-tab");
    const storedActivity = window.localStorage.getItem("tenderpulse.recent-activity");
    if (storedTab === "overview" || storedTab === "search") setActiveTab(storedTab);
    if (storedActivity) {
      try { setActivity(JSON.parse(storedActivity) as ActivityItem[]); } catch { /* Ignore invalid older local data. */ }
    }
    localReady.current = true;
  }, []);

  const changeTab = (value: string) => {
    setActiveTab(value);
    if (localReady.current) window.localStorage.setItem("tenderpulse.active-tab", value);
  };
  const rememberActivity = (next: ActivityItem) => {
    setActivity((current) => {
      const updated = [next, ...current.filter((item) => normalize(item.keyword) !== normalize(next.keyword))].slice(0, 8);
      window.localStorage.setItem("tenderpulse.recent-activity", JSON.stringify(updated));
      return updated;
    });
  };
  const reopenActivity = (item: ActivityItem) => {
    setResume({ ...item, id: `${item.id}-${Date.now()}` });
    changeTab("search");
    setShowActivity(false);
  };

  return <Tabs className="app-tabs" value={activeTab} onValueChange={changeTab}>
    <header className="app-header"><Brand /><TabsList className="main-tabs" variant="line"><TabsTrigger value="overview">Tổng quan thị trường</TabsTrigger><TabsTrigger value="search">Tra cứu sản phẩm</TabsTrigger></TabsList><div className="activity-menu"><button type="button" onClick={() => setShowActivity((current) => !current)} aria-expanded={showActivity}>Hoạt động gần đây{activity.length ? <span>{activity.length}</span> : null}</button>{showActivity && <div className="activity-panel"><div className="activity-panel-head"><strong>Hoạt động trên thiết bị này</strong><button type="button" onClick={() => setShowActivity(false)}>Đóng</button></div>{activity.length ? activity.map((item) => <button className="activity-item" type="button" key={item.id} onClick={() => reopenActivity(item)}><strong>{item.keyword}</strong><span>{new Date(item.searchedAt).toLocaleString("vi-VN")}</span></button>) : <p>Chưa có lượt tra cứu nào được lưu.</p>}</div>}</div></header>
    <TabsContent className="app-tab-content" value="overview"><MarketOverview /></TabsContent>
    <TabsContent className="app-tab-content" value="search"><SearchExperience resume={resume} onActivity={rememberActivity} /></TabsContent>
  </Tabs>;
}
