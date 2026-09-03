import keywordMasterJson from "@/data/keyword-master.json";

import {
	collectWinningBids,
	type WinningBidFilters,
	type WinningBidRecord,
} from "@/lib/winning-bids";

export const SUB_OU_ORDER = [
	"VS&D",
	"Endo Stapling",
	"Open Stapling",
	"Hernia",
	"Suture",
	"A&I",
	"ES",
] as const;

export type SubOuName = (typeof SUB_OU_ORDER)[number];

export type KeywordRule = {
	id: number;
	subOu: string;
	productGroup: string;
	keyword: string;
	excludes: string[];
	note: string;
};

export type OverviewFilters = WinningBidFilters & {
	subOu?: string;
	productGroup?: string;
};

export type OverviewNamedValue = {
	name: string;
	value: number;
	units: number;
};

export type OverviewHospital = OverviewNamedValue & {
	products: number;
	tenders: number;
};

export type OverviewTender = {
	id: string;
	hospital: string;
	value: number;
	products: number;
};

export type OverviewSubOu = {
	name: string;
	marketSize: number;
	totalUnits: number;
	medtronicValue: number;
	medtronicUnits: number;
	medtronicValueShare: number;
	medtronicUnitShare: number;
	tenderCount: number;
	hospitalCount: number;
	productCount: number;
	competitors: OverviewNamedValue[];
	hospitals: OverviewHospital[];
	suppliers: OverviewNamedValue[];
	tenders: OverviewTender[];
	sourceRecords: number;
	sourceTotalElements: number;
	truncated: boolean;
	failedQueries: string[];
};

type ClassifiedRecord = {
	record: WinningBidRecord;
	rule: KeywordRule;
};

const keywordRules = keywordMasterJson as KeywordRule[];

// Portal search seeds keep the live request set bounded. Every returned record is
// then checked against all 196 approved include/exclude rules before aggregation.
const GROUP_SEARCH_SEEDS: Record<string, string[]> = {
	"Dao siêu âm": ["dao siêu âm"],
	"Dao hàn mạch": ["hàn mạch", "hàn mô"],
	"Dụng cụ khâu cắt nối nội soi": [
		"khâu cắt nối nội soi",
		"cắt khâu nối nội soi",
		"khâu cắt nội soi",
		"cắt khâu nội soi",
		"khâu nối nội soi",
	],
	"Băng ghim nội soi": [
		"băng ghim nội soi",
		"băng đạn nội soi",
		"reload nội soi",
		"cartridge nội soi",
	],
	"Dụng cụ khâu cắt nối mổ mở": [
		"khâu cắt nối mổ mở",
		"cắt khâu nối mổ mở",
		"khâu nối mổ mở",
		"khâu cắt mổ mở",
		"cắt nối mổ mở",
		"khâu thẳng mổ mở",
	],
	"Băng ghim mổ mở": [
		"băng ghim mổ mở",
		"băng đạn mổ mở",
		"ghim khâu máy mổ mở",
	],
	"Khâu nối tròn/vòng": ["khâu nối tròn", "khâu cắt nối tròn", "khâu nối vòng"],
	"Lưới thoát vị": ["lưới thoát vị", "mảnh ghép thoát vị"],
	"Dụng cụ cố định lưới thoát vị": [
		"cố định lưới thoát vị",
		"ghim cố định lưới",
	],
	"Chỉ phẫu thuật": [
		"chỉ phẫu thuật",
		"chỉ khâu",
		"chỉ tan",
		"chỉ không tan",
		"chỉ tiêu",
		"chỉ không tiêu",
	],
	Trocar: ["trocar"],
	"Túi đựng bệnh phẩm": [
		"túi đựng bệnh phẩm",
		"túi bệnh phẩm",
		"túi lấy bệnh phẩm",
		"túi thu hồi bệnh phẩm",
		"dụng cụ lấy bệnh phẩm",
	],
	"Túi bảo vệ vết mổ": [
		"bảo vệ vết mổ",
		"bảo vệ thành vết mổ",
		"bảo vệ nong vết mổ",
	],
	"Đơn cực": ["đơn cực"],
	"Kẹp lưỡng cực": ["lưỡng cực"],
	"Tấm điện cực trung tính": [
		"điện cực trung tính",
		"bản cực trung tính",
		"tấm lót điện cực thu hồi",
		"thu hồi điện cực",
	],
};

export function normalizeSearchText(value: string) {
	return value
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[đĐ]/g, "d")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase();
}

