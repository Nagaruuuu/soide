// Quota + chi phí (T18). Một nguồn sự thật cho paywall và log cost.
// Bảng users giữ nguyên plan/monthly_quota/used_this_month; thêm cột đo chi phí AI.
import { db } from "../../db/db.js";

const CURRENT_USER = "demo-teacher";

// Reset số đã dùng nếu sang tháng mới (so sánh chuỗi YYYY-MM để không cần cột tháng).
function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export function ensureUser(id = CURRENT_USER) {
  let u = db.prepare("SELECT * FROM users WHERE id=?").get(id);
  if (!u) {
    db.prepare("INSERT INTO users(id, display_name, plan, monthly_quota, used_this_month, quota_month) VALUES(?,?,?,?,?,?)")
      .run(id, "GV Demo", "free", 30, 0, currentMonth());
    u = db.prepare("SELECT * FROM users WHERE id=?").get(id);
  } else if (u.quota_month && u.quota_month !== currentMonth()) {
    // Sang tháng mới -> reset quota, KHÔNG đụng tổng AI đã dùng (để thống kê dài hạn).
    db.prepare("UPDATE users SET used_this_month=0, quota_month=? WHERE id=?").run(currentMonth(), id);
    u = db.prepare("SELECT * FROM users WHERE id=?").get(id);
  }
  return u;
}

// Kiểm tra trước khi tạo check: đủ câu trong quota không?
// Free = giới hạn theo câu/tháng. Premium (plan='premium') = không giới hạn (gói tháng).
export function checkQuota(questionsCount, userId = CURRENT_USER) {
  const u = ensureUser(userId);
  const quota = Number(u.monthly_quota ?? 30);
  const used = Number(u.used_this_month ?? 0);
  const unlimited = String(u.plan || "free").toLowerCase() === "premium";
  if (unlimited) {
    return { ok: true, plan: u.plan, quota_left: null, unlimited: true };
  }
  const left = quota - used;
  if (left < questionsCount) {
    const e = new Error(`Đã dùng ${used}/${quota} câu trong tháng này. Hết lượt miễn phí — nâng cấp Premium để không giới hạn câu.`);
    e.code = "QUOTA_EXCEEDED";
    e.status = 402; // Payment Required
    e.retryable = false;
    e.upgrade_hint = { code: "QUOTA_EXCEEDED", plan: "premium", message_vi: "Nâng cấp Premium để kiểm tra không giới hạn câu." };
    e.quota_left = Math.max(0, left);
    throw e;
  }
  return { ok: true, plan: u.plan, quota_left: left - questionsCount, unlimited: false };
}

// Ghi nhận sau khi tạo check thành công (chỉ trừ câu thực tế tạo).
export function consumeQuota(questionsCount, userId = CURRENT_USER) {
  db.prepare("UPDATE users SET used_this_month = used_this_month + ? WHERE id=?").run(questionsCount, userId);
}

// Ghi log chi phí AI (USD). tokens optional. Không chặn luồng chính nếu lỗi.
export function recordCost({ checkId, model, inputTokens = 0, outputTokens = 0, costUSD = 0 }) {
  try {
    db.prepare("INSERT INTO ai_cost_log(check_id, user_id, model, input_tokens, output_tokens, cost_usd, at) VALUES(?,?,?,?,?,?,?)")
      .run(checkId || null, CURRENT_USER, model || "unknown", inputTokens, outputTokens, costUSD, new Date().toISOString());
  } catch (e) {
    console.error("[quota] ghi ai_cost_log lỗi:", e?.message || e);
  }
}

// Tổng chi phí AI tích luỹ (để báo cáo T21: đơn giá thực/câu).
export function totalCost() {
  const r = db.prepare("SELECT SUM(cost_usd) AS cost, SUM(input_tokens) AS tin, SUM(output_tokens) AS tout, COUNT(*) AS calls FROM ai_cost_log").get();
  return { costUSD: r?.cost || 0, inputTokens: r?.tin || 0, outputTokens: r?.tout || 0, calls: r?.calls || 0 };
}