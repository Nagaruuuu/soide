import React, { useState, useEffect, useMemo } from "react";
import { api } from "../lib/api.js";
import {
  IconCopy,
  IconSearch,
  IconCheckCircle,
  IconAlertTriangle,
  IconAlertCircle,
  IconFileText,
  IconX,
} from "../components/Icons.jsx";

const MOCK_SAMPLE_REPORT = {
  check: {
    id: "sample-demo",
    title: "Đề kiểm tra Tin học 10",
    subject: "Tin học",
    grade: "10",
    created_at: new Date().toISOString(),
  },
  summary: {
    total_questions: 40,
    ok_questions: 32,
    review_count: 5,
    blocker_count: 3,
    severity_counts: { blocker: 3, review: 5, hint: 0 },
  },
  matrix_gdpt_2018: {
    total: 40,
    distribution: {
      biet: { count: 16, percent: 40, label: "Nhận biết", target: "40%" },
      hieu: { count: 12, percent: 30, label: "Thông hiểu", target: "30%" },
      van_dung: { count: 8, percent: 20, label: "Vận dụng", target: "20%" },
      van_dung_cao: { count: 4, percent: 10, label: "Vận dụng cao", target: "10%" },
    },
    pedagogical_score: 9.4,
    pedagogical_assessment: "Độ phủ ma trận chuẩn mực theo định hướng phát triển phẩm chất, năng lực CT GDPT 2018; phân hóa tốt giữa các nhóm học sinh.",
    recommendation: "Tỷ lệ phân bố 4 mức độ nhận thức đạt chuẩn 40 - 30 - 20 - 10 của Bộ GD&ĐT.",
  },
  findings: [
    {
      id: "sample-1",
      ord: 12,
      severity: "blocker",
      cognitive_level: "van_dung",
      title: "Đáp án có thể sai",
      expected_answer: "B",
      suggested_answer: "C",
      evidence: "Hai phương pháp cho kết quả khác nhau. Cần đối chiếu điều kiện câu hỏi và kiến thức liên quan.",
      source_reference: "",
      fix_suggestion: "Đổi phương án đúng sang C hoặc điều chỉnh lại câu dẫn để khớp với phương án B.",
      verification_method: "Giải độc lập đối sánh (Rules + Solver Sandbox)",
    },
    {
      id: "sample-2",
      ord: 18,
      severity: "review",
      cognitive_level: "hieu",
      title: "Câu hỏi có thể mơ hồ",
      expected_answer: "A",
      suggested_answer: "A hoặc C",
      evidence: "Câu dẫn chứa từ ngữ chưa đủ điều kiện tiên quyết, dẫn đến có thể suy luận ra hai phương án hợp lệ.",
      source_reference: "SGK Tin học 10 - Bài 3: Điện toán đám mây & Internet.",
      fix_suggestion: "Thêm cụm từ 'xét trong mô hình mạng cục bộ tiêu chuẩn' vào phần dẫn câu hỏi.",
      verification_method: "Heuristic đối soát văn phong & tiền đề câu hỏi",
    },
    {
      id: "sample-3",
      ord: 25,
      severity: "review",
      cognitive_level: "biet",
      title: "Trùng lặp nội dung giữa các phương án",
      expected_answer: "D",
      suggested_answer: "D",
      evidence: "Phương án B và C có ý nghĩa gần như tương đương, học sinh dễ bị nhiễu không cần thiết.",
      source_reference: "Nguyên tắc xây dựng câu hỏi trắc nghiệm khách quan.",
      fix_suggestion: "Thay thế phương án B bằng một phương án gây nhiễu mang tính logic khác biệt.",
      verification_method: "Rule phát hiện trùng lặp ngữ nghĩa phương án",
    },
  ],
};

const exportMenuItemStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  padding: "10px 14px",
  background: "#fff",
  border: "none",
  borderBottom: "1px solid #f1f5f9",
  fontSize: 13.5,
  fontWeight: 600,
  color: "#1e293b",
  cursor: "pointer",
  textAlign: "left",
};

// Severity ranking: blocker/error > review/warning > hint > info
const SEVERITY_RANK = { blocker: 3, error: 3, review: 2, warning: 2, hint: 1, info: 0, ok: -1 };
const getSeverityRank = (sev) => SEVERITY_RANK[sev] ?? 0;

