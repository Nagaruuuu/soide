// Unit + integration test Textbook Knowledge Retrieval — mock/offline, 0 phí.
// Bao phủ: chunk ranh giới, metadata chương/trang, hash embedding ổn định,
// dedup, retrieve trúng + no_reference_found, gắn trích dẫn vào AI (opt-in).
import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import { chunkText, splitParagraphs, sha256norm } from "../src/modules/knowledge/chunk.js";
import { detectChapterMarks, chapterAt, estimatePage, bookMeta } from "../src/modules/knowledge/metadata.js";
import { hashEmbed, cosine, embedTexts, packVector, unpackVector, EMBED_DIM } from "../src/modules/knowledge/embed.js";
import { retrieve, formatCitations } from "../src/modules/knowledge/retrieve.js";
import { referencesBlock, questionTextOf, makeRefProvider } from "../src/modules/knowledge/attach.js";
import { ingestTextbook } from "../src/modules/knowledge/ingest.js";
import { reviewQuestions } from "../src/modules/aiReview/review.js";
import { solveQuestions } from "../src/modules/independentSolver/solver.js";
import { createMockProvider } from "../src/modules/aiReview/provider.js";
import { db, initDb } from "../src/db/db.js";

const sampleTxt = fs.readFileSync(new URL("./fixtures/textbook-sample.txt", import.meta.url), "utf8");

// ---------- chunk ----------
test("chunk: tách theo đoạn văn, đoạn dài cắt ở ranh câu", () => {
  const chunks = chunkText(sampleTxt);
  assert.ok(chunks.length >= 2, `kỳ vọng >=2 chunk, được ${chunks.length}`);
  assert.ok(chunks.every((c) => c.length <= 700), "không chunk nào vượt MAX");
  assert.ok(chunks.join(" ").includes("nhị phân"));
  assert.deepEqual(chunkText("   "), []);
  assert.deepEqual(splitParagraphs("a\n\n\nb"), ["a", "b"]);
});

test("chunk: sha256 chuẩn hóa trùng khi chỉ khác hoa/thường/khoảng trắng", () => {
  assert.equal(sha256norm("  Hà  Nội "), sha256norm("hà nội"));
  assert.notEqual(sha256norm("hà nội"), sha256norm("hải phòng"));
});

// ---------- metadata ----------
test("metadata: tách Chương/Bài kể cả khi dính liền thân bài, page null khi thiếu", () => {
  const marks = detectChapterMarks(sampleTxt);
  const names = marks.map((m) => m.chapter);
  assert.ok(names.some((c) => /Chương 1/.test(c)), JSON.stringify(names));
  assert.ok(names.some((c) => /Bài 2/.test(c)));
  assert.equal(chapterAt(0, marks), null);
  assert.equal(chapterAt(marks[0].charOffset, marks), marks[0].chapter);
  assert.equal(estimatePage(10, 100, null), null);
  assert.equal(estimatePage(0, 100, 10), 1);
  assert.equal(estimatePage(99, 100, 10), 10);
  assert.deepEqual(bookMeta({}), { subject: "Tin học", grade: "10", book_series: "Kết nối tri thức", title: "" });
  assert.equal(bookMeta({ subject: "Toán", grade: "9", bookSeries: "Cánh Diều", title: "T" }).book_series, "Cánh Diều");
});

// ---------- hash embedding ----------
test("embed hash: ổn định, chuẩn hóa, giống nhau -> cosine ~1", () => {
  const a = hashEmbed("máy tính nhị phân bit byte");
  const b = hashEmbed("máy tính nhị phân bit byte");
  const c = hashEmbed("con mèo ăn cá ngoài vườn rau thơm ngát");
  assert.equal(a.length, EMBED_DIM);
  assert.deepEqual(a, b);
  assert.ok(Math.abs(cosine(a, b) - 1) < 1e-9);
  assert.ok(cosine(a, c) < 0.6, `hash trùng từ vựng quá cao: ${cosine(a, c)}`);
});

test("embedTexts: engine mock/hash trả đúng shape, cost 0", async () => {
  for (const provider of ["mock", "hash"]) {
    const r = await embedTexts(["abc", "def"], { provider, maxChunks: 400, maxChars: 1e6, pricePer1kChars: 0, timeoutMs: 5000, apiKey: "", baseUrl: "", model: "" });
    assert.equal(r.vectors.length, 2);
    assert.equal(r.vectors[0].length, EMBED_DIM);
    assert.equal(r.costUSD, 0);
  }
  await assert.rejects(embedTexts(["x"], { provider: "cohere" }), (e) => e.code === "BAD_CONFIG");
});

