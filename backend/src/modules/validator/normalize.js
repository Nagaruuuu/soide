// Chuẩn hóa text CHỈ để so sánh — không sửa nội dung gốc.
// Giống nhau sau chuẩn hóa => trùng; gần giống => warning, không tự kết luận.
export function normalizeText(s = "") {
  return String(s ?? "")
    .toLowerCase()
    .replace(/đ/g, "d") // đ không phân rã trong NFD nên map tay
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // bỏ dấu tiếng Việt để "Hà Nội" == "ha noi"
    .replace(/[“”"''`´]/g, "")
    .replace(/[^a-z0-9\s]/g, " ") // bỏ dấu câu
    .replace(/\s+/g, " ")
    .trim();
}

// Dấu vân tay của câu: nội dung + 4 lựa chọn đã chuẩn hóa.
export function questionFingerprint(q = {}) {
  return [q.content, q.opt_a, q.opt_b, q.opt_c, q.opt_d].map(normalizeText).join(" || ");
}

// Cosine trên túi từ (tái dùng cách làm của rules.js, độc lập module).
export function tokenCosine(a = "", b = "") {
  const ta = normalizeText(a).split(" ").filter(Boolean);
  const tb = normalizeText(b).split(" ").filter(Boolean);
  if (!ta.length || !tb.length) return 0;
  const fa = Object.create(null), fb = Object.create(null);
  for (const w of ta) fa[w] = (fa[w] || 0) + 1;
  for (const w of tb) fb[w] = (fb[w] || 0) + 1;
  let dot = 0;
  for (const w in fa) if (fb[w]) dot += fa[w] * fb[w];
  const na = Math.sqrt(Object.values(fa).reduce((s, x) => s + x * x, 0));
  const nb = Math.sqrt(Object.values(fb).reduce((s, x) => s + x * x, 0));
  return na && nb ? dot / (na * nb) : 0;
}

// Chuẩn hóa nhãn lựa chọn: "a." / "(B)" / "c)" -> "A"/"B"/"C".
export function normalizeLabel(raw = "") {
  const m = String(raw ?? "").trim().match(/^[(（]?([A-Za-z])[)）.\-:]/);
  return m ? m[1].toUpperCase() : null;
}