export function getKeywordCatalog() {
	return SUB_OU_ORDER.map((subOu) => ({
		subOu,
		productGroups: [
			...new Set(
				keywordRules
					.filter((rule) => rule.subOu === subOu)
					.map((rule) => rule.productGroup),
			),
		],
		keywords: keywordRules
			.filter((rule) => rule.subOu === subOu)
			.map((rule) => rule.keyword),
	}));
}

function searchableText(record: WinningBidRecord) {
	return normalizeSearchText(
		[
			record.tenThietBi,
			record.kyMaHieu,
			record.nhanHieu,
			record.hangSanXuat,
			record.chungLoai,
			record.cauHinh,
		]
			.filter(Boolean)
			.join(" | "),
	);
}

function classifyRecord(record: WinningBidRecord) {
	const text = searchableText(record);
	if (!text) return undefined;

	return keywordRules
		.filter((rule) => {
			const keyword = normalizeSearchText(rule.keyword);
			if (!text.includes(keyword)) return false;
			return !rule.excludes.some((exclude) =>
				text.includes(normalizeSearchText(exclude)),
			);
		})
		.sort((left, right) => right.keyword.length - left.keyword.length)[0];
}

function toNumber(value: unknown) {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	const source = String(value ?? "")
		.trim()
		.replace(/\s/g, "");
	if (!source) return 0;
	if (/^-?\d{1,3}([.,]\d{3})+$/.test(source))
		return Number(source.replace(/[.,]/g, "")) || 0;
	return Number(source.replace(",", ".")) || 0;
}

function quantityOf(record: WinningBidRecord) {
	return toNumber(record.khoiLuongDouble ?? record.khoiLuong);
}

function valueOf(record: WinningBidRecord) {
	return quantityOf(record) * toNumber(record.donGia ?? record.donGiaDuThau);
}

function listText(value: string[] | string | undefined) {
	return Array.isArray(value) ? value.filter(Boolean).join("; ") : value || "";
}

function companyOf(record: WinningBidRecord) {
	const text = searchableText(record);
	if (/covidien|coviden|medtronic|ligasure/.test(text)) return "Medtronic";
	if (/johnson.{0,5}johnson|ethicon|harmonic/.test(text))
		return "Johnson & Johnson / Ethicon";
	if (/b[. ]?braun|aesculap/.test(text)) return "B. Braun / Aesculap";
	if (/boston scientific/.test(text)) return "Boston Scientific";
	if (/applied medical|applied/.test(text)) return "Applied Medical";
	if (/olympus/.test(text)) return "Olympus";
	if (/miconvey/.test(text)) return "Miconvey";
	if (/innolcon/.test(text)) return "Innolcon";
	return record.hangSanXuat?.trim() || "Chưa xác định";
}

function recordKey(record: WinningBidRecord) {
	return (
		record.id ||
		[
			record.maTbmt,
			record.tenThietBi,
			record.kyMaHieu,
			record.chungLoai,
			record.donGia ?? record.donGiaDuThau,
			listText(record.winningName),
			record.tenCdtBmt,
		]
			.map((value) => normalizeSearchText(String(value ?? "")))
			.join("::")
	);
}

function productKey(record: WinningBidRecord) {
	return normalizeSearchText(
		record.kyMaHieu ||
			record.chungLoai ||
			record.nhanHieu ||
			record.tenThietBi ||
			recordKey(record),
	);
}

function addNamedValue(
	map: Map<string, OverviewNamedValue>,
	name: string,
	record: WinningBidRecord,
) {
	const key = name.trim() || "Chưa xác định";
	const current = map.get(key) || { name: key, value: 0, units: 0 };
	current.value += valueOf(record);
	current.units += quantityOf(record);
	map.set(key, current);
}

async function collectSeeds(seeds: string[], filters: WinningBidFilters) {
	const records = new Map<string, WinningBidRecord>();
	const failedQueries: string[] = [];
	let sourceTotalElements = 0;
	let truncated = false;

	// Three at a time avoids hammering the public portal while keeping the page usable.
	for (let start = 0; start < seeds.length; start += 3) {
		const batch = seeds.slice(start, start + 3);
		const results = await Promise.allSettled(
			batch.map((seed) => collectWinningBids(seed, filters)),
		);

		results.forEach((result, index) => {
			const seed = batch[index];
			if (result.status === "rejected") {
				failedQueries.push(seed);
				return;
			}
			sourceTotalElements += result.value.totalElements;
			truncated ||= result.value.truncated;
			result.value.records.forEach((record) =>
				records.set(recordKey(record), record),
			);
		});
	}

	return {
		records: [...records.values()],
		sourceTotalElements,
		truncated,
		failedQueries,
	};
}

