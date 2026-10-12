// Đọc ZIP central directory (không bung nén) để chặn zip-bomb TRƯỚC khi mammoth inflate.
// Không thêm dependency: parse tay EOCD + central headers trên Buffer gốc.
import { extractError } from "./fileTypes.js";

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;

function findEocd(buffer) {
  // EOCD nằm trong 64KB cuối (cộng comment tối đa 64KB)
  const start = Math.max(0, buffer.length - 65557);
  for (let i = buffer.length - 22; i >= start; i--) {
    if (buffer.readUInt32LE(i) === EOCD_SIG) return i;
  }
  return -1;
}

export function inspectZip(buffer) {
  if (!buffer || buffer.length < 22) {
    throw extractError("EXTRACT_FAILED", "File ZIP quá nhỏ hoặc không hợp lệ.", 422);
  }
  const eocd = findEocd(buffer);
  if (eocd < 0) {
    throw extractError("EXTRACT_FAILED", "Không đọc được cấu trúc file (có thể bị hỏng).", 422);
  }
  const totalEntries = buffer.readUInt16LE(eocd + 10);
  const cenOffset = buffer.readUInt32LE(eocd + 16);
  if (cenOffset >= buffer.length) {
    throw extractError("EXTRACT_FAILED", "Cấu trúc file ZIP không hợp lệ.", 422);
  }
  let pos = cenOffset;
  let uncompressedBytes = 0;
  let count = 0;
  for (let n = 0; n < totalEntries; n++) {
    if (pos + 46 > buffer.length || buffer.readUInt32LE(pos) !== CEN_SIG) break;
    const method = buffer.readUInt16LE(pos + 10);
    const compSize = buffer.readUInt32LE(pos + 20);
    const uncompSize = buffer.readUInt32LE(pos + 24);
    const nameLen = buffer.readUInt16LE(pos + 28);
    const extraLen = buffer.readUInt16LE(pos + 30);
    const commentLen = buffer.readUInt16LE(pos + 32);
    void method;
    void compSize;
    uncompressedBytes += uncompSize;
    count++;
    pos += 46 + nameLen + extraLen + commentLen;
    // chặn sớm: không duyệt tiếp khi đã vượt ngưỡng
    if (uncompressedBytes > 2 * 1024 * 1024 * 1024 || count > 100000) break;
  }
  return { entries: count, declaredEntries: totalEntries, uncompressedBytes };
}

export function guardZipBomb(buffer, { maxUncompressedBytes, maxZipEntries }) {
  const info = inspectZip(buffer);
  if (info.entries > maxZipEntries) {
    throw extractError("FILE_TOO_COMPLEX", `File có ${info.entries} mục nén, vượt giới hạn ${maxZipEntries}.`, 413);
  }
  if (info.uncompressedBytes > maxUncompressedBytes) {
    const mb = Math.round(info.uncompressedBytes / 1024 / 1024);
    throw extractError("FILE_TOO_COMPLEX", `File bung nén khoảng ${mb}MB, vượt giới hạn cho phép. Hãy tách nhỏ file.`, 413);
  }
  return info;
}
