// Chia text thành đoạn ~400-600 ký tự theo ranh đoạn văn (không cắt giữa câu
// nếu được). Giữ thứ tự gốc để trích dẫn đúng ngữ cảnh.
import { createHash } from "node:crypto";

const TARGET = 500;
const MAX = 700;

export function splitParagraphs(text = "") {
  return String(text ?? "")
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

// Cắt đoạn dài quá MAX tại ranh câu (.!?); bí quá mới cắt cứng.
function splitLong(para) {
  if (para.length <= MAX) return [para];
  const out = [];
  const sentences = para.match(/[^.!?]+[.!?]+["”)]?\s*|[^.!?]+$/g) || [para];
  let cur = "";
  for (const s of sentences) {
    if ((cur + " " + s).trim().length > MAX && cur) { out.push(cur.trim()); cur = s; }
    else cur = (cur + " " + s).trim();
    if (cur.length > MAX) { out.push(cur.slice(0, MAX).trim()); cur = cur.slice(MAX).trim(); }
  }
  if (cur) out.push(cur.trim());
  return out.filter(Boolean);
}

export function chunkText(text = "") {
  const chunks = [];
  let cur = "";
  const flush = () => { if (cur.trim()) chunks.push(cur.trim()); cur = ""; };
  for (const para of splitParagraphs(text)) {
    for (const piece of splitLong(para)) {
      if (!cur) cur = piece;
      else if ((cur + " " + piece).length <= TARGET + 100) cur += " " + piece;
      else { flush(); cur = piece; }
      if (cur.length >= TARGET) flush();
    }
  }
  flush();
  return chunks;
}

export function sha256norm(s = "") {
  const norm = String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  return createHash("sha256").update(norm, "utf8").digest("hex");
}
