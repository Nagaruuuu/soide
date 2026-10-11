// Facade trích xuất file -> JSON thống nhất. Thuần code, không AI, không gửi ra ngoài.
// { text, fileType, pageCount?, warnings[], metadata{} }
import { detectFileType, extractError } from "./fileTypes.js";
import { extractTxt } from "./txtExtractor.js";
import { extractDocx } from "./docxExtractor.js";
import { extractPdf } from "./pdfExtractor.js";
import { extractPptxStub, needsOcr, ocrStub } from "./stubs.js";

const MAX_TEXT_CHARS = 20000; // khớp giới hạn exam_text của POST /api/checks
const BOMB_RATIO = 5; // text bùng nổ >5x dung lượng file -> nghi zip-bomb

export function extractLimits() {
  return {
    maxMb: Number(process.env.FILE_MAX_MB || 10),
    maxPages: Number(process.env.FILE_MAX_PAGES || 50),
    maxBytes: Number(process.env.FILE_MAX_MB || 10) * 1024 * 1024,
  };
}

export async function extractFromBuffer(buffer, { originalName = "", mimetype = "" } = {}) {
  const { maxBytes, maxPages } = extractLimits();
  if (!buffer || buffer.length === 0) {
    throw extractError("EMPTY_FILE", "Tệp rỗng — không có nội dung để trích xuất.", 400);
  }
  if (buffer.length > maxBytes) {
    throw extractError("FILE_TOO_LARGE", `File vượt giới hạn ${extractLimits().maxMb}MB. Hãy tách nhỏ file.`, 413);
  }
  const detected = detectFileType({ buffer, originalName, mimetype });
  if (detected.fileType === "pptx") await extractPptxStub();
  if (!detected.supported) {
    throw extractError("UNSUPPORTED_TYPE", `Định dạng .${detected.ext || "?"} chưa hỗ trợ (chỉ .docx/.pdf/.txt).`, 415);
  }
  let out;
  if (detected.fileType === "txt") out = extractTxt(buffer);
  else if (detected.fileType === "docx") out = await extractDocx(buffer);
  else out = await extractPdf(buffer, { maxPages });

  let text = String(out.text ?? "");
  const warnings = [...(out.warnings ?? [])];

  // PDF scan: không có chữ -> stub OCR rõ ràng
  if (detected.fileType === "pdf" && needsOcr(text)) await ocrStub();

  if (!text.trim()) {
    throw extractError("NO_TEXT_EXTRACTED", "Không trích xuất được chữ nào từ file. File có thể rỗng hoặc là bản scan.", 422);
  }
  // Chống zip-bomb: text bùng nổ bất thường so với dung lượng
  if (text.length > buffer.length * BOMB_RATIO && text.length > 200000) {
    throw extractError("FILE_TOO_COMPLEX", "File quá phức tạp (nội dung bùng nổ). Hãy tách nhỏ file.", 413);
  }
  if (text.length > MAX_TEXT_CHARS) {
    warnings.push(`Đã cắt ở ${MAX_TEXT_CHARS.toLocaleString("vi-VN")} ký tự để vừa khung kiểm tra (bản đầy đủ giữ nguyên thứ tự).`);
    text = text.slice(0, MAX_TEXT_CHARS);
  }
  return {
    text,
    fileType: detected.fileType,
    ...(out.pageCount ? { pageCount: out.pageCount } : {}),
    warnings,
    metadata: {
      originalName,
      sizeBytes: buffer.length,
      ...(out.pageCount ? { pageCount: out.pageCount } : {}),
      truncated: text.length >= MAX_TEXT_CHARS,
      extractedAt: new Date().toISOString(),
    },
  };
}
