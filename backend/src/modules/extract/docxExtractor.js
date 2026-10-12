// DOCX: mammoth extractRawText — giữ thứ tự đoạn văn + bảng ở mức text thô.
// Giới hạn đã biết: công thức OMML thành text phẳng, ảnh bị bỏ qua, merge-cell mất cấu trúc.
import mammoth from "mammoth";
import { extractError } from "./fileTypes.js";
import { guardZipBomb } from "./zipGuard.js";
import { fileLimits } from "./limits.js";

export async function extractDocx(buffer, { timeoutMs } = {}) {
  if (!buffer || buffer.length === 0) {
    throw extractError("EMPTY_FILE", "Tệp rỗng — không có nội dung để trích xuất.", 400);
  }
  const limits = fileLimits();
  const ms = timeoutMs ?? limits.extractTimeoutMs;
  // P0-1: chặn zip-bomb theo central directory TRƯỚC khi mammoth inflate RAM
  guardZipBomb(buffer, limits);
  let timer;
  const run = mammoth.extractRawText({ buffer });
  // P0-4: promise nền phải có catch để không thành unhandledRejection khi timeout thắng
  run.catch(() => {});
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      console.error(`[extract] DOCX timeout sau ${ms}ms (tác vụ nền vẫn chạy, đã tách handler).`);
      reject(extractError("EXTRACT_FAILED", "Trích xuất DOCX quá lâu (timeout). File có thể quá phức tạp.", 500, true));
    }, ms);
  });
  let result;
  try {
    result = await Promise.race([run, timeout]);
  } catch (e) {
    if (e?.code) throw e;
    throw extractError("EXTRACT_FAILED", "Không đọc được file DOCX. File có thể bị hỏng hoặc đặt mật khẩu.", 422);
  } finally {
    clearTimeout(timer);
  }
  const text = String(result?.value ?? "").replace(/\r\n/g, "\n").trim();
  const warnings = [];
  for (const m of result?.messages ?? []) {
    if (m?.message) warnings.push(`DOCX: ${m.message}`);
  }
  // mammoth bỏ ảnh: báo rõ để GV biết
  warnings.push("Ảnh/công thức trong DOCX chỉ trích xuất ở dạng text thô hoặc bị bỏ qua.");
  return { text, warnings };
}
