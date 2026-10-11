export async function api(path, opts = {}) {
  const r = await fetch(path, { headers: { "Content-Type": "application/json" }, ...opts });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(data.message_vi || "Lỗi hệ thống.");
    e.code = data.error_code; e.retryable = data.retryable;
    throw e;
  }
  return data;
}

export const listChecks = () => api("/api/checks");
export const getMe = () => api("/api/me");
export const previewExam = (exam_text) => api("/api/checks/preview", { method: "POST", body: JSON.stringify({ exam_text }) });
export const createCheck = (payload) => api("/api/checks", { method: "POST", body: JSON.stringify(payload) });
export const runCheck = (id, body = {}) => api(`/api/checks/${id}/run`, { method: "POST", body: JSON.stringify(body) });
export const getResults = (id) => api(`/api/checks/${id}/results`);
export const reviewFinding = (qid, finding_id, action) => api(`/api/results/${qid}`, { method: "PATCH", body: JSON.stringify({ finding_id, action }) });
export const getReport = (id) => api(`/api/checks/${id}/report`);
export const deleteCheck = (id) => api(`/api/checks/${id}`, { method: "DELETE" });

// Upload file đề (.docx/.pdf/.txt) -> trích xuất text thuần code ở server (không AI).
// Dùng FormData nên không set Content-Type thủ công (browser tự gắn boundary).
export async function extractFile(file) {
  const form = new FormData();
  form.append("file", file);
  const r = await fetch("/api/files/extract", { method: "POST", body: form });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(data.message_vi || "Không đọc được file.");
    e.code = data.error_code; e.retryable = data.retryable;
    throw e;
  }
  return data; // { text, fileType, pageCount?, warnings[], metadata{} }
}

export function guessGroup(subject = "") {
  const s = String(subject).toLowerCase();
  if (/toán|toan|lý|vật lý|hóa/.test(s)) return "T";
  if (/anh|english|tin/.test(s)) return "N";
  return "H";
}
