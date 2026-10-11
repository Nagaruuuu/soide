// PDF có text layer: pdf-parse (CJS) — BE là ESM nên require động.
// Giới hạn: PDF 2 cột/footnote có thể lộn thứ tự; PDF scan (0 text) -> NO_TEXT_EXTRACTED.
import { createRequire } from "node:module";
import { extractError } from "./fileTypes.js";

const require = createRequire(import.meta.url);
// eslint-disable-next-line import/no-commonjs
const pdfParse = require("pdf-parse");

export async function extractPdf(buffer, { maxPages = 50, timeoutMs = 15000 } = {}) {
  if (!buffer || buffer.length === 0) {
    throw extractError("EMPTY_FILE", "Tệp rỗng — không có nội dung để trích xuất.", 400);
  }
  // pdf.js (makeSubStream) dùng bytes.buffer mà bỏ qua byteOffset:
  // Buffer nhỏ (<~4KB) nằm chung pool nên đọc lệch -> 'bad XRef entry'.
  // Copy sang ArrayBuffer mới (offset 0) trước khi parse.
  const bytes = new Uint8Array(buffer);
  let timer;
  const run = pdfParse(bytes);
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(extractError("EXTRACT_FAILED", "Trích xuất PDF quá lâu (timeout).", 500, true)), timeoutMs);
  });
  let data;
  try {
    data = await Promise.race([run, timeout]);
  } catch (e) {
    if (e?.code) throw e;
    throw extractError("EXTRACT_FAILED", "Không đọc được file PDF. File có thể bị hỏng hoặc đặt mật khẩu.", 422);
  } finally {
    clearTimeout(timer);
  }
  const pageCount = Number(data?.numpages ?? 0) || 0;
  if (pageCount > maxPages) {
    throw extractError("TOO_MANY_PAGES", `PDF có ${pageCount} trang, vượt giới hạn ${maxPages} trang. Hãy tách file.`, 413);
  }
  const text = String(data?.text ?? "").replace(/\r\n/g, "\n").trim();
  const warnings = [];
  if (pageCount > 10) warnings.push(`PDF dài ${pageCount} trang — thứ tự cột/ghi chú cuối trang có thể bị xáo trộn.`);
  return { text, pageCount, warnings };
}
