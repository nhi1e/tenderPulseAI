export const MARKET_OVERVIEW_SEARCH_SEEDS: Record<string, string[]> = {
  // Rules with Confirmation use every confirmation phrase as a retrieval seed.
  // This produces a superset because Confirmation may occur in the product name,
  // brand, or technical configuration; the complete rule is applied after download.
  "Dao siêu âm": ["siêu âm"],
  "Dao hàn mạch": ["hàn mạch"],
  "Băng ghim nội soi": ["nội soi"],
  "Dụng cụ khâu cắt nối nội soi": ["nội soi"],
  "Băng ghim mổ mở": ["mổ mở", "mổ hở"],
  "Dụng cụ khâu cắt nối mổ mở": ["mổ mở", "mổ hở"],
  "Dụng cụ khâu nối tròn": ["nối tròn", "nối vòng", "nối ống tiêu hóa tròn"],
  "Chỉ phẫu thuật": ["khâu", "phẫu thuật"],
  "Lưới thoát vị": ["thoát vị"],
  "Dụng cụ cố định lưới thoát vị": ["cố định lưới"],
  Trocar: ["trocar"],
  "Túi lấy bệnh phẩm": ["túi lấy bệnh phẩm", "túi đựng bệnh phẩm", "túi bệnh phẩm", "túi đựng mẫu bệnh phẩm"],
  "Túi bảo vệ vết thương": ["bảo vệ vết thương", "bảo vệ thành vết mổ", "wound protector", "vết rạch", "nong phẫu trường"],
  "Kẹp lưỡng cực": ["lưỡng cực"],
  "Tấm điện cực trung tính": ["trung tính"],
  "Tay dao mổ điện đơn cực": ["đơn cực"],
};
