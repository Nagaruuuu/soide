// POST /api/files/extract — trích xuất text thuần code, không AI, không gửi ra ngoài.
import { Router } from "express";
import { uploadSingle } from "../middleware/upload.js";
import { extractFromBuffer } from "../modules/extract/extract.js";
import { detectFileType } from "../modules/extract/fileTypes.js";

const r = Router();

r.post("/files/extract", (req, res, next) => {
  uploadSingle(req, res, async (multerErr) => {
    try {
      if (multerErr) {
        if (multerErr.code === "LIMIT_FILE_SIZE") {
          const maxMb = Number(process.env.FILE_MAX_MB || 10);
          return res.status(413).json({ error_code: "FILE_TOO_LARGE", message_vi: `File vượt giới hạn ${maxMb}MB. Hãy tách nhỏ file.`, retryable: false });
        }
        if (multerErr.code === "LIMIT_UNEXPECTED_FILE") {
          return res.status(400).json({ error_code: "EMPTY_FILE", message_vi: "Chưa chọn file (field `file`).", retryable: false });
        }
        if (String(multerErr.code || "").startsWith("LIMIT_")) {
          return res.status(413).json({ error_code: "FILE_TOO_LARGE", message_vi: "File gửi lên vượt giới hạn cho phép.", retryable: false });
        }
        return next(multerErr);
      }
      if (!req.file?.buffer) {
        const e = new Error("Chưa chọn file (field `file`).");
        e.code = "EMPTY_FILE"; e.status = 400;
        throw e;
      }
      // Kiểm tra tên nguy hiểm (path traversal) — memory-only nên chỉ cần chặn nhãn
      const originalName = String(req.file.originalname || "").slice(0, 200);
      if (originalName.includes("..") || originalName.includes("/") || originalName.includes("\\")) {
        const e = new Error("Tên file không hợp lệ.");
        e.code = "UNSUPPORTED_TYPE"; e.status = 415;
        throw e;
      }
      const out = await extractFromBuffer(req.file.buffer, { originalName, mimetype: req.file.mimetype });
      // Gợi ý nối tiếp pipeline parser hiện có (giữ thứ tự câu/A-D/đáp án)
      const detected = detectFileType({ buffer: req.file.buffer, originalName, mimetype: req.file.mimetype });
      res.json({ ...out, next: { hint: "Dán `text` vào exam_text của POST /api/checks để chạy parser/rules hiện có.", detected } });
    } catch (e) { next(e); }
  });
});

export default r;
