// Facade trích xuất file -> JSON thống nhất. Thuần code, không AI, không gửi ra ngoài.
// { text, fileType, pageCount?, warnings[], metadata{} }
import { detectFileType, extractError } from "./fileTypes.js";
import { extractTxt } from "./txtExtractor.js";
import { extractDocx } from "./docxExtractor.js";
import { extractPdf } from "./pdfExtractor.js";
import { extractPptxStub, needsOcr, ocrStub } from "./stubs.js";
import { fileLimits, bookLimits } from "./limits.js";
import { createHash } from "node:crypto";

const MAX_TEXT_CHARS = 20000; // đề thi: khớp giới hạn exam_text của POST /api/checks

// P0-6: cắt theo ranh câu/đoạn gần nhất DƯỚI ngưỡng, không cắt giữa câu/đáp án.
export function cutAtBoundary(text, max = MAX_TEXT_CHARS) {
  if (text.length <= max) return { text, cut: false };
  const window = text.slice(Math.max(0, max - 500), max);
  const marks = [...window.matchAll(/([.!?…]\s+|\n\s*\n)/g)];
  const cutAt = marks.length
    ? Math.max(0, max - 500) + marks[marks.length - 1].index + marks[marks.length - 1][0].length
    : max;
  return { text: text.slice(0, cutAt).trimEnd(), cut: true, cutAt };
}

export function extractLimits() {
  // Giữ tương thích ngược — logic mới dùng fileLimits() từ limits.js.
  return fileLimits();
}

// T14: `profile: "exam" | "book"` chọn bộ giới hạn. Mặc định "exam" (20k ký tự)
// để mọi đường cũ giữ nguyên hành vi; ingest SGK gọi profile "book" (300k).
export async function extractFromBuffer(buffer, { originalName = "", mimetype = "", profile = "exam", limits: limitsOverride } = {}) {
  const isBook = profile === "book";
  const limits = limitsOverride || (isBook ? bookLimits() : fileLimits());
  const maxChars = isBook ? limits.maxChars : MAX_TEXT_CHARS;
  const { maxBytes, maxPages } = limits;
  if (!buffer || buffer.length === 0) {
    throw extractError("EMPTY_FILE", "Tệp rỗng — không có nội dung để trích xuất.", 400);
  }
  if (buffer.length > maxBytes) {
    throw extractError("FILE_TOO_LARGE", `File vượt giới hạn ${limits.maxMb}MB. Hãy tách nhỏ file.`, 413);
  }
  const detected = detectFileType({ buffer, originalName, mimetype });
  if (detected.fileType === "pptx") await extractPptxStub();
  if (!detected.supported) {
    throw extractError("UNSUPPORTED_TYPE", `Định dạng .${detected.ext || "?"} chưa hỗ trợ (chỉ .docx/.pdf/.txt).`, 415);
  }
  let out;
  if (detected.fileType === "txt") out = extractTxt(buffer);
  else if (detected.fileType === "docx") out = await extractDocx(buffer);
  else out = await extractPdf(buffer, { maxPages, timeoutMs: limits.extractTimeoutMs });

  let text = String(out.text ?? "");
  const warnings = [...(out.warnings ?? [])];

  // PDF scan: không có chữ -> stub OCR rõ ràng
  if (detected.fileType === "pdf" && needsOcr(text)) await ocrStub();

  if (!text.trim()) {
    throw extractError("NO_TEXT_EXTRACTED", "Không trích xuất được chữ nào từ file. File có thể rỗng hoặc là bản scan.", 422);
  }
  // Hash toàn văn TRƯỚC khi cắt — dedup theo nội dung thật, không theo bản cắt.
  const fullHash = createHash("sha256").update(text, "utf8").digest("hex");
  const fullLength = text.length;
  let truncatedAt = null;
  if (text.length > maxChars) {
    // P0-6: cắt theo ranh câu/đoạn, không cắt giữa câu/đáp án
    const cut = cutAtBoundary(text, maxChars);
    text = cut.text;
    truncatedAt = cut.cutAt;
    warnings.push(`Đã cắt ở ~${maxChars.toLocaleString("vi-VN")} ký tự theo ranh câu để vừa khung kiểm tra (phần sau bị bỏ, không suy diễn thêm).`);
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
      truncated: truncatedAt !== null,
      ...(truncatedAt !== null ? { truncatedAt, fullLength } : {}),
      fullHash,
      extractedAt: new Date().toISOString(),
    },
  };
}
