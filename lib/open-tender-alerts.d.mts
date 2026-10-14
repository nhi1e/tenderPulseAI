export type OpenTenderNotice = {
  noticeId: string;
  notifyId: string;
  notifyNo: string;
  title: string;
  buyer: string;
  buyerCode: string;
  publishedAt: string;
  bidCloseAt: string;
  bidForm: string;
  bidPrice: number;
  location: string;
  matchedKeywords: string[];
  sourceUrl: string;
  contentHash: string;
};
export type OpenTenderEvent = OpenTenderNotice & {
  id: string;
  kind: "new" | "updated";
  detectedAt: string;
};
export function normalizeSearchTerms(rules: Array<{ keywords?: string[] }>): string[];
export function buildOpenTenderSearchPayload(keyword: string, pageNumber: number, from: string, to: string): Array<Record<string, unknown>>;
export function normalizePortalNotice(record: Record<string, unknown>, matchedKeywords?: string[]): OpenTenderNotice | undefined;
export function diffOpenTenderNotices(records: OpenTenderNotice[], previousState: { seen?: Record<string, { contentHash?: string; lastSeenAt?: string }> } | undefined, generatedAt: string, isBaseline?: boolean): { seen: Record<string, { contentHash: string; lastSeenAt: string }>; events: OpenTenderEvent[] };
