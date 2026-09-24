# TenderPulse classification data

The active rules began with `rule_phan_nhom_san_pham_10_9.xlsx` and now include the completed staff review in `TenderPulseAI_staff_rule_review_23.9.xlsx` (version 2026-09-23).

- `classification-rules.json` contains 16 ordered product rules and 107 approved keyword phrases.
- `staff-classification-overrides.json` contains all 167 rows from `01_Trùng rule`: 137 confirmed classifications, 26 explicit dashboard exclusions, and 4 unresolved records held for review.
- `manufacturer-mapping.json` contains the 321 non-empty rows from the manufacturer-conversion sheet. Four source rows have no target and therefore remain unchanged.

## Product classification

A portal row is counted only when:

1. `Tên thiết bị` contains at least one phrase from the rule's keyword basket.
2. A phrase from the Confirmation basket appears in `Tên thiết bị`, `Nhãn hiệu`, or `Cấu hình kỹ thuật` when the rule requires confirmation.
3. No exclusion matches its specified field and match mode.

Text is normalized to Unicode NFC, lowercased, stripped of line breaks and repeated spaces, and compared with Vietnamese diacritics preserved. An exact staff decision identified by the portal row ID takes precedence. For records without an exact decision, the system evaluates every rule and accepts the row only when exactly one rule matches. A row matching several rules is kept out of KPI calculations until staff confirms it; the system no longer lets the first rule silently win.

The 23.9 review also adds the approved Endo/Open/Hernia exclusions, the `cắt nối` and `khâu nối` confirmations, the Trocar `đóng lỗ` exclusion, and the additional Suture exclusions. The four incomplete staff rows remain in `review` status and are intentionally not guessed.

## Manufacturer conversion

The full normalized `Hãng sản xuất` value is matched against the source column. When a source name appears more than once, the last populated mapping row wins. Known spelling and punctuation variants are grouped for reporting, including Covidien/Coviden/Covididen under Medtronic and Ethicon/Johnson variants under Johnson & Johnson.

All dashboard KPIs and exports use the product classification result and the converted company name. The original manufacturer field remains available in detailed Excel exports for traceability. Date filters use `Ngày ban hành quyết định`, as confirmed by staff, while exports retain both the decision date and publication date.

KQLCNT is counted from an explicit result identifier when the portal provides one. When that field is absent, the stable fallback is `Mã TBMT + Số quyết định + Ngày ban hành quyết định`; this avoids treating every product row as a separate result while also avoiding a TBMT-only undercount when several result decisions exist.

## Hospital identity

`hospital-names-by-buyer-id.json` contains 693 buyer IDs from the 2026-09-11 hospital-review sheet where one buyer ID had multiple portal names. The display names are provisional proposals from that sheet, **not staff-approved names**. Award rows sharing a populated `Mã định danh CĐT` are grouped under that ID; without an ID, only names matching after basic case/spacing/diacritic normalization are grouped. Different IDs are never joined merely because the names resemble each other. The 72 cases with similar names and different IDs remain separate until reviewed.

Hospital search suggestions display their buyer ID and a selected suggestion searches by ID, so the portal can return all naming variants. Detailed Excel files retain `Tên CĐT` exactly as reported by the portal and add a separate grouped display-name column. Update the proposed names in this JSON file when the team confirms corrections; the buyer ID remains the stable identity.
# Manufacturer alias normalization

`manufacturer-aliases.json` contains the 749 spelling clusters from sheet
`05_Hãng chưa mapping` of the staff review workbook dated 23 September 2026.
Punctuation, spacing, capitalization and occurrence-count variants share one
canonical manufacturer name. The original manufacturer master still takes
precedence for confirmed parent-company mappings such as Covidien → Medtronic
and Ethicon → Johnson & Johnson.

Rows containing several independent manufacturers remain a composite canonical
label until item-level source data can separate them. They are not assigned to
one constituent company merely because that company appears first.
