// T18: paywall quota + ghi log chi phí AI.
// Dùng user riêng (không đụng demo-teacher) để test không ảnh hưởng bộ test khác.
import test from "node:test";
import assert from "node:assert";
import { db, initDb } from "../src/db/db.js";
import { checkQuota, consumeQuota, ensureUser, totalCost, recordCost } from "../src/modules/quota/quota.js";

const month = () => new Date().toISOString().slice(0, 7);

function seedUser(id, { plan = "free", quota = 30, used = 0, qm = month() } = {}) {
  db.prepare("INSERT OR REPLACE INTO users(id, display_name, plan, monthly_quota, used_this_month, quota_month) VALUES(?,?,?,?,?,?)")
    .run(id, "T", plan, quota, used, qm);
  return id;
}

test("T18: initDb có bảng ai_cost_log + citations + cột users.quota_month/used_ai_month", () => {
  initDb();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
  assert.ok(tables.includes("ai_cost_log"), "thiếu bảng ai_cost_log");
  assert.ok(tables.includes("citations"), "thiếu bảng citations (T13)");
  const ucols = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
  assert.ok(ucols.includes("quota_month"), "thiếu users.quota_month");
  assert.ok(ucols.includes("used_ai_month"), "thiếu users.used_ai_month");
});

test("T18: free còn quota -> ok, quota_left trừ đúng số câu", (t) => {
  const id = seedUser("q-free-ok", { quota: 10, used: 2 });
  t.after(() => db.prepare("DELETE FROM users WHERE id=?").run(id));
  const r = checkQuota(5, id);
  assert.equal(r.ok, true);
  assert.equal(r.unlimited, false);
  assert.equal(r.quota_left, 3); // 10 - 2 đã dùng - 5 mới
});

test("T18: free hết quota -> ném QUOTA_EXCEEDED, status 402, kèm upgrade_hint", (t) => {
  const id = seedUser("q-free-full", { quota: 10, used: 10 });
  t.after(() => db.prepare("DELETE FROM users WHERE id=?").run(id));
  assert.throws(
    () => checkQuota(1, id),
    (e) => {
      assert.equal(e.code, "QUOTA_EXCEEDED");
      assert.equal(e.status, 402);
      assert.equal(e.retryable, false);
      assert.equal(e.quota_left, 0);
      assert.equal(e.upgrade_hint.plan, "premium");
      return true;
    }
  );
  // Còn 1 câu chỉ cần 2 câu -> cũng chặn (đủ câu mới cho tạo 1 lần)
  const id2 = seedUser("q-free-partial", { quota: 10, used: 9 });
  t.after(() => db.prepare("DELETE FROM users WHERE id=?").run(id2));
  assert.throws(() => checkQuota(2, id2), (e) => e.code === "QUOTA_EXCEEDED");
});

test("T18: premium KHÔNG giới hạn -> ok, quota_left=null, unlimited=true", (t) => {
  const id = seedUser("q-premium", { plan: "premium", quota: 30, used: 9999 });
  t.after(() => db.prepare("DELETE FROM users WHERE id=?").run(id));
  const r = checkQuota(50, id);
  assert.equal(r.ok, true);
  assert.equal(r.unlimited, true);
  assert.equal(r.quota_left, null);
});

test("T18: consumeQuota cộng dồn used_this_month", (t) => {
  const id = seedUser("q-consume", { quota: 30, used: 0 });
  t.after(() => db.prepare("DELETE FROM users WHERE id=?").run(id));
  consumeQuota(7, id);
  consumeQuota(3, id);
  assert.equal(db.prepare("SELECT used_this_month FROM users WHERE id=?").get(id).used_this_month, 10);
});

test("T18: sang tháng mới -> tự reset used_this_month", (t) => {
  const id = seedUser("q-reset", { quota: 30, used: 25, qm: "2020-01" }); // tháng cũ
  t.after(() => db.prepare("DELETE FROM users WHERE id=?").run(id));
  const r = checkQuota(5, id); // gọi ensureUser -> reset
  assert.equal(r.ok, true);
  assert.equal(db.prepare("SELECT used_this_month FROM users WHERE id=?").get(id).used_this_month, 0);
});

test("T18: ensureUser tự tạo user nếu chưa có (demo mặc định free 30 câu)", (t) => {
  const id = "q-autocreate";
  t.after(() => db.prepare("DELETE FROM users WHERE id=?").run(id));
  const u = ensureUser(id);
  assert.equal(u.plan, "free");
  assert.equal(u.monthly_quota, 30);
  assert.equal(u.used_this_month, 0);
});

test("T18: recordCost ghi log + totalCost tổng đúng", (t) => {
  const cid = `cost-test-${Date.now()}`;
  const before = totalCost();
  t.after(() => db.prepare("DELETE FROM ai_cost_log WHERE check_id=?").run(cid));
  recordCost({ checkId: cid, model: "test/model", inputTokens: 1000, outputTokens: 500, costUSD: 0.0005 });
  recordCost({ checkId: cid, model: "test/model", inputTokens: 2000, outputTokens: 1000, costUSD: 0.001 });
  const after = totalCost();
  assert.ok(Math.abs((after.costUSD - before.costUSD) - 0.0015) < 1e-9, `cost lệch: ${after.costUSD - before.costUSD}`);
  assert.equal(after.calls, before.calls + 2);
});

test("T18: recordCost KHÔNG throw khi thiếu checkId (không sập luồng chính)", () => {
  assert.doesNotThrow(() => recordCost({ model: "x", costUSD: 1 }));
});