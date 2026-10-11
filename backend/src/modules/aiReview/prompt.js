// Prompt mù đáp án: KHÔNG mặc định đáp án GV đúng, không sửa đề gốc,
// chỉ viện dẫn tài liệu khi có nguồn thật, nêu điều kiện khi nhiều cách hiểu.

export const REVIEW_SYSTEM = `Bạn là chuyên gia thẩm định đề trắc nghiệm. Nhiệm vụ: phát hiện lỗi KHÓ thấy bằng code.
NGUYÊN TẮC BẮT BUỘC:
- Đáp án do đề cung cấp CHƯA CHẮC đúng — hãy nghi ngờ độc lập, không mặc định nó đúng.
- KHÔNG sửa đề, chỉ ra vấn đề kèm trích đoạn nguyên văn.
- Chỉ 3 mức: high (có bằng chứng cụ thể), medium (nghi vấn có cơ sở), low (gợi ý kiểm tra thêm). Không dùng mức khác.
- KHÔNG trả về trường confidence dưới mọi hình thức.
- reference: chỉ ghi khi đề bài đã cung cấp nguồn (tên bài/mục trong đề); TUYỆT ĐỐI không bịa tên SGK, bài học, số trang.
- Với câu nhiều đáp án tùy cách hiểu: nêu rõ ĐIỀU KIỆN/cách hiểu dẫn tới từng đáp án.
- Không có vấn đề thì trả {"findings": []}. Không cảnh báo không có nghĩa câu chắc chắn đúng.
CHỈ trả JSON: {"findings": [{"questionNumber": <số trong thẻ <question number="N">>, "issueType": "AMBIGUOUS|MISSING_DATA|MULTI_VALID|MISMATCH_OPTIONS|WRONG_KEY|OUT_OF_SCOPE|CONTRADICTION", "severity": "high|medium|low", "evidence": "<trích đoạn nguyên văn>", "explanation": "<phần nào gây vấn đề, vì sao>", "suggestion": "<GV xem xét sửa thế nào>", "reference": "<chỉ khi có nguồn thật, nếu không bỏ trống>"}]}`;

export function buildReviewUser(q, validatorFlags = []) {
  const lines = [
    `Câu ${q._num ?? q.ord ?? "?"}: ${q.content || ""}`,
    `A. ${q.opt_a || ""}`,
    `B. ${q.opt_b || ""}`,
    `C. ${q.opt_c || ""}`,
    `D. ${q.opt_d || ""}`,
  ];
  if (q.expected_answer) lines.push(`(Đáp án theo đề: ${q.expected_answer} — CHƯA XÁC MINH, hãy nghi ngờ độc lập)`);
  if (q.explanation) lines.push(`(Lời giải theo đề: ${String(q.explanation).slice(0, 300)})`);
  if (validatorFlags.length) {
    lines.push(`(Rule-based đã phát hiện: ${validatorFlags.join(", ")} — đừng lặp lại, chỉ tìm lỗi KHÓ mà code bỏ sót)`);
  }
  return lines.join("\n");
}

// Batch nhỏ: gộp tối đa 3 câu/1 prompt để tiết kiệm lượt gọi, mỗi câu vẫn tách finding riêng.
export function buildBatchUser(items = []) {
  return items.map(({ q, flags, refsBlock }) => {
    const body = `<question number="${q._num ?? q.ord ?? "?"}">\n${buildReviewUser(q, flags)}\n</question>`;
    return refsBlock ? `${body}\n${refsBlock}` : body;
  }).join("\n\n");
}
