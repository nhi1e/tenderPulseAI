import * as XLSX from "xlsx";

import type { OverviewFilters, OverviewSubOu } from "@/lib/market-overview";

export const dynamic = "force-dynamic";

function safeText(value: unknown) {
  const text = String(value ?? "");
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
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
      filters?: OverviewFilters;
      slices?: OverviewSubOu[];
    };
    const slices = Array.isArray(body.slices) ? body.slices : [];
    if (!slices.length) {
      return Response.json({ error: "Chưa có dữ liệu tổng quan để xuất." }, { status: 400 });
    }

    const subOuRows = slices.map((slice) => ({
      "Sub-OU": safeText(slice.name),
      "Market Size (VND)": slice.marketSize,
      "Market Share Medtronic (VND)": slice.medtronicValueShare / 100,
      "Market Share Medtronic (Unit)": slice.medtronicUnitShare / 100,
      "Số KQLCNT": slice.tenderCount,
      "Bệnh viện trúng thầu": slice.hospitalCount,
      "Số sản phẩm": slice.productCount,
      "Top 1 đối thủ": safeText(slice.competitors[0]?.name),
      "Top 1 Value": slice.competitors[0]?.value || 0,
      "Top 1 Unit": slice.competitors[0]?.units || 0,
      "Top 2 đối thủ": safeText(slice.competitors[1]?.name),
      "Top 2 Value": slice.competitors[1]?.value || 0,
      "Top 2 Unit": slice.competitors[1]?.units || 0,
      "Top 3 đối thủ": safeText(slice.competitors[2]?.name),
      "Top 3 Value": slice.competitors[2]?.value || 0,
      "Top 3 Unit": slice.competitors[2]?.units || 0,
    }));
    const hospitalRows = slices.flatMap((slice) => slice.hospitals.map((hospital) => ({
      "Sub-OU": safeText(slice.name),
      "Bệnh viện / chủ đầu tư": safeText(hospital.name),
      "Số sản phẩm": hospital.products,
      "Số KQLCNT": hospital.tenders,
      "Số lượng": hospital.units,
      "Market Size (VND)": hospital.value,
    })));
    const supplierRows = slices.flatMap((slice) => slice.suppliers.map((supplier) => ({
      "Sub-OU": safeText(slice.name),
      "Nhà phân phối": safeText(supplier.name),
      "Số lượng": supplier.units,
      "Market Size (VND)": supplier.value,
    })));
    const filters = body.filters || {};
    const infoRows = [
      ["Thông tin xuất dữ liệu", ""],
      ["Ngày tải", new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })],
      ["Từ ngày", filters.dateFrom || "Tất cả"],
      ["Đến ngày", filters.dateTo || "Tất cả"],
      ["Bệnh viện / chủ đầu tư", safeText(filters.hospital || "Tất cả")],
      ["Sub-OU", safeText(filters.subOu && filters.subOu !== "all" ? filters.subOu : "Tất cả")],
      ["Nhóm sản phẩm", safeText(filters.productGroup && filters.productGroup !== "all" ? filters.productGroup : "Tất cả")],
      ["Công ty", safeText(filters.company && filters.company !== "all" ? filters.company : "Tất cả")],
      ["Nguồn", "Cổng Mua Sắm Công"],
    ];

    const workbook = XLSX.utils.book_new();
    const subOuSheet = XLSX.utils.json_to_sheet(subOuRows);
    const hospitalSheet = XLSX.utils.json_to_sheet(hospitalRows);
    const supplierSheet = XLSX.utils.json_to_sheet(supplierRows);
    const infoSheet = XLSX.utils.aoa_to_sheet(infoRows);
    subOuSheet["!cols"] = [{ wch: 22 }, ...Array(15).fill({ wch: 22 })];
    hospitalSheet["!cols"] = [{ wch: 22 }, { wch: 48 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 22 }];
    supplierSheet["!cols"] = [{ wch: 22 }, { wch: 48 }, { wch: 16 }, { wch: 22 }];
    infoSheet["!cols"] = [{ wch: 30 }, { wch: 64 }];
    XLSX.utils.book_append_sheet(workbook, subOuSheet, "Tổng quan Sub-OU");
    XLSX.utils.book_append_sheet(workbook, hospitalSheet, "Bệnh viện");
    XLSX.utils.book_append_sheet(workbook, supplierSheet, "Nhà phân phối");
    XLSX.utils.book_append_sheet(workbook, infoSheet, "Bộ lọc");

    const file = XLSX.write(workbook, { type: "array", bookType: "xlsx", compression: true }) as ArrayBuffer;
    const filename = `${downloadDate()}-tong-quan-thi-truong.xlsx`;
    return new Response(file, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "X-Export-Filename": filename,
      },
    });
  } catch (error) {
    console.error("Market overview export failed", error);
    return Response.json({ error: "Không thể tạo file Excel tổng quan." }, { status: 502 });
  }
}
