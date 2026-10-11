// Stub mở rộng: PPTX và OCR cho PDF scan. Giữ đúng interface để cắm sau.
// PPTX sau này: unzip ppt/slides/slide*.xml + sharedStrings (không dùng AI).
// OCR sau này: tesseract chạy local, offline (không gửi file ra ngoài).
import { extractError } from "./fileTypes.js";

export async function extractPptxStub() {
  throw extractError(
    "PPTX_NOT_SUPPORTED_YET",
    "Chưa hỗ trợ PPTX ở đợt này. Hãy lưu slide thành DOCX/PDF-text hoặc dán nội dung.",
    415
  );
}

export function needsOcr(text) {
  return !String(text ?? "").trim();
}

export async function ocrStub() {
  throw extractError(
    "PDF_SCAN_NEEDS_OCR",
    "PDF này không có lớp chữ (bản scan/ảnh). Module OCR chưa bật — hãy dùng PDF có text hoặc gõ lại.",
    422
  );
}
