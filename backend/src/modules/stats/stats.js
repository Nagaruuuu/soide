// Thống kê DUY NHẤT từ findings đã lưu: số câu có vấn đề, số lỗi xác định (blocker),
// số cảnh báo (review), số gợi ý (hint+info). Mọi nơi hiển thị dùng chung object này.
export function buildQuestionStats(questions, findings) {
  const byQ = new Map(questions.map((q) => [q.id, []]));
  for (const f of findings) if (byQ.has(f.question_id)) byQ.get(f.question_id).push(f.severity);
  let withIssue = 0, errors = 0, warnings = 0, infos = 0;
  for (const sevs of byQ.values()) {
    if (!sevs.length || sevs.every((s) => s === "ok")) continue;
    withIssue++;
    if (sevs.includes("blocker")) errors++;
    else if (sevs.includes("review") || sevs.includes("warning")) warnings++;
    else infos++;
  }
  return {
    total: questions.length,
    with_issue: withIssue,
    errors, warnings, infos,
    ok: questions.length - withIssue,
  };
}
