import { randomUUID } from "node:crypto";
import { db } from "../db/db.js";
import { parseExamText } from "../modules/parser/parser.js";
import { runRules } from "../modules/rules/rules.js";
import { aggregate } from "../modules/aggregator/aggregator.js";
import { solveNumeric } from "../modules/solver/solver.js";
import { solveBlind, counterArgue, llmConfig } from "../modules/llm/provider.js";

const MAX_QUESTIONS = 50;

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
    const rows = db.prepare("SELECT id,title,subject,grade,level_expect,group_kind,status,created_at,(SELECT COUNT(*) FROM questions WHERE check_id=checks.id) AS question_count FROM checks WHERE user_id=? ORDER BY created_at DESC LIMIT 50").all(CURRENT_USER);
    res.json({ checks: rows });
  } catch (e) { next(e); }
}

export function createCheck(req, res, next) {
  try {
    const { title = "Bài kiểm tra", subject = "Toán", grade = "", level_expect = "", check_level = "", group_kind = "", exam_text = "", questions = [] } = req.body ?? {};
    const rawLen = typeof exam_text === "string" && exam_text ? exam_text.length : JSON.stringify(questions ?? "").length;
    if (rawLen > 20_000) throw err("INPUT_TOO_LONG", "Nội dung quá dài (tối đa ~20.000 ký tự). Hãy chia nhỏ.", 413);

    let parsed = questions;
    if (exam_text && (!questions || questions.length === 0)) parsed = parseExamText(exam_text);
    if (!parsed || parsed.length === 0) throw err("INPUT_EMPTY", "Chưa tách được câu hỏi nào. Hãy kiểm tra định dạng A/B/C/D.", 400);
    if (parsed.length > MAX_QUESTIONS) throw err("INPUT_TOO_LONG", `Tối đa ${MAX_QUESTIONS} câu/lần.`, 413);

    const id = randomUUID();
    const group = group_kind || guessGroup(subject);
    // check_level từ FE (standard|deep): lưu vào level_expect để run dùng
    const level = check_level || level_expect || "standard";
    db.prepare("INSERT INTO checks(id,user_id,title,subject,grade,level_expect,group_kind,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
      .run(id, CURRENT_USER, title, subject, grade, level, group, "created", new Date().toISOString());
    const qins = db.prepare("INSERT INTO questions(id,check_id,ord,content,opt_a,opt_b,opt_c,opt_d,expected_answer,explanation) VALUES(?,?,?,?,?,?,?,?,?,?)");
    parsed.forEach((q, i) => qins.run(randomUUID(), id, i + 1, q.content ?? "", q.opt_a ?? "", q.opt_b ?? "", q.opt_c ?? "", q.opt_d ?? "", q.expected_answer ?? "", q.explanation ?? ""));
    db.prepare("UPDATE users SET used_this_month = used_this_month + ? WHERE id=?").run(parsed.length, CURRENT_USER);
    res.json({ check_id: id, question_count: parsed.length, group_kind: group, level_expect: level });
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
    for (const q of questions) {
      const ruleFindings = runRules(q, check, allQs);
      let solver = null, llm = null;
      if (check.group_kind === "T") {
        solver = await solveNumeric(q).catch((e) => ({ value: null, steps: "", method: "computed", error: e }));
        if (solver?.error?.code === "SOLVER_TIMEOUT") {
          llm = { status: "fallback", confidence: "thấp", note: "solver timeout — chưa thể kết luận" };
        }
      }
      // Phản biện có điều kiện: solver lệch đáp án GV HOẶC rules confidence thấp / thiếu đáp án
      // deep: luôn phản biện (tối đa 10 câu) để kiểm tra sâu
      const needArgue = solver?.matchLetter && q.expected_answer && solver.matchLetter !== q.expected_answer;
      const lowConf = ruleFindings.some((f) => f.confidence === "thấp" || f.category === "thieu_dap_an");
      const wantDeep = deep && deepArgueLeft > 0;
      if (llmConfig().hasKey && (needArgue || lowConf || wantDeep)) {
        if (wantDeep && !needArgue && !lowConf) deepArgueLeft--;
        const blind = await solveBlind(q);
        if (!blind?.status) llm = await counterArgue(q, blind.answer || "");
        else if (blind?.status === "fallback") llm = blind;
      }
      const final = aggregate(q, check, ruleFindings, { solver, llm });
      for (const f of final) {
        finsIns.run(randomUUID(), q.id, f.severity, f.category, f.evidence, f.expected_answer ?? "", f.suggested_answer ?? "", f.fix_suggestion ?? "", f.confidence ?? "vừa", f.verification_method ?? "rule", "pending");
        count++;
      }
    }
    db.prepare("UPDATE checks SET status='done' WHERE id=?").run(id);
    const cfg = llmConfig();
    res.json({ check_id: id, status: "done", finding_count: count, elapsed_ms: Date.now() - started, model: cfg.hasKey ? `${cfg.provider}/${cfg.model}` : "rules-only" });
  } catch (e) { next(e); }
}

export function getResults(req, res, next) {
  try {
    const { id } = req.params;
    const check = getOwnedCheck(id);
    const questions = db.prepare("SELECT * FROM questions WHERE check_id=? ORDER BY ord").all(id);
    const findings = db.prepare("SELECT * FROM findings WHERE question_id IN (SELECT id FROM questions WHERE check_id=?)").all(id);
    const byQ = new Map(questions.map((q) => [q.id, { ...q, findings: [] }]));
    for (const f of findings) byQ.get(f.question_id)?.findings.push(f);
    const counts = { blocker: 0, review: 0, hint: 0, ok: 0 };
    for (const f of findings) if (counts[f.severity] !== undefined) counts[f.severity]++;
    const done = questions.filter((q) => byQ.get(q.id)?.findings.length).length;
    res.json({ check, questions: [...byQ.values()], counts, progress: { done, total: questions.length } });
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
    const findings = db.prepare("SELECT f.*, q.ord, q.content, q.expected_answer AS q_expected_answer FROM findings f JOIN questions q ON q.id=f.question_id WHERE q.check_id=? ORDER BY q.ord").all(id);
    const confirmed = findings.filter((f) => f.status === "confirmed");
    const pending = findings.filter((f) => f.status === "pending");
    const needsExpert = findings.filter((f) => f.status === "needs_expert");
    const okQ = db.prepare("SELECT COUNT(*) AS c FROM questions WHERE check_id=? AND id NOT IN (SELECT question_id FROM findings WHERE severity != 'ok')").get(id).c;
    const cfg = llmConfig();
    const matrix_gdpt_2018 = computeMatrixGDPT2018(questions);
    res.json({
      check,
      summary: { total_questions: nQ, confirmed: confirmed.length, pending: pending.length, needs_expert: needsExpert.length, ok_questions: okQ },
      matrix_gdpt_2018,
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
    const user = db.prepare("SELECT id, display_name, plan, monthly_quota, used_this_month FROM users WHERE id=?").get("demo-teacher");
    res.json({ user });
  } catch (e) { next(e); }
}

export function computeMatrixGDPT2018(questions = []) {
  if (!questions || questions.length === 0) {
    // Đề rỗng: trả rỗng trung thực, KHÔNG bịa số liệu mẫu
    return {
      total: 0,
      available: false,
      distribution: {
        biet: { count: 0, percent: 0, label: "Nhận biết", target: "40%" },
        hieu: { count: 0, percent: 0, label: "Thông hiểu", target: "30%" },
        van_dung: { count: 0, percent: 0, label: "Vận dụng", target: "20%" },
        van_dung_cao: { count: 0, percent: 0, label: "Vận dụng cao", target: "10%" },
      },
      format_structure: {
        part1: { count: 0, percent: 0, label: "Phần I: Nhiều lựa chọn (4 PA)" },
        part2: { count: 0, percent: 0, label: "Phần II: Đúng / Sai (4 ý)" },
        part3: { count: 0, percent: 0, label: "Phần III: Trả lời ngắn" },
      },
      pedagogical_score: null,
      pedagogical_assessment: "Chưa có câu hỏi nào để đánh giá ma trận.",
      recommendation: "Khung ma trận tham chiếu chuẩn: 40% Biết · 30% Hiểu · 20% Vận dụng · 10% Vận dụng cao.",
    };
  }

  const counts = { biet: 0, hieu: 0, van_dung: 0, van_dung_cao: 0 };
  const formats = { part1: 0, part2: 0, part3: 0 };

  const categorizedQuestions = questions.map((q) => {
    const text = (q.content || "").toLowerCase();
    let level = "biet";
    if (/tối ưu|cực trị|lớn nhất|nhỏ nhất|phối hợp|chứng minh|thực tiễn cao|nâng cao/.test(text)) {
      level = "van_dung_cao";
      counts.van_dung_cao++;
    } else if (/tính|bằng bao nhiêu|giá trị|vận tốc|kết quả|thu được|thực hiện phép/.test(text)) {
      level = "van_dung";
      counts.van_dung++;
    } else if (/tại sao|giải thích|vì sao|phân biệt|so sánh|nguyên nhân|chức năng|ý nghĩa/.test(text)) {
      level = "hieu";
      counts.hieu++;
    } else {
      level = "biet";
      counts.biet++;
    }

    let fmt = "part1";
    if (q.q_type === "true_false" || /đúng.*sai/i.test(text)) {
      fmt = "part2";
      formats.part2++;
    } else if (q.q_type === "short_answer" || (!q.opt_c && !q.opt_d)) {
      fmt = "part3";
      formats.part3++;
    } else {
      fmt = "part1";
      formats.part1++;
    }

    return { ...q, cognitive_level: level, format_type: fmt };
  });

  // Phần trăm làm tròn theo largest-remainder để tổng luôn = 100
  const total = questions.length;
  const raw = [counts.biet, counts.hieu, counts.van_dung, counts.van_dung_cao].map((c) => (c / total) * 100);
  const floors = raw.map(Math.floor);
  let rest = 100 - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; k < order.length && rest > 0; k++, rest--) floors[order[k][1]]++;
  const [pBiet, pHieu, pVD, pVDC] = floors;

  let assessment = "Độ phủ ma trận hài hòa theo định hướng kiểm tra đánh giá năng lực của Bộ GD&ĐT.";
  if (counts.van_dung_cao === 0 && total >= 5) {
    assessment = "Đề thi đang tập trung ở mức Nhận biết - Thông hiểu; nên bổ sung thêm 5-10% câu hỏi Vận dụng cao để tăng tính phân hóa.";
  } else if (pBiet > 55) {
    assessment = "Tỷ lệ câu hỏi Nhận biết đang chiếm trên 50%; phù hợp kiểm tra định kỳ cơ bản nhưng cần thêm bài toán vận dụng.";
  }

  // Điểm suy từ dữ liệu thật: phủ đủ 4 mức + cân đối tỉ trọng
  const levelsPresent = [counts.biet, counts.hieu, counts.van_dung, counts.van_dung_cao].filter((c) => c > 0).length;
  const balanced = pBiet >= 25 && pBiet <= 55 && (pHieu + pVD + pVDC) >= 40;
  const pedagogical_score = Math.min(10, 6.5 + levelsPresent * 0.5 + (balanced ? 1.0 : 0) + (counts.van_dung_cao > 0 ? 0.5 : 0));

  return {
    total,
    categorizedQuestions,
    distribution: {
      biet: { count: counts.biet, percent: pBiet, label: "Nhận biết", target: "40%" },
      hieu: { count: counts.hieu, percent: pHieu, label: "Thông hiểu", target: "30%" },
      van_dung: { count: counts.van_dung, percent: pVD, label: "Vận dụng", target: "20%" },
      van_dung_cao: { count: counts.van_dung_cao, percent: pVDC, label: "Vận dụng cao", target: "10%" },
    },
    format_structure: {
      part1: { count: formats.part1, percent: Math.round((formats.part1 / total) * 100), label: "Phần I: Nhiều lựa chọn" },
      part2: { count: formats.part2, percent: Math.round((formats.part2 / total) * 100), label: "Phần II: Đúng / Sai" },
      part3: { count: formats.part3, percent: Math.round((formats.part3 / total) * 100), label: "Phần III: Trả lời ngắn" },
    },
    pedagogical_score: Number(pedagogical_score.toFixed(1)),
    pedagogical_assessment: assessment,
    recommendation: "Khung ma trận tham chiếu chuẩn: 40% Biết · 30% Hiểu · 20% Vận dụng · 10% Vận dụng cao.",
  };
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

