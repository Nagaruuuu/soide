// TXT: decode UTF-8, strip BOM, chuẩn hóa xuống dòng. Không diễn giải nội dung.
import { extractError } from "./fileTypes.js";

export function extractTxt(buffer) {
  if (!buffer || buffer.length === 0) {
    throw extractError("EMPTY_FILE", "Tệp rỗng — không có nội dung để trích xuất.", 400);
  }
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw extractError("EXTRACT_FAILED", "File TXT không phải UTF-8 hợp lệ. Hãy lưu lại dưới dạng UTF-8.", 422);
  }
  // Strip BOM + chuẩn hóa \r\n/\r -> \n, giữ nguyên thứ tự dòng
  text = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // Giới hạn ký tự điều khiển (trừ \n \t) để tránh log/control-char injection
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  return { text, warnings: [] };
}