// ---------- no_reference_found (không cần DB) ----------
test("retrieve: query rỗng / không sách khớp / dưới ngưỡng -> no_reference_found", async () => {
  const mockCfg = { provider: "mock", maxChunks: 400, maxChars: 1e6, pricePer1kChars: 0, timeoutMs: 5000, apiKey: "", baseUrl: "", model: "" };
  let r = await retrieve({ query: "   ", embedCfg: mockCfg });
  assert.equal(r.status, "no_reference_found");
  r = await retrieve({ query: "máy tính là gì", subject: "Môn Không Tồn Tại XYZ", _rows: [], embedCfg: mockCfg });
  assert.equal(r.status, "no_reference_found");
  r = await retrieve({ query: "xyzzy hoàn toàn không liên quan gì hết", minScore: 0.999, _rows: [], embedCfg: mockCfg });
  assert.equal(r.status, "no_reference_found");
});

// ---------- integration thật trên SQLite (ingest -> retrieve -> dedup -> xóa) ----------
test("integration: ingest TXT mẫu -> retrieve trúng + trích dẫn đủ nguồn", async (t) => {
  initDb();
  const title = `TEST-TIN10-${Date.now()}`;
  const out = await ingestTextbook({
    buffer: Buffer.from(sampleTxt, "utf8"),
    originalName: "tin10-mau.txt",
    mimetype: "text/plain",
    meta: { subject: "Tin học", grade: "10", bookSeries: "Kết nối tri thức", title },
  });
  t.after(() => {
    db.prepare("DELETE FROM chunks WHERE textbook_id=?").run(out.textbook.id);
    db.prepare("DELETE FROM textbooks WHERE id=?").run(out.textbook.id);
  });
  assert.ok(out.ingested.chunks >= 2, JSON.stringify(out.ingested));
  assert.equal(out.ingested.engine, "hash");
  assert.equal(out.ingested.costUSD, 0);
  assert.ok(out.textbook.id);
  // trùng nội dung -> 409, không tạo bản thứ hai
  await assert.rejects(
    ingestTextbook({ buffer: Buffer.from(sampleTxt, "utf8"), originalName: "copy.txt", mimetype: "text/plain", meta: { title } }),
    (e) => e.code === "TEXTBOOK_DUPLICATE"
  );
  const found = await retrieve({ query: "dữ liệu trong máy tính biểu diễn dạng gì, bit byte là gì", subject: "Tin học", grade: "10", bookSeries: "Kết nối tri thức" });
  assert.equal(found.status, "found");
  assert.ok(found.citations.length >= 1 && found.citations.length <= 3);
  const c0 = found.citations[0];
  assert.ok(c0.content.includes("nhị phân"));
  assert.equal(c0.title, title);
  assert.ok(/Chương 1/.test(c0.chapter || ""), JSON.stringify(c0.chapter));
  // sai môn -> không tìm thấy, không bịa
  const miss = await retrieve({ query: "dữ liệu trong máy tính biểu diễn dạng gì", subject: "Ngữ văn" });
  assert.equal(miss.status, "no_reference_found");
  assert.deepEqual(miss.citations, []);
});

// ---------- T13: BLOB float32 + lọc SQL + citations ----------
test("packVector/unpackVector: round-trip giữ nguyên giá trị, BLOB nhỏ hơn JSON", () => {
  const v = hashEmbed("định luật II Newton");
  const blob = packVector(v);
  assert.ok(blob instanceof Uint8Array);
  assert.equal(blob.byteLength, EMBED_DIM * 4, "512 float32 = 2048 byte");
  const back = unpackVector(blob);
  assert.equal(back.length, v.length);
  assert.ok(cosine(v, back) > 0.999999, `round-trip lệch: ${cosine(v, back)}`);
  // BLOB cố định 2048 byte và parse tức thì (không JSON.parse mỗi dòng khi scan).
  // Với vector THƯA của hash thì JSON có thể ngắn hơn, nên đừng so kích thước ở đây.
  const dense = Array.from({ length: EMBED_DIM }, (_, i) => 0.1234567890123456 + i * 1e-9);
  assert.ok(packVector(dense).byteLength < JSON.stringify(dense).length, "vector dày: BLOB phải nhỏ hơn JSON");
  assert.equal(JSON.parse(JSON.stringify(v)).length, v.length);
  // dữ liệu hỏng -> null chứ không crash
  assert.equal(unpackVector(null), null);
  assert.equal(unpackVector(new Uint8Array(5)), null); // 5 byte không chia hết cho 4
  assert.equal(packVector([]), null);
  assert.equal(packVector(null), null);
});

