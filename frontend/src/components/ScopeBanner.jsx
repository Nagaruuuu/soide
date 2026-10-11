import React, { useState } from "react";
import { IconShield, IconLock } from "./Icons.jsx";

export default function ScopeBanner() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      style={{
        background: "#e6f4ff",
        border: "1px solid #91caff",
        borderLeft: "4px solid #1677ff",
        borderRadius: "var(--radius-md)",
        padding: "14px 18px",
        marginBottom: 20,
        display: "flex",
        alignItems: "flex-start",
        gap: 14,
        boxShadow: "var(--shadow-xs)",
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: "#ffffff",
          color: "#1677ff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <IconShield size={18} />
      </div>

      <div style={{ flex: 1, fontSize: 13, color: "#002c8c", lineHeight: 1.6 }}>
        <div>
          <strong>Phạm vi & Giới hạn kiểm định MVP (Chuẩn Azota):</strong> Hỗ trợ đề trắc nghiệm 4 lựa chọn (A–D).
          Đối với <strong>Nhóm T</strong> (Toán/Lý/Hóa): đối chiếu bằng rules + solver tính toán lại.
          Đối với <strong>Nhóm N</strong> (Anh/Tin): rà soát cấu trúc & ngữ pháp cơ bản.
          Đối với <strong>Nhóm H</strong> (Văn/Sử/Địa/GDCD...): AI chỉ gợi ý — <em>giáo viên quyết định cuối cùng</em>.
        </div>

        {!collapsed && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11.5,
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: 4,
                background: "white",
                border: "1px solid #adc6ff",
                color: "#1d39c4",
              }}
            >
              <IconLock size={12} /> Không lưu tên học sinh/trường
            </span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11.5,
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: 4,
                background: "white",
                border: "1px solid #adc6ff",
                color: "#1d39c4",
              }}
            >
              Tự động xóa đề sau 30 ngày
            </span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11.5,
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: 4,
                background: "white",
                border: "1px solid #adc6ff",
                color: "#1d39c4",
              }}
            >
              Cấm điểm % chính xác giả tạo
            </span>
          </div>
        )}
      </div>

      <button
        style={{
          background: "transparent",
          border: "none",
          color: "#1677ff",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          padding: "2px 6px",
        }}
        onClick={() => setCollapsed(!collapsed)}
      >
        {collapsed ? "Mở rộng ▾" : "Thu gọn ▴"}
      </button>
    </div>
  );
}
