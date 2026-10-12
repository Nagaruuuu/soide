// Một nguồn sự thật cho mọi giới hạn file. Validate fail-closed:
// env bẩn (NaN, <=0, Infinity) -> fallback an toàn, không bao giờ mất giới hạn.
function numEnv(name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const v = Number(process.env[name]);
  if (!Number.isFinite(v) || v < min || v > max) return fallback;
  return v;
}

export function fileLimits() {
  const maxMb = numEnv("FILE_MAX_MB", 10, { min: 1, max: 100 });
  const maxPages = numEnv("FILE_MAX_PAGES", 50, { min: 1, max: 1000 });
  return {
    maxMb,
    maxPages,
    maxBytes: maxMb * 1024 * 1024,
    // zip-bomb: tổng dung lượng bung nén + số entries cho phép trong 1 file
    maxUncompressedBytes: numEnv("FILE_MAX_UNCOMPRESSED_MB", 100, { min: 10, max: 1000 }) * 1024 * 1024,
    maxZipEntries: numEnv("FILE_MAX_ZIP_ENTRIES", 2000, { min: 10, max: 20000 }),
    extractTimeoutMs: numEnv("EXTRACT_TIMEOUT_MS", 15000, { min: 1000, max: 120000 }),
  };
}

// Profile SÁCH (T14): tách riêng khỏi đề thi.
// Lý do: đề thi giữ 20k ký tự, nhưng 1 chương SGK 30-60 trang có 60k-150k ký tự.
// Dùng chung MAX_TEXT_CHARS=20000 khiến ingest sách chỉ giữ ~20% nội dung.
export function bookLimits() {
  const maxMb = numEnv("BOOK_MAX_MB", 30, { min: 1, max: 200 });
  const maxPages = numEnv("BOOK_MAX_PAGES", 400, { min: 1, max: 3000 });
  return {
    maxMb,
    maxPages,
    maxBytes: maxMb * 1024 * 1024,
    maxChars: numEnv("BOOK_MAX_CHARS", 300000, { min: 20000, max: 5000000 }),
    maxUncompressedBytes: numEnv("BOOK_MAX_UNCOMPRESSED_MB", 200, { min: 10, max: 2000 }) * 1024 * 1024,
    maxZipEntries: numEnv("BOOK_MAX_ZIP_ENTRIES", 4000, { min: 10, max: 40000 }),
    extractTimeoutMs: numEnv("BOOK_EXTRACT_TIMEOUT_MS", 60000, { min: 1000, max: 300000 }),
  };
}
