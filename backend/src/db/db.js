import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "..", "data");
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, "soide.db");

export const db = new DatabaseSync(dbPath);

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users(
      id TEXT PRIMARY KEY, display_name TEXT,
      plan TEXT DEFAULT 'free', monthly_quota INTEGER DEFAULT 30, used_this_month INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS checks(
      id TEXT PRIMARY KEY, user_id TEXT, title TEXT, subject TEXT, grade TEXT,
      level_expect TEXT, group_kind TEXT, has_answer INTEGER DEFAULT 1,
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
  `);
  if (!db.prepare("SELECT 1 FROM users WHERE id=?").get("demo-teacher")) {
    db.prepare("INSERT INTO users(id, display_name) VALUES(?,?)").run("demo-teacher", "GV Demo");
  }
  // Migration: đề có kèm đáp án hay không (1 = có, 0 = không). DB cũ thiếu cột -> thêm.
  const cols = db.prepare("PRAGMA table_info(checks)").all().map((c) => c.name);
  if (!cols.includes("has_answer")) {
    db.exec("ALTER TABLE checks ADD COLUMN has_answer INTEGER DEFAULT 1");
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_q_check ON questions(check_id);
    CREATE INDEX IF NOT EXISTS idx_f_q ON findings(question_id);
    CREATE INDEX IF NOT EXISTS idx_chunks_book ON chunks(textbook_id);
    CREATE INDEX IF NOT EXISTS idx_books_meta ON textbooks(subject, grade, book_series);
    PRAGMA journal_mode=WAL;`);
}

export function purgeOld(days = 30) {
  const cutoff = new Date(Date.now() - days * 864e5).toISOString();
  const ids = db.prepare("SELECT id FROM checks WHERE created_at < ?").all(cutoff).map((r) => r.id);
  for (const id of ids) {
    db.prepare("DELETE FROM findings WHERE question_id IN (SELECT id FROM questions WHERE check_id=?)").run(id);
    db.prepare("DELETE FROM questions WHERE check_id=?").run(id);
    db.prepare("DELETE FROM checks WHERE id=?").run(id);
  }
  return ids.length;
}

