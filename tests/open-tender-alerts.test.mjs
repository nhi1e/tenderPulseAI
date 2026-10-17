import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  buildOpenTenderSearchPayload,
  diffOpenTenderNotices,
  normalizePortalNotice,
  normalizeSearchTerms,
} from "../lib/open-tender-alerts.mjs";

const range = {
  from: "2026-10-07T00:00:00.000Z",
  to: "2026-10-14T00:00:00.000Z",
};
const collectorSource = await readFile(new URL("../scripts/sync-open-tender-alerts.mjs", import.meta.url), "utf8");

const portalRecord = {
  notifyNo: "IB2600123456",
  notifyId: "notice-id-1",
  notifyNoStand: "IB2600123456",
  bidName: "Mua sắm thiết bị phẫu thuật",
  investorName: "Bệnh viện A",
  investorCode: "vn123",
  publicDate: "2026-10-13T09:15:00",
  bidCloseDate: "2026-10-20T09:00:00",
  bidForm: "Đấu thầu rộng rãi",
  bidPrice: 120000000,
  locations: [{ districtName: "Quận 1", provName: "TP Hồ Chí Minh" }],
};

test("normalizes approved goods keywords and removes accent/case duplicates", () => {
  assert.deepEqual(normalizeSearchTerms([
    { keywords: [" Băng   ghim ", "dụng cụ khâu"] },
    { keywords: ["BANG GHIM", "Dụng cụ khâu"] },
  ]), ["Băng ghim", "dụng cụ khâu"]);
});

test("queries the official tender invitation goods field and open notices only", () => {
  const [body] = buildOpenTenderSearchPayload("dao siêu âm", 2, range.from, range.to);
  assert.equal(body.pageNumber, 2);
  assert.equal(body.query[0].index, "es-contractor-selection");
  assert.equal(body.query[0].keyWord, "dao siêu âm");
  assert.deepEqual(body.query[0].matchFields, ["goods"]);
  assert.deepEqual(body.query[0].filters[0], { fieldName: "type", searchType: "in", fieldValues: ["es-notify-contractor"] });
  assert.deepEqual(body.query[0].filters[1], { fieldName: "caseKHKQ", searchType: "not_in", fieldValues: ["1"] });
  assert.deepEqual(body.query[0].filters[3], { fieldName: "bidCloseDate", searchType: "range", from: range.to, to: null });
});

test("does not send the placeholder portal token or follow redirects that can turn POST into GET", () => {
  assert.match(collectorSource, /services\/smart\/search\?token=/);
  assert.doesNotMatch(collectorSource, /token=fake/i);
  assert.match(collectorSource, /method: "POST"/);
  assert.match(collectorSource, /redirect: "manual"/);
});

test("normalizes an open tender notice with buyer, dates, matched terms and portal link", () => {
  const notice = normalizePortalNotice(portalRecord, ["ghim khâu", "ghim khâu"]);
  assert.equal(notice.noticeId, "IB2600123456");
  assert.equal(notice.notifyNo, "IB2600123456");
  assert.equal(notice.title, "Mua sắm thiết bị phẫu thuật");
  assert.equal(notice.buyer, "Bệnh viện A");
  assert.deepEqual(notice.matchedKeywords, ["ghim khâu"]);
  assert.match(notice.sourceUrl, /notice-id-1/);
  assert.equal(normalizePortalNotice({ ...portalRecord, notifyNo: "" }), undefined);
});

test("baseline is silent; later scans report new and changed notices by content hash", () => {
  const notice = normalizePortalNotice(portalRecord, ["ghim khâu"]);
  const baseline = diffOpenTenderNotices([notice], undefined, "2026-10-13T10:00:00.000Z", true);
  assert.equal(baseline.events.length, 0);

  const unchanged = diffOpenTenderNotices([notice], { seen: baseline.seen }, "2026-10-14T10:00:00.000Z");
  assert.equal(unchanged.events.length, 0);

  const newNotice = normalizePortalNotice({ ...portalRecord, notifyNo: "IB2600654321", notifyNoStand: "IB2600654321", notifyId: "notice-id-2" }, ["dao mổ"]);
  const updatedNotice = normalizePortalNotice({ ...portalRecord, bidPrice: 150000000 }, ["ghim khâu"]);
  const next = diffOpenTenderNotices([newNotice, updatedNotice], { seen: baseline.seen }, "2026-10-15T10:00:00.000Z");
  assert.deepEqual(next.events.map((event) => event.kind).sort(), ["new", "updated"]);
});
