import React, { useState, useEffect } from "react";
import { api, extractFile } from "../lib/api.js";
import {
  IconSearch,
  IconCheck,
  IconX,
  IconHelp,
  IconAlertCircle,
  IconAlertTriangle,
  IconInfo,
  IconCheckCircle,
  IconBarChart,
  IconRefresh,
} from "../components/Icons.jsx";

const DEFAULT_EXAM_SAMPLES = {
  "Tin học": `Câu 1: Thiết bị nào sau đây là thiết bị vào của máy tính?
A. Chuột (Mouse)
B. Màn hình (Monitor)
C. Máy in (Printer)
D. Loa (Speaker)
Đáp án: A

Câu 2: Dung lượng 1 GB (Gigabyte) tương đương với bao nhiêu Megabyte?
A. 1000 MB
B. 1024 MB
C. 1048 MB
D. 512 MB
Đáp án: B

Câu 3: Trong mạng máy tính, giao thức nào sau đây có thể dùng để truyền tải trang web an toàn?
A. HTTP
B. FTP
C. HTTPS
D. Tất cả đều đúng trong mọi trường hợp nếu xét mô hình dưới đây
Đáp án: C`,

  "Toán": `Câu 1: Giá trị của biểu thức 2 + 3 x 4 bằng bao nhiêu?
A. 20
B. 14
C. 12
D. 24
Đáp án: B

Câu 2: Một vật rơi tự do không vận tốc đầu từ độ cao h. Gia tốc trọng trường là g. Vận tốc của vật khi chạm đất là gì?
A. v = sqrt(2gh)
B. v = 2gh
C. v = sqrt(gh)
D. v = gh
Đáp án: A

Câu 3: Cho tam giác ABC vuông tại A. Khẳng định nào sau đây có thể đúng?
A. AB + AC < BC
B. AB^2 + AC^2 = BC^2
C. BC luôn ngắn hơn AB
D. Tất cả đều đúng trong mọi trường hợp nếu xét hình vẽ dưới đây
Đáp án: B`,

  "Ngữ văn": `Câu 1: Tác phẩm "Chí Phèo" của nhà văn Nam Cao được sáng tác vào năm nào?
A. 1941
B. 1945
C. 1930
D. 1954
Đáp án: A

Câu 2: Biện pháp tu từ nào được sử dụng trong câu: "Bàn tay ta làm nên tất cả / Có sức người sỏi đá cũng thành cơm"?
A. So sánh
B. Hoán dụ
C. Ẩn dụ
D. Nhân hóa
Đáp án: B`,
};

