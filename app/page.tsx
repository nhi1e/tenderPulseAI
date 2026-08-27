"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft, Building2, CheckCircle2, ChevronRight, CircleAlert,
  Database, Download, Filter, LoaderCircle, Search, Sparkles, Trophy,
} from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  if (/covidien|coviden|medtronic/.test(searchable)) return "Medtronic";
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
  if (/dao|han mach|sieu am|vessel/.test(value)) return "VS&D · Vessel Sealing & Dissector";
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
  return <div className="brand" aria-label="TenderPulse AI phân tích Medtronic"><span className="brand-mark"><span /></span><span className="brand-name">TenderPulse <b>AI</b></span><span className="brand-divider" /><span className="company-label">PHÂN TÍCH MEDTRONIC</span></div>;
}
function SearchHome({ loading, error, onSearch }: { loading: boolean; error?: string; onSearch: (query: string) => void }) {
  return <main className="home-page"><header className="topbar"><Brand /><span className="snapshot live-snapshot"><i /> Kết nối dữ liệu trực tiếp</span></header><section className="search-hero">
    <div className="company-pill"><CheckCircle2 /> Góc nhìn công ty: Medtronic</div><h1>Tìm kiếm sản phẩm.<br /><span>Xem vị thế của Medtronic.</span></h1>
    <p>Mỗi lượt tìm kiếm sẽ lấy dữ liệu trúng thầu công khai mới nhất và tính toán dashboard trực tiếp từ kết quả trả về.</p>
    <ProductSearch loading={loading} error={error} onSearch={onSearch} />
    <div className="keyword-row"><span>Từ khóa phổ biến</span>{suggestions.slice(0, 4).map((item) => <button key={item.name} onClick={() => onSearch(item.name)} disabled={loading}>{item.name}</button>)}</div>
    <div className="source-line"><Database /> Dữ liệu trực tiếp từ Mua Sắm Công · không sử dụng số liệu cố định</div>
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
      link.download = response.headers.get("X-Export-Filename") || `tenderpulse-${new Date().toISOString().slice(0, 10)}.xlsx`;
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

  return <main className="dashboard-page"><header className="dashboard-topbar"><Brand /><div className="topbar-product-search"><ProductSearch compact loading={loading} onSearch={(query) => onSearch(query, product.filters)} /></div><button className="new-search" onClick={onBack}><ArrowLeft /> Trang tìm kiếm</button></header><section className="dashboard-shell">
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
    <p className="dashboard-footnote">{product.truncated ? `Kết quả trên cổng vượt giới hạn an toàn; dashboard được tính từ ${product.lineItems.toLocaleString("vi-VN")} bản ghi đầu tiên.` : "Toàn bộ số liệu được tính sau mỗi lượt tìm kiếm từ dữ liệu trúng thầu công khai; không sử dụng số liệu dashboard cố định."}</p>
  </section></main>;
}

export default function Home() {
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
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Không thể thực hiện tìm kiếm trực tiếp."); }
    finally { setLoading(false); }
  }
  if (!selectedProduct) return <SearchHome loading={loading} error={error} onSearch={searchLive} />;
  return <Dashboard product={selectedProduct} loading={loading} error={error} onBack={() => { setSelectedProduct(null); setError(undefined); }} onSearch={searchLive} />;
}
