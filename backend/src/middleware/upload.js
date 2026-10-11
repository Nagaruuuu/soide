// Upload memory-only: không lưu đĩa, chặn sớm theo dung lượng + đuôi file.
import multer from "multer";

const MAX_MB = Number(process.env.FILE_MAX_MB || 10);
const ALLOWED = new Set([".docx", ".pdf", ".txt", ".pptx"]);

export const uploadSingle = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_MB * 1024 * 1024,
    files: 1,
    fields: 5,
  },
  fileFilter: (_req, file, cb) => {
    const name = String(file.originalname || "").toLowerCase();
    const ok = [...ALLOWED].some((ext) => name.endsWith(ext));
    if (!ok) {
      const e = new Error("Chỉ nhận file .docx/.pdf/.txt (pptx báo stub riêng).");
      e.code = "UNSUPPORTED_TYPE"; e.status = 415; e.retryable = false;
      return cb(e);
    }
    cb(null, true);
  },
}).single("file");
