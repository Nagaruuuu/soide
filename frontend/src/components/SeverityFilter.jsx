import React from "react";
import { IconAlertCircle, IconAlertTriangle, IconInfo, IconCheckCircle } from "./Icons.jsx";

const SEV_ITEMS = [
  { key: "all", label: "Tất cả", chipClass: "" },
  { key: "blocker", label: "Chặn lại", chipClass: "chip-blocker", Icon: IconAlertCircle },
  { key: "review", label: "Nên xem", chipClass: "chip-review", Icon: IconAlertTriangle },
  { key: "hint", label: "Gợi ý", chipClass: "chip-hint", Icon: IconInfo },
  { key: "ok", label: "Ổn định", chipClass: "chip-ok", Icon: IconCheckCircle },
];

export const SEV_LABEL = {
  blocker: "Chặn lại",
  review: "Nên xem",
  hint: "Gợi ý",
  ok: "Ổn định",
};

export default function SeverityFilter({ value, onChange, counts = {} }) {
  return (
    <div className="filter-bar">
      <span className="filter-bar-title">Lọc mức độ:</span>
      {SEV_ITEMS.map((item) => {
        const IconComp = item.Icon;
        const isActive = value === item.key;
        return (
          <button
            key={item.key}
            onClick={() => onChange(item.key)}
            className={`filter-chip ${item.chipClass} ${isActive ? "active" : ""}`}
          >
            {IconComp && <IconComp size={14} />}
            <span>{item.label}</span>
            {counts[item.key] != null && <span className="filter-count">{counts[item.key]}</span>}
          </button>
        );
      })}
    </div>
  );
}
