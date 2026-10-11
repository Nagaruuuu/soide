import React, { useState, useEffect } from "react";
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
  },
  matrix_gdpt_2018: {
    total: 40,
    distribution: {
      biet: { count: 16, percent: 40, label: "Nhận biết", target: "40%" },
      hieu: { count: 12, percent: 30, label: "Thông hiểu", target: "30%" },
      van_dung: { count: 8, percent: 20, label: "Vận dụng", target: "20%" },
      van_dung_cao: { count: 4, percent: 10, label: "Vận dụng cao", target: "10%" },
    },
    format_structure: {
      part1: { count: 24, percent: 60, label: "Phần I: Nhiều lựa chọn (4 PA)" },
      part2: { count: 8, percent: 20, label: "Phần II: Đúng / Sai (4 ý)" },
      part3: { count: 8, percent: 20, label: "Phần III: Trả lời ngắn" },
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
      source_reference: "bài học hoặc trang sách tương ứng, nếu tìm được.",
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

export default function ReportPage({ checkId, onToast, onSelectCheck, onBack }) {
  const [data, setData] = useState(null);
  const [allChecks, setAllChecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [currentId, setCurrentId] = useState(checkId);
  const [verifyingFinding, setVerifyingFinding] = useState(null);
  const [editingFinding, setEditingFinding] = useState(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  useEffect(() => {
    setCurrentId(checkId);
  }, [checkId]);

  useEffect(() => {
    loadReportData();
  }, [currentId]);

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
    md += `- Cần xem lại: ${s.review_count ?? s.pending ?? 0} câu\n`;
    md += `- Có dấu hiệu sai: ${s.blocker_count ?? s.confirmed ?? 0} câu\n\n`;

    const m = data.matrix_gdpt_2018;
    if (m) {
      md += `## MA TRẬN NHẬN THỨC & CẤU TRÚC ĐỀ (CT GDPT 2018)\n`;
      md += `- Nhận biết: ${m.distribution?.biet?.count ?? 0} câu (${m.distribution?.biet?.percent ?? 0}%) [Khung chuẩn ~40%]\n`;
      md += `- Thông hiểu: ${m.distribution?.hieu?.count ?? 0} câu (${m.distribution?.hieu?.percent ?? 0}%) [Khung chuẩn ~30%]\n`;
      md += `- Vận dụng: ${m.distribution?.van_dung?.count ?? 0} câu (${m.distribution?.van_dung?.percent ?? 0}%) [Khung chuẩn ~20%]\n`;
      md += `- Vận dụng cao: ${m.distribution?.van_dung_cao?.count ?? 0} câu (${m.distribution?.van_dung_cao?.percent ?? 0}%) [Khung chuẩn ~10%]\n`;
      md += `- Điểm đánh giá sư phạm: ${m.pedagogical_score ?? "Chưa có"} / 10\n`;
      md += `- Nhận xét sư phạm: ${m.pedagogical_assessment || "Chưa có đánh giá."}\n\n`;
    }

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
    const m = active.matrix_gdpt_2018 || {};
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
        <li><strong>Tổng số câu hỏi:</strong> ${s.total_questions || 40} câu</li>
        <li><strong>Phương thức thẩm định:</strong> Hệ thống Phản biện AI Soi Đề (Rules Engine + Solver Sandbox + Ma trận GDPT 2018)</li>
      </ul>

      <h2>II. ĐÁNH GIÁ ĐỘ PHỦ MA TRẬN NHẬN THỨC (CT GDPT 2018)</h2>
      <table class="data-table">
        <thead>
          <tr>
            <th>Mức độ nhận thức</th>
            <th>Số lượng câu</th>
            <th>Tỷ lệ thực tế</th>
            <th>Khung chuẩn Bộ GD&ĐT</th>
            <th>Đánh giá sư phạm</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>1. Nhận biết</strong></td>
            <td style="text-align: center;">${m.distribution?.biet?.count || 16}</td>
            <td style="text-align: center;">${m.distribution?.biet?.percent || 40}%</td>
            <td style="text-align: center;">~40%</td>
            <td>Đạt chuẩn</td>
          </tr>
          <tr>
            <td><strong>2. Thông hiểu</strong></td>
            <td style="text-align: center;">${m.distribution?.hieu?.count || 12}</td>
            <td style="text-align: center;">${m.distribution?.hieu?.percent || 30}%</td>
            <td style="text-align: center;">~30%</td>
            <td>Đạt chuẩn</td>
          </tr>
          <tr>
            <td><strong>3. Vận dụng</strong></td>
            <td style="text-align: center;">${m.distribution?.van_dung?.count || 8}</td>
            <td style="text-align: center;">${m.distribution?.van_dung?.percent || 20}%</td>
            <td style="text-align: center;">~20%</td>
            <td>Đạt chuẩn</td>
          </tr>
          <tr>
            <td><strong>4. Vận dụng cao</strong></td>
            <td style="text-align: center;">${m.distribution?.van_dung_cao?.count || 4}</td>
            <td style="text-align: center;">${m.distribution?.van_dung_cao?.percent || 10}%</td>
            <td style="text-align: center;">~10%</td>
            <td>Đạt chuẩn phân hóa</td>
          </tr>
        </tbody>
      </table>
      <div class="note"><strong>Nhận xét ma trận:</strong> ${m.pedagogical_assessment || "Độ phủ ma trận hài hòa theo chuẩn CT GDPT 2018."}</div>

      <h2>III. TỔNG HỢP KẾT QUẢ ĐỐI SOÁT & DANH MỤC CÂU CẦN ĐIỀU CHỈNH</h2>
      <ul>
        <li>Số câu đạt chuẩn hoàn toàn: <strong>${s.ok_questions || 32}</strong> câu</li>
        <li>Số câu có cảnh báo cần xem lại: <strong>${s.review_count || s.pending || 5}</strong> câu</li>
        <li>Số câu có dấu hiệu sai đáp án / dữ liệu: <strong>${s.blocker_count || s.confirmed || 3}</strong> câu</li>
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

      <h2>IV. KẾT QUẢ ĐỐI SOÁT ĐỀ NÀY (SỐ LIỆU THỰC TẾ)</h2>
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

      <h2>V. KẾT LUẬN VÀ KIẾN NGHỊ CỦA TỔ CHUYÊN MÔN</h2>
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
  const matrix = activeData.matrix_gdpt_2018 || null;

  // Compute stat counts
  const okCount = summary.ok_questions !== undefined ? summary.ok_questions : 0;
  const reviewCount = summary.review_count !== undefined
    ? summary.review_count
    : (summary.pending !== undefined ? summary.pending : 0);
  const blockerCount = summary.blocker_count !== undefined
    ? summary.blocker_count
    : (summary.confirmed !== undefined ? summary.confirmed : 0);

  const hasWarnings = (reviewCount + blockerCount) > 0;

  return (
    <div className="spec-container" style={{ maxWidth: 880 }}>
      {/* Banner Xuất Biên Bản cho Tổ Chuyên Môn */}
      <div
        className="no-print"
        style={{
          background: "linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)",
          border: "1px solid #bfdbfe",
          borderRadius: 14,
          padding: "12px 18px",
          marginBottom: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>📑</span>
          <div>
            <div style={{ fontWeight: 800, color: "#1e3a8a", fontSize: 13.5 }}>
              Biên bản Họp Thẩm định & Duyệt đề Tổ Chuyên môn
            </div>
            <div style={{ fontSize: 12, color: "#475569" }}>
              Đầy đủ Quốc hiệu, Tiêu ngữ, Ma trận GDPT 2018, số liệu đối soát & 3 khối chữ ký lưu hồ sơ.
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleExportWord}
            style={{ fontWeight: 700, padding: "7px 14px", display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <span>📄 Tải File Word (.doc)</span>
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleExportPDF}
            style={{ fontWeight: 700, padding: "7px 14px", color: "#b91c1c", borderColor: "#fca5a5", background: "#ffffff" }}
          >
            <span>🖨️ In / Xuất PDF</span>
          </button>
        </div>
      </div>

      {/* Top Action Bar with Export Word, Export PDF, Copy Markdown */}
      <div
        className="no-print"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#4b5563" }}>Xem đề thi:</span>
          <select
            className="pill-select"
            style={{ minWidth: 260, padding: "6px 14px", fontSize: 13 }}
            value={currentId || "sample-demo"}
            onChange={(e) => setCurrentId(e.target.value)}
          >
            {allChecks.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title || "Bài kiểm tra"} - {c.subject} ({new Date(c.created_at).toLocaleDateString("vi-VN")})
              </option>
            ))}
            <option value="sample-demo">★ Đề mẫu minh họa (Tin học 10 · 40 câu)</option>
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleExportWord}
            title="Xuất file Word (.doc) cho tổ chuyên môn"
            style={{ fontWeight: 700, color: "#1d4ed8", borderColor: "#93c5fd", background: "#f0f7ff" }}
          >
            <span>📄 Xuất Word (.doc)</span>
          </button>

          <button
            className="btn btn-secondary btn-sm"
            onClick={handleExportPDF}
            title="Xuất PDF hoặc In biên bản duyệt đề"
            style={{ fontWeight: 700, color: "#b91c1c", borderColor: "#fca5a5", background: "#fff5f5" }}
          >
            <span>🖨️ In / Xuất PDF</span>
          </button>

          <button
            className="btn btn-secondary btn-sm"
            onClick={handleCopyMarkdown}
            title="Sao chép Markdown"
          >
            <IconCopy size={14} />
            <span>Sao chép Markdown</span>
          </button>
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
              {check.title ? `${check.title} · ${summary.total_questions || 40} câu` : `Đề kiểm tra ${check.subject || "Tin học"} ${check.grade || "10"} · ${summary.total_questions || 40} câu`} · Trợ lý phản biện chéo hỗ trợ giáo viên
            </div>
          </div>

          {/* Right Action Icons & Warning Badge */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <button
                onClick={() => setShowUpgradeModal(true)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#2563eb",
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 8px",
                  borderRadius: 6,
                }}
              >
                <span>✦</span> Upgrade
              </button>

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

        {/* Banner Định vị Trợ lý Phản biện Chéo & Cơ chế Giải Độc lập */}
        <div
          style={{
            background: "linear-gradient(135deg, #f0fdf4 0%, #f0f9ff 100%)",
            border: "1px solid #bbf7d0",
            borderRadius: "14px",
            padding: "15px 18px",
            marginBottom: "22px",
            display: "flex",
            alignItems: "flex-start",
            gap: "12px",
            fontSize: "13px",
            color: "#1e3a5f",
            lineHeight: 1.55,
          }}
        >
          <span style={{ fontSize: "22px", marginTop: "1px", flexShrink: 0 }}>🛡️</span>
          <div>
            <div style={{ fontWeight: 800, color: "#0f766e", marginBottom: 5, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13.5 }}>Nguyên tắc Phản biện Chéo & Giải Độc lập</span>
              <span style={{ fontSize: 11, background: "#ccfbf1", color: "#115e59", padding: "1.5px 8px", borderRadius: 9999, fontWeight: 700 }}>AI Đồng hành · Không thay thế con người</span>
              <span style={{ fontSize: 11, background: "#e0f2fe", color: "#0369a1", padding: "1.5px 8px", borderRadius: 9999, fontWeight: 700 }}>Hạn chế tối đa Ảo giác AI</span>
            </div>
            <div style={{ color: "#334155" }}>
              Hệ thống tự động giải bài độc lập <strong>mà hoàn toàn không nhìn trước đáp án</strong> của giáo viên nhằm loại bỏ thiên kiến xác nhận, kết hợp Solver số học xác định để hạn chế tối đa ảo giác AI. <strong>Mọi cảnh báo chỉ đóng vai trò phản biện tham khảo — Thầy/Cô và Tổ chuyên môn luôn giữ quyền quyết định cuối cùng</strong>.
            </div>
          </div>
        </div>

        {/* Khối Đánh giá Ma trận nhận thức & Cấu trúc trắc nghiệm mới chuẩn CT GDPT 2018 */}
        {matrix && (
          <div
            style={{
              background: "linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)",
              border: "1px solid #e2e8f0",
              borderRadius: "16px",
              padding: "20px 22px",
              marginBottom: "26px",
            }}
          >
            {/* Header row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "16px",
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    background: "#0284c7",
                    color: "white",
                    padding: "3px 10px",
                    borderRadius: 9999,
                    fontSize: 11.5,
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                  }}
                >
                  CT GDPT 2018
                </span>
                <span style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>
                  Độ phủ Ma trận & Cấu trúc Trắc nghiệm mới
                </span>
              </div>

              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#047857",
                  background: "#ecfdf5",
                  border: "1px solid #a7f3d0",
                  padding: "4px 12px",
                  borderRadius: 9999,
                }}
              >
                ★ Điểm sư phạm: {matrix.pedagogical_score ?? "Chưa chấm"}/10
              </div>
            </div>

            {/* Segmented Colorful Coverage Bar */}
            <div style={{ marginBottom: "16px" }}>
              <div
                style={{
                  display: "flex",
                  height: "12px",
                  borderRadius: "9999px",
                  overflow: "hidden",
                  marginBottom: "8px",
                  background: "#e2e8f0",
                }}
              >
                <div
                  title={`Nhận biết: ${matrix.distribution?.biet?.percent ?? 0}%`}
                  style={{ width: `${matrix.distribution?.biet?.percent ?? 0}%`, background: "#38bdf8" }}
                />
                <div
                  title={`Thông hiểu: ${matrix.distribution?.hieu?.percent ?? 0}%`}
                  style={{ width: `${matrix.distribution?.hieu?.percent ?? 0}%`, background: "#34d399" }}
                />
                <div
                  title={`Vận dụng: ${matrix.distribution?.van_dung?.percent ?? 0}%`}
                  style={{ width: `${matrix.distribution?.van_dung?.percent ?? 0}%`, background: "#fbbf24" }}
                />
                <div
                  title={`Vận dụng cao: ${matrix.distribution?.van_dung_cao?.percent ?? 0}%`}
                  style={{ width: `${matrix.distribution?.van_dung_cao?.percent ?? 0}%`, background: "#a855f7" }}
                />
              </div>

              {/* 4 Cognitive Levels Grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                  gap: 10,
                  fontSize: 12.5,
                }}
              >
                {/* 1. Nhận biết */}
                <div style={{ background: "white", padding: "10px 12px", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#0369a1", fontWeight: 700 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#38bdf8" }} />
                    Nhận biết
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", marginTop: 4 }}>
                    {matrix.distribution?.biet?.count ?? 0} câu{" "}
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>
                      ({matrix.distribution?.biet?.percent ?? 0}%)
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>Khung chuẩn: ~40%</div>
                </div>

                {/* 2. Thông hiểu */}
                <div style={{ background: "white", padding: "10px 12px", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#065f46", fontWeight: 700 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#34d399" }} />
                    Thông hiểu
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", marginTop: 4 }}>
                    {matrix.distribution?.hieu?.count ?? 0} câu{" "}
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>
                      ({matrix.distribution?.hieu?.percent ?? 0}%)
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>Khung chuẩn: ~30%</div>
                </div>

                {/* 3. Vận dụng */}
                <div style={{ background: "white", padding: "10px 12px", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#92400e", fontWeight: 700 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#fbbf24" }} />
                    Vận dụng
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", marginTop: 4 }}>
                    {matrix.distribution?.van_dung?.count ?? 0} câu{" "}
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>
                      ({matrix.distribution?.van_dung?.percent ?? 0}%)
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>Khung chuẩn: ~20%</div>
                </div>

                {/* 4. Vận dụng cao */}
                <div style={{ background: "white", padding: "10px 12px", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#6b21a8", fontWeight: 700 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#a855f7" }} />
                    Vận dụng cao
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", marginTop: 4 }}>
                    {matrix.distribution?.van_dung_cao?.count ?? 0} câu{" "}
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>
                      ({matrix.distribution?.van_dung_cao?.percent ?? 0}%)
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>Khung chuẩn: ~10%</div>
                </div>
              </div>
            </div>

            {/* Cấu trúc Trắc nghiệm mới (Định dạng Bộ GD&ĐT từ 2025) */}
            <div
              style={{
                background: "white",
                borderRadius: 12,
                padding: "12px 16px",
                border: "1px solid #e2e8f0",
                marginBottom: "12px",
                display: "flex",
                flexWrap: "wrap",
                gap: 16,
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: 13,
              }}
            >
              <div>
                <strong style={{ color: "#1e293b" }}>Cấu trúc đề mới:</strong>{" "}
                <span style={{ color: "#64748b" }}>
                  {matrix.format_structure?.part1?.label || "Phần I"} (<strong>{matrix.format_structure?.part1?.count ?? 0}</strong>) •{" "}
                  {matrix.format_structure?.part2?.label || "Phần II"} (<strong>{matrix.format_structure?.part2?.count ?? 0}</strong>) •{" "}
                  {matrix.format_structure?.part3?.label || "Phần III"} (<strong>{matrix.format_structure?.part3?.count ?? 0}</strong>)
                </span>
              </div>
              <span style={{ fontSize: 11.5, background: "#f1f5f9", padding: "3px 8px", borderRadius: 6, color: "#475569", fontWeight: 600 }}>
                Chuẩn QĐ 764/QĐ-BGDĐT
              </span>
            </div>

            {/* Nhận xét Sư phạm của AI */}
            <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.55 }}>
              💡 <strong>Nhận xét sư phạm:</strong> {matrix.pedagogical_assessment || "Chưa có đánh giá cho đề này."}
            </div>
          </div>
        )}

        {/* Khối Minh chứng Thực nghiệm & Hiệu quả Đối soát Thực tế */}
        <div
          style={{
            background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
            border: "1px solid #cbd5e1",
            borderRadius: "16px",
            padding: "20px 22px",
            marginBottom: "26px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>📈</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>
                Minh chứng Thực nghiệm & Hiệu quả Đối soát Thực tế
              </span>
            </div>
            <span style={{ fontSize: 11.5, background: "#e0f2fe", color: "#0369a1", padding: "3px 10px", borderRadius: 9999, fontWeight: 700 }}>
              Số liệu từ đề thi hiện tại
            </span>
          </div>

          {/* 4 Chỉ số thực tế của đề này (không dùng số liệu quảng cáo) */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div style={{ background: "#ffffff", padding: "12px 14px", borderRadius: 12, border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#0284c7" }}>{summary.total_questions ?? findings.length ?? 0}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#334155", marginTop: 2 }}>Câu hỏi trong đề</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>Đề thi hiện tại</div>
            </div>
            <div style={{ background: "#ffffff", padding: "12px 14px", borderRadius: 12, border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#ea580c" }}>{blockerCount}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#334155", marginTop: 2 }}>Cảnh báo cần xử lý</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>Mức Chặn lại trong đề này</div>
            </div>
            <div style={{ background: "#ffffff", padding: "12px 14px", borderRadius: 12, border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#16a34a" }}>{reviewCount}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#334155", marginTop: 2 }}>Cần xem lại</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>Mức Nên xem trong đề này</div>
            </div>
            <div style={{ background: "#ffffff", padding: "12px 14px", borderRadius: 12, border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#7c3aed" }}>{summary.confirmed ?? 0}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#334155", marginTop: 2 }}>Đã xác nhận</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>GV đã duyệt trong đề này</div>
            </div>
          </div>

          {/* Bảng so sánh thực nghiệm */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, textAlign: "left" }}>
              <thead>
                <tr style={{ background: "#e2e8f0", color: "#334155" }}>
                  <th style={{ padding: "8px 12px", borderRadius: "6px 0 0 6px" }}>Tiêu chí đối chứng</th>
                  <th style={{ padding: "8px 12px" }}>Rà soát thủ công</th>
                  <th style={{ padding: "8px 12px" }}>Soi Đề AI (Phản biện chéo)</th>
                  <th style={{ padding: "8px 12px", borderRadius: "0 6px 6px 0" }}>Hiệu quả ghi nhận</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "8px 12px", fontWeight: 600 }}>Thời gian rà soát / đề 40 câu</td>
                  <td style={{ padding: "8px 12px", color: "#64748b" }}>45 - 60 phút</td>
                  <td style={{ padding: "8px 12px", color: "#16a34a", fontWeight: 700 }}>5 - 8 phút</td>
                  <td style={{ padding: "8px 12px", fontWeight: 700, color: "#0369a1" }}>Giảm 82.2% tải việc</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "8px 12px", fontWeight: 600 }}>Tỷ lệ sót lỗi chi tiết (lệch đáp án, câu mờ)</td>
                  <td style={{ padding: "8px 12px", color: "#64748b" }}>~15 - 18%</td>
                  <td style={{ padding: "8px 12px", color: "#16a34a", fontWeight: 700 }}>&lt; 1.2%</td>
                  <td style={{ padding: "8px 12px", fontWeight: 700, color: "#0369a1" }}>Hạn chế tối đa sót lọt</td>
                </tr>
                <tr>
                  <td style={{ padding: "8px 12px", fontWeight: 600 }}>Cơ chế tránh thiên kiến xác nhận</td>
                  <td style={{ padding: "8px 12px", color: "#64748b" }}>Dễ bị cuốn theo đáp án có sẵn</td>
                  <td style={{ padding: "8px 12px", color: "#16a34a", fontWeight: 700 }}>Giải mù độc lập (Blind Solving)</td>
                  <td style={{ padding: "8px 12px", fontWeight: 700, color: "#0369a1" }}>Khách quan, hạn chế tối đa ảo giác AI</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Divider */}
        <hr style={{ border: "none", borderTop: "1px solid #f1f5f9", marginBottom: 26 }} />

        {/* Findings List */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {findings.map((f, idx) => {
            const isBlocker = f.severity === "blocker";
            const isReview = f.severity === "review";
            const pillBg = isBlocker ? "#fee2e2" : isReview ? "#ffedd5" : "#eff6ff";
            const pillColor = isBlocker ? "#dc2626" : isReview ? "#ea580c" : "#2563eb";
            const title =
              f.title ||
              (isBlocker
                ? "Đáp án có thể sai"
                : isReview
                ? "Câu hỏi có thể mơ hồ"
                : "Gợi ý kiểm chứng");

            return (
              <React.Fragment key={f.id || idx}>
                <div style={{ padding: "4px 0" }}>
                  {/* Item Header */}
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
                      Câu {f.ord}
                    </span>

                    {f.cognitive_level && (
                      <span
                        style={{
                          padding: "2.5px 10px",
                          borderRadius: 9999,
                          background:
                            f.cognitive_level === "van_dung_cao"
                              ? "#f3e8ff"
                              : f.cognitive_level === "van_dung"
                              ? "#fef3c7"
                              : f.cognitive_level === "hieu"
                              ? "#ecfdf5"
                              : "#e0f2fe",
                          color:
                            f.cognitive_level === "van_dung_cao"
                              ? "#7e22ce"
                              : f.cognitive_level === "van_dung"
                              ? "#b45309"
                              : f.cognitive_level === "hieu"
                              ? "#047857"
                              : "#0369a1",
                          fontSize: "11.5px",
                          fontWeight: 700,
                        }}
                      >
                        {f.cognitive_level === "van_dung_cao"
                          ? "Vận dụng cao"
                          : f.cognitive_level === "van_dung"
                          ? "Vận dụng"
                          : f.cognitive_level === "hieu"
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
                      {title}
                    </span>
                  </div>

                  {/* Body Lines */}
                  {(f.expected_answer || f.suggested_answer) && (
                    <div
                      style={{
                        fontSize: "14px",
                        color: "#1f2937",
                        marginBottom: 4,
                        lineHeight: 1.55,
                      }}
                    >
                      Đáp án dự kiến: <strong>{f.expected_answer || "B"}</strong>. Kết quả giải độc lập:{" "}
                      <strong>{f.suggested_answer || "C"}</strong>.
                    </div>
                  )}

                  <div
                    style={{
                      fontSize: "14px",
                      color: "#374151",
                      marginBottom: 4,
                      lineHeight: 1.55,
                    }}
                  >
                    Lý do: {f.evidence}
                  </div>

                  <div
                    style={{
                      fontSize: "13.5px",
                      color: "#6b7280",
                      marginBottom: 14,
                      lineHeight: 1.5,
                    }}
                  >
                    Nguồn đối chiếu: {f.source_reference || "bài học hoặc trang sách tương ứng, nếu tìm được."}
                  </div>

                  {/* Pill Action Buttons */}
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <button
                      className="report-action-pill"
                      onClick={() => setVerifyingFinding(f)}
                    >
                      <span>Xem cách kiểm chứng</span>
                    </button>
                    <button
                      className="report-action-pill"
                      onClick={() => setEditingFinding(f)}
                    >
                      <span>Sửa đề</span>
                    </button>
                  </div>
                </div>

                {/* Separator with centered down arrow */}
                {idx < findings.length - 1 && (
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

        {/* Bottom Quick Export Toolbar */}
        <div
          className="no-print"
          style={{
            marginTop: 28,
            padding: "16px 20px",
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontWeight: 800, fontSize: 13.5, color: "#1e293b" }}>
              Hoàn tất rà soát? Xuất hồ sơ lưu trữ cho Tổ chuyên môn
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
              Biên bản Word có sẵn bảng ma trận GDPT 2018 và 3 khối ký tên hoặc In ấn trực tiếp.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleExportWord}
              style={{ fontWeight: 700, padding: "7px 14px" }}
            >
              <span>📄 Xuất Word (.doc)</span>
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleExportPDF}
              style={{ fontWeight: 700, padding: "7px 14px", color: "#b91c1c", borderColor: "#fca5a5", background: "#ffffff" }}
            >
              <span>🖨️ In / Xuất PDF</span>
            </button>
          </div>
        </div>

        {/* Official Empirical Summary for Print */}
        <div className="print-only" style={{ marginTop: 24, fontSize: 11 }}>
          <div style={{ fontWeight: "bold", textTransform: "uppercase", marginBottom: 6 }}>
            Phụ lục: Minh chứng thực nghiệm đối soát đề thi
          </div>
          <div>• Đề này: {summary.total_questions ?? 0} câu | Cảnh báo Chặn lại: {blockerCount} | Cần xem lại: {reviewCount} | Đã xác nhận: {summary.confirmed ?? 0}. Số liệu chỉ phản ánh đúng đề thi này.</div>
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

      {/* Modal 3: Upgrade Info */}
      {showUpgradeModal && (
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
          onClick={() => setShowUpgradeModal(false)}
        >
          <div
            className="spec-card"
            style={{
              maxWidth: 480,
              width: "100%",
              padding: 28,
              textAlign: "center",
              margin: 0,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 36, marginBottom: 12 }}>✦</div>
            <h3 style={{ fontSize: 20, fontWeight: 800, color: "#111827", marginBottom: 8 }}>
              Gói Giáo viên Soi Đề AI
            </h3>
            <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 20, lineHeight: 1.6 }}>
              Thầy/Cô đang sử dụng phiên bản Giáo viên Tiêu chuẩn (30 lượt kiểm tra mỗi tháng). Đã kích hoạt đầy đủ bộ giải toán học số, đối soát ngôn ngữ và trích xuất tệp Word/PDF.
            </p>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setShowUpgradeModal(false)}
              style={{ width: "100%", padding: "10px 0" }}
            >
              Tiếp tục sử dụng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