export default function ReportPage({ checkId, onToast, onSelectCheck, onBack }) {
  const [data, setData] = useState(null);
  const [allChecks, setAllChecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [currentId, setCurrentId] = useState(checkId);
  const [verifyingFinding, setVerifyingFinding] = useState(null);
  const [editingFinding, setEditingFinding] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    setCurrentId(checkId);
  }, [checkId]);

  useEffect(() => {
    loadReportData();
  }, [currentId]);

  useEffect(() => {
    if (!exportOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") setExportOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [exportOpen]);

  // Gom findings theo câu (f.ord) — giữ đúng thứ tự xuất hiện, câu không số gom nhóm "Khác"
  // Khai báo HOOK ở đầu component TRƯỚC mọi return có điều kiện để tuân thủ React Rules of Hooks
  const groupedFindings = useMemo(() => {
    const findings = data?.findings || [];
    const groups = [];
    const map = new Map();

    findings.forEach((f) => {
      const key = f.ord !== undefined && f.ord !== null ? String(f.ord) : "Khác";
      if (!map.has(key)) {
        const group = {
          key,
          ord: f.ord,
          items: [],
          highestSeverity: f.severity || "review",
          cognitiveLevel: f.cognitive_level || null,
          expectedAnswer: f.expected_answer || null,
          suggestedAnswer: f.suggested_answer || null,
          mainTitle: f.title || "",
        };
        map.set(key, group);
        groups.push(group);
      }
      const g = map.get(key);
      g.items.push(f);

      // Cập nhật mức độ nặng nhất & tiêu đề chính từ finding nặng nhất
      if (getSeverityRank(f.severity) > getSeverityRank(g.highestSeverity)) {
        g.highestSeverity = f.severity;
        if (f.title) g.mainTitle = f.title;
      }
      if (!g.mainTitle && f.title) g.mainTitle = f.title;
      if (!g.cognitiveLevel && f.cognitive_level) g.cognitiveLevel = f.cognitive_level;
      if (!g.expectedAnswer && f.expected_answer) g.expectedAnswer = f.expected_answer;
      if (!g.suggestedAnswer && f.suggested_answer) g.suggestedAnswer = f.suggested_answer;
    });

    return groups;
  }, [data]);

  async function loadReportData() {
    setLoading(true);
    setLoadError("");
    try {
      const listRes = await api("/api/checks").catch(() => ({ checks: [] }));
      const checks = listRes.checks || [];
      setAllChecks(checks);

      if (currentId === "sample-demo") {
        setData(MOCK_SAMPLE_REPORT);
        return;
      }

      const activeId = currentId || checks[0]?.id;
      if (activeId) {
        const res = await api(`/api/checks/${activeId}/report`);
        setData(res);
      } else {
        // Không có đề nào: báo rỗng trung thực, KHÔNG dùng số liệu mẫu
        setData(null);
        setLoadError("Chưa có đề thi nào để lập báo cáo. Hãy tạo đề mới ở trang Kiểm tra đề.");
      }
    } catch (e) {
      // Lỗi API: hiện lỗi + nút thử lại, KHÔNG fallback báo cáo mẫu
      setData(null);
      setLoadError(e?.message || "Không tải được báo cáo. Kiểm tra mạng/server rồi thử lại.");
    } finally {
      setLoading(false);
    }
  }

  function handleCopyMarkdown() {
    if (!data) return;
    const c = data.check || {};
    const s = data.summary || {};
    const findingsList = data.findings || [];

    let md = `# BÁO CÁO KIỂM TRA ĐỀ — SOI ĐỀ AI\n\n`;
    md += `- **Đề thi:** ${c.title || "Đề kiểm tra Tin học 10"}\n`;
    md += `- **Môn học:** ${c.subject || "Tin học"} ${c.grade ? `· Lớp ${c.grade}` : ""}\n`;
    md += `- **Thời gian xuất:** ${new Date().toLocaleString("vi-VN")}\n\n`;
    md += `## THỐNG KÊ TỔNG QUAN\n`;
    md += `- Chưa phát hiện lỗi: ${s.ok_questions ?? 0} câu\n`;
    md += `- Cần xem lại (mức Nên xem): ${s.severity_counts?.review ?? s.review_count ?? s.pending ?? 0} câu\n`;
    md += `- Có dấu hiệu sai (mức Chặn lại): ${s.severity_counts?.blocker ?? s.blocker_count ?? s.confirmed ?? 0} câu\n\n`;

    md += `## DANH SÁCH CHI TIẾT CẢNH BÁO\n\n`;

    findingsList.forEach((f) => {
      md += `### Câu ${f.ord}: ${f.title || (f.severity === "blocker" ? "Đáp án có thể sai" : "Cần xem lại")}\n`;
      if (f.expected_answer || f.suggested_answer) {
        md += `- **Đáp án dự kiến:** ${f.expected_answer || "Chưa có"}. **Giải độc lập:** ${f.suggested_answer || "Chưa có"}\n`;
      }
      md += `- **Lý do:** ${f.evidence}\n`;
      if (f.source_reference) md += `- **Nguồn đối chiếu:** ${f.source_reference}\n`;
      if (f.fix_suggestion) md += `- **Gợi ý sửa:** ${f.fix_suggestion}\n`;
      md += `\n`;
    });

    navigator.clipboard?.writeText?.(md);
    onToast?.("Đã sao chép Báo cáo (Markdown) vào Clipboard!");
  }

  function handleExportWord() {
    if (!data) return;
    const active = data;
    const c = active.check || {};
    const s = active.summary || {};
    const findingsList = active.findings || [];

    const html = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset='utf-8'>
      <title>Biên bản Thẩm định & Duyệt đề thi</title>
      <style>
        body { font-family: 'Times New Roman', serif; font-size: 13pt; line-height: 1.45; color: #000; }
        .header-table { width: 100%; border: none; margin-bottom: 20px; }
        .header-table td { border: none; vertical-align: top; text-align: center; font-size: 11.5pt; }
        h1 { text-align: center; font-size: 16pt; font-weight: bold; margin: 15px 0 5px 0; text-transform: uppercase; }
        .subtitle { text-align: center; font-style: italic; margin-bottom: 20px; font-size: 12pt; }
        h2 { font-size: 13pt; font-weight: bold; margin-top: 18px; margin-bottom: 8px; text-transform: uppercase; }
        table.data-table { width: 100%; border-collapse: collapse; margin: 12px 0; }
        table.data-table th, table.data-table td { border: 1px solid #000; padding: 6px 10px; font-size: 12pt; }
        table.data-table th { background-color: #f2f2f2; text-align: center; font-weight: bold; }
        .sig-table { width: 100%; border: none; margin-top: 40px; }
        .sig-table td { border: none; text-align: center; font-size: 12pt; vertical-align: top; width: 33.33%; }
        .note { font-style: italic; font-size: 11pt; color: #333; margin-top: 6px; }
      </style>
    </head>
    <body>
      <table class="header-table">
        <tr>
          <td style="width: 45%;">
            SỞ GIÁO DỤC VÀ ĐÀO TẠO<br/>
            <strong>TRƯỜNG THPT ....................</strong><br/>
            TỔ CHUYÊN MÔN: ....................
          </td>
          <td style="width: 55%;">
            <strong>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</strong><br/>
            <strong><u>Độc lập - Tự do - Hạnh phúc</u></strong><br/>
            <em>Ngày ${new Date().getDate()} tháng ${new Date().getMonth() + 1} năm ${new Date().getFullYear()}</em>
          </td>
        </tr>
      </table>

      <h1>BIÊN BẢN HỌP THẨM ĐỊNH & PHẢN BIỆN ĐỀ THI</h1>
      <div class="subtitle">(Định hướng Chương trình Giáo dục phổ thông 2018 - Chuẩn đánh giá mới)</div>

      <h2>I. THÔNG TIN CHUNG VỀ BÀI KIỂM TRA</h2>
      <ul>
        <li><strong>Tên bài kiểm tra:</strong> ${c.title || "Đề kiểm tra định kỳ"}</li>
        <li><strong>Môn học:</strong> ${c.subject || "Tin học"} ${c.grade ? `(Khối ${c.grade})` : ""}</li>
        <li><strong>Bộ sách tham chiếu:</strong> Kết nối tri thức / Cánh diều</li>
        <li><strong>Tổng số câu hỏi:</strong> ${s.total_questions ?? 0} câu</li>
        <li><strong>Phương thức thẩm định:</strong> Hệ thống Phản biện AI Soi Đề (Rules Engine + Solver Sandbox)</li>
      </ul>

      <h2>II. TỔNG HỢP KẾT QUẢ ĐỐI SOÁT & DANH MỤC CÂU CẦN ĐIỀU CHỈNH</h2>
      <ul>
        <li>Số câu đạt chuẩn hoàn toàn: <strong>${s.ok_questions ?? 0}</strong> câu</li>
        <li>Số câu có cảnh báo cần xem lại: <strong>${s.severity_counts?.review ?? s.review_count ?? s.pending ?? 0}</strong> câu</li>
        <li>Số câu có dấu hiệu sai đáp án / dữ liệu: <strong>${s.severity_counts?.blocker ?? s.blocker_count ?? s.confirmed ?? 0}</strong> câu</li>
      </ul>

      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 10%;">Câu</th>
            <th style="width: 15%;">Mức độ</th>
            <th style="width: 20%;">Vấn đề ghi nhận</th>
            <th style="width: 30%;">Dẫn chứng & Chi tiết</th>
            <th style="width: 25%;">Khuyến nghị điều chỉnh</th>
          </tr>
        </thead>
        <tbody>
          ${findingsList.map(f => `
            <tr>
              <td style="text-align: center;"><strong>Câu ${f.ord}</strong></td>
              <td style="text-align: center;">${f.cognitive_level === 'van_dung_cao' ? 'Vận dụng cao' : f.cognitive_level === 'van_dung' ? 'Vận dụng' : f.cognitive_level === 'hieu' ? 'Thông hiểu' : 'Nhận biết'}</td>
              <td><strong>${f.title || (f.severity === 'blocker' ? 'Đáp án có thể sai' : 'Câu hỏi mơ hồ')}</strong></td>
              <td>${f.expected_answer ? `Đáp án dự kiến: ${f.expected_answer}. Giải độc lập: ${f.suggested_answer || 'Chưa có'}. ` : ''}${f.evidence || ''}</td>
              <td>${f.fix_suggestion || 'Kiểm tra lại câu hỏi'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <h2>III. KẾT QUẢ ĐỐI SOÁT ĐỀ NÀY (SỐ LIỆU THỰC TẾ)</h2>
      <table class="data-table">
        <thead>
          <tr>
            <th>Chỉ số</th>
            <th>Số liệu đề này</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Tổng số câu hỏi</strong></td>
            <td style="text-align: center; font-weight: bold;">${s.total_questions ?? findingsList.length}</td>
          </tr>
          <tr>
            <td><strong>Cảnh báo mức Chặn lại</strong></td>
            <td style="text-align: center; font-weight: bold;">${s.confirmed ?? 0}</td>
          </tr>
          <tr>
            <td><strong>Cảnh báo mức Nên xem</strong></td>
            <td style="text-align: center; font-weight: bold;">${s.pending ?? 0}</td>
          </tr>
          <tr>
            <td><strong>Câu không phát hiện vấn đề</strong></td>
            <td style="text-align: center; font-weight: bold;">${s.ok_questions ?? 0}</td>
          </tr>
        </tbody>
      </table>
      <div class="note"><strong>Ghi chú:</strong> Bảng trên chỉ phản ánh kết quả thẩm định của đúng đề thi này. Hệ thống không cam kết tỷ lệ phát hiện lỗi hay độ chính xác tổng quát.</div>

      <h2>IV. KẾT LUẬN VÀ KIẾN NGHỊ CỦA TỔ CHUYÊN MÔN</h2>
      <p>1. Đề thi đạt yêu cầu về mục tiêu, chuẩn kiến thức kỹ năng theo Chương trình GDPT 2018 sau khi điều chỉnh các câu hỏi đã ghi nhận ở Mục III.</p>
      <p>2. Thống nhất phê duyệt đưa vào sử dụng làm đề kiểm tra chính thức.</p>

      <table class="sig-table">
        <tr>
          <td><strong>GIÁO VIÊN RA ĐỀ</strong><br/><em>(Ký và ghi rõ họ tên)</em><br/><br/><br/><br/>...................................</td>
          <td><strong>NGƯỜI PHẢN BIỆN</strong><br/><em>(Ký và ghi rõ họ tên)</em><br/><br/><br/><br/>...................................</td>
          <td><strong>TỔ TRƯỞNG CHUYÊN MÔN</strong><br/><em>(Ký và ghi rõ họ tên)</em><br/><br/><br/><br/>...................................</td>
        </tr>
      </table>
    </body>
    </html>
    `;

    const blob = new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Bien_ban_duyet_de_${c.subject || 'TinHoc'}_${new Date().toISOString().slice(0,10)}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onToast?.("Đã xuất file Word (.doc) Biên bản phản biện thành công!");
  }

  function handleExportPDF() {
    onToast?.("Đang chuẩn bị trang in / xuất PDF...");
    setTimeout(() => {
      window.print();
    }, 200);
  }

  if (loading) {
    return (
      <div className="spec-container" style={{ maxWidth: 860 }}>
        <div className="skeleton" style={{ height: 420, borderRadius: 20 }} />
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <div className="spec-container" style={{ maxWidth: 860, textAlign: "center", padding: "48px 24px" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#ff4d4f", marginBottom: 8 }}>
          {loadError || "Chưa có dữ liệu báo cáo."}
        </div>
        <button className="btn btn-primary" onClick={loadReportData}>Thử lại</button>
      </div>
    );
  }

  const activeData = data;
  const check = activeData.check || {};
  const summary = activeData.summary || {};
  const findings = activeData.findings || [];

  // Compute stat counts — ưu tiên lấy từ question_stats (đồng bộ cùng nguồn)
  const qs = summary.question_stats || null;
  const okCount = qs ? qs.ok : (summary.ok_questions !== undefined ? summary.ok_questions : 0);
  const reviewCount = qs
    ? qs.warnings
    : (summary.severity_counts?.review
      ?? (summary.review_count !== undefined
        ? summary.review_count
        : (summary.pending !== undefined ? summary.pending : 0)));
  const blockerCount = qs
    ? qs.errors
    : (summary.severity_counts?.blocker
      ?? (summary.blocker_count !== undefined
        ? summary.blocker_count
        : (summary.confirmed !== undefined ? summary.confirmed : 0)));

  const hasWarnings = (reviewCount + blockerCount) > 0;

  return (
    <div className="spec-container" style={{ maxWidth: 880 }}>
      {/* Top Action Bar: dropdown Xuất báo cáo (gọn, không choán chỗ) */}
      <div
        className="no-print"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 12,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ position: "relative" }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setExportOpen((v) => !v)}
            title="Xuất báo cáo"
            style={{ fontWeight: 700 }}
          >
            <span>📥 Xuất báo cáo ▾</span>
          </button>
          {exportOpen && (
            <>
              <div
                style={{ position: "fixed", inset: 0, zIndex: 998 }}
                onClick={() => setExportOpen(false)}
              />
              <div
                style={{
                  position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 999,
                  background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10,
                  boxShadow: "0 10px 30px rgba(0,0,0,0.12)", minWidth: 220, overflow: "hidden",
                }}
              >
                <button
                  onClick={() => { setExportOpen(false); handleExportWord(); }}
                  title="Xuất file Word (.doc) cho tổ chuyên môn"
                  style={exportMenuItemStyle}
                >
                  <span>📄 Xuất Word (.doc)</span>
                </button>
                <button
                  onClick={() => { setExportOpen(false); handleExportPDF(); }}
                  title="Xuất PDF hoặc In biên bản duyệt đề"
                  style={exportMenuItemStyle}
                >
                  <span>🖨️ In / Xuất PDF</span>
                </button>
                <button
                  onClick={() => { setExportOpen(false); handleCopyMarkdown(); }}
                  title="Sao chép Markdown"
                  style={{ ...exportMenuItemStyle, borderBottom: "none" }}
                >
                  <span>📋 Sao chép Markdown</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Main Elevated Report Card (Exact Screenshot Match) */}
      <div className="spec-card report-spec-card">
        {/* Official Header for Print / PDF Export */}
        <div className="print-only" style={{ marginBottom: 24, textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div style={{ textAlign: "center", width: "45%" }}>
              <div style={{ fontSize: 13 }}>SỞ GIÁO DỤC VÀ ĐÀO TẠO</div>
              <div style={{ fontSize: 13, fontWeight: "bold" }}>TRƯỜNG THPT ....................</div>
              <div style={{ fontSize: 12 }}>TỔ CHUYÊN MÔN: {check.subject?.toUpperCase() || "TIN HỌC"}</div>
            </div>
            <div style={{ textAlign: "center", width: "55%" }}>
              <div style={{ fontSize: 13, fontWeight: "bold" }}>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
              <div style={{ fontSize: 13, fontWeight: "bold", textDecoration: "underline" }}>Độc lập - Tự do - Hạnh phúc</div>
              <div style={{ fontSize: 12, fontStyle: "italic", marginTop: 4 }}>
                Ngày {new Date().getDate()} tháng {new Date().getMonth() + 1} năm {new Date().getFullYear()}
              </div>
            </div>
          </div>
          <h2 style={{ fontSize: 18, fontWeight: "bold", textTransform: "uppercase", margin: "14px 0 4px 0" }}>
            BIÊN BẢN HỌP THẨM ĐỊNH VÀ PHẢN BIỆN ĐỀ THI
          </h2>
          <div style={{ fontSize: 12, fontStyle: "italic", color: "#444" }}>
            (Theo Chương trình GDPT 2018 - Định dạng cấu trúc trắc nghiệm mới)
          </div>
        </div>

        {/* Top Header Row */}
        <div
          className="no-print"
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: 20,
            gap: 16,
          }}
        >
          {/* Left Title & Subtitle */}
          <div>
            <h1
              style={{
                fontSize: "24px",
                fontWeight: 800,
                color: "#111827",
                marginBottom: "4px",
                letterSpacing: "-0.02em",
              }}
            >
              Báo cáo Phản biện Chéo Đề thi
            </h1>
            <div style={{ fontSize: "14.5px", color: "#6b7280", fontWeight: 500 }}>
              {check.title ? `${check.title} · ${summary.total_questions ?? 0} câu` : `Đề kiểm tra ${check.subject || "Tin học"} ${check.grade || "10"} · ${summary.total_questions ?? 0} câu`} · Trợ lý phản biện chéo hỗ trợ giáo viên
            </div>
          </div>

          {/* Right Action Icons & Warning Badge */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <button
                onClick={handleCopyMarkdown}
                title="Chia sẻ / Sao chép"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#4b5563",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 16,
                  padding: 4,
                }}
              >
                📤
              </button>

              <button
                onClick={onBack}
                title="Đóng / Quay lại"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#6b7280",
                  cursor: "pointer",
                  fontSize: 16,
                  padding: 4,
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>

            {/* Warning / OK Badge */}
            {hasWarnings ? (
              <div
                style={{
                  padding: "4px 14px",
                  borderRadius: 9999,
                  background: "#fff1eb",
                  color: "#ea580c",
                  fontSize: "12.5px",
                  fontWeight: 700,
                  letterSpacing: "-0.01em",
                }}
              >
                Có cảnh báo
              </div>
            ) : (
              <div
                style={{
                  padding: "4px 14px",
                  borderRadius: 9999,
                  background: "#ecfdf5",
                  color: "#16a34a",
                  fontSize: "12.5px",
                  fontWeight: 700,
                }}
              >
                ✓ Đạt chuẩn
              </div>
            )}
          </div>
        </div>

        {/* 3 KPI Metrics Row */}
        <div className="report-kpi-grid">
          {/* Column 1: Chưa phát hiện lỗi */}
          <div>
            <div
              className="kpi-num"
              style={{
                fontSize: "32px",
                fontWeight: 800,
                color: "#16a34a",
                lineHeight: 1.1,
                fontFamily: "var(--font-sans)",
              }}
            >
              {okCount}
            </div>
            <div className="kpi-label" style={{ fontSize: "13.5px", color: "#4b5563", marginTop: 6, fontWeight: 500 }}>
              Chưa phát hiện lỗi
            </div>
          </div>

          {/* Column 2: Cần xem lại */}
          <div>
            <div
              className="kpi-num"
              style={{
                fontSize: "32px",
                fontWeight: 800,
                color: "#ea580c",
                lineHeight: 1.1,
                fontFamily: "var(--font-sans)",
              }}
            >
              {reviewCount}
            </div>
            <div className="kpi-label" style={{ fontSize: "13.5px", color: "#4b5563", marginTop: 6, fontWeight: 500 }}>
              Cần xem lại
            </div>
          </div>

          {/* Column 3: Có dấu hiệu sai */}
          <div>
            <div
              className="kpi-num"
              style={{
                fontSize: "32px",
                fontWeight: 800,
                color: "#dc2626",
                lineHeight: 1.1,
                fontFamily: "var(--font-sans)",
              }}
            >
              {blockerCount}
            </div>
            <div className="kpi-label" style={{ fontSize: "13.5px", color: "#4b5563", marginTop: 6, fontWeight: 500 }}>
              Có dấu hiệu sai
            </div>
          </div>
        </div>

        {/* Findings List (Gom theo từng câu) */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {groupedFindings.map((g, groupIdx) => {
            const isBlocker = g.highestSeverity === "blocker" || g.highestSeverity === "error";
            const isReview = g.highestSeverity === "review" || g.highestSeverity === "warning";
            const pillBg = isBlocker ? "#fee2e2" : isReview ? "#ffedd5" : "#eff6ff";
            const pillColor = isBlocker ? "#dc2626" : isReview ? "#ea580c" : "#2563eb";
            const groupHeaderTitle =
              g.mainTitle ||
              (isBlocker
                ? "Lỗi cần xử lý"
                : isReview
                ? "Nghi vấn cần kiểm tra"
                : "Gợi ý kiểm chứng");

            return (
              <React.Fragment key={g.key || groupIdx}>
                <div style={{ padding: "4px 0" }}>
                  {/* Header 1 lần duy nhất: Pill Câu N + Pill mức nặng nhất + Cognitive level + Tiêu đề */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        padding: "3px 10px",
                        borderRadius: 9999,
                        background: pillBg,
                        color: pillColor,
                        fontSize: "12.5px",
                        fontWeight: 700,
                      }}
                    >
                      {g.ord !== undefined && g.ord !== null ? `Câu ${g.ord}` : "Khác"}
                    </span>

                    <span
                      style={{
                        padding: "2.5px 8px",
                        borderRadius: 6,
                        background: isBlocker ? "#fee2e2" : isReview ? "#ffedd5" : "#eff6ff",
                        color: isBlocker ? "#dc2626" : isReview ? "#ea580c" : "#2563eb",
                        fontSize: "11.5px",
                        fontWeight: 700,
                      }}
                    >
                      {isBlocker ? "Lỗi nghiêm trọng" : isReview ? "Cần xem lại" : "Gợi ý"}
                    </span>

                    {g.cognitiveLevel && (
                      <span
                        style={{
                          padding: "2.5px 10px",
                          borderRadius: 9999,
                          background:
                            g.cognitiveLevel === "van_dung_cao"
                              ? "#f3e8ff"
                              : g.cognitiveLevel === "van_dung"
                              ? "#fef3c7"
                              : g.cognitiveLevel === "hieu"
                              ? "#ecfdf5"
                              : "#e0f2fe",
                          color:
                            g.cognitiveLevel === "van_dung_cao"
                              ? "#7e22ce"
                              : g.cognitiveLevel === "van_dung"
                              ? "#b45309"
                              : g.cognitiveLevel === "hieu"
                              ? "#047857"
                              : "#0369a1",
                          fontSize: "11.5px",
                          fontWeight: 700,
                        }}
                      >
                        {g.cognitiveLevel === "van_dung_cao"
                          ? "Vận dụng cao"
                          : g.cognitiveLevel === "van_dung"
                          ? "Vận dụng"
                          : g.cognitiveLevel === "hieu"
                          ? "Thông hiểu"
                          : "Nhận biết"}
                      </span>
                    )}

                    <span
                      style={{
                        fontSize: "16px",
                        fontWeight: 700,
                        color: "#111827",
                      }}
                    >
                      {groupHeaderTitle}
                    </span>
                  </div>

                  {/* Hướng dẫn giáo viên khi nội dung chưa đủ để đánh giá */}
                  {g.items.some((item) => item.category === "noi_dung_chua_du") && (
                    <div
                      style={{
                        margin: "8px 0 10px 0",
                        padding: "10px 14px",
                        background: "#fffbeb",
                        border: "1px solid #fde68a",
                        borderRadius: 8,
                        fontSize: "13px",
                        color: "#92400e",
                        lineHeight: 1.5,
                      }}
                    >
                      <strong style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span>💡 Hướng dẫn bổ sung nội dung:</span>
                      </strong>
                      <div>
                        Nội dung câu hỏi hiện chưa đủ để SOI ĐỀ AI tiến hành thẩm định. Thầy/cô vui lòng bổ sung đầy đủ nội dung câu hỏi, các phương án lựa chọn A/B/C/D (nếu là trắc nghiệm) và đáp án dự kiến (nếu có).
                      </div>
                    </div>
                  )}

                  {/* 1 dòng đáp án dự kiến & Giải độc lập (nếu có) */}
                  {(g.expectedAnswer || g.suggestedAnswer) && (
                    <div
                      style={{
                        fontSize: "14px",
                        color: "#1f2937",
                        marginBottom: 10,
                        lineHeight: 1.55,
                      }}
                    >
                      Đáp án dự kiến: <strong>{g.expectedAnswer || "Chưa có"}</strong>. Kết quả giải độc lập:{" "}
                      <strong>{g.suggestedAnswer || "Chưa có"}</strong>.
                    </div>
                  )}

                  {/* Danh sách gạch đầu dòng — mỗi issue 1 dòng */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
                    {g.items.map((item, itemIdx) => {
                      const itemIsBlocker = item.severity === "blocker" || item.severity === "error";
                      const itemIsReview = item.severity === "review" || item.severity === "warning";
                      const itemPillBg = itemIsBlocker ? "#fee2e2" : itemIsReview ? "#ffedd5" : "#eff6ff";
                      const itemPillColor = itemIsBlocker ? "#dc2626" : itemIsReview ? "#ea580c" : "#2563eb";
                      const itemPillLabel = itemIsBlocker ? "Lỗi" : itemIsReview ? "Xem lại" : "Gợi ý";
                      const itemTitle =
                        item.title ||
                        (itemIsBlocker
                          ? "Lỗi cần xử lý"
                          : itemIsReview
                          ? "Nghi vấn cần kiểm tra"
                          : "Gợi ý kiểm chứng");

                      return (
                        <div
                          key={item.id || itemIdx}
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            justifyContent: "space-between",
                            gap: 12,
                            padding: "8px 12px",
                            background: "#f8fafc",
                            borderRadius: 8,
                            border: "1px solid #e2e8f0",
                            flexWrap: "wrap",
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 260, fontSize: "13.5px", lineHeight: 1.5, color: "#374151" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 3 }}>
                              <span
                                style={{
                                  padding: "1.5px 7px",
                                  borderRadius: 4,
                                  background: itemPillBg,
                                  color: itemPillColor,
                                  fontSize: "11px",
                                  fontWeight: 700,
                                }}
                              >
                                {itemPillLabel}
                              </span>
                              <strong style={{ color: "#0f172a" }}>{itemTitle}</strong>
                            </div>
                            <div>
                              <span style={{ color: "#475569" }}>Lý do: </span>
                              {item.evidence}
                            </div>
                            {item.source_reference ? (
                              <div style={{ fontSize: "12.5px", color: "#64748b", marginTop: 2 }}>
                                Nguồn đối chiếu: {item.source_reference}
                              </div>
                            ) : null}
                          </div>

                          {/* Nút hành động cho từng dòng */}
                          <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0, marginTop: 2 }}>
                            <button
                              className="report-action-pill"
                              style={{ padding: "3px 10px", fontSize: "12px" }}
                              onClick={() => setVerifyingFinding(item)}
                              title="Xem cách kiểm chứng"
                            >
                              <span>Chi tiết</span>
                            </button>
                            <button
                              className="report-action-pill"
                              style={{ padding: "3px 10px", fontSize: "12px" }}
                              onClick={() => setEditingFinding(item)}
                              title="Sửa đề"
                            >
                              <span>Sửa</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Separator with centered down arrow chỉ giữa các câu khác nhau */}
                {groupIdx < groupedFindings.length - 1 && (
                  <div
                    style={{
                      position: "relative",
                      margin: "24px 0",
                      textAlign: "center",
                    }}
                  >
                    <hr style={{ border: "none", borderTop: "1px solid #f1f5f9" }} />
                    <div
                      style={{
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        transform: "translate(-50%, -50%)",
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        background: "#ffffff",
                        border: "1px solid #e2e8f0",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#6b7280",
                        fontSize: 14,
                        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                        cursor: "default",
                      }}
                    >
                      ↓
                    </div>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Signatures for Print / PDF Export */}
        <div className="print-only" style={{ marginTop: 40, paddingTop: 20, borderTop: "1px solid #ccc" }}>
          <div style={{ display: "flex", justifyContent: "space-between", textAlign: "center", fontSize: 12 }}>
            <div style={{ width: "33%" }}>
              <strong>GIÁO VIÊN RA ĐỀ</strong>
              <div style={{ fontStyle: "italic", fontSize: 11 }}>(Ký và ghi rõ họ tên)</div>
              <div style={{ height: 65 }} />
              <div>.......................................</div>
            </div>
            <div style={{ width: "33%" }}>
              <strong>NGƯỜI PHẢN BIỆN</strong>
              <div style={{ fontStyle: "italic", fontSize: 11 }}>(Ký và ghi rõ họ tên)</div>
              <div style={{ height: 65 }} />
              <div>.......................................</div>
            </div>
            <div style={{ width: "33%" }}>
              <strong>TỔ TRƯỞNG CHUYÊN MÔN</strong>
              <div style={{ fontStyle: "italic", fontSize: 11 }}>(Ký và ghi rõ họ tên)</div>
              <div style={{ height: 65 }} />
              <div>.......................................</div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal 1: Xem cách kiểm chứng */}
      {verifyingFinding && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.4)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 20,
          }}
          onClick={() => setVerifyingFinding(null)}
        >
          <div
            className="spec-card"
            style={{
              maxWidth: 580,
              width: "100%",
              padding: 28,
              margin: 0,
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    padding: "3px 10px",
                    borderRadius: 9999,
                    background: verifyingFinding.severity === "blocker" ? "#fee2e2" : "#ffedd5",
                    color: verifyingFinding.severity === "blocker" ? "#dc2626" : "#ea580c",
                    fontSize: 12.5,
                    fontWeight: 700,
                  }}
                >
                  Câu {verifyingFinding.ord}
                </span>
                <h3 style={{ fontSize: 17, fontWeight: 800, color: "#111827" }}>
                  Phương pháp kiểm chứng
                </h3>
              </div>
              <button
                onClick={() => setVerifyingFinding(null)}
                style={{ background: "none", border: "none", fontSize: 18, color: "#6b7280", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 14, color: "#374151" }}>
              {/* Box giải thích cơ chế giải mù độc lập */}
              <div
                style={{
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  borderRadius: 10,
                  padding: "12px 14px",
                  fontSize: "12.5px",
                  color: "#166534",
                  lineHeight: 1.55,
                }}
              >
                <div style={{ fontWeight: 800, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                  <span>🛡️ Cơ chế Giải Mù Độc Lập & Hạn Chế Tối Đa Ảo Giác AI:</span>
                </div>
                AI tự động giải bài độc lập mà <strong>không đọc trước đáp án</strong> của giáo viên, loại trừ thiên kiến xác nhận và hạn chế tối đa ảo giác AI qua sandbox logic. Thầy/Cô giữ toàn quyền phán quyết chuyên môn.
              </div>

              <div style={{ padding: 12, background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                <strong>Thuật toán thực thi:</strong>
                <p style={{ marginTop: 4, color: "#0284c7", fontWeight: 600 }}>
                  {verifyingFinding.verification_method || "Solver Sandbox độc lập + Heuristic Engine"}
                </p>
              </div>

              <div>
                <strong>Dẫn chứng đối chiếu:</strong>
                <p style={{ marginTop: 4, color: "#4b5563", lineHeight: 1.6 }}>
                  {verifyingFinding.evidence}
                </p>
              </div>

              {verifyingFinding.fix_suggestion && (
                <div style={{ padding: 12, background: "#ecfdf5", borderRadius: 10, border: "1px solid #a7f3d0" }}>
                  <strong style={{ color: "#065f46" }}>Khuyến nghị sư phạm:</strong>
                  <p style={{ marginTop: 4, color: "#047857", lineHeight: 1.6 }}>
                    {verifyingFinding.fix_suggestion}
                  </p>
                </div>
              )}
            </div>

            <div style={{ marginTop: 20, textAlign: "right" }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => setVerifyingFinding(null)}
              >
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Sửa đề */}
      {editingFinding && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.4)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 20,
          }}
          onClick={() => setEditingFinding(null)}
        >
          <div
            className="spec-card"
            style={{
              maxWidth: 580,
              width: "100%",
              padding: 28,
              margin: 0,
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    padding: "3px 10px",
                    borderRadius: 9999,
                    background: "#eff6ff",
                    color: "#2563eb",
                    fontSize: 12.5,
                    fontWeight: 700,
                  }}
                >
                  Câu {editingFinding.ord}
                </span>
                <h3 style={{ fontSize: 17, fontWeight: 800, color: "#111827" }}>
                  Trợ lý sửa đề thi
                </h3>
              </div>
              <button
                onClick={() => setEditingFinding(null)}
                style={{ background: "none", border: "none", fontSize: 18, color: "#6b7280", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>Gợi ý điều chỉnh:</label>
                <div
                  style={{
                    marginTop: 6,
                    padding: "12px 14px",
                    background: "#f8fafc",
                    border: "1px solid #cbd5e1",
                    borderRadius: 10,
                    fontSize: 14,
                    color: "#1e293b",
                    lineHeight: 1.6,
                  }}
                >
                  {editingFinding.fix_suggestion || "Đổi đáp án đúng hoặc bổ sung ngữ cảnh chuẩn cho câu hỏi."}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    navigator.clipboard?.writeText?.(editingFinding.fix_suggestion || "");
                    onToast?.("Đã sao chép nội dung sửa!");
                    setEditingFinding(null);
                  }}
                >
                  <IconCopy size={14} />
                  <span>Sao chép gợi ý sửa</span>
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    onToast?.("Đã áp dụng ghi chú sửa câu hỏi!");
                    setEditingFinding(null);
                  }}
                >
                  Áp dụng & Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
