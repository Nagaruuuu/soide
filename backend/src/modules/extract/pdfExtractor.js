// PDF có text layer: pdf-parse (CJS) — BE là ESM nên require động.
// Giới hạn: PDF 2 cột/footnote có thể lộn thứ tự; PDF scan (0 text) -> NO_TEXT_EXTRACTED.
import { createRequire } from "node:module";
import { extractError } from "./fileTypes.js";
import { fileLimits } from "./limits.js";

const require = createRequire(import.meta.url);
// eslint-disable-next-line import/no-commonjs
const pdfParse = require("pdf-parse");

// Đếm nhanh số trang bằng regex trên buffer thô (không inflate, không parse).
// Heuristic ước lượng trên để từ chối sớm; con số chính xác vẫn do pdf.js quyết định sau.
export function quickPageCount(buffer) {
  const ascii = buffer.toString("latin1");
  const m = ascii.match(/\/Type\s*\/Page(?!s)/g);
  return m ? m.length : 0;
}

export async function extractPdf(buffer, { maxPages, timeoutMs } = {}) {
  const limits = fileLimits();
  const maxP = maxPages ?? limits.maxPages;
  const ms = timeoutMs ?? limits.extractTimeoutMs;
  if (!buffer || buffer.length === 0) {
    throw extractError("EMPTY_FILE", "Tệp rỗng — không có nội dung để trích xuất.", 400);
  }
  // P0-3: từ chối sớm PDF quá dày TRƯỚC khi pdf.js tốn CPU/RAM
  const est = quickPageCount(buffer);
  if (est > maxP * 2) {
    throw extractError("TOO_MANY_PAGES", `PDF ước lượng hơn ${est} trang, vượt giới hạn ${maxP} trang. Hãy tách file.`, 413);
  }
  // pdf.js (makeSubStream) dùng bytes.buffer mà bỏ qua byteOffset:
  // Buffer nhỏ (<~4KB) nằm chung pool nên đọc lệch -> 'bad XRef entry'.
  // Copy sang ArrayBuffer mới (offset 0) trước khi parse.
  const bytes = new Uint8Array(buffer);
  let timer;
  const run = pdfParse(bytes);
  // P0-4: promise nền phải có catch để không thành unhandledRejection khi timeout thắng
  run.catch(() => {});
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      console.error(`[extract] PDF timeout sau ${ms}ms (tác vụ nền vẫn chạy, đã tách handler).`);
      reject(extractError("EXTRACT_FAILED", "Trích xuất PDF quá lâu (timeout).", 500, true));
    }, ms);
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
  if (pageCount > maxP) {
    throw extractError("TOO_MANY_PAGES", `PDF có ${pageCount} trang, vượt giới hạn ${maxP} trang. Hãy tách file.`, 413);
  }
  const text = String(data?.text ?? "").replace(/\r\n/g, "\n").trim();
  const warnings = [
    // P0-7: cảnh báo thứ tự mặc định cho mọi PDF (trừ khi chắc chắn 1 cột — chưa detect được nên luôn warn)
    "Thứ tự câu/chữ trong PDF có thể bị xáo trộn (2 cột, bảng, header/footer, footnote). Đối chiếu lại với file gốc trước khi chốt.",
  ];
  if (pageCount > 10) warnings.push(`PDF dài ${pageCount} trang — nguy cơ xáo trộn thứ tự cao hơn.`);
  return { text, pageCount, warnings };
}