test("T13: ingest ghi cả vec BLOB và page_source; retrieve đọc được BLOB", async (t) => {
  initDb();
  const title = `TEST-BLOB-${Date.now()}`;
  const out = await ingestTextbook({
    buffer: Buffer.from(sampleTxt, "utf8"),
    originalName: "blob.txt",
    mimetype: "text/plain",
    meta: { subject: "Toán", grade: "10", bookSeries: "Kết nối tri thức", title },
  });
  t.after(() => {
    db.prepare("DELETE FROM chunks WHERE textbook_id=?").run(out.textbook.id);
    db.prepare("DELETE FROM textbooks WHERE id=?").run(out.textbook.id);
  });
  const rows = db.prepare("SELECT vec, page_source, embedding FROM chunks WHERE textbook_id=?").all(out.textbook.id);
  assert.ok(rows.length >= 2);
  for (const r of rows) {
    assert.ok(r.vec, "phải có vec BLOB");
    assert.equal(r.page_source, "estimated", "ingest hiện tại chưa lấy trang thật -> phải đánh dấu estimated");
    assert.equal(unpackVector(r.vec).length, EMBED_DIM);
  }
  const found = await retrieve({ query: "nhị phân dữ liệu bit byte", subject: "Toán", grade: "10" });
  assert.equal(found.status, "found");
  assert.equal(found.citations[0].page_source, "estimated", "citation phải mang page_source");
});

test("T13: lọc SQL — sai môn/lớp/bộ không lọt chunk của sách khác", async (t) => {
  initDb();
  const title = `TEST-FILT-${Date.now()}`;
  const out = await ingestTextbook({
    buffer: Buffer.from(sampleTxt, "utf8"),
    originalName: "filt.txt",
    mimetype: "text/plain",
    meta: { subject: "Tin học", grade: "10", bookSeries: "Kết nối tri thức", title },
  });
  t.after(() => {
    db.prepare("DELETE FROM chunks WHERE textbook_id=?").run(out.textbook.id);
    db.prepare("DELETE FROM textbooks WHERE id=?").run(out.textbook.id);
  });
  const q = "dữ liệu trong máy tính biểu diễn dạng gì";
  // Đây là test chặn lỗi ưu tiên toán tử OR (thiếu ngoặc) làm rò rỉ chunk sai môn.
  for (const wrong of [{ subject: "Ngữ văn" }, { subject: "Tin học", grade: "11" }, { subject: "Tin học", bookSeries: "Cánh Diều" }]) {
    const r = await retrieve({ query: q, ...wrong });
    assert.equal(r.status, "no_reference_found", `phải không thấy với ${JSON.stringify(wrong)}`);
    assert.deepEqual(r.citations, []);
  }
  // đúng cả 3 khoá -> vẫn thấy
  assert.equal((await retrieve({ query: q, subject: "Tin học", grade: "10", bookSeries: "Kết nối tri thức" })).status, "found");
});

