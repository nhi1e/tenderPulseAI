# TenderPulse classification data

The active rules were transcribed from `rule_phan_nhom_san_pham_10_9.xlsx` (version 2026-09-10).

- `classification-rules.json` contains 16 ordered product rules and 107 approved keyword phrases.
- `manufacturer-mapping.json` contains the 321 non-empty rows from the manufacturer-conversion sheet. Four source rows have no target and therefore remain unchanged.

## Product classification

A portal row is counted only when:

1. `Tên thiết bị` contains at least one phrase from the rule's keyword basket.
2. A phrase from the Confirmation basket appears in `Tên thiết bị`, `Nhãn hiệu`, or `Cấu hình kỹ thuật` when the rule requires confirmation.
3. No exclusion matches its specified field and match mode.

Text is normalized to Unicode NFC, lowercased, stripped of line breaks and repeated spaces, and compared with Vietnamese diacritics preserved. Rules are evaluated in workbook order, which ensures `Dao siêu âm` is classified before `Dao hàn mạch`.

## Manufacturer conversion

The full normalized `Hãng sản xuất` value is matched against the source column. When a source name appears more than once, the last populated mapping row wins. Known spelling and punctuation variants are grouped for reporting, including Covidien/Coviden/Covididen under Medtronic and Ethicon/Johnson variants under Johnson & Johnson.

All dashboard KPIs and exports use the product classification result and the converted company name. The original manufacturer field remains available in detailed Excel exports for traceability.
