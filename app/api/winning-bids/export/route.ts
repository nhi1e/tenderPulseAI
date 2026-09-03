import * as XLSX from "xlsx";

import {
  collectWinningBids,
  type WinningBidFilters,
  type WinningBidRecord,
} from "@/lib/winning-bids";

export const dynamic = "force-dynamic";

const bidFormNames: Record<string, string> = {
  DTRR: "Đấu thầu rộng rãi",
  CGTTRG: "Chào giá trực tuyến theo quy trình rút gọn",
  MSTT: "Mua sắm trực tiếp",
  CDTRG: "Chỉ định thầu rút gọn",
};

const companyDisplayNames: Record<string, string> = {
  medtronic: "Medtronic",
  ethicon: "J&J / Ethicon",
  applied: "Applied Medical",
  bbraun: "B. Braun / Aesculap",
  olympus: "Olympus",
  miconvey: "Miconvey",
  innolcon: "Innolcon",
};

function clean(value: unknown, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function formatList(value: string[] | string | undefined) {
  return Array.isArray(value) ? value.filter(Boolean).join("; ") : value || "";
}

function formatLocation(locations: WinningBidRecord["diaDiem"]) {
  if (!Array.isArray(locations)) return "";

  return locations
    .map((location) =>
      [location.wardName, location.districtName, location.provName]
        .filter(Boolean)
        .join(", "),
    )
    .filter(Boolean)
    .join("; ");
}

// Prevent text supplied by the source portal from being interpreted as a formula.
function safeText(value: unknown) {
  const text = String(value ?? "");
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const source = String(value ?? "").trim().replace(/\s/g, "");
  if (!source) return 0;
  if (/^-?\d{1,3}([.,]\d{3})+$/.test(source)) return Number(source.replace(/[.,]/g, "")) || 0;
  return Number(source.replace(",", ".")) || 0;
}

function filenamePart(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "ket-qua";
}

function downloadDate() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${value("day")}-${value("month")}-${value("year")}`;
}

function buildWorkbook(keyword: string, filters: WinningBidFilters, records: WinningBidRecord[]) {
  const rows = records.map((record, index) => {
    const quantity = toNumber(record.khoiLuongDouble ?? record.khoiLuong);
    const unitPrice = toNumber(record.donGia ?? record.donGiaDuThau);

    return {
      STT: index + 1,
      "Tên thiết bị, vật tư y tế": safeText(record.tenThietBi),
      "Đơn vị tính": safeText(record.donViTinh),
      "Khối lượng": quantity,
      "Xuất xứ": safeText(record.xuatXu),
      "Mã HS": safeText(record.maHs),
      "Ký mã hiệu": safeText(record.kyMaHieu),
      "Nhãn hiệu": safeText(record.nhanHieu),
      "Hãng sản xuất": safeText(record.hangSanXuat),
      "Chủng loại (model)": safeText(record.chungLoai),
      "Số lưu hành / giấy phép nhập khẩu": safeText(record.soLuuHanh),
      "Năm sản xuất": safeText(record.namSanXuat),
      "Cấu hình, tính năng kỹ thuật": safeText(record.cauHinh),
      "Đơn giá trúng thầu": unitPrice,
      "Thành tiền ước tính": quantity * unitPrice,
      "Mã định danh NT trúng thầu": safeText(formatList(record.winningCode)),
      "Tên NT trúng thầu": safeText(formatList(record.winningName)),
      "Mã TBMT": safeText(record.maTbmt),
      "Mã định danh CĐT": safeText(record.maCdt),
      "Tên CĐT": safeText(record.tenCdtBmt),
      "Hình thức LCNT": safeText(record.bidForm ? bidFormNames[record.bidForm] || record.bidForm : ""),
      "Ngày đăng tải KQLCNT": safeText(record.ngayDangTaiKqlcnt),
      "Số quyết định": safeText(record.soQuyetDinh),
      "Ngày ban hành quyết định": safeText(record.ngayBanHanhQuyetDinh),
      "Số nhà thầu tham dự": toNumber(record.soNhaThauThamDu) || "",
      "Địa điểm": safeText(formatLocation(record.diaDiem)),
    };
  });

  const workbook = XLSX.utils.book_new();
  const resultSheet = XLSX.utils.json_to_sheet(rows);
  resultSheet["!autofilter"] = { ref: `A1:Z${Math.max(rows.length + 1, 1)}` };
  resultSheet["!cols"] = [
    { wch: 7 }, { wch: 44 }, { wch: 14 }, { wch: 14 }, { wch: 24 }, { wch: 13 },
    { wch: 22 }, { wch: 22 }, { wch: 32 }, { wch: 22 }, { wch: 28 }, { wch: 15 },
    { wch: 60 }, { wch: 20 }, { wch: 20 }, { wch: 26 }, { wch: 42 }, { wch: 18 },
    { wch: 22 }, { wch: 38 }, { wch: 34 }, { wch: 20 }, { wch: 22 }, { wch: 22 },
    { wch: 18 }, { wch: 38 },
  ];

  const infoRows = [
    ["Thông tin xuất dữ liệu", ""],
    ["Từ khóa", safeText(keyword)],
    ["Thời gian xuất", new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })],
    ["Số dòng kết quả", records.length],
    ["Từ ngày", filters.dateFrom || "Tất cả"],
    ["Đến ngày", filters.dateTo || "Tất cả"],
    ["Bệnh viện / chủ đầu tư", safeText(filters.hospital || "Tất cả")],
    ["Brand / hãng sản xuất", safeText(filters.brand || "Tất cả")],
    ["Nhà thầu trúng", safeText(filters.supplier || "Tất cả")],
    ["Công ty", safeText(filters.company && filters.company !== "all" ? companyDisplayNames[filters.company] || filters.company : "Tất cả")],
    ["Nguồn dữ liệu", "Cổng Mua Sắm Công"],
  ];
  const infoSheet = XLSX.utils.aoa_to_sheet(infoRows);
  infoSheet["!cols"] = [{ wch: 28 }, { wch: 65 }];

  XLSX.utils.book_append_sheet(workbook, resultSheet, "Kết quả");
  XLSX.utils.book_append_sheet(workbook, infoSheet, "Thông tin tìm kiếm");
  return workbook;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { keyword?: unknown; filters?: unknown };
    const keyword = clean(body.keyword, 120);
    if (!keyword) {
      return Response.json({ error: "Vui lòng nhập từ khóa sản phẩm." }, { status: 400 });
    }

    const rawFilters = body.filters && typeof body.filters === "object"
      ? body.filters as Record<string, unknown>
      : {};
    const filters: WinningBidFilters = {
      dateFrom: clean(rawFilters.dateFrom, 10),
      dateTo: clean(rawFilters.dateTo, 10),
      hospital: clean(rawFilters.hospital),
      brand: clean(rawFilters.brand),
      supplier: clean(rawFilters.supplier),
      company: clean(rawFilters.company, 30),
    };

    const validDate = (value: string) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value);
    if (!validDate(filters.dateFrom || "") || !validDate(filters.dateTo || "")) {
      return Response.json({ error: "Vui lòng chọn khoảng thời gian hợp lệ." }, { status: 400 });
    }
    if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) {
      return Response.json({ error: "Ngày bắt đầu phải trước ngày kết thúc." }, { status: 400 });
    }

    const result = await collectWinningBids(keyword, filters);
    if (!result.records.length) {
      return Response.json({ error: "Không có kết quả để xuất Excel." }, { status: 404 });
    }

    const workbook = buildWorkbook(keyword, filters, result.records);
    const file = XLSX.write(workbook, { type: "array", bookType: "xlsx", compression: true }) as ArrayBuffer;
    const filename = `${downloadDate()}-${filenamePart(keyword)}.xlsx`;

    return new Response(file, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "X-Export-Filename": filename,
      },
    });
  } catch (error) {
    console.error("Winning-bid Excel export failed", error);
    return Response.json(
      { error: "Không thể tạo file Excel từ dữ liệu trực tiếp. Vui lòng thử lại." },
      { status: 502 },
    );
  }
}
