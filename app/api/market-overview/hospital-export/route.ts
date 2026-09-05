import * as XLSX from "xlsx";

import type { OverviewFact } from "@/lib/market-overview-aggregate";

export const dynamic = "force-dynamic";

function safeText(value: unknown) {
  const text = String(value ?? "");
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function slug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "benh-vien";
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

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      hospital?: string;
      filters?: Record<string, string>;
      rows?: Array<OverviewFact & { subOu?: string }>;
    };
    const hospital = String(body.hospital || "").trim();
    const rows = Array.isArray(body.rows)
      ? body.rows.filter((row) => row.hospital === hospital)
      : [];
    if (!hospital || !rows.length) {
      return Response.json({ error: "Không có dữ liệu bệnh viện để xuất." }, { status: 400 });
    }

    const detailRows = rows.map((row) => ({
      "Sub-OU": safeText(row.subOu),
      "Bệnh viện / chủ đầu tư": safeText(row.hospital),
      "Mã TBMT": safeText(row.tender),
      "Tên sản phẩm": safeText(row.productName),
      "Model / mã hiệu": safeText(row.model),
      "Nhãn hiệu": safeText(row.brand),
      "Hãng sản xuất": safeText(row.manufacturer),
      "Công ty quy đổi": safeText(row.company),
      "Nhà thầu trúng": safeText(row.supplier),
      "Đơn vị tính": safeText(row.unitOfMeasure),
      "Số lượng": row.units,
      "Đơn giá trúng thầu": row.unitPrice,
      "Giá trị trúng thầu": row.value,
      "Ngày đăng KQLCNT": safeText(row.publishedAt),
    }));
    const filters = body.filters || {};
    const infoRows = [
      ["Bệnh viện / chủ đầu tư", safeText(hospital)],
      ["Ngày tải", new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })],
      ["Từ ngày", filters.dateFrom || "Tất cả"],
      ["Đến ngày", filters.dateTo || "Tất cả"],
      ["Sub-OU", filters.subOu && filters.subOu !== "all" ? safeText(filters.subOu) : "Tất cả"],
      ["Nhóm sản phẩm", filters.productGroup && filters.productGroup !== "all" ? safeText(filters.productGroup) : "Tất cả"],
      ["Công ty", filters.company && filters.company !== "all" ? safeText(filters.company) : "Tất cả"],
      ["Nguồn", "Cổng Mua Sắm Công"],
    ];

    const workbook = XLSX.utils.book_new();
    const detailSheet = XLSX.utils.json_to_sheet(detailRows);
    const infoSheet = XLSX.utils.aoa_to_sheet(infoRows);
    detailSheet["!cols"] = [
      { wch: 18 }, { wch: 46 }, { wch: 20 }, { wch: 54 }, { wch: 24 },
      { wch: 22 }, { wch: 36 }, { wch: 30 }, { wch: 42 }, { wch: 16 },
      { wch: 16 }, { wch: 22 }, { wch: 22 }, { wch: 20 },
    ];
    infoSheet["!cols"] = [{ wch: 30 }, { wch: 64 }];
    XLSX.utils.book_append_sheet(workbook, detailSheet, "Chi tiết bệnh viện");
    XLSX.utils.book_append_sheet(workbook, infoSheet, "Bộ lọc");

    const file = XLSX.write(workbook, { type: "array", bookType: "xlsx", compression: true }) as ArrayBuffer;
    const filename = `${downloadDate()}-${slug(hospital)}.xlsx`;
    return new Response(file, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "X-Export-Filename": filename,
      },
    });
  } catch (error) {
    console.error("Hospital export failed", error);
    return Response.json({ error: "Không thể tạo file Excel cho bệnh viện." }, { status: 502 });
  }
}
