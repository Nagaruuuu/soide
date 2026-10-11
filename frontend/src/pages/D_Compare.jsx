import React, { useState, useEffect } from "react";
import { api } from "../lib/api.js";
import { IconCopy, IconLock, IconEdit } from "../components/Icons.jsx";

export default function ComparePage({ checkId, onToast }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [originalText, setOriginalText] = useState("");
  const [suggestedText, setSuggestedText] = useState("");

  useEffect(() => {
    loadData();
  }, [checkId]);

  async function loadData() {
    if (!checkId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api(`/api/checks/${checkId}/results`);
      setData(res);

      let orig = "";
      let sugg = "";

      (res.questions || []).forEach((q) => {
        const qBlock = `Câu ${q.ord}: ${q.content}\nA. ${q.opt_a}\nB. ${q.opt_b}\nC. ${q.opt_c}\nD. ${q.opt_d}\nĐáp án: ${q.expected_answer || "Chưa có"}\n\n`;
        orig += qBlock;

        let fixedContent = q.content;
        const fix = (q.findings || []).find((f) => f.fix_suggestion);
        if (fix && fix.fix_suggestion) {
          fixedContent += ` /* Gợi ý sửa Azota: ${fix.fix_suggestion} */`;
        }

        const sBlock = `Câu ${q.ord}: ${fixedContent}\nA. ${q.opt_a}\nB. ${q.opt_b}\nC. ${q.opt_c}\nD. ${q.opt_d}\nĐáp án: ${q.expected_answer || "Chưa có"}\n\n`;
        sugg += sBlock;
      });

      setOriginalText(orig.trim());
      setSuggestedText(sugg.trim());
    } catch (e) {
      if (onToast) onToast("Lỗi tải dữ liệu so sánh: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  function handleCopySuggested() {
    navigator.clipboard.writeText(suggestedText);
    if (onToast) onToast("Đã sao chép nội dung đề đề xuất vào bộ nhớ tạm!");
  }

  if (loading) {
    return (
      <div className="skeleton" style={{ height: 400 }} />
    );
  }

  if (!data) {
    return (
      <div className="azota-card" style={{ padding: 36, textAlign: "center", color: "#64748b" }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Chưa chọn đề thi nào</div>
        <div style={{ fontSize: 13 }}>Hãy tạo đề mới ở trang Kiểm tra đề hoặc chọn một đề trong Lịch sử.</div>
      </div>
    );
  }

  return (
    <div>
      <div
        className="azota-card"
        style={{
          padding: "18px 22px",
          marginBottom: 18,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 14,
        }}
      >
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: "var(--text-main)" }}>
            So sánh Đề gốc & Đề đề xuất chuẩn Azota
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>
            Đối chiếu nguyên bản đề giáo viên nhập với bản đề xuất đã sửa lỗi.
          </p>
        </div>

        <button className="azota-btn azota-btn-primary" onClick={handleCopySuggested}>
          <IconCopy size={15} />
          <span>Sao chép đề đề xuất</span>
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Left: Original */}
        <div className="azota-card">
          <div className="azota-card-header">
            <span style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
              <IconLock size={15} />
              <span>Đề gốc ban đầu (Chỉ đọc)</span>
            </span>
            <span style={{ fontSize: 11, background: "#f0f2f5", padding: "2px 8px", borderRadius: 4 }}>
              Khóa
            </span>
          </div>
          <div
            style={{
              padding: 18,
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              lineHeight: 1.65,
              whiteSpace: "pre-wrap",
              background: "#fafafa",
              color: "#374151",
              minHeight: 380,
            }}
          >
            {originalText || "Chưa có dữ liệu đề gốc."}
          </div>
        </div>

        {/* Right: Suggested */}
        <div className="azota-card">
          <div className="azota-card-header">
            <span style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, color: "#1677ff" }}>
              <IconEdit size={15} />
              <span>Đề đề xuất tối ưu (Sửa được)</span>
            </span>
            <span style={{ fontSize: 11, background: "#e6f4ff", color: "#1677ff", padding: "2px 8px", borderRadius: 4, fontWeight: 600 }}>
              Cho phép chỉnh sửa
            </span>
          </div>
          <textarea
            style={{
              width: "100%",
              padding: 18,
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              lineHeight: 1.65,
              border: "none",
              outline: "none",
              resize: "vertical",
              minHeight: 380,
              background: "#ffffff",
            }}
            value={suggestedText}
            onChange={(e) => setSuggestedText(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
