export const MARKET_OVERVIEW_SEARCH_SEEDS: Record<string, string[]> = {
  // Retrieval seeds intentionally create a superset. Product-name anchors are
  // included when portal configuration-field matching is incomplete; the full
  // approved keyword, confirmation, exclusion, and staff rules run after download.
  "Dao siêu âm": ["dao siêu âm"],
  "Dao hàn mạch": ["hàn mạch"],
  // Avoid the very broad `nội soi` request. Every accepted cartridge must
  // contain a cartridge anchor, and every accepted instrument must contain
  // one of the second confirmation-group phrases below.
  "Băng ghim nội soi": ["băng ghim", "băng đạn", "ghim khâu", "ghim nội soi"],
  "Dụng cụ khâu cắt nối nội soi": ["khâu cắt", "cắt khâu", "khâu nối", "nối khâu", "cắt nối", "nối cắt"],
  "Băng ghim mổ mở": ["mổ mở", "mổ hở"],
  "Dụng cụ khâu cắt nối mổ mở": ["mổ mở", "mổ hở"],
  "Dụng cụ khâu nối tròn": ["nối tròn", "nối vòng", "nối ống tiêu hóa tròn"],
  // Exact approved product anchors are faster and more reliable than the old
  // generic `khâu` and `phẫu thuật` searches, which returned large amounts of
  // unrelated equipment before the product rule could filter it.
  "Chỉ phẫu thuật": [
    "chỉ khâu",
    "chỉ phẫu thuật",
    "chỉ thép khâu",
    "chỉ tan",
    "chỉ tự tiêu",
    "chỉ không tiêu",
    "chỉ catgut",
    "chỉ silk",
    "chỉ nylon",
    "chỉ nilon",
    "chỉ prolene",
    "chỉ vicryl",
    "chỉ kháng khuẩn",
    "chỉ polyester",
  ],
  "Lưới thoát vị": ["thoát vị"],
  "Dụng cụ cố định lưới thoát vị": ["cố định lưới"],
  Trocar: ["trocar"],
  "Túi lấy bệnh phẩm": ["túi lấy bệnh phẩm", "túi đựng bệnh phẩm", "túi bệnh phẩm", "túi đựng mẫu bệnh phẩm"],
  "Túi bảo vệ vết thương": ["bảo vệ vết thương", "bảo vệ thành vết mổ", "wound protector", "vết rạch", "nong phẫu trường"],
  "Kẹp lưỡng cực": ["lưỡng cực"],
  "Tấm điện cực trung tính": ["trung tính"],
  "Tay dao mổ điện đơn cực": ["đơn cực"],
};
