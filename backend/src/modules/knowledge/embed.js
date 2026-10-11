// Embedding đa engine, chọn bằng EMBED_PROVIDER. Mặc định "hash": offline,
// 0đ, đủ cho pilot; "gemini": ngữ nghĩa thật, tốn phí; "mock": test.
// Không lộ key ra frontend — mọi gọi ở server.
import { aiError, withTimeout } from "../aiReview/provider.js";

export const EMBED_DIM = 512;

export function embedConfig() {
  return {
    provider: process.env.EMBED_PROVIDER || "hash",
    model: process.env.EMBED_MODEL || "text-embedding-004",
    apiKey: process.env.EMBED_API_KEY || process.env.LLM_API_KEY || "",
    baseUrl: process.env.LLM_BASE_URL || "https://generativelanguage.googleapis.com",
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS || 20000),
    maxChunks: Number(process.env.EMBED_MAX_CHUNKS || 400),
    maxChars: Number(process.env.EMBED_MAX_CHARS || 200000),
    pricePer1kChars: Number(process.env.EMBED_PRICE_PER_1K_CHARS || 0), // USD/1k ký tự
  };
}

// Hash embedding: char 3-gram -> dim buckets, L2-norm. Deterministic, offline.
// Giới hạn đã biết: chỉ khớp từ vựng/từ láy, khái niệm diễn đạt khác dễ trượt.
export function hashEmbed(text = "", dim = EMBED_DIM) {
  const v = new Float32Array(dim);
  const s = String(text ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!s) return Array.from(v);
  const grams = new Set();
  for (let i = 0; i < s.length; i++) {
    for (const n of [2, 3, 4]) {
      if (i + n <= s.length) grams.add(s.slice(i, i + n));
    }
  }
  for (const g of grams) {
    let h = 2166136261;
    for (let i = 0; i < g.length; i++) { h ^= g.codePointAt(i); h = Math.imul(h, 16777619); }
    v[(h >>> 0) % dim] += 1;
  }
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm) || 1;
  return Array.from(v, (x) => x / norm);
}

export function cosine(a = [], b = []) {
  const n = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function geminiEmbed(texts, cfg) {
  if (!cfg.apiKey) throw aiError("NO_KEY", "Chưa cấu hình EMBED_API_KEY (hoặc LLM_API_KEY).", 400, false);
  const out = [];
  let chars = 0;
  for (const t of texts) {
    const { signal, done } = withTimeout(cfg.timeoutMs);
    try {
      const url = `${cfg.baseUrl.replace(/\/$/, "")}/v1beta/models/${encodeURIComponent(cfg.model)}:embedContent?key=${encodeURIComponent(cfg.apiKey)}`;
      const res = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" }, signal,
        body: JSON.stringify({ content: { parts: [{ text: String(t).slice(0, 8000) }] } }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) throw aiError("RATE_LIMITED", "Embedding giới hạn tốc độ.", 429, true);
      if (!res.ok) throw aiError("LLM_API_ERROR", `Embedding lỗi HTTP ${res.status}.`, 502, res.status >= 500);
      const values = data?.embedding?.values;
      if (!Array.isArray(values) || !values.length) throw aiError("LLM_BAD_JSON", "Embedding trả về rỗng.", 502, true);
      // chuẩn hóa về EMBED_DIM (cắt/pad) để cùng schema lưu trữ
      const v = values.slice(0, EMBED_DIM);
      while (v.length < EMBED_DIM) v.push(0);
      let norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
      out.push(v.map((x) => x / norm));
      chars += String(t).length;
    } catch (e) {
      if (e?.name === "AbortError") throw aiError("TIMEOUT", "Embedding quá thời gian.", 504, true);
      throw e;
    } finally {
      done();
    }
  }
  return { vectors: out, chars };
}

// texts[] -> { vectors[][], costUSD, chars }. Mock: vector giả ổn định theo text.
export async function embedTexts(texts = [], cfg = embedConfig()) {
  if (cfg.provider === "mock") {
    return {
      vectors: texts.map((t) => hashEmbed("mock:" + t).map((x) => -x)),
      costUSD: 0, chars: texts.join("").length, engine: "mock",
    };
  }
  if (cfg.provider === "hash") {
    const chars = texts.join("").length;
    return { vectors: texts.map((t) => hashEmbed(t)), costUSD: 0, chars, engine: "hash" };
  }
  if (cfg.provider === "gemini") {
    const r = await geminiEmbed(texts, cfg);
    return { ...r, costUSD: (r.chars / 1000) * cfg.pricePer1kChars, engine: `gemini/${cfg.model}` };
  }
  throw aiError("BAD_CONFIG", `EMBED_PROVIDER "${cfg.provider}" không hỗ trợ (hash|gemini|mock).`, 400, false);
}
