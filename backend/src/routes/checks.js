import { randomUUID } from "node:crypto";
import { db } from "../db/db.js";
import { parseExamText } from "../modules/parser/parser.js";
import { runRules, CATEGORY_TITLES } from "../modules/rules/rules.js";
import { aggregate } from "../modules/aggregator/aggregator.js";
import { solveNumeric } from "../modules/solver/solver.js";
import { solveBlind, counterArgue, llmConfig, solverPrompt, arguePrompt } from "../modules/llm/provider.js";
import { buildQuestionStats } from "../modules/stats/stats.js";
import { checkQuota, consumeQuota, ensureUser, totalCost, recordCost } from "../modules/quota/quota.js";

const MAX_QUESTIONS = 50;

// Danh mục môn cho phép (khớp dropdown frontend) — chặn tên rác kiểu "Ton".
const ALLOWED_SUBJECTS = ["Tin học", "Toán", "Ngữ văn", "Tiếng Anh", "Vật lý", "Hóa học", "Lịch sử", "Địa lý", "Sinh học", "GDCD", "Khác"];

function cleanText(s, maxLen) {
  return String(s ?? "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // ký tự điều khiển
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

// TODO(auth): thay bằng user từ session/JWT khi có đăng nhập thật.
export const CURRENT_USER = "demo-teacher";

function err(code, message_vi, status = 400, retryable = false) {
  const e = new Error(message_vi);
  e.status = status; e.code = code; e.retryable = retryable;
  return e;
}

// Chặn IDOR: mọi thao tác trên check phải thuộc về user hiện tại.
export function getOwnedCheck(id) {
  const check = db.prepare("SELECT * FROM checks WHERE id=? AND user_id=?").get(id, CURRENT_USER);
  if (!check) throw err("NOT_FOUND", "Không tìm thấy lần kiểm tra.", 404);
  return check;
}

export function listChecks(req, res, next) {
  try {
    const rows = db.prepare("SELECT id,title,subject,grade,level_expect,group_kind,has_answer,question_format,status,created_at,(SELECT COUNT(*) FROM questions WHERE check_id=checks.id) AS question_count FROM checks WHERE user_id=? ORDER BY created_at DESC LIMIT 50").all(CURRENT_USER);
    res.json({ checks: rows });
  } catch (e) { next(e); }
}

export function createCheck(req, res, next) {
  try {
    const { title = "Bài kiểm tra", subject = "Toán", grade = "", level_expect = "", check_level = "", group_kind = "", exam_text = "", questions = [], has_answer = "auto", question_format = "auto" } = req.body ?? {};
    // Làm sạch tên đề/môn/lớp: chống tên rác, ký tự điều khiển, chuỗi quá dài
    const cleanTitle = cleanText(title, 120) || "Bài kiểm tra";
    const cleanSubject = cleanText(subject, 30) || "Toán";
    if (!ALLOWED_SUBJECTS.some((s) => s.toLowerCase() === cleanSubject.toLowerCase())) {
      throw err("BAD_SUBJECT", `Môn không hợp lệ. Chọn trong: ${ALLOWED_SUBJECTS.join(", ")}.`, 400);
    }
    const cleanGrade = cleanText(grade, 20);
    const rawLen = typeof exam_text === "string" && exam_text ? exam_text.length : JSON.stringify(questions ?? "").length;
    if (rawLen > 20_000) throw err("INPUT_TOO_LONG", "Nội dung quá dài (tối đa ~20.000 ký tự). Hãy chia nhỏ.", 413);

    let parsed = questions;
    if (exam_text && (!questions || questions.length === 0)) parsed = parseExamText(exam_text);
    if (!parsed || parsed.length === 0) throw err("INPUT_EMPTY", "Chưa tách được câu hỏi nào. Hãy kiểm tra định dạng A/B/C/D.", 400);
    if (parsed.length > MAX_QUESTIONS) throw err("INPUT_TOO_LONG", `Tối đa ${MAX_QUESTIONS} câu/lần.`, 413);
    // T18 paywall: chặn TRƯỚC khi tạo để free không dùng vô hạn.
    const quota = checkQuota(parsed.length);

    const id = randomUUID();
    const group = group_kind || guessGroup(cleanSubject);
    // check_level từ FE (standard|deep): lưu vào level_expect để run dùng
    const level = check_level || level_expect || "standard";
    // has_answer: true | false | "auto" (mặc định). auto: <30% câu có đáp án -> coi như không có.
    const answeredCount = parsed.filter((q) => String(q.expected_answer ?? "").trim() !== "").length;
    const detectedHasAnswer = answeredCount / parsed.length >= 0.3;
    const hasAnswer = has_answer === "auto" || has_answer == null
      ? detectedHasAnswer
      : has_answer === true || has_answer === 1 || has_answer === "true";
    // question_format: choice | essay | "auto". auto: có dấu hiệu A-D -> choice, ngược lại essay.
    const optCount = parsed.filter((q) => [q.opt_a, q.opt_b, q.opt_c, q.opt_d].some((o) => String(o ?? "").trim() !== "")).length;
    const detectedFormat = optCount / parsed.length >= 0.3 ? "choice" : "essay";
    const format = question_format === "auto" || question_format == null
      ? detectedFormat
      : (question_format === "essay" ? "essay" : "choice");
    db.prepare("INSERT INTO checks(id,user_id,title,subject,grade,level_expect,group_kind,has_answer,question_format,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
      .run(id, CURRENT_USER, cleanTitle, cleanSubject, cleanGrade, level, group, hasAnswer ? 1 : 0, format, "created", new Date().toISOString());
    const qins = db.prepare("INSERT INTO questions(id,check_id,ord,content,opt_a,opt_b,opt_c,opt_d,expected_answer,explanation) VALUES(?,?,?,?,?,?,?,?,?,?)");
    parsed.forEach((q, i) => qins.run(randomUUID(), id, i + 1, q.content ?? "", q.opt_a ?? "", q.opt_b ?? "", q.opt_c ?? "", q.opt_d ?? "", q.expected_answer ?? "", q.explanation ?? ""));
    consumeQuota(parsed.length);
    res.json({ check_id: id, question_count: parsed.length, group_kind: group, level_expect: level, has_answer: hasAnswer, answer_detected: detectedHasAnswer, question_format: format, format_detected: detectedFormat, quota_left: quota.unlimited ? null : quota.quota_left });
  } catch (e) { next(e); }
}

export async function runCheck(req, res, next) {
  try {
    const { id } = req.params;
    const { criteria = [], force = false, only_ord = null } = req.body ?? {};
    void criteria;
    const check = getOwnedCheck(id);
    let questions = db.prepare("SELECT * FROM questions WHERE check_id=? ORDER BY ord").all(id);
    if (only_ord != null) questions = questions.filter((q) => q.ord === Number(only_ord));
    if (!force) {
      // cho chạy lại câu chưa có findings (retry từng câu), bỏ qua câu đã xong
      const doneIds = new Set(db.prepare("SELECT DISTINCT question_id AS qid FROM findings WHERE question_id IN (SELECT id FROM questions WHERE check_id=?)").all(id).map((r) => r.qid));
      const pending = questions.filter((q) => !doneIds.has(q.id));
      if (!pending.length) {
        const n = db.prepare("SELECT COUNT(*) AS c FROM findings WHERE question_id IN (SELECT id FROM questions WHERE check_id=?)").get(id).c;
        return res.json({ check_id: id, status: "done", finding_count: n });
      }
      questions = pending;
    } else if (only_ord == null) {
      db.prepare("DELETE FROM findings WHERE question_id IN (SELECT id FROM questions WHERE check_id=?)").run(id);
    } else {
      const qids = questions.map((q) => q.id);
      for (const qid of qids) db.prepare("DELETE FROM findings WHERE question_id=?").run(qid);
    }
    const started = Date.now();
    const finsIns = db.prepare("INSERT INTO findings(id,question_id,severity,category,evidence,expected_answer,suggested_answer,fix_suggestion,confidence,verification_method,status) VALUES(?,?,?,?,?,?,?,?,?,?,?)");
    let count = 0;
    // deep: giải mù + phản biện cho mọi câu (tối đa 10 câu tốn token), standard: chỉ khi cần
    const deep = check.level_expect === "deep";
    let deepArgueLeft = 10;
    const allQs = db.prepare("SELECT * FROM questions WHERE check_id=? ORDER BY ord").all(id);
    const cfg = llmConfig();
    // T18: đếm usage để ghi log chi phí. llmConfig chưa trả usage thật (callLLM
    // chưa cắm provider) nên ước lượng theo độ dài prompt (~4 ký tự/token) —
    // đủ để biết đơn giá/câu thực tế, sẽ thay bằng usage thật khi cắm provider.
    const usage = { inputTokens: 0, outputTokens: 0, calls: 0 };
    const est = (s) => Math.ceil(String(s ?? "").length / 4);
    for (const q of questions) {
      const ruleFindings = runRules(q, check, allQs);
      let solver = null, llm = null;
      const isInsufficient = ruleFindings.some((f) => f.category === "noi_dung_chua_du");

      if (!isInsufficient && check.group_kind === "T") {
        solver = await solveNumeric(q).catch((e) => ({ value: null, steps: "", method: "computed", error: e }));
        if (solver?.error?.code === "SOLVER_TIMEOUT") {
          llm = { status: "fallback", confidence: "thấp", note: "solver timeout — chưa thể kết luận" };
        }
      }
      // Phản biện có điều kiện: solver lệch đáp án GV HOẶC rules confidence thấp / thiếu đáp án
      // deep: luôn phản biện (tối đa 10 câu) để kiểm tra sâu
      // đề không đáp án: không kích argue chỉ vì thiếu đáp án (tránh tốn token vô ích)
      const hasAns = Number(check.has_answer ?? 1) !== 0;
      const needArgue = solver?.matchLetter && q.expected_answer && solver.matchLetter !== q.expected_answer;
      const lowConf = ruleFindings.some((f) => f.confidence === "thấp" || (hasAns && f.category === "thieu_dap_an"));
      const wantDeep = deep && deepArgueLeft > 0;
      if (!isInsufficient && llmConfig().hasKey && (needArgue || lowConf || wantDeep)) {
        if (wantDeep && !needArgue && !lowConf) deepArgueLeft--;
        const blind = await solveBlind(q);
        if (!blind?.status) llm = await counterArgue(q, blind.answer || "");
        else if (blind?.status === "fallback") llm = blind;
        if (blind && !blind.status) {
          usage.inputTokens += est(solverPrompt(q)) + est(arguePrompt(q, blind.answer || ""));
          usage.outputTokens += est(blind.steps) + est(llm?.evidence) + 200;
          usage.calls += 2;
        } else if (blind?.status === "solved" || blind?.answer) {
          usage.inputTokens += est(solverPrompt(q));
          usage.outputTokens += est(blind.steps) + 200;
          usage.calls += 1;
        }
      }
      const final = aggregate(q, check, ruleFindings, { solver, llm });
      for (const f of final) {
        finsIns.run(randomUUID(), q.id, f.severity, f.category, f.evidence, f.expected_answer ?? "", f.suggested_answer ?? "", f.fix_suggestion ?? "", f.confidence ?? "vừa", f.verification_method ?? "rule", "pending");
        count++;
      }
    }
    // Ghi log chi phí AI (T18). costUSD = 0 nếu chưa điền LLM_PRICE_IN/OUT.
    const costUSD = (usage.inputTokens / 1e6) * cfg.priceIn + (usage.outputTokens / 1e6) * cfg.priceOut;
    recordCost({ checkId: id, model: cfg.hasKey ? `${cfg.provider}/${cfg.model}` : "rules-only", ...usage, costUSD });
    db.prepare("UPDATE checks SET status='done' WHERE id=?").run(id);
    res.json({ check_id: id, status: "done", finding_count: count, elapsed_ms: Date.now() - started, model: cfg.hasKey ? `${cfg.provider}/${cfg.model}` : "rules-only", usage: { ...usage, costUSD } });
  } catch (e) { next(e); }
}

// Thống kê DUY NHẤT từ findings đã lưu: số câu có vấn đề, số lỗi xác định (blocker),
// số cảnh báo (review), số gợi ý (hint+info). Mọi nơi hiển thị dùng chung object này.
export { buildQuestionStats };

function enrichFinding(f) {
  const isErr = f.severity === "blocker" || f.severity === "error";
  const isWarn = f.severity === "review" || f.severity === "warning";
  const defaultTitle = isErr ? "Lỗi cần xử lý" : isWarn ? "Nghi vấn cần kiểm tra" : "Gợi ý kiểm chứng";
  return {
    ...f,
    title: f.title || CATEGORY_TITLES[f.category] || defaultTitle,
  };
}

export function getResults(req, res, next) {
  try {
    const { id } = req.params;
    const check = getOwnedCheck(id);
    const questions = db.prepare("SELECT * FROM questions WHERE check_id=? ORDER BY ord").all(id);
    const rawFindings = db.prepare("SELECT * FROM findings WHERE question_id IN (SELECT id FROM questions WHERE check_id=?)").all(id);
    const findings = rawFindings.map(enrichFinding);
    const byQ = new Map(questions.map((q) => [q.id, { ...q, findings: [] }]));
    for (const f of findings) byQ.get(f.question_id)?.findings.push(f);
    const counts = { blocker: 0, review: 0, warning: 0, hint: 0, info: 0, ok: 0 };
    for (const f of findings) if (counts[f.severity] !== undefined) counts[f.severity]++;
    const done = questions.filter((q) => byQ.get(q.id)?.findings.length).length;
    res.json({ check, questions: [...byQ.values()], counts, question_stats: buildQuestionStats(questions, findings), progress: { done, total: questions.length } });
  } catch (e) { next(e); }
}

export function review(req, res, next) {
  try {
    const { qid } = req.params;
    const { finding_id, action } = req.body ?? {};
    if (!["confirmed", "rejected", "needs_expert"].includes(action)) throw err("BAD_ACTION", "Hành động không hợp lệ.", 400);
    const f = db.prepare("SELECT * FROM findings WHERE id=?").get(finding_id);
    if (!f) throw err("NOT_FOUND", "Không tìm thấy cảnh báo.", 404);
    // Chặn IDOR: question phải thuộc check của user hiện tại
    const owner = db.prepare("SELECT q.id FROM questions q JOIN checks c ON c.id=q.check_id WHERE q.id=? AND c.user_id=?").get(qid, CURRENT_USER);
    if (!owner || f.question_id !== qid) throw err("BAD_REQUEST", "finding_id không thuộc câu hỏi này.", 400);
    const r = db.prepare("UPDATE findings SET status=? WHERE id=?").run(action, finding_id);
    if (r.changes === 0) throw err("NOT_FOUND", "Không tìm thấy cảnh báo.", 404);
    db.prepare("INSERT INTO decisions_log(question_id,finding_id,action,at) VALUES(?,?,?,?)").run(qid, finding_id, action, new Date().toISOString());
    res.json({ ok: true });
  } catch (e) { next(e); }
}

export function getReport(req, res, next) {
  try {
    const { id } = req.params;
    const check = getOwnedCheck(id);
    const questions = db.prepare("SELECT * FROM questions WHERE check_id=? ORDER BY ord").all(id);
    const nQ = questions.length;
    const rawFindings = db.prepare("SELECT f.*, q.ord, q.content, q.expected_answer AS q_expected_answer FROM findings f JOIN questions q ON q.id=f.question_id WHERE q.check_id=? ORDER BY q.ord").all(id);
    const findings = rawFindings.map(enrichFinding);
    const confirmed = findings.filter((f) => f.status === "confirmed");
    const pending = findings.filter((f) => f.status === "pending");
    const needsExpert = findings.filter((f) => f.status === "needs_expert");
    const okQ = db.prepare("SELECT COUNT(*) AS c FROM questions WHERE check_id=? AND id NOT IN (SELECT question_id FROM findings WHERE severity != 'ok')").get(id).c;
    // Đếm theo MỨC ĐỘ để bảng tổng khớp màu thẻ cảnh báo (không theo trạng thái duyệt)
    const sev = db.prepare("SELECT severity, COUNT(*) AS c FROM findings WHERE question_id IN (SELECT id FROM questions WHERE check_id=?) GROUP BY severity").all(id);
    const severity_counts = { blocker: 0, review: 0, warning: 0, hint: 0, info: 0 };
    for (const r of sev) if (severity_counts[r.severity] !== undefined) severity_counts[r.severity] = r.c;
    const cfg = llmConfig();
    res.json({
      check,
      summary: { total_questions: nQ, confirmed: confirmed.length, pending: pending.length, needs_expert: needsExpert.length, ok_questions: okQ, severity_counts, question_stats: buildQuestionStats(questions, findings) },
      findings,
      confirmed, pending, needs_expert: needsExpert,
      scope_note: scopeNote(check),
      model: cfg.hasKey ? `${cfg.provider}/${cfg.model}` : "rules-only",
      generated_at: new Date().toISOString(),
    });
  } catch (e) { next(e); }
}

export function removeCheck(req, res, next) {
  try {
    getOwnedCheck(req.params.id); // chặn xóa đề của người khác
    db.prepare("DELETE FROM findings WHERE question_id IN (SELECT id FROM questions WHERE check_id=?)").run(req.params.id);
    db.prepare("DELETE FROM questions WHERE check_id=?").run(req.params.id);
    db.prepare("DELETE FROM checks WHERE id=?").run(req.params.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
}

export function getMe(req, res, next) {
  try {
    const u = ensureUser();
    const quota = Number(u.monthly_quota ?? 30);
    const used = Number(u.used_this_month ?? 0);
    const premium = String(u.plan || "free").toLowerCase() === "premium";
    res.json({
      user: {
        id: u.id, display_name: u.display_name, plan: u.plan,
        monthly_quota: quota, used_this_month: used,
        // FE dùng để hiện banner upsell + chặn sớm trước khi gọi API.
        quota_left: premium ? null : Math.max(0, quota - used),
        unlimited: premium,
      },
      ai_cost: totalCost(), // T18: tổng cost đã ghi — để T21 đo đơn giá thực/câu
    });
  } catch (e) { next(e); }
}

function guessGroup(subject = "") {
  const s = subject.toLowerCase();
  if (/toán|toan|lý|ly|hóa|hoa|vật lý|vat ly/.test(s)) return "T";
  if (/anh|tiếng anh|tieng anh|tin học|tin hoc/.test(s)) return "N";
  return "H";
}

function scopeNote(check) {
  if (!check) return "";
  if (check.group_kind === "T") return "Nhóm tính toán: đáp án số đã đối chiếu bằng solver sandbox (computed) + rules; LLM chỉ phản biện khi lệch.";
  if (check.group_kind === "N") return "Nhóm ngôn ngữ/quy tắc: chỉ kiểm cấu trúc và lỗi cơ bản (rule), tối đa Nên xem — không kết luận nghĩa văn chương.";
  return "Nhóm hiểu/nhận định: AI chỉ gợi ý (llm-suggest), CHƯA thể kết luận — giáo viên quyết định cuối cùng.";
}

