import React, { useState, useEffect } from "react";
import CheckExamPage from "./pages/B_Input.jsx";
import ReportPage from "./pages/E_Report.jsx";
import HistoryPage from "./pages/A_Overview.jsx";
import Toast from "./components/Toast.jsx";
import {
  IconFileText,
  IconBarChart,
  IconHome,
} from "./components/Icons.jsx";
import { api } from "./lib/api.js";

export default function App() {
  // Exactly 3 pages: "check", "report", "history"
  const [tab, setTab] = useState("check");
  const [selectedCheckId, setSelectedCheckId] = useState(null);
  const [toastMsg, setToastMsg] = useState("");
  const [userQuota, setUserQuota] = useState({ used: 0, total: 30 });

  useEffect(() => {
    loadQuota();
  }, [selectedCheckId]);

  async function loadQuota() {
    try {
      const res = await api("/api/me");
      if (res.user) {
        setUserQuota({
          used: res.user.used_this_month || 0,
          total: res.user.monthly_quota || 30,
        });
      }
    } catch {
      // ignore
    }
  }

  function handleToast(msg) {
    setToastMsg(msg);
  }

  function handleCheckDone(id) {
    setSelectedCheckId(id);
    handleToast("Đã phân tích đề thi thành công!");
    loadQuota();
  }

  function handleGoToReport(id) {
    if (id) setSelectedCheckId(id);
    setTab("report");
  }

  function handleSelectCheck(id) {
    setSelectedCheckId(id);
    setTab("check");
  }

  return (
    <div className="app-layout">
      {/* 3-Page Header */}
      <header className="spec-header">
        <div className="app-container spec-header-inner">
          <div className="spec-brand" onClick={() => setTab("check")}>
            <img
              src="/logo.png"
              alt="Soi Đề AI Logo"
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                objectFit: "cover",
                boxShadow: "0 4px 12px rgba(2, 132, 199, 0.3)",
                flexShrink: 0,
              }}
            />
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div className="spec-brand-title">Soi Đề AI</div>
              <span style={{ fontSize: 9.5, fontWeight: 700, color: "#0284c7", letterSpacing: "0.04em", marginTop: -2 }}>
                TRỢ LÝ PHẢN BIỆN CHÉO
              </span>
            </div>
          </div>

          {/* Exactly 3 Navigation Tabs */}
          <div className="spec-nav-tabs">
            <button
              className={`spec-nav-tab ${tab === "check" ? "active" : ""}`}
              onClick={() => setTab("check")}
            >
              <IconFileText size={15} />
              <span>Kiểm tra đề</span>
            </button>

            <button
              className={`spec-nav-tab ${tab === "report" ? "active" : ""}`}
              onClick={() => setTab("report")}
            >
              <IconBarChart size={15} />
              <span>Báo cáo</span>
            </button>

            <button
              className={`spec-nav-tab ${tab === "history" ? "active" : ""}`}
              onClick={() => setTab("history")}
            >
              <IconHome size={15} />
              <span>Lịch sử</span>
            </button>
          </div>

          {/* Right Action */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          </div>
        </div>
      </header>

      {/* Main Content Area: 3 Pages */}
      <main className="app-main">
        {/* Page 1: Trang Kiểm tra đề */}
        {tab === "check" && (
          <CheckExamPage
            onDone={handleCheckDone}
            onGoToReport={handleGoToReport}
            currentCheckId={selectedCheckId}
          />
        )}

        {/* Page 2: Trang Báo cáo */}
        {tab === "report" && (
          <ReportPage
            checkId={selectedCheckId}
            onToast={handleToast}
            onSelectCheck={(id) => setSelectedCheckId(id)}
            onBack={() => setTab("check")}
          />
        )}

        {/* Page 3: Trang Lịch sử */}
        {tab === "history" && (
          <HistoryPage
            onNewCheck={() => {
              setSelectedCheckId(null);
              setTab("check");
            }}
            onSelectCheck={handleSelectCheck}
            onGoToReport={handleGoToReport}
            onToast={handleToast}
          />
        )}
      </main>

      <Toast message={toastMsg} onClose={() => setToastMsg("")} />
    </div>
  );
}
