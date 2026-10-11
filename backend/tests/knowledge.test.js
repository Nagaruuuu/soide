// Unit + integration test Textbook Knowledge Retrieval — mock/offline, 0 phí.
// Bao phủ: chunk ranh giới, metadata chương/trang, hash embedding ổn định,
// dedup, retrieve trúng + no_reference_found, gắn trích dẫn vào AI (opt-in).
import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import { chunkText, splitParagraphs, sha256norm } from "../src/modules/knowledge/chunk.js";
import { detectChapterMarks, chapterAt, estimatePage, bookMeta } from "../src/modules/knowledge/metadata.js";
import { hashEmbed, cosine, embedTexts, EMBED_DIM } from "../src/modules/knowledge/embed.js";
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
