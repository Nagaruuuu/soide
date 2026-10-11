// Metadata sách: subject/grade/bookSeries/title từ body upload (pilot mặc định
// Tin/10/KNTT); chương/bài tách bằng regex tiêu đề; page để null trừ khi ước
// lượng được — KHÔNG bịa số trang.

const CHAPTER_RE = /^\s*(chương|chuong|bài|bai|§)\s*([IVXLC\d]+)[\s.:)\-–—]*(.*)$/i;

function cap(s = "") {
  const t = String(s).toLowerCase();
  if (t === "chuong") return "Chương";
  if (t === "bai") return "Bài";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// Quét TIÊU ĐỀ theo từng dòng text thô (kể cả khi tiêu đề dính liền thân bài
// chỉ cách 1 xuống dòng — rất thường gặp trong DOCX/PDF trích xuất).
// -> [{ charOffset, chapter }], chapterAt(offset) lấy mục gần nhất phía trước.
export function detectChapterMarks(text = "") {
  const marks = [];
  let offset = 0;
  for (const raw of String(text ?? "").replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    if (line.length > 0 && line.length < 160) {
      const m = line.match(CHAPTER_RE);
      if (m) {
        marks.push({
          charOffset: offset,
          chapter: `${cap(m[1])} ${m[2].toUpperCase()}${m[3] ? ` — ${m[3].trim().slice(0, 80)}` : ""}`,
        });
      }
    }
    offset += raw.length + 1;
  }
  return marks;
}

export function chapterAt(charOffset, marks = []) {
  let cur = null;
  for (const m of marks) {
    if (m.charOffset <= charOffset) cur = m.chapter;
    else break;
  }
  return cur;
}

// Ước lượng trang theo tỷ lệ ký tự (chỉ khi có pageCount thật từ PDF).
// Không có pageCount -> null, tuyệt đối không đoán.
export function estimatePage(charOffset, totalChars, pageCount) {
  if (!pageCount || pageCount <= 0 || !totalChars) return null;
  const p = Math.floor((charOffset / totalChars) * pageCount) + 1;
  return Math.min(Math.max(p, 1), pageCount);
}

export function bookMeta({ subject, grade, bookSeries, title } = {}) {
  return {
    subject: (subject || "Tin học").trim(),
    grade: (grade || "10").trim(),
    book_series: (bookSeries || "Kết nối tri thức").trim(),
    title: (title || "").trim().slice(0, 200),
  };
}
