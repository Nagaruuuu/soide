// eslint-disable-next-line no-unused-vars
export function errorHandler(e, _req, res, _next) {
  const status = e.status || 500;
  const body = {
    error_code: e.code || "INTERNAL",
    message_vi: e.message || "Lỗi hệ thống.",
    retryable: !!e.retryable,
  };
  // T18: lỗi paywall mang upgrade_hint để FE hiện upsell mà không parse message.
  if (e.upgrade_hint) body.upgrade_hint = e.upgrade_hint;
  // Lỗi quota cũng trả quota để FE chặn sớm và đổi sang màn nâng cấp.
  if (e.quota_left !== undefined) body.quota_left = e.quota_left;
  res.status(status).json(body);
}
