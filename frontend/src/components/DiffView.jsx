import React from "react";
import { IconLock, IconEdit } from "./Icons.jsx";

// Diff đơn giản theo từ, bôi vàng phần khác
export function diffWords(a = "", b = "") {
  const aw = String(a).split(/(\s+)/), bw = String(b).split(/(\s+)/);
  const setB = new Set(bw);
  return aw.map((w, i) => (
    <span
      key={i}
      style={
        w.trim() && !setB.has(w)
          ? { background: "#fef08a", padding: "1px 3px", borderRadius: 3, fontWeight: 600 }
          : {}
      }
    >
      {w}
    </span>
  ));
}

export default function DiffView({ original, proposal, onChange }) {
  return (
    <div className="compare-container">
      <div className="compare-card">
        <div className="compare-card-header">
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <IconLock size={15} />
            <span>Gốc (Khóa)</span>
          </span>
          <span className="badge badge-method">Chỉ đọc</span>
        </div>
        <div className="compare-body" style={{ background: "#f8fafc", color: "#334155" }}>
          {original}
        </div>
      </div>

      <div className="compare-card">
        <div className="compare-card-header">
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <IconEdit size={15} />
            <span>Đề xuất (Sửa được)</span>
          </span>
          <span className="badge badge-ok">Cho phép chỉnh sửa</span>
        </div>
        <div style={{ padding: 16 }}>
          <textarea
            className="form-textarea"
            value={proposal}
            onChange={(e) => onChange(e.target.value)}
            rows={5}
            style={{ width: "100%", marginBottom: 12 }}
          />
          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            <strong>Xem trước thay đổi:</strong> {diffWords(original, proposal)}
          </div>
        </div>
      </div>
    </div>
  );
}
