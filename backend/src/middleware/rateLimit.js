export function rateLimit({ windowMs = 60_000, max = 30 } = {}) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, arr] of hits) {
      const f = arr.filter((t) => now - t < windowMs);
      if (!f.length) hits.delete(k); else hits.set(k, f);
    }
  }, windowMs).unref?.();
  return (req, res, next) => {
    const key = req.header("x-user-id") || req.ip || "local";
    const now = Date.now();
    const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
    arr.push(now); hits.set(key, arr);
    if (arr.length > max) { const e = new Error("Quá nhiều yêu cầu, thử lại sau 1 phút."); e.status = 429; e.code = "RATE_LIMITED"; e.retryable = true; return next(e); }
    next();
  };
}

export function inputLimit(req, _res, next) {
  const t = req.body?.exam_text;
  if (typeof t === "string" && t.length > 20_000) {
    const e = new Error("Nội dung quá dài (tối đa ~20.000 ký tự). Hãy chia nhỏ.");
    e.status = 413; e.code = "INPUT_TOO_LONG"; e.retryable = false;
    return next(e);
  }
  const n = req.body?.questions?.length ?? 0;
  if (n > 50) {
    const e = new Error("Tối đa 50 câu/lần.");
    e.status = 413; e.code = "INPUT_TOO_LONG"; e.retryable = false;
    return next(e);
  }
  next();
}
