// Nhận diện định dạng file bằng đuôi + magic bytes (không tin mimetype của client).
// Chỉ cho phép docx/pdf/txt ở đợt này; pptx + pdf-scan giữ stub mở rộng.

export const ALLOWED_EXTS = new Set(["docx", "pdf", "txt"]);

export function getExt(originalName = "") {
  const m = String(originalName).toLowerCase().match(/\.([a-z0-9]+)\s*$/);
  return m ? m[1] : "";
}

function sniff(buffer) {
  if (!buffer || buffer.length < 4) return "unknown";
  if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) return "zip"; // docx/pptx/xlsx
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) return "pdf";
  return "unknown";
}

export function detectFileType({ buffer, originalName = "", mimetype = "" } = {}) {
  const ext = getExt(originalName);
  const magic = sniff(buffer);
  // pptx cũng là zip — nhận diện để trả stub rõ ràng thay vì lỗi chung.
  // Lưu ý: mimetype DOCX thật cũng chứa "officedocument" nên KHÔNG dùng nó để nhận pptx.
  if (ext === "pptx" || (magic === "zip" && /presentation|pptx/i.test(String(mimetype)))) {
    return { fileType: "pptx", ext, magic, supported: false, stub: true };
  }
  if (ext === "docx" && magic === "zip") return { fileType: "docx", ext, magic, supported: true };
  if (ext === "pdf" && magic === "pdf") return { fileType: "pdf", ext, magic, supported: true };
  if (ext === "txt") return { fileType: "txt", ext, magic, supported: true };
  // Trường hợp lệch đuôi/magic: báo không hỗ trợ, kèm lý do để FE hiển thị
  return { fileType: ext || "unknown", ext, magic, supported: false, stub: false };
}

export function extractError(code, message_vi, status = 400, retryable = false) {
  const e = new Error(message_vi);
  e.code = code; e.status = status; e.retryable = retryable;
  return e;
}
