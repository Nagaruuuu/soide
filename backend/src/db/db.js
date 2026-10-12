import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "..", "data");
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, "soide.db");

export const db = new DatabaseSync(dbPath);
// node --test chạy CÁC FILE test song song, tất cả mở cùng file DB.
// Không có busy_timeout thì ghi chồng -> "database is locked".
db.exec("PRAGMA busy_timeout = 10000;");

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users(
      id TEXT PRIMARY KEY, display_name TEXT,
      plan TEXT DEFAULT 'free', monthly_quota INTEGER DEFAULT 30, used_this_month INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS checks(
      id TEXT PRIMARY KEY, user_id TEXT, title TEXT, subject TEXT, grade TEXT,
      level_expect TEXT, group_kind TEXT, has_answer INTEGER DEFAULT 1,
      question_format TEXT DEFAULT 'choice',
      status TEXT DEFAULT 'created', created_at TEXT
    );    CREATE TABLE IF NOT EXISTS questions(
      id TEXT PRIMARY KEY, check_id TEXT, ord INTEGER, content TEXT,
      opt_a TEXT, opt_b TEXT, opt_c TEXT, opt_d TEXT, expected_answer TEXT, explanation TEXT
    );
    CREATE TABLE IF NOT EXISTS findings(
      id TEXT PRIMARY KEY, question_id TEXT, severity TEXT, category TEXT, evidence TEXT,
      expected_answer TEXT, suggested_answer TEXT, fix_suggestion TEXT,
      confidence TEXT, verification_method TEXT, status TEXT DEFAULT 'pending'
    );
    CREATE TABLE IF NOT EXISTS decisions_log(
      id INTEGER PRIMARY KEY AUTOINCREMENT, question_id TEXT, finding_id TEXT, action TEXT, at TEXT
    );
    CREATE TABLE IF NOT EXISTS textbooks(
      id TEXT PRIMARY KEY, subject TEXT, grade TEXT, book_series TEXT, title TEXT,
      chapter_info TEXT, file_type TEXT, sha256 TEXT UNIQUE, chunk_count INTEGER DEFAULT 0, created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS chunks(
      id TEXT PRIMARY KEY, textbook_id TEXT, ord INTEGER, content TEXT,
      chapter TEXT, page INTEGER, embedding TEXT, created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS ai_cost_log(
      id INTEGER PRIMARY KEY AUTOINCREMENT, check_id TEXT, user_id TEXT, model TEXT,
      input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0,
      cost_usd REAL DEFAULT 0, at TEXT
    );
    CREATE TABLE IF NOT EXISTS citations(
      id TEXT PRIMARY KEY, question_id TEXT, ord INTEGER, textbook_id TEXT,
      title TEXT, chapter TEXT, page INTEGER, page_source TEXT DEFAULT 'real',
      score REAL, content TEXT, at TEXT
    );
  `);
  if (!db.prepare("SELECT 1 FROM users WHERE id=?").get("demo-teacher")) {
    db.prepare("INSERT INTO users(id, display_name) VALUES(?,?)").run("demo-teacher", "GV Demo");
  }
  // Migration: đề có kèm đáp án hay không (1 = có, 0 = không). DB cũ thiếu cột -> thêm.
  const cols = db.prepare("PRAGMA table_info(checks)").all().map((c) => c.name);
  if (!cols.includes("has_answer")) {
    db.exec("ALTER TABLE checks ADD COLUMN has_answer INTEGER DEFAULT 1");
  }
  // Migration: định dạng đề (choice = trắc nghiệm, essay = tự luận). Mặc định choice để tương thích cũ.
  if (!cols.includes("question_format")) {
    db.exec("ALTER TABLE checks ADD COLUMN question_format TEXT DEFAULT 'choice'");
  }
  // Migration T18: cột tháng để reset quota, tổng câu đã dùng (không reset).
  const userCols = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
  if (!userCols.includes("quota_month")) {
    db.exec("ALTER TABLE users ADD COLUMN quota_month TEXT");
    db.prepare("UPDATE users SET quota_month=? WHERE quota_month IS NULL").run(new Date().toISOString().slice(0, 7));
  }
  if (!userCols.includes("used_ai_month")) {
    db.exec("ALTER TABLE users ADD COLUMN used_ai_month INTEGER DEFAULT 0");
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_q_check ON questions(check_id);
    CREATE INDEX IF NOT EXISTS idx_f_q ON findings(question_id);
    CREATE INDEX IF NOT EXISTS idx_chunks_book ON chunks(textbook_id);
    CREATE INDEX IF NOT EXISTS idx_books_meta ON textbooks(subject, grade, book_series);
    CREATE INDEX IF NOT EXISTS idx_cit_q ON citations(question_id);
    PRAGMA journal_mode=WAL;`);
  migrateChunkVectors();
}

// Migration T13: thêm cột vec (BLOB float32) + page_source cho chunks.
// Cột `embedding` (TEXT JSON) CỐ Ý GIỮ LẠI -> rollback được nếu cần.
// Chunk cũ chưa biết số trang thật -> đánh dấu 'estimated' để UI không hứa nhầm.
function migrateChunkVectors() {
  const cols = db.prepare("PRAGMA table_info(chunks)").all().map((c) => c.name);
  if (!cols.includes("vec")) db.exec("ALTER TABLE chunks ADD COLUMN vec BLOB");
  if (!cols.includes("page_source")) {
    db.exec("ALTER TABLE chunks ADD COLUMN page_source TEXT DEFAULT 'estimated'");
  }
  // Chuyển JSON -> BLOB cho chunk còn thiếu (chạy 1 lần; bỏ qua dòng đã có vec).
  const rows = db.prepare("SELECT id, embedding FROM chunks WHERE vec IS NULL AND embedding IS NOT NULL").all();
  if (!rows.length) return;
  const up = db.prepare("UPDATE chunks SET vec=? WHERE id=?");
  let ok = 0, skip = 0;
  for (const r of rows) {
    let vec = null;
    try {
      const arr = JSON.parse(r.embedding);
      if (Array.isArray(arr) && arr.length) {
        const f = Float32Array.from(arr);
        vec = new Uint8Array(f.buffer);
      }
    } catch { /* JSON hỏng -> giữ nguyên TEXT, đọc fallback lúc retrieve */ }
    if (vec) { up.run(vec, r.id); ok++; } else skip++;
  }
  if (ok || skip) console.log(`[soide] migrate chunks->vec BLOB: ${ok} chuyển, ${skip} bỏ qua`);
}

export function purgeOld(days = 30) {
  const cutoff = new Date(Date.now() - days * 864e5).toISOString();
  const ids = db.prepare("SELECT id FROM checks WHERE created_at < ?").all(cutoff).map((r) => r.id);
  for (const id of ids) {
    db.prepare("DELETE FROM citations WHERE question_id IN (SELECT id FROM questions WHERE check_id=?)").run(id);
    db.prepare("DELETE FROM findings WHERE question_id IN (SELECT id FROM questions WHERE check_id=?)").run(id);
    db.prepare("DELETE FROM questions WHERE check_id=?").run(id);
    db.prepare("DELETE FROM checks WHERE id=?").run(id);
  }
  return ids.length;
}