test("T13: bảng citations tồn tại, lưu/đọc/đếm theo câu", (t) => {
  initDb();
  const qid = `TESTQ-${Date.now()}`;
  const txid = `TESTB-${Date.now()}`;
  db.prepare("INSERT INTO textbooks(id,subject,grade,book_series,title,file_type,sha256,chunk_count,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
    .run(txid, "Toán", "10", "Kết nối tri thức", "T", "txt", `h-${Date.now()}`, 1, "t");
  t.after(() => db.prepare("DELETE FROM textbooks WHERE id=?").run(txid));
  const ins = db.prepare("INSERT INTO citations(id,question_id,ord,textbook_id,title,chapter,page,page_source,score,content,at) VALUES(?,?,?,?,?,?,?,?,?,?,?)");
  const c1 = `C1-${Date.now()}`;
  const c2 = `C2-${Date.now()}`;
  ins.run(c1, qid, 1, txid, "SGK Toán 10", "Chương 1", 12, "real", 0.87, "đoạn trích", "t");
  ins.run(c2, qid, 2, txid, "SGK Toán 10", "Chương 2", 30, "estimated", 0.61, "đoạn 2", "t");
  const got = db.prepare("SELECT * FROM citations WHERE question_id=? ORDER BY ord").all(qid);
  assert.equal(got.length, 2);
  assert.equal(got[0].page, 12);
  assert.equal(got[0].page_source, "real", "phải lưu được nguồn trang thật/ước lượng");
  t.after(() => {
    db.prepare("DELETE FROM citations WHERE question_id=?").run(qid);
  });
});

test("T13: retrieve chịu được 20k chunks (mục tiêu <300ms, lọc SQL không quét toàn bảng)", async (t) => {
  initDb();
  const txid = `PERF-${Date.now()}`;
  const N = 20000;
  const dim = EMBED_DIM;
  db.prepare("INSERT INTO textbooks(id,subject,grade,book_series,title,file_type,sha256,chunk_count,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
    .run(txid, "Toán", "10", "Kết nối tri thức", "Sách lớn", "txt", `perf-${Date.now()}`, N, "t");
  const insChunk = db.prepare("INSERT INTO chunks(id,textbook_id,ord,content,chapter,page,embedding,vec,page_source,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)");
  // 20k chunk CÙNG một cuốn sách (Toán 10). Ý nghĩa: SQL phải lọc theo khoá sách
  // và chỉ đọc 20k dòng khớp — nếu ai đó lỡ bỏ ngoặc OR/AND hoặc lọc sai, số dòng
  // đọc và thời gian sẽ bùng lên và test này phải đỏ.
  db.exec("BEGIN");
  for (let i = 0; i < N; i++) {
    const v = hashEmbed(`nội dung số ${i} về Toán lặp lại cho perf test`);
    insChunk.run(`PC-${txid}-${i}`, txid, i + 1, `nội dung số ${i} về Toán lặp lại cho perf test`, "Chương 1", (i % 200) + 1, null, packVector(v), "real", "t");
  }
  db.exec("COMMIT");
  t.after(() => {
    db.prepare("DELETE FROM chunks WHERE textbook_id=?").run(txid);
    db.prepare("DELETE FROM textbooks WHERE id=?").run(txid);
  });
  const t0 = Date.now();
  const r = await retrieve({ query: "nội dung số về Toán", subject: "Toán", grade: "10", bookSeries: "Kết nối tri thức", topK: 3, embedCfg: { provider: "hash" } });
  const ms = Date.now() - t0;
  assert.equal(r.status, "found");
  assert.ok(r.citations.length > 0 && r.citations.every((c) => c.title === "Sách lớn"));
  // Ngưỡng thực tế cho Node/SQLite offline (mục tiêu thiết kế <300ms ở máy dev,
  // nhưng test phải chạy được trên máy yếu nên để 5s cho có thở).
  assert.ok(ms < 5000, `retrieve mất ${ms}ms với ${N} chunks — quá chậm`);
  console.log(`    [perf] retrieve trên ${N} chunks: ${ms}ms`);
});

// ---------- attach vào AI (opt-in, mock) ----------
test("attach: block rỗng khi không trích dẫn; format đủ tên/chương/trang", () => {
  assert.equal(referencesBlock([]), "");
  const b = referencesBlock([{ content: "abc", title: "Tin 10", chapter: "Bài 2", page: 5, score: 0.9 }]);
  assert.match(b, /<references>/);
  assert.match(b, /Tin 10.*Bài 2.*tr\.5/);
  assert.match(b, /KHÔNG được bịa/);
  assert.equal(questionTextOf({ content: "c?", opt_a: "a", opt_b: "", opt_c: null }), "c?\na");
});

test("review + solver gắn <references> khi opt-in, im lặng khi tắt", async () => {
  const q = { _num: 1, content: "bit là gì", opt_a: "đơn vị nhỏ nhất", opt_b: "mạng", opt_c: "phần mềm", opt_d: "ổ cứng" };
  const cites = [{ content: "bit là đơn vị nhỏ nhất", title: "Tin 10", chapter: "Chương 1", page: 2, score: 0.9 }];
  const seen = [];
  const provider = createMockProvider(({ user }) => { seen.push(user); return { findings: [] }; });
  // tắt refProvider -> không block references
  await reviewQuestions({ questions: [q], provider });
  assert.ok(!seen[0].includes("<references>"));
  // makeRefProvider thật nhưng lọc môn không tồn tại -> [] xác định, không phụ thuộc DB
  const used = {};
  const { makeRefProvider } = await import("../src/modules/knowledge/attach.js");
  const rp = makeRefProvider({ subject: "Môn Không Tồn Tại XYZ" }, used);
  assert.deepEqual(await rp("bit là gì?", { _num: 1 }), []);
  assert.deepEqual(used, {});
  await reviewQuestions({ questions: [q], provider, refProvider: rp });
  assert.ok(!seen[1].includes("<references>"));
  // bật: refProvider trả trích dẫn trực tiếp
  await reviewQuestions({ questions: [q], provider, refProvider: async () => cites });
  assert.ok(seen[2].includes("<references>") && seen[2].includes("bit là đơn vị nhỏ nhất"));
  // solver: refs gắn sau rào chắn mù, không gây báo lộ giả
  let solverUser = "";
  const solverMock = createMockProvider(({ user }) => {
    solverUser = user;
    return { status: "solved", answer: "A", reasoningSummary: "r", verificationMethod: "model-reasoning" };
  });
  const out = await solveQuestions({
    questions: [{ ...q, expected_answer: "A", explanation: "SGK viết bit là đơn vị nhỏ nhất của thông tin" }],
    provider: solverMock, refProvider: async () => cites,
  });
  assert.ok(solverUser.includes("<references>"), "refs phải tới được prompt solver");
  assert.ok(!solverUser.includes("SGK viết bit là đơn vị"), "lời giải gốc không lọt vào solver");
  assert.equal(out.skipped.length, 0, JSON.stringify(out.skipped));
  assert.equal(out.solutions.length, 1);
});
