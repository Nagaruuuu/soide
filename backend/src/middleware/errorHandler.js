// eslint-disable-next-line no-unused-vars
export function errorHandler(e, _req, res, _next) {
  res.status(e.status || 500).json({ error_code: e.code || "INTERNAL", message_vi: e.message || "Lỗi hệ thống.", retryable: !!e.retryable });
}
