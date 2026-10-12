// Upload memory-only: không lưu đĩa, chặn sớm theo dung lượng + đuôi file.
import multer from "multer";
import { fileLimits, bookLimits } from "../modules/extract/limits.js";

const ALLOWED = new Set([".docx", ".pdf", ".txt", ".pptx"]);

function fileFilter(_req, file, cb) {
  const name = String(file.originalname || "").toLowerCase();
  const ok = [...ALLOWED].some((ext) => name.endsWith(ext));
  if (!ok) {
    const e = new Error("Chỉ nhận file .docx/.pdf/.txt (pptx báo stub riêng).");
    e.code = "UNSUPPORTED_TYPE"; e.status = 415; e.retryable = false;
    return cb(e);
  }
  cb(null, true);
}

export function makeUploader(maxMb) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxMb * 1024 * 1024, files: 1, fields: 5 },
    fileFilter,
  }).single("file");
}

// Route trích đề nhanh: file đề thi thường nhỏ -> limit riêng thấp hơn để chống DoS RAM.
const _limits = fileLimits();
const _book = bookLimits();
const EXTRACT_MAX_MB = (() => {
  const v = Number(process.env.EXTRACT_MAX_MB);
  return Number.isFinite(v) && v > 0 ? Math.min(v, _limits.maxMb) : Math.min(5, _limits.maxMb);
})();

export const uploadSingle = makeUploader(_limits.maxMb);
export const uploadSmall = makeUploader(EXTRACT_MAX_MB);
// T14: route nạp SGK dùng limit SÁCH (mặc định 30MB), không dùng FILE_MAX_MB (10MB)
// vì 1 chương SGK PDF thường nặng hơn đề thi.
export const uploadBook = makeUploader(_book.maxMb);
export const EXTRACT_ROUTE_MAX_MB = EXTRACT_MAX_MB;
export const TEXTBOOK_ROUTE_MAX_MB = _book.maxMb;