export default function CheckExamPage({ onDone, onGoToReport, currentCheckId }) {
  const [mode, setMode] = useState("file"); // "file" | "text"
  const [subject, setSubject] = useState("Tin học");
  const [grade, setGrade] = useState("Lớp 10");
  const [bookSeries, setBookSeries] = useState("Kết nối tri thức");
  const [checkLevel, setCheckLevel] = useState("standard"); // "standard" | "deep"
  const [answerMode, setAnswerMode] = useState("auto"); // "auto" | "yes" | "no"
  const [examText, setExamText] = useState("");
  const [fileText, setFileText] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [uploadedFileInfo, setUploadedFileInfo] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0); // 0 = idle, 1..4
  const [errorMsg, setErrorMsg] = useState("");

  const hasExam = mode === "file"
    ? Boolean(uploadedFileName && !extracting && fileText && fileText.trim().length > 0)
    : Boolean(examText && examText.trim().length > 0);

  const STEPS = [
    { id: 1, label: "Đọc đề", desc: "Phân tích cấu trúc & nhận diện dữ kiện câu hỏi" },
    { id: 2, label: "Giải mù độc lập", desc: "Solver sandbox tính toán không nhìn đáp án" },
    { id: 3, label: "Đối soát đáp án", desc: "So khớp chéo, rà soát sai lệch & câu mơ hồ" },
    { id: 4, label: "Xuất báo cáo", desc: "Tổng hợp biên bản & ma trận GDPT 2018" },
  ];

  // Results state if showing results on this page
  const [resultsData, setResultsData] = useState(null);
  const [severityFilter, setSeverityFilter] = useState("all");

  const subjectsList = ["Tin học", "Toán", "Ngữ văn", "Tiếng Anh", "Vật lý", "Hóa học", "Lịch sử", "Địa lý", "Sinh học", "GDCD", "Khác"];

  useEffect(() => {
    if (currentCheckId) {
      loadResults(currentCheckId);
    }
  }, [currentCheckId]);

  async function loadResults(id) {
    try {
      const d = await api(`/api/checks/${id}/results`);
      setResultsData(d);
    } catch {
      // ignore
    }
  }

  async function handleFileSelect(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // cho phép chọn lại cùng file
    if (!file || extracting) return;
    setUploadedFileName(file.name);
    setUploadedFileInfo("");
    setErrorMsg("");
    // Trích xuất ở server bằng code (mammoth/pdf-parse/đọc UTF-8), không gửi ra ngoài.
    setExtracting(true);
    try {
      const out = await extractFile(file);
      setFileText(out.text || "");
      const parts = [`Loại: ${out.fileType}`];
      if (out.pageCount) parts.push(`${out.pageCount} trang`);
      setUploadedFileInfo(parts.join(" · ") + (out.warnings?.length ? " — " + out.warnings.join(" ") : ""));
    } catch (err) {
      setUploadedFileName("");
      setFileText("");
      setUploadedFileInfo("");
      setErrorMsg(err.message + (err.code ? ` [${err.code}]` : ""));
    } finally {
      setExtracting(false);
    }
  }

  async function handleCheck() {
    if (extracting) {
      setErrorMsg("File đang được trích xuất, vui lòng đợi xong rồi bấm thẩm định.");
      return;
    }
    if (!hasExam) {
      setErrorMsg(
        mode === "file"
          ? "Vui lòng tải tệp đề (.docx, .pdf, .txt) và đợi trích xuất xong để bắt đầu thẩm định."
          : "Vui lòng nhập/dán nội dung đề thi để bắt đầu thẩm định."
      );
      return;
    }
    setErrorMsg("");
    setLoading(true);
    setCurrentStep(1); // Bước 1: Đọc đề

    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    try {
      const title = uploadedFileName
        ? `Đề ${subject} - ${uploadedFileName.replace(/\.[^/.]+$/, "")}`
        : `Đề ${subject} - ${grade} (${bookSeries})`;
      const textToAnalyze = mode === "file" ? (fileText || examText).trim() : examText.trim();

      // Bước 1: Đọc đề & gửi dữ liệu lên server
      const c = await api("/api/checks", {
        method: "POST",
        body: JSON.stringify({
          title,
          subject,
          grade: grade.replace("Lớp ", ""),
          exam_text: textToAnalyze,
          check_level: checkLevel,
          has_answer: answerMode === "auto" ? "auto" : answerMode === "yes",
        }),
      });
      await delay(700);

      // Bước 2: Giải mù độc lập (Blind Solving Sandbox)
      setCurrentStep(2);
      await api(`/api/checks/${c.check_id}/run`, { method: "POST", body: "{}" });
      await delay(700);

      // Bước 3: Đối soát đáp án & logic
      setCurrentStep(3);
      const d = await api(`/api/checks/${c.check_id}/results`);
      setResultsData(d);
      await delay(700);

      // Bước 4: Xuất báo cáo & biên bản
      setCurrentStep(4);
      await delay(600);

      setLoading(false);
      onDone(c.check_id);
      if (onGoToReport) {
        onGoToReport(c.check_id);
      }
    } catch (err) {
      setLoading(false);
      setCurrentStep(0);
      setErrorMsg(err.message || "Lỗi thẩm định đề thi.");
    }
  }

  async function handleReview(qid, fid, action) {
    if (!resultsData?.check?.id) return;
    try {
      await api(`/api/results/${qid}`, {
        method: "PATCH",
        body: JSON.stringify({ finding_id: fid, action }),
      });
      const d = await api(`/api/checks/${resultsData.check.id}/results`);
      setResultsData(d);
    } catch (err) {
      alert("Lỗi: " + err.message);
    }
  }

  // If results exist and user wants to view them
  if (resultsData && resultsData.questions) {
    const CATEGORY_LABELS = {
      ok: "Đánh giá sơ bộ",
      on: "Đánh giá sơ bộ",
      dap_an_sai: "Sai lệch đáp án",
      solver_khong_khop: "Không khớp lời giải mù",
      thieu_thanh_phan: "Thiếu thành phần câu",
      phu_dinh_kep: "Phủ định kép / Dễ gây nhiễu",
      thieu_dap_an: "Thiếu đáp án",
      ambiguous: "Câu hỏi đa nghĩa / Mơ hồ",
      ai_ambiguous: "Câu hỏi đa nghĩa",
    };

    const counts = {
      blocker: (resultsData.questions || []).filter((q) =>
        (q.findings || []).some((f) => f.severity === "blocker")
      ).length,
      review: (resultsData.questions || []).filter((q) =>
        (q.findings || []).some((f) => f.severity === "review")
      ).length,
      hint: (resultsData.questions || []).filter((q) =>
        (q.findings || []).some((f) => f.severity === "hint")
      ).length,
      ok: (resultsData.questions || []).filter(
        (q) => !q.findings || q.findings.length === 0 || q.findings.every((f) => f.severity === "ok")
      ).length,
    };

    const filteredQuestions = (resultsData.questions || []).filter((q) => {
      if (severityFilter === "all") return true;
      if (severityFilter === "blocker") {
        return (q.findings || []).some((f) => f.severity === "blocker");
      }
      if (severityFilter === "review") {
        return (q.findings || []).some((f) => f.severity === "review");
      }
      if (severityFilter === "hint") {
        return (q.findings || []).some((f) => f.severity === "hint");
      }
      if (severityFilter === "ok") {
        return !q.findings || q.findings.length === 0 || q.findings.every((f) => f.severity === "ok");
      }
      return true;
    });

    return (
      <div className="spec-container" style={{ maxWidth: 860 }}>
        {/* Top Action Card */}
        <div className="card" style={{ padding: "16px 20px", marginBottom: 16, borderRadius: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 14,
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: "#111827", margin: 0 }}>
                {resultsData.check?.title || "Kết quả kiểm tra đề"}
              </h2>
              <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>
                Môn: <strong>{resultsData.check?.subject}</strong> {resultsData.check?.grade ? `(Lớp ${resultsData.check.grade})` : ""} •{" "}
                <strong>{resultsData.questions.length}</strong> câu hỏi
              </div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setResultsData(null);
                  setUploadedFileName("");
                }}
              >
                <span>+ Kiểm tra đề khác</span>
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => onGoToReport(resultsData.check?.id)}
              >
                <IconBarChart size={15} />
                <span>Xem báo cáo chi tiết →</span>
              </button>
            </div>
          </div>

          {/* Thanh thống kê: Bộ lọc 4 trạng thái có thể bấm được */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "#6b7280", marginRight: 2 }}>
              Lọc hiển thị:
            </span>

            <button
              type="button"
              onClick={() => setSeverityFilter("all")}
              style={{
                padding: "5px 12px",
                background: severityFilter === "all" ? "#111827" : "#f3f4f6",
                color: severityFilter === "all" ? "#ffffff" : "#374151",
                border: "1.5px solid",
                borderColor: severityFilter === "all" ? "#111827" : "#e5e7eb",
                borderRadius: 9999,
                fontSize: 12.5,
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              Tất cả ({resultsData.questions.length})
            </button>

            <button
              type="button"
              onClick={() => setSeverityFilter(severityFilter === "blocker" ? "all" : "blocker")}
              style={{
                padding: "5px 12px",
                background: severityFilter === "blocker" ? "#ff4d4f" : "#fff1f0",
                color: severityFilter === "blocker" ? "#ffffff" : "#cf1322",
                border: "1.5px solid",
                borderColor: severityFilter === "blocker" ? "#cf1322" : "#ffa39e",
                borderRadius: 9999,
                fontSize: 12.5,
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.15s ease",
                boxShadow: severityFilter === "blocker" ? "0 2px 6px rgba(255,77,79,0.3)" : "none",
              }}
              title="Nhấp để lọc các câu có lỗi chặn lại"
            >
              ⛔ Chặn lại: {counts.blocker} lỗi
            </button>

            <button
              type="button"
              onClick={() => setSeverityFilter(severityFilter === "review" ? "all" : "review")}
              style={{
                padding: "5px 12px",
                background: severityFilter === "review" ? "#fa8c16" : "#fff7e6",
                color: severityFilter === "review" ? "#ffffff" : "#d46b08",
                border: "1.5px solid",
                borderColor: severityFilter === "review" ? "#d46b08" : "#ffd591",
                borderRadius: 9999,
                fontSize: 12.5,
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.15s ease",
                boxShadow: severityFilter === "review" ? "0 2px 6px rgba(250,140,22,0.3)" : "none",
              }}
              title="Nhấp để lọc các câu cần rà soát"
            >
              ⚠️ Nên xem: {counts.review} cảnh báo
            </button>

            <button
              type="button"
              onClick={() => setSeverityFilter(severityFilter === "hint" ? "all" : "hint")}
              style={{
                padding: "5px 12px",
                background: severityFilter === "hint" ? "#1677ff" : "#e6f4ff",
                color: severityFilter === "hint" ? "#ffffff" : "#0958d9",
                border: "1.5px solid",
                borderColor: severityFilter === "hint" ? "#0958d9" : "#91caff",
                borderRadius: 9999,
                fontSize: 12.5,
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.15s ease",
                boxShadow: severityFilter === "hint" ? "0 2px 6px rgba(22,119,255,0.3)" : "none",
              }}
              title="Nhấp để lọc các câu có gợi ý"
            >
              ℹ️ Gợi ý: {counts.hint}
            </button>

            <button
              type="button"
              onClick={() => setSeverityFilter(severityFilter === "ok" ? "all" : "ok")}
              style={{
                padding: "5px 12px",
                background: severityFilter === "ok" ? "#10b981" : "#f6ffed",
                color: severityFilter === "ok" ? "#ffffff" : "#389e0d",
                border: "1.5px solid",
                borderColor: severityFilter === "ok" ? "#059669" : "#b7eb8f",
                borderRadius: 9999,
                fontSize: 12.5,
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.15s ease",
                boxShadow: severityFilter === "ok" ? "0 2px 6px rgba(16,185,129,0.3)" : "none",
              }}
              title="Nhấp để xem các câu đạt chuẩn"
            >
              ✓ Đạt chuẩn: {counts.ok} câu
            </button>
          </div>
        </div>

        {/* Question Cards Feed */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filteredQuestions.length === 0 ? (
            <div
              className="card"
              style={{
                textAlign: "center",
                padding: "36px 20px",
                borderRadius: 14,
                color: "#6b7280",
              }}
            >
              <div style={{ fontSize: 24, marginBottom: 8 }}>🔍</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#374151" }}>
                Không có câu hỏi nào thuộc phân loại này
              </div>
              <button
                className="btn btn-secondary btn-sm"
                style={{ marginTop: 12 }}
                onClick={() => setSeverityFilter("all")}
              >
                Xem tất cả ({resultsData.questions.length} câu)
              </button>
            </div>
          ) : (
            filteredQuestions.map((q) => (
              <div key={q.id} className="question-card">
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                  <span
                    style={{
                      background: "#111827",
                      color: "white",
                      fontSize: 11.5,
                      fontWeight: 700,
                      padding: "2px 7px",
                      borderRadius: 4,
                      flexShrink: 0,
                    }}
                  >
                    Câu {q.ord}
                  </span>
                  <span style={{ fontSize: 14.5, fontWeight: 700, color: "#111827", lineHeight: 1.45 }}>
                    {q.content}
                  </span>
                </div>

                {/* Choices */}
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
                        <span
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: "50%",
                            background: isExpected ? "#52c41a" : "#e5e7eb",
                            color: isExpected ? "white" : "#374151",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 11,
                            fontWeight: 700,
                            flexShrink: 0,
                          }}
                        >
                          {letter}
                        </span>
                        <span style={{ flex: 1 }}>{text || <em>(trống)</em>}</span>
                        {isExpected && (
                          <span style={{ fontSize: 10.5, fontWeight: 700, color: "#22c55e", flexShrink: 0 }}>
                            Đáp án GV
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Findings or Clean Evaluation */}
                {(!q.findings || q.findings.length === 0) ? (
                  <div className="finding-box sev-ok">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: 4,
                          background: "#10b981",
                          color: "white",
                        }}
                      >
                        Đạt chuẩn
                      </span>
                      <span style={{ fontSize: 11.5, color: "#059669", fontWeight: 600 }}>
                        ✓ Đạt chuẩn CT GDPT 2018
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: "#065f46" }}>
                      <strong>Đánh giá sơ bộ:</strong> Chưa phát hiện bất thường. Câu hỏi tường minh, phương án hợp lệ.
                    </div>
                  </div>
                ) : (
                  q.findings.map((f) => {
                    const isOk = f.severity === "ok" || f.category === "ok" || f.category === "on" || f.evidence === "on" || !f.evidence;
                    return (
                      <div key={f.id} className={`finding-box sev-${f.severity}`}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            flexWrap: "wrap",
                            gap: 6,
                            marginBottom: 6,
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                padding: "2px 8px",
                                borderRadius: 4,
                                background:
                                  f.severity === "blocker"
                                    ? "#ff4d4f"
                                    : f.severity === "review"
                                    ? "#fa8c16"
                                    : f.severity === "hint"
                                    ? "#1677ff"
                                    : "#10b981",
                                color: "white",
                              }}
                            >
                              {f.severity === "blocker"
                                ? "Lỗi chặn lại"
                                : f.severity === "review"
                                ? "Cần xem lại"
                                : f.severity === "hint"
                                ? "Gợi ý"
                                : "Đạt chuẩn"}
                            </span>
                            <span style={{ fontSize: 11.5, color: "#6b7280" }}>
                              Trạng thái:{" "}
                              <strong
                                style={{
                                  color:
                                    f.status === "confirmed"
                                      ? "#16a34a"
                                      : f.status === "rejected"
                                      ? "#dc2626"
                                      : f.status === "needs_expert"
                                      ? "#d97706"
                                      : "#4b5563",
                                }}
                              >
                                {f.status === "confirmed"
                                  ? "✓ Đã xác nhận"
                                  : f.status === "rejected"
                                  ? "✕ Bác bỏ"
                                  : f.status === "needs_expert"
                                  ? "⚠ Cần chuyên gia"
                                  : "Chờ duyệt"}
                              </strong>
                            </span>
                          </div>

                          {/* 3 nút duyệt câu: Đưa lên góc phải cùng hàng với nhãn Trạng thái */}
                          {f.severity !== "ok" && (
                            <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                              <button
                                className="btn btn-secondary btn-sm"
                                style={{
                                  padding: "2px 8px",
                                  fontSize: 11,
                                  color: f.status === "confirmed" ? "#ffffff" : "#16a34a",
                                  backgroundColor: f.status === "confirmed" ? "#16a34a" : "#f0fdf4",
                                  borderColor: "#bbf7d0",
                                  fontWeight: 600,
                                }}
                                title="Xác nhận lỗi này"
                                onClick={() => handleReview(q.id, f.id, "confirmed")}
                              >
                                ✓ Xác nhận lỗi
                              </button>
                              <button
                                className="btn btn-secondary btn-sm"
                                style={{
                                  padding: "2px 8px",
                                  fontSize: 11,
                                  color: f.status === "rejected" ? "#ffffff" : "#dc2626",
                                  backgroundColor: f.status === "rejected" ? "#dc2626" : "#fef2f2",
                                  borderColor: "#fecaca",
                                  fontWeight: 600,
                                }}
                                title="Bác bỏ cảnh báo (không có lỗi)"
                                onClick={() => handleReview(q.id, f.id, "rejected")}
                              >
                                ✕ Bác bỏ
                              </button>
                              <button
                                className="btn btn-secondary btn-sm"
                                style={{
                                  padding: "2px 8px",
                                  fontSize: 11,
                                  color: f.status === "needs_expert" ? "#ffffff" : "#d97706",
                                  backgroundColor: f.status === "needs_expert" ? "#d97706" : "#fffbeb",
                                  borderColor: "#fde68a",
                                  fontWeight: 600,
                                }}
                                title="Cần tổ chuyên môn thẩm định"
                                onClick={() => handleReview(q.id, f.id, "needs_expert")}
                              >
                                ? Cần chuyên gia
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Nội dung đánh giá */}
                        <div style={{ fontSize: 13, color: "#111827", marginBottom: 4 }}>
                          {isOk ? (
                            <>
                              <strong>Đánh giá sơ bộ:</strong>{" "}
                              {f.evidence && f.evidence !== "on" ? f.evidence : "Chưa phát hiện bất thường. Câu hỏi rõ ràng, đáp án hợp lệ."}
                            </>
                          ) : (
                            <>
                              <strong>Phát hiện ({CATEGORY_LABELS[f.category] || f.category}):</strong> {f.evidence}
                            </>
                          )}
                        </div>

                        {f.fix_suggestion && (
                          <div
                            style={{
                              fontSize: 12.5,
                              background: "white",
                              padding: "6px 10px",
                              borderRadius: 6,
                              marginTop: 6,
                              border: "1px solid #f1f5f9",
                            }}
                          >
                            <strong>Gợi ý sửa:</strong> {f.fix_suggestion}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // Exact mockup form as in user screenshot
  return (
    <div className="spec-container">
      {/* Title & Subtitle */}
      <div style={{ textAlign: "center", marginBottom: 14 }}>
        <h1 className="spec-hero-title">
          Đề của bạn đã thực sự đúng?
        </h1>
        <p className="spec-hero-subtitle">
          Đồng hành hỗ trợ giáo viên đối soát câu hỏi mơ hồ, lệch đáp án và chuẩn kiến thức — <strong>AI hỗ trợ, không thay thế con người</strong>.
        </p>
      </div>

      {/* Floating Crisp Glass Card */}
      <div className="spec-card">
        {/* Upload Mode Tabs */}
      <div className="upload-mode-tabs">
        <button
          className={`upload-mode-tab ${mode === "file" ? "active" : ""}`}
          onClick={() => setMode("file")}
        >
          Tải tệp đề
        </button>
        <button
          className={`upload-mode-tab ${mode === "text" ? "active" : ""}`}
          onClick={() => setMode("text")}
        >
          Dán nội dung
        </button>
      </div>

      {/* Tab 1: Dropzone Box */}
      {mode === "file" ? (
        <label className="dropzone-box" style={{ display: "block" }}>
          <input
            type="file"
            accept=".docx,.pdf,.txt"
            style={{ display: "none" }}
            onChange={handleFileSelect}
          />
          <div className="dropzone-icon" style={{ marginBottom: 6 }}>
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#3b82f6"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="12" y1="12" x2="12" y2="18"></line>
              <polyline points="9 15 12 12 15 15"></polyline>
            </svg>
          </div>
          <div className="dropzone-title" style={{ fontSize: "14.5px", marginBottom: "3px" }}>
            {extracting ? "Đang trích xuất nội dung file..." : uploadedFileName ? `Đã chọn: ${uploadedFileName}` : "Kéo thả tệp đề vào đây (DOCX, PDF, TXT) hoặc nhấp chọn"}
          </div>
          <div className="dropzone-note" style={{ fontSize: "11.5px" }}>
            {uploadedFileInfo || "Chưa hỗ trợ PDF scan; công thức và hình ảnh phức tạp chỉ nhận diện văn bản thô."}
          </div>
          {uploadedFileName && (
            <div style={{ marginTop: 8 }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{
                  padding: "2px 8px",
                  fontSize: 11.5,
                  color: "#dc2626",
                  borderColor: "#fecaca",
                  backgroundColor: "#fff",
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setUploadedFileName("");
                  setUploadedFileInfo("");
                  setFileText("");
                }}
              >
                🗑️ Bỏ chọn tệp
              </button>
            </div>
          )}
        </label>
      ) : (
        /* Tab 2: Dán nội dung */
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 6, justifyContent: "space-between", alignItems: "center" }}>
            <button
              type="button"
              disabled={!examText || !examText.trim()}
              className="btn btn-secondary btn-sm"
              style={{
                padding: "3px 10px",
                fontSize: 12,
                color: examText && examText.trim() ? "#dc2626" : "#94a3b8",
                borderColor: examText && examText.trim() ? "#fca5a5" : "#e2e8f0",
                backgroundColor: examText && examText.trim() ? "#fef2f2" : "#f8fafc",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontWeight: 600,
                cursor: examText && examText.trim() ? "pointer" : "not-allowed",
                opacity: examText && examText.trim() ? 1 : 0.45,
                transition: "all 0.15s ease",
              }}
              title={examText && examText.trim() ? "Xóa nhanh toàn bộ nội dung trong ô văn bản" : "Ô nhập liệu đang trống"}
              onClick={() => setExamText("")}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
              Xóa nhanh
            </button>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ padding: "3px 10px", fontSize: 12 }}
                onClick={() => {
                  setSubject("Tin học");
                  setExamText(DEFAULT_EXAM_SAMPLES["Tin học"]);
                }}
              >
                Mẫu Tin học
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ padding: "3px 10px", fontSize: 12 }}
                onClick={() => {
                  setSubject("Toán");
                  setExamText(DEFAULT_EXAM_SAMPLES["Toán"]);
                }}
              >
                Mẫu Toán
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ padding: "3px 10px", fontSize: 12 }}
                onClick={() => {
                  setSubject("Ngữ văn");
                  setExamText(DEFAULT_EXAM_SAMPLES["Ngữ văn"]);
                }}
              >
                Mẫu Ngữ văn
              </button>
            </div>
          </div>
          <textarea
            className="spec-textarea"
            value={examText}
            onChange={(e) => setExamText(e.target.value)}
          />
        </div>
      )}

      {/* Môn học: Nút bấm ngang (Chips/Pills) */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: "13px", fontWeight: 700, color: "#374151", display: "block", marginBottom: 5 }}>
          Môn học
        </label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {subjectsList.map((s) => (
            <button
              key={s}
              type="button"
              className={`subject-chip-pill ${subject === s ? "active" : ""}`}
              onClick={() => setSubject(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Lớp & Bộ sách (chia đều 2 ô) */}
      <div className="select-row">
        <div className="select-col">
          <label style={{ fontSize: "13px", fontWeight: 600, color: "#374151" }}>Lớp</label>
          <select
            className="pill-select"
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
          >
            <option>Lớp 6</option>
            <option>Lớp 7</option>
            <option>Lớp 8</option>
            <option>Lớp 9</option>
            <option>Lớp 10</option>
            <option>Lớp 11</option>
            <option>Lớp 12</option>
          </select>
        </div>

        <div className="select-col">
          <label style={{ fontSize: "13px", fontWeight: 600, color: "#374151" }}>Bộ sách</label>
          <select
            className="pill-select"
            value={bookSeries}
            onChange={(e) => setBookSeries(e.target.value)}
          >
            <option>Kết nối tri thức</option>
            <option>Cánh diều</option>
            <option>Chân trời sáng tạo</option>
            <option>Khác / Đề chung</option>
          </select>
        </div>
      </div>

      {/* Đáp án kèm theo */}
      <div className="custom-radio-group">
        <div className="custom-radio-label">Đề có kèm đáp án không?</div>
        <div className="custom-radio-row">
          {[
            ["auto", "Tự đoán — hệ thống tự nhận biết"],
            ["yes", "Có — đối chiếu đáp án GV"],
            ["no", "Không — chỉ soi cấu trúc + gợi ý đáp án"],
          ].map(([v, label]) => (
            <div key={v} className="custom-radio-item" onClick={() => setAnswerMode(v)}>
              <div className={`custom-radio-circle ${answerMode === v ? "checked" : ""}`}>
                {answerMode === v && <div className="custom-radio-dot" />}
              </div>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Mức kiểm tra */}
      <div className="custom-radio-group">
        <div className="custom-radio-label">Mức kiểm tra</div>
        <div className="custom-radio-row">
          <div
            className="custom-radio-item"
            onClick={() => setCheckLevel("standard")}
          >
            <div className={`custom-radio-circle ${checkLevel === "standard" ? "checked" : ""}`}>
              {checkLevel === "standard" && <div className="custom-radio-dot" />}
            </div>
            <span>Tiêu chuẩn — nhanh, quét nhanh lỗi cơ bản</span>
          </div>

          <div
            className="custom-radio-item"
            onClick={() => setCheckLevel("deep")}
          >
            <div className={`custom-radio-circle ${checkLevel === "deep" ? "checked" : ""}`}>
              {checkLevel === "deep" && <div className="custom-radio-dot" />}
            </div>
            <span>Chuyên sâu — giải độc lập các câu có rủi ro</span>
          </div>
        </div>
      </div>

      {/* Multi-step Progress Stepper (Hiện rõ 4 bước khi thẩm định) */}
      {loading && (
        <div
          style={{
            background: "linear-gradient(135deg, #f0fdf4 0%, #f0f9ff 100%)",
            border: "1.5px solid #86efac",
            borderRadius: "14px",
            padding: "16px 18px",
            marginTop: "14px",
            marginBottom: "14px",
            boxShadow: "0 4px 16px rgba(16, 185, 129, 0.08)",
          }}
        >
          {/* Header tiến độ */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>⚡</span>
              <span style={{ fontSize: 13.5, fontWeight: 800, color: "#0f766e" }}>
                Tiến trình Thẩm định Phản biện Chéo:
              </span>
            </div>
            <span style={{ fontSize: 12, fontWeight: 800, color: "#0284c7", background: "#e0f2fe", padding: "2px 8px", borderRadius: 9999 }}>
              {currentStep === 1 ? "Bước 1/4 (25%)" : currentStep === 2 ? "Bước 2/4 (50%)" : currentStep === 3 ? "Bước 3/4 (75%)" : "Bước 4/4 (100%)"}
            </span>
          </div>

          {/* Dải 4 bước kết nối */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 8,
              marginBottom: 10,
              position: "relative",
            }}
          >
            {STEPS.map((s) => {
              const isDone = s.id < currentStep;
              const isActive = s.id === currentStep;
              return (
                <div
                  key={s.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    textAlign: "center",
                    opacity: isDone || isActive ? 1 : 0.45,
                    transition: "all 0.3s ease",
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 800,
                      fontSize: 12,
                      marginBottom: 5,
                      background: isDone
                        ? "#16a34a"
                        : isActive
                        ? "#0284c7"
                        : "#e2e8f0",
                      color: isDone || isActive ? "#ffffff" : "#64748b",
                      boxShadow: isActive ? "0 0 0 4px rgba(2, 132, 199, 0.2)" : "none",
                      transition: "all 0.3s ease",
                    }}
                  >
                    {isDone ? "✓" : s.id}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: isActive ? "#0284c7" : isDone ? "#16a34a" : "#475569" }}>
                    {s.label}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Diễn giải bước hiện tại */}
          <div style={{ textAlign: "center", fontSize: 12, color: "#334155", fontWeight: 600, background: "rgba(255,255,255,0.7)", padding: "5px 10px", borderRadius: 8 }}>
            ➜ {STEPS.find((s) => s.id === currentStep)?.desc || "Đang xử lý dữ liệu đề thi..."}
          </div>
        </div>
      )}

      {/* Black Pill Button */}
      <button
        className="black-pill-btn"
        onClick={handleCheck}
        disabled={!hasExam || loading}
        style={{
          opacity: !hasExam ? 0.45 : loading ? 0.85 : 1,
          cursor: !hasExam ? "not-allowed" : loading ? "wait" : "pointer",
          background: !hasExam ? "#64748b" : "#0f172a",
          transition: "all 0.2s ease",
        }}
      >
        {loading ? (
          <span>
            {currentStep === 1
              ? "① Đang đọc đề & trích xuất câu hỏi..."
              : currentStep === 2
              ? "② Đang giải mù độc lập qua Solver Sandbox..."
              : currentStep === 3
              ? "③ Đang đối soát đáp án & rà soát logic..."
              : "④ Đang tổng hợp biên bản & xuất báo cáo..."}
          </span>
        ) : (
          <>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 7V5a2 2 0 0 1 2-2h2"></path>
              <path d="M17 3h2a2 2 0 0 1 2 2v2"></path>
              <path d="M21 17v2a2 2 0 0 1-2 2h-2"></path>
              <path d="M7 21H5a2 2 0 0 1-2-2v-2"></path>
            </svg>
            <span>Bắt đầu thẩm định</span>
          </>
        )}
      </button>

      {/* Thông báo nhắc nhở khi chưa có đề */}
      {!hasExam && (
        <div
          style={{
            textAlign: "center",
            fontSize: "12px",
            color: "#64748b",
            marginTop: "-4px",
            marginBottom: "12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <span>ℹ️</span>
          <span>
            {mode === "file"
              ? "Vui lòng tải tệp đề (.docx, .pdf, .txt) để bắt đầu thẩm định"
              : "Vui lòng nhập/dán nội dung đề thi để bắt đầu thẩm định"}
          </span>
        </div>
      )}

      {errorMsg && (
        <div style={{ textAlign: "center", color: "#dc2626", fontWeight: 600, marginBottom: 12 }}>
          {errorMsg}
        </div>
      )}
      </div>

      {/* Footer Note */}
      <div className="spec-footer-note">
        🛡️ <strong>Soi Đề AI là trợ lý phản biện chéo hỗ trợ duyệt đề, không thay thế con người.</strong> Cơ chế giải mù độc lập giúp hạn chế tối đa ảo giác AI — Quyết định chuyên môn cuối cùng luôn thuộc về Thầy/Cô và Tổ chuyên môn.
      </div>
    </div>
  );
}
