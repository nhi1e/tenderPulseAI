export function normalizeSearchTerms(rules) {
  const unique = new Map();
  for (const rule of Array.isArray(rules) ? rules : []) {
    for (const raw of Array.isArray(rule?.keywords) ? rule.keywords : []) {
      const term = String(raw ?? "").replace(/\s+/g, " ").trim();
      const key = term.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLocaleLowerCase("vi-VN");
      if (term && key && !unique.has(key)) unique.set(key, term);
    }
  }
  return [...unique.values()].sort((a, b) => a.localeCompare(b, "vi"));
}

export function buildOpenTenderSearchPayload(keyword, pageNumber, from, to) {
  return [{
    pageSize: 1000,
    pageNumber,
    query: [{
      index: "es-contractor-selection",
      keyWord: keyword,
      keyWordNotMatch: "",
      matchType: "all-1",
      matchFields: ["goods"],
      filters: [
        { fieldName: "type", searchType: "in", fieldValues: ["es-notify-contractor"] },
        { fieldName: "caseKHKQ", searchType: "not_in", fieldValues: ["1"] },
        { fieldName: "publicDate", searchType: "range", from, to },
        { fieldName: "bidCloseDate", searchType: "range", from: to, to: null },
      ],
    }],
  }];
}

function text(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function normalizePortalNotice(record, matchedKeywords = []) {
  const notifyNo = text(record?.notifyNo);
  const notifyId = text(record?.notifyId || record?.id);
  if (!notifyNo || !notifyId) return undefined;

  const matched = [...new Set(matchedKeywords.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b, "vi"));
  const noticeId = text(record?.notifyNoStand) || `${notifyNo}-${text(record?.notifyVersion) || "00"}`;
  const bidName = Array.isArray(record?.bidName) ? record.bidName.map(text).filter(Boolean).join("; ") : text(record?.bidName);
  const locations = Array.isArray(record?.locations) ? record.locations.map((location) => [location?.districtName, location?.provName].map(text).filter(Boolean).join(" - ")).filter(Boolean) : [];
  const rawPrice = Array.isArray(record?.bidPrice) ? record.bidPrice[0] : record?.bidPrice;
  const price = Number(rawPrice);
  const detail = new URL("https://muasamcong.mof.gov.vn/vi/web/guest/contractor-selection");
  detail.searchParams.set("render", "detail-v2");
  detail.searchParams.set("type", "es-notify-contractor");
  detail.searchParams.set("stepCode", "notify-contractor-step-1-tbmt");
  detail.searchParams.set("id", notifyId);
  detail.searchParams.set("notifyId", notifyId);
  detail.searchParams.set("notifyNo", notifyNo);
  detail.searchParams.set("planNo", text(record?.planNo));
  detail.searchParams.set("step", "tbmt");
  detail.searchParams.set("processApply", text(record?.processApply) || "LDT");
  detail.searchParams.set("bidForm", text(record?.bidForm));

  const content = {
    noticeId,
    notifyId,
    notifyNo,
    title: bidName,
    buyer: text(record?.investorName),
    buyerCode: text(record?.investorCode),
    publishedAt: text(record?.publicDate || record?.originalPublicDate),
    bidCloseAt: text(record?.bidCloseDate),
    bidForm: text(record?.bidForm),
    bidPrice: Number.isFinite(price) ? price : 0,
    location: locations.join("; "),
    matchedKeywords: matched,
    sourceUrl: detail.toString(),
  };
  return { ...content, contentHash: stableHash(JSON.stringify(content)) };
}

export function diffOpenTenderNotices(records, previousState, generatedAt, isBaseline = false) {
  const previous = previousState?.seen && typeof previousState.seen === "object" ? previousState.seen : {};
  const next = { ...previous };
  const events = [];

  for (const notice of records) {
    if (!notice) continue;
    const old = previous[notice.noticeId];
    const event = old ? (old.contentHash !== notice.contentHash ? "updated" : "") : (isBaseline ? "" : "new");
    next[notice.noticeId] = { contentHash: notice.contentHash, lastSeenAt: generatedAt };
    if (event) events.push({
      ...notice,
      id: `${event}:${notice.noticeId}:${notice.contentHash}`,
      kind: event,
      detectedAt: generatedAt,
    });
  }

  for (const [id, value] of Object.entries(next)) {
    if (!value?.lastSeenAt || Date.parse(generatedAt) - Date.parse(value.lastSeenAt) > 120 * 24 * 60 * 60 * 1000) delete next[id];
  }

  return { seen: next, events };
}

function stableHash(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
