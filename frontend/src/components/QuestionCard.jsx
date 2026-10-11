import React from "react";
import { IconCheck, IconX, IconHelp, IconAlertCircle, IconAlertTriangle, IconInfo, IconCheckCircle } from "./Icons.jsx";

const SEV_CONFIG = {
  blocker: { label: "Chặn lại", badgeClass: "badge-blocker", Icon: IconAlertCircle },
  review: { label: "Nên xem", badgeClass: "badge-review", Icon: IconAlertTriangle },
  hint: { label: "Gợi ý", badgeClass: "badge-hint", Icon: IconInfo },
  ok: { label: "Ổn định", badgeClass: "badge-ok", Icon: IconCheckCircle },
};

export default function QuestionCard({ q, filter = "all", onReview, onRetry }) {
  const findings = (q.findings || []).filter((f) => filter === "all" || f.severity === filter);

  return (
    <div className="question-card">
      <div className="question-card-top">
        <div className="question-title-group">
          <span className="question-ord">Câu {q.ord}</span>
          <div className="question-content">{q.content}</div>
        </div>
      </div>

      <div className="choices-grid">
        {[
          ["A", q.opt_a],
          ["B", q.opt_b],
          ["C", q.opt_c],
          ["D", q.opt_d],
        ].map(([letter, text]) => {
          const isExpected = (q.expected_answer || "").toUpperCase() === letter;
          return (
            <div key={letter} className={`choice-box ${isExpected ? "is-expected" : ""}`}>
              <span className="choice-letter">{letter}</span>
              <span className="choice-text">{text || <em>(trống)</em>}</span>
              {isExpected && (
                <span className="choice-expected-tag">
                  <IconCheck size={12} />
                  <span>Đáp án GV</span>
                </span>
              )}
            </div>
          );
        })}
      </div>

      {!q.findings?.length && (
        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
          <span className="badge badge-method">Chưa kiểm tra</span>
          {onRetry && (
            <button className="btn btn-secondary btn-sm" onClick={() => onRetry(q)}>
              Thử lại câu này
            </button>
          )}
        </div>
      )}

      {filter !== "all" && !findings.length && (
        <div style={{ color: "var(--text-muted)", marginTop: 8, fontSize: 13 }}>
          Không có cảnh báo mức này.
        </div>
      )}

      {findings.map((f) => {
        const conf = SEV_CONFIG[f.severity] || { label: f.severity, badgeClass: "badge-review", Icon: IconAlertTriangle };
        const SevIcon = conf.Icon;
        const statusClass = `status-${f.status || "pending"}`;
        const statusText =
          f.status === "confirmed"
            ? "Đã xác nhận lỗi"
            : f.status === "rejected"
            ? "Đã bác bỏ"
            : f.status === "needs_expert"
            ? "Cần chuyên gia"
            : "Chờ giáo viên duyệt";

        return (
          <div key={f.id} className={`finding-box sev-${f.severity}`}>
            <div className="finding-meta">
              <div className="finding-meta-left">
                <span className={`badge ${conf.badgeClass}`}>
                  <SevIcon size={13} />
                  <span>{conf.label}</span>
                </span>
                <span className="badge badge-method">{f.verification_method}</span>
                <span className="badge-conf">
                  Độ tin cậy: <strong>{f.confidence}</strong>
                </span>
              </div>
              <div>
                <span className={`status-badge ${statusClass}`}>{statusText}</span>
              </div>
            </div>

            <div className="finding-evidence">
              {f.severity === "ok" || f.category === "on" || f.category === "ok" || !f.evidence || f.evidence === "on" ? (
                <>
                  <strong>Đánh giá sơ bộ:</strong> {f.evidence && f.evidence !== "on" ? f.evidence : "Chưa phát hiện bất thường"}
                </>
              ) : (
                <>
                  <strong>{f.category}:</strong> {f.evidence}
                </>
              )}
            </div>

            {f.suggested_answer && (
              <div className="finding-fix" style={{ marginBottom: 6 }}>
                Đề xuất đáp án: <strong>{f.suggested_answer}</strong> (Đáp án GV: {f.expected_answer || q.expected_answer})
              </div>
            )}

            {f.fix_suggestion && (
              <div className="finding-fix">
                <strong>Gợi ý sửa:</strong> {f.fix_suggestion}
              </div>
            )}

            <div className="review-actions">
              <span className="review-label">Thẩm định của GV:</span>
              <button className="btn-review-action act-confirm" onClick={() => onReview?.(q.id, f.id, "confirmed")}>
                <IconCheck size={14} />
                <span>Xác nhận đúng</span>
              </button>
              <button className="btn-review-action act-reject" onClick={() => onReview?.(q.id, f.id, "rejected")}>
                <IconX size={14} />
                <span>Bác bỏ</span>
              </button>
              <button className="btn-review-action act-expert" onClick={() => onReview?.(q.id, f.id, "needs_expert")}>
                <IconHelp size={14} />
                <span>Cần chuyên gia</span>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