export async function buildMarketOverviewSlice(
	subOu: string,
	filters: OverviewFilters,
): Promise<OverviewSubOu> {
	const requestedRules = keywordRules.filter(
		(rule) =>
			rule.subOu === subOu &&
			(!filters.productGroup ||
				filters.productGroup === "all" ||
				rule.productGroup === filters.productGroup),
	);
	const productGroups = [
		...new Set(requestedRules.map((rule) => rule.productGroup)),
	];
	const seeds = [
		...new Set(
			productGroups.flatMap((group) => GROUP_SEARCH_SEEDS[group] || [group]),
		),
	];
	const portalFilters: WinningBidFilters = {
		dateFrom: filters.dateFrom,
		dateTo: filters.dateTo,
		hospital: filters.hospital,
		company: filters.company,
	};
	const source = await collectSeeds(seeds, portalFilters);
	const classified: ClassifiedRecord[] = [];

	source.records.forEach((record) => {
		const rule = classifyRecord(record);
		if (
			!rule ||
			rule.subOu !== subOu ||
			!productGroups.includes(rule.productGroup)
		)
			return;
		classified.push({ record, rule });
	});

	const companyTotals = new Map<string, OverviewNamedValue>();
	const supplierTotals = new Map<string, OverviewNamedValue>();
	const hospitalTotals = new Map<
		string,
		OverviewHospital & { productKeys: Set<string>; tenderKeys: Set<string> }
	>();
	const tenderTotals = new Map<
		string,
		OverviewTender & { productKeys: Set<string> }
	>();
	const allProducts = new Set<string>();
	const allTenders = new Set<string>();
	let marketSize = 0;
	let totalUnits = 0;
	let medtronicValue = 0;
	let medtronicUnits = 0;

	classified.forEach(({ record }) => {
		const value = valueOf(record);
		const units = quantityOf(record);
		const company = companyOf(record);
		const product = productKey(record);
		const hospital = record.tenCdtBmt?.trim() || "Chưa xác định";
		const tender = record.maTbmt?.trim() || `Không có mã · ${hospital}`;
		marketSize += value;
		totalUnits += units;
		allProducts.add(product);
		allTenders.add(tender);
		addNamedValue(companyTotals, company, record);
		addNamedValue(supplierTotals, listText(record.winningName), record);

		if (company === "Medtronic") {
			medtronicValue += value;
			medtronicUnits += units;
		}

		const hospitalEntry = hospitalTotals.get(hospital) || {
			name: hospital,
			value: 0,
			units: 0,
			products: 0,
			tenders: 0,
			productKeys: new Set<string>(),
			tenderKeys: new Set<string>(),
		};
		hospitalEntry.value += value;
		hospitalEntry.units += units;
		hospitalEntry.productKeys.add(product);
		hospitalEntry.tenderKeys.add(tender);
		hospitalTotals.set(hospital, hospitalEntry);

		const tenderEntry = tenderTotals.get(tender) || {
			id: tender,
			hospital,
			value: 0,
			products: 0,
			productKeys: new Set<string>(),
		};
		tenderEntry.value += value;
		tenderEntry.productKeys.add(product);
		tenderTotals.set(tender, tenderEntry);
	});

	const hospitals = [...hospitalTotals.values()]
		.map(({ productKeys, tenderKeys, ...entry }) => ({
			...entry,
			products: productKeys.size,
			tenders: tenderKeys.size,
		}))
		.sort((left, right) => right.value - left.value);
	const tenders = [...tenderTotals.values()]
		.map(({ productKeys, ...entry }) => ({
			...entry,
			products: productKeys.size,
		}))
		.sort((left, right) => right.value - left.value);
	const competitors = [...companyTotals.values()]
		.filter(
			(entry) => entry.name !== "Medtronic" && entry.name !== "Chưa xác định",
		)
		.sort((left, right) => right.value - left.value)
		.slice(0, 3);

	return {
		name: subOu,
		marketSize,
		totalUnits,
		medtronicValue,
		medtronicUnits,
		medtronicValueShare: marketSize ? (medtronicValue / marketSize) * 100 : 0,
		medtronicUnitShare: totalUnits ? (medtronicUnits / totalUnits) * 100 : 0,
		tenderCount: allTenders.size,
		hospitalCount: hospitals.filter((entry) => entry.name !== "Chưa xác định")
			.length,
		productCount: allProducts.size,
		competitors,
		hospitals,
		suppliers: [...supplierTotals.values()].sort(
			(left, right) => right.value - left.value,
		),
		tenders,
		sourceRecords: source.records.length,
		sourceTotalElements: source.sourceTotalElements,
		truncated: source.truncated,
		failedQueries: source.failedQueries,
	};
}
