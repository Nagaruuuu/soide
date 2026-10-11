import React, { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import {
  IconSearch,
  IconScale,
  IconBarChart,
  IconAlertCircle,
  IconAlertTriangle,
  IconInfo,
  IconCheckCircle,
  IconCheck,
  IconX,
  IconHelp,
} from "../components/Icons.jsx";

const SEV = {
  blocker: { label: "Chặn lại", className: "q-blocker", color: "#ff4d4f", Icon: IconAlertCircle },
  review: { label: "Nên xem", className: "q-review", color: "#fa8c16", Icon: IconAlertTriangle },
  hint: { label: "Gợi ý", className: "q-hint", color: "#1677ff", Icon: IconInfo },
  ok: { label: "Ổn định", className: "q-ok", color: "#52c41a", Icon: IconCheckCircle },
};

const METHOD_LABELS = {
  rule: "Quy tắc định dạng",
  computed: "Solver tính toán lại",
  "llm-suggest": "AI phản biện chuyên sâu",
};

export default function ResultsPage({ checkId, onGoToCompare, onGoToReport, onToast }) {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadResults();
  }, [checkId]);

  async function loadResults() {
    if (!checkId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const d = await api(`/api/checks/${checkId}/results`);
      setData(d);
      setError("");
    } catch (e) {
      setError(e.message || "Lỗi tải kết quả kiểm định.");
    } finally {
      setLoading(false);
    }
  }

  async function review(qid, fid, action) {
    try {
      await api(`/api/results/${qid}`, {
        method: "PATCH",
        body: JSON.stringify({ finding_id: fid, action }),
      });
      const d = await api(`/api/checks/${checkId}/results`);
      setData(d);
      const actionText =
        action === "confirmed"
          ? "Đã xác nhận lỗi câu hỏi"
          : action === "rejected"
          ? "Đã bác bỏ cảnh báo"
          : "Đã chuyển tổ chuyên môn";
      if (onToast) onToast(actionText);
    } catch (e) {
      if (onToast) onToast("Lỗi: " + e.message);
    }
  }

  function scrollToQuestion(qid) {
    const el = document.getElementById(`question-card-${qid}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.style.borderColor = "#1677ff";
      setTimeout(() => {
        el.style.borderColor = "";
      }, 1500);
    }
  }

  if (loading) {
    return (
      <div>
        <div className="skeleton" style={{ height: 100, marginBottom: 16 }} />
        <div className="skeleton" style={{ height: 320 }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="azota-card" style={{ padding: 36, textAlign: "center" }}>
        <div style={{ color: "#ff4d4f", marginBottom: 12 }}>
          <IconAlertTriangle size={36} />
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#ff4d4f", marginBottom: 8 }}>{error}</div>
        <button className="azota-btn azota-btn-default" onClick={loadResults}>
          Thử lại
        </button>
      </div>
    );
  }

  if (!data || !data.questions) {
    return (
      <div className="azota-card" style={{ padding: 36, textAlign: "center", color: "#64748b" }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Chưa chọn đề thi nào</div>
        <div style={{ fontSize: 13 }}>Hãy tạo đề mới ở trang Kiểm tra đề hoặc chọn một đề trong Lịch sử.</div>
      </div>
    );
  }

  // Counts
  const allFindings = data.questions.flatMap((q) => q.findings || []);
  const counts = {
    blocker: allFindings.filter((f) => f.severity === "blocker").length,
    review: allFindings.filter((f) => f.severity === "review").length,
    hint: allFindings.filter((f) => f.severity === "hint").length,
    ok: allFindings.filter((f) => f.severity === "ok").length,
  };

  // Filter
  const filteredQuestions = data.questions.filter((q) => {
    if (searchQuery.trim()) {
      const matchText = (q.content + " " + q.opt_a + " " + q.opt_b + " " + q.opt_c + " " + q.opt_d).toLowerCase();
      if (!matchText.includes(searchQuery.toLowerCase())) return false;
    }
    if (filter === "all") return true;
    return (q.findings || []).some((f) => f.severity === filter);
  });

  return (
    <div>
      {/* Top Azota KPI Bar */}
      <div className="azota-kpi-bar">
        <div className="azota-kpi-card">
          <div className="azota-kpi-icon" style={{ background: "#e6f4ff", color: "#1677ff" }}>
            <IconSearch size={20} />
          </div>
          <div>
            <div className="azota-kpi-val">{data.questions.length}</div>
            <div className="azota-kpi-label">Tổng số câu hỏi</div>
          </div>
        </div>

        <div className="azota-kpi-card" style={{ borderLeft: "3px solid #ff4d4f" }}>
          <div className="azota-kpi-icon" style={{ background: "#fff1f0", color: "#ff4d4f" }}>
            <IconAlertCircle size={20} />
          </div>
          <div>
            <div className="azota-kpi-val" style={{ color: "#cf1322" }}>{counts.blocker}</div>
            <div className="azota-kpi-label">Cảnh báo chặn lại</div>
          </div>
        </div>

        <div className="azota-kpi-card" style={{ borderLeft: "3px solid #fa8c16" }}>
          <div className="azota-kpi-icon" style={{ background: "#fff7e6", color: "#fa8c16" }}>
            <IconAlertTriangle size={20} />
          </div>
          <div>
            <div className="azota-kpi-val" style={{ color: "#d46b08" }}>{counts.review}</div>
            <div className="azota-kpi-label">Cần rà soát lại</div>
          </div>
        </div>

        <div className="azota-kpi-card" style={{ borderLeft: "3px solid #52c41a" }}>
          <div className="azota-kpi-icon" style={{ background: "#f6ffed", color: "#52c41a" }}>
            <IconCheckCircle size={20} />
          </div>
          <div>
            <div className="azota-kpi-val" style={{ color: "#389e0d" }}>{counts.ok}</div>
            <div className="azota-kpi-label">Câu hỏi chuẩn hóa</div>
          </div>
        </div>
      </div>

      {/* Main 2-column Azota Layout */}
      <div className="azota-results-layout">
        {/* Left: Questions Feed */}
        <div>
          {/* Action Bar */}
          <div
            className="azota-card"
            style={{
              padding: "12px 16px",
              marginBottom: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-muted)", marginRight: 4 }}>
                Lọc mức độ:
              </span>
              <button
                className={`azota-btn azota-btn-sm ${filter === "all" ? "azota-btn-primary" : "azota-btn-default"}`}
                onClick={() => setFilter("all")}
              >
                Tất cả ({data.questions.length})
              </button>
              <button
                className={`azota-btn azota-btn-sm ${filter === "blocker" ? "azota-btn-danger" : "azota-btn-default"}`}
                onClick={() => setFilter("blocker")}
              >
                Chặn lại ({counts.blocker})
              </button>
              <button
                className={`azota-btn azota-btn-sm ${filter === "review" ? "azota-btn-primary" : "azota-btn-default"}`}
                style={filter === "review" ? { background: "#fa8c16", borderColor: "#fa8c16" } : {}}
                onClick={() => setFilter("review")}
              >
                Nên xem ({counts.review})
              </button>
              <button
                className={`azota-btn azota-btn-sm ${filter === "ok" ? "azota-btn-success" : "azota-btn-default"}`}
                onClick={() => setFilter("ok")}
              >
                Đạt ({counts.ok})
              </button>
            </div>

            <div style={{ minWidth: 200 }}>
              <input
                className="azota-input"
                style={{ height: 34, padding: "4px 10px", fontSize: 13 }}
                placeholder="Tìm nội dung câu hỏi..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Question Cards Feed */}
          {filteredQuestions.length === 0 ? (
            <div className="azota-card" style={{ padding: 40, textAlign: "center" }}>
              <div style={{ color: "#9ca3af", marginBottom: 8 }}>
                <IconSearch size={32} />
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-main)" }}>
                Không có câu hỏi nào khớp với bộ lọc
              </div>
            </div>
          ) : (
            filteredQuestions.map((q) => {
              const visibleFindings = (q.findings || []).filter(
                (f) => filter === "all" || f.severity === filter
              );

              return (
                <div key={q.id} id={`question-card-${q.id}`} className="azota-question-card">
                  {/* Question Header */}
                  <div className="azota-qheader">
                    <div className="azota-qtitle">
                      <span className="azota-qbadge">Câu {q.ord}</span>
                      <span>{q.content}</span>
                    </div>
                  </div>

                  {/* 4 Choices Grid (Azota Radio Style) */}
                  <div className="azota-choices-grid">
                    {[
                      ["A", q.opt_a],
                      ["B", q.opt_b],
                      ["C", q.opt_c],
                      ["D", q.opt_d],
                    ].map(([letter, text]) => {
                      const isCorrect = (q.expected_answer || "").toUpperCase() === letter;

                      return (
                        <div
                          key={letter}
                          className={`azota-choice-item ${isCorrect ? "is-correct" : ""}`}
                        >
                          <span className="azota-choice-circle">{letter}</span>
                          <span style={{ flex: 1, wordBreak: "break-word" }}>
                            {text || <em>(trống)</em>}
                          </span>
                          {isCorrect && (
                            <span className="azota-correct-tag">
                              ✓ Đáp án GV
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Findings Callouts */}
                  {visibleFindings.length === 0 ? (
                    <div
                      style={{
                        padding: "8px 12px",
                        background: "#f6ffed",
                        border: "1px solid #b7eb8f",
                        borderRadius: "var(--radius-sm)",
                        fontSize: 12.5,
                        color: "#389e0d",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <IconCheckCircle size={15} />
                      <span>Không phát hiện lỗi cấu trúc ở câu hỏi này.</span>
                    </div>
                  ) : (
                    visibleFindings.map((f) => {
                      const statusText =
                        f.status === "confirmed"
                          ? "✓ Đã duyệt đúng lỗi"
                          : f.status === "rejected"
                          ? "✕ Đã bác bỏ"
                          : f.status === "needs_expert"
                          ? "? Chờ chuyên gia"
                          : "⏳ Chờ giáo viên xử lý";

                      return (
                        <div key={f.id} className={`azota-finding-box sev-${f.severity}`}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              flexWrap: "wrap",
                              gap: 8,
                              marginBottom: 8,
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span
                                style={{
                                  fontSize: 11.5,
                                  fontWeight: 700,
                                  textTransform: "uppercase",
                                  padding: "2px 8px",
                                  borderRadius: 4,
                                  background: f.severity === "blocker" ? "#ff4d4f" : f.severity === "review" ? "#fa8c16" : "#1677ff",
                                  color: "white",
                                }}
                              >
                                {f.severity === "blocker" ? "Lỗi chặn lại" : f.severity === "review" ? "Cần rà soát" : "Gợi ý"}
                              </span>

                              <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>
                                {METHOD_LABELS[f.verification_method] || f.verification_method}
                              </span>

                              <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                                • Độ chắc chắn: <strong>{f.confidence || "vừa"}</strong>
                              </span>
                            </div>

                            <span
                              style={{
                                fontSize: 11.5,
                                fontWeight: 700,
                                padding: "2px 8px",
                                borderRadius: 4,
                                background: f.status === "confirmed" ? "#d9f7be" : f.status === "rejected" ? "#ffccc7" : "#f0f2f5",
                                color: f.status === "confirmed" ? "#237804" : f.status === "rejected" ? "#a8071a" : "#595959",
                              }}
                            >
                              {statusText}
                            </span>
                          </div>

                          <div style={{ fontSize: 13.5, color: "var(--text-main)", lineHeight: 1.55 }}>
                            {f.severity === "ok" || f.category === "on" || f.category === "ok" || !f.evidence || f.evidence === "on" ? (
                              <>
                                <strong>Đánh giá sơ bộ:</strong> {f.evidence && f.evidence !== "on" ? f.evidence : "Chưa phát hiện bất thường. Câu hỏi rõ ràng, đáp án hợp lệ."}
                              </>
                            ) : (
                              <>
                                <strong>Phát hiện ({f.category}):</strong> {f.evidence}
                              </>
                            )}
                          </div>

                          {f.fix_suggestion && (
                            <div
                              style={{
                                marginTop: 8,
                                padding: "8px 12px",
                                background: "rgba(255, 255, 255, 0.9)",
                                border: "1px solid rgba(0, 0, 0, 0.08)",
                                borderRadius: "var(--radius-sm)",
                                fontSize: 13,
                              }}
                            >
                              <strong>Gợi ý sửa Azota:</strong> {f.fix_suggestion}
                            </div>
                          )}

                          {/* Teacher Action Buttons */}
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              marginTop: 10,
                              paddingTop: 10,
                              borderTop: "1px dashed rgba(0, 0, 0, 0.1)",
                              flexWrap: "wrap",
                            }}
                          >
                            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>
                              Giáo viên thẩm định:
                            </span>
                            <button
                              className="azota-btn azota-btn-sm azota-btn-success"
                              onClick={() => review(q.id, f.id, "confirmed")}
                            >
                              <IconCheck size={13} />
                              <span>Xác nhận lỗi</span>
                            </button>
                            <button
                              className="azota-btn azota-btn-sm azota-btn-default"
                              style={{ color: "#cf1322" }}
                              onClick={() => review(q.id, f.id, "rejected")}
                            >
                              <IconX size={13} />
                              <span>Bác bỏ</span>
                            </button>
                            <button
                              className="azota-btn azota-btn-sm azota-btn-default"
                              style={{ color: "#d46b08" }}
                              onClick={() => review(q.id, f.id, "needs_expert")}
                            >
                              <IconHelp size={13} />
                              <span>Cần chuyên gia</span>
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Right Sticky Column: Iconic Azota Question Navigation Matrix */}
        <div className="azota-nav-sidebar">
          <div className="azota-card" style={{ marginBottom: 16 }}>
            <div className="azota-card-header">
              <span className="azota-card-title">
                <span>📑</span>
                <span>Bảng câu hỏi đề thi</span>
              </span>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {data.questions.length} câu
              </span>
            </div>

            <div className="azota-card-body">
              {/* Question Number Pills Grid */}
              <div className="azota-qgrid">
                {data.questions.map((q) => {
                  const hasBlocker = (q.findings || []).some((f) => f.severity === "blocker");
                  const hasReview = (q.findings || []).some((f) => f.severity === "review");
                  const hasHint = (q.findings || []).some((f) => f.severity === "hint");

                  let qClass = "q-ok";
                  if (hasBlocker) qClass = "q-blocker";
                  else if (hasReview) qClass = "q-review";
                  else if (hasHint) qClass = "q-hint";

                  return (
                    <div
                      key={q.id}
                      className={`azota-qgrid-item ${qClass}`}
                      onClick={() => scrollToQuestion(q.id)}
                      title={`Câu ${q.ord}: Bấm để cuộn đến câu`}
                    >
                      {q.ord}
                    </div>
                  );
                })}
              </div>

              {/* Status Legend */}
              <div className="azota-qgrid-legend">
                <div className="legend-item">
                  <span className="legend-dot dot-blocker" />
                  <span>Chặn lại ({counts.blocker})</span>
                </div>
                <div className="legend-item">
                  <span className="legend-dot dot-review" />
                  <span>Nên xem ({counts.review})</span>
                </div>
                <div className="legend-item">
                  <span className="legend-dot dot-hint" />
                  <span>Gợi ý ({counts.hint})</span>
                </div>
                <div className="legend-item">
                  <span className="legend-dot dot-ok" />
                  <span>Ổn định ({counts.ok})</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions Panel */}
          <div className="azota-card">
            <div className="azota-card-header">
              <span className="azota-card-title">Thao tác đề thi</span>
            </div>
            <div className="azota-card-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                className="azota-btn azota-btn-primary"
                style={{ width: "100%" }}
                onClick={onGoToReport}
              >
                <IconBarChart size={16} />
                <span>Xuất Báo cáo Thẩm định</span>
              </button>

              <button
                className="azota-btn azota-btn-default"
                style={{ width: "100%" }}
                onClick={onGoToCompare}
              >
                <IconScale size={16} />
                <span>So sánh đề gốc / Đề xuất</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
