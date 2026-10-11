import React, { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import {
  IconFileText,
  IconArrowRight,
  IconTrash,
  IconBarChart,
  IconPlus,
} from "../components/Icons.jsx";

export default function HistoryPage({ onNewCheck, onSelectCheck, onGoToReport, onToast }) {
  const [checks, setChecks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadChecks();
  }, []);

  async function loadChecks() {
    try {
      const res = await api("/api/checks");
      setChecks(res.checks || []);
    } catch {
      setChecks([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id, e) {
    e.stopPropagation();
    if (!window.confirm("Thầy/Cô có chắc chắn muốn xóa bài kiểm tra này khỏi lịch sử?")) return;
    try {
      await api(`/api/checks/${id}`, { method: "DELETE" });
      onToast("Đã xóa đề thi khỏi lịch sử.");
      loadChecks();
    } catch (err) {
      onToast("Lỗi khi xóa: " + err.message);
    }
  }

  return (
    <div className="spec-container" style={{ maxWidth: 860 }}>
      {/* Header */}
      <div
        className="card"
        style={{
          padding: "20px 24px",
          marginBottom: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 14,
        }}
      >
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "#111827" }}>
            Lịch sử Phản biện Chéo Đề thi
          </h1>
          <p style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>
            Hồ sơ các bài kiểm tra đã được thẩm định độc lập · AI đồng hành hỗ trợ, giáo viên phê duyệt.
          </p>
        </div>

        <button className="btn btn-primary btn-sm" onClick={onNewCheck}>
          <IconPlus size={15} />
          <span>+ Kiểm tra đề mới</span>
        </button>
      </div>

      {/* History List */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <IconFileText size={17} />
            <span>Tất cả các lần kiểm tra ({checks.length})</span>
          </span>
        </div>

        <div className="card-body" style={{ padding: checks.length ? 0 : 32 }}>
          {loading ? (
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="skeleton" style={{ height: 48 }} />
              <div className="skeleton" style={{ height: 48 }} />
              <div className="skeleton" style={{ height: 48 }} />
            </div>
          ) : checks.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px" }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>📂</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 6 }}>
                Chưa có lịch sử kiểm tra đề
              </div>
              <p style={{ fontSize: 13.5, color: "#6b7280", marginBottom: 18 }}>
                Hãy chuyển sang trang "Kiểm tra đề" để bắt đầu soi lỗi đề thi đầu tiên.
              </p>
              <button className="btn btn-primary" onClick={onNewCheck}>
                <span>Bắt đầu kiểm tra đề</span>
              </button>
            </div>
          ) : (
            <div>
              {checks.map((c) => (
                <div
                  key={c.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "16px 20px",
                    borderBottom: "1px solid #f3f4f6",
                    transition: "var(--transition)",
                    flexWrap: "wrap",
                    gap: 12,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f9fafb")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#ffffff")}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 8,
                        background: c.subject === "Toán" ? "#e0f2fe" : c.subject === "Tin học" ? "#f3e8ff" : "#fee2e2",
                        color: c.subject === "Toán" ? "#0284c7" : c.subject === "Tin học" ? "#7e22ce" : "#dc2626",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 800,
                        fontSize: 14,
                      }}
                    >
                      {c.subject ? c.subject.slice(0, 1) : "Đ"}
                    </div>

                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>
                        {c.title || "Bài kiểm tra"}
                      </div>
                      <div style={{ fontSize: 12.5, color: "#6b7280", marginTop: 2 }}>
                        Môn: <strong>{c.subject || "Toán"}</strong> {c.grade ? `(Lớp ${c.grade})` : ""} •{" "}
                        <strong>{c.question_count || "?"}</strong> câu •{" "}
                        {new Date(c.created_at).toLocaleString("vi-VN", {
                          hour: "2-digit",
                          minute: "2-digit",
                          day: "2-digit",
                          month: "2-digit",
                        })}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span
                      style={{
                        fontSize: 11.5,
                        fontWeight: 700,
                        padding: "3px 8px",
                        borderRadius: 4,
                        background: c.status === "done" ? "#f0fdf4" : "#fefce8",
                        color: c.status === "done" ? "#15803d" : "#a16207",
                        border: c.status === "done" ? "1px solid #bbf7d0" : "1px solid #fef08a",
                      }}
                    >
                      {c.status === "done" ? "✓ Đã thẩm định" : "Đang xử lý"}
                    </span>

                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => onGoToReport(c.id)}
                    >
                      <IconBarChart size={14} />
                      <span>Xem báo cáo</span>
                    </button>

                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => onSelectCheck(c.id)}
                    >
                      <span>Soi lại câu</span>
                      <IconArrowRight size={13} />
                    </button>

                    <button
                      className="btn-ghost btn-sm"
                      style={{ color: "#ef4444" }}
                      title="Xóa đề này"
                      onClick={(e) => handleDelete(c.id, e)}
                    >
                      <IconTrash size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
