import { collectWinningBids, type WinningBidFilters } from "@/lib/winning-bids";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { keyword?: unknown; filters?: unknown };
    const keyword = typeof body.keyword === "string" ? body.keyword.trim() : "";

    if (!keyword) {
      return Response.json({ error: "Vui lòng nhập từ khóa sản phẩm." }, { status: 400 });
    }

    if (keyword.length > 120) {
      return Response.json({ error: "Từ khóa tìm kiếm quá dài." }, { status: 400 });
    }

    const rawFilters = body.filters && typeof body.filters === "object"
      ? body.filters as Record<string, unknown>
      : {};
    const clean = (value: unknown, max = 200) =>
      typeof value === "string" ? value.trim().slice(0, max) : "";
    const validDate = (value: string) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value);
    const filters: WinningBidFilters = {
      dateFrom: clean(rawFilters.dateFrom, 10),
      dateTo: clean(rawFilters.dateTo, 10),
      hospital: clean(rawFilters.hospital),
      brand: clean(rawFilters.brand),
      supplier: clean(rawFilters.supplier),
      company: clean(rawFilters.company, 30),
    };

    if (!validDate(filters.dateFrom || "") || !validDate(filters.dateTo || "")) {
      return Response.json({ error: "Vui lòng chọn khoảng thời gian hợp lệ." }, { status: 400 });
    }
    if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) {
      return Response.json({ error: "Ngày bắt đầu phải trước ngày kết thúc." }, { status: 400 });
    }

    const result = await collectWinningBids(keyword, filters);

    return Response.json(
      {
        keyword,
        filters,
        fetchedAt: new Date().toISOString(),
        ...result,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  } catch (error) {
    console.error("Live winning-bid search failed", error);

    return Response.json(
      {
        error: "Không thể kết nối với cổng Mua Sắm Công. Vui lòng thử lại.",
      },
      { status: 502 },
    );
  }
}
