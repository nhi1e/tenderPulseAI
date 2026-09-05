import {
  buildMarketOverviewSegment,
  SUB_OU_ORDER,
  type OverviewFilters,
} from "@/lib/market-overview";

export const dynamic = "force-dynamic";

function clean(value: unknown, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function wholeNumber(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const subOu = clean(body.subOu, 50);
    if (!SUB_OU_ORDER.includes(subOu as (typeof SUB_OU_ORDER)[number])) {
      return Response.json({ error: "Sub-OU không hợp lệ." }, { status: 400 });
    }

    const filters: OverviewFilters = {
      dateFrom: clean(body.dateFrom, 10),
      dateTo: clean(body.dateTo, 10),
      hospital: clean(body.hospital),
      productGroup: clean(body.productGroup, 100),
      company: clean(body.company, 30),
      subOu,
    };
    const validDate = (value: string | undefined) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value);
    if (!validDate(filters.dateFrom) || !validDate(filters.dateTo)) {
      return Response.json({ error: "Vui lòng chọn khoảng thời gian hợp lệ." }, { status: 400 });
    }
    if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) {
      return Response.json({ error: "Ngày bắt đầu phải trước ngày kết thúc." }, { status: 400 });
    }

    const segment = await buildMarketOverviewSegment(
      subOu,
      filters,
      wholeNumber(body.seedIndex),
      wholeNumber(body.startPage),
    );

    return Response.json({ fetchedAt: new Date().toISOString(), segment }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    console.error("Market overview segment failed", error);
    return Response.json(
      { error: "Không thể tải phần dữ liệu này từ Cổng Mua Sắm Công. Vui lòng thử lại." },
      { status: 502 },
    );
  }
}
