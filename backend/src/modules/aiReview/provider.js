// AIProvider interface: đổi model/hãng bằng cấu hình, không sửa logic nghiệp vụ.
// - completeJSON({system, user, maxTokens, signal}) -> { text, inputTokens, outputTokens }
// - MockAdapter: kịch bản có sẵn cho test/eval, 0 phí. GeminiAdapter: gọi thật.
// - Key chỉ ở server, không log nội dung đề. Retry tối đa 1 lần do caller quyết.

export function aiConfig() {
  return {
    provider: process.env.LLM_PROVIDER || "gemini",
    model: process.env.LLM_MODEL || "gemini-2.0-flash",
    apiKey: process.env.LLM_API_KEY || "",
    baseUrl: process.env.LLM_BASE_URL || "https://generativelanguage.googleapis.com",
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS || 20000),
    maxInputTokens: Number(process.env.LLM_MAX_INPUT_TOKENS || 2000),
    maxOutputTokens: Number(process.env.LLM_MAX_OUTPUT_TOKENS || 800),
    maxQuestions: Number(process.env.LLM_MAX_QUESTIONS || 10),
    priceIn: Number(process.env.LLM_PRICE_IN || 0), // USD / 1M input tokens
    priceOut: Number(process.env.LLM_PRICE_OUT || 0), // USD / 1M output tokens
  };
}

export function aiError(code, message_vi, status = 500, retryable = false) {
  const e = new Error(message_vi);
  e.code = code; e.status = status; e.retryable = retryable;
  return e;
}

// Ước lượng token khi hãng không trả usage (rất thô: ~4 ký tự/token).
export function estimateTokens(s = "") {
  return Math.max(1, Math.ceil(String(s ?? "").length / 4));
}

export function withTimeout(ms) {
  const c = new AbortController();
  const timer = setTimeout(() => c.abort(), ms);
  return { signal: c.signal, done: () => clearTimeout(timer) };
}

// MockAdapter: responses có thể là:
// - function(ctx) => JSON-string | object | Error (kịch bản theo prompt), hoặc
// - object { __default, ...keyed } (chọn theo responses[key]), hoặc
// - object/array response duy nhất (dùng cho mọi lượt gọi).
// Dùng cho unit/integration/eval — không mạng, không phí.
export function createMockProvider(responses = {}) {
  const calls = [];
  const pick = (ctx) => {
    if (typeof responses === "function") return responses(ctx);
    if (responses && typeof responses === "object" && "__default" in responses) {
      const key = responses.__default ?? "ok-empty";
      return responses[key] ?? "ok-empty";
    }
    return responses;
  };
  return {
    name: "mock",
    calls,
    async completeJSON({ system = "", user = "", maxTokens = 800 } = {}) {
      calls.push({ system: system.length, user: user.length, maxTokens });
      const scripted = pick({ system, user });
      if (scripted instanceof Error) throw scripted;
      const started = Date.now();
      const text = typeof scripted === "string" ? scripted : JSON.stringify(scripted);
      return {
        text,
        inputTokens: estimateTokens(system + user),
        outputTokens: estimateTokens(text),
        latencyMs: Date.now() - started,
      };
    },
  };
}

// GeminiAdapter: gọi thật generativelanguage generateContent (response JSON).
export function createGeminiProvider(cfg = aiConfig()) {
  if (!cfg.apiKey) {
    throw aiError("NO_KEY", "Chưa cấu hình LLM_API_KEY nên không gọi AI thật.", 400, false);
  }
  return {
    name: `gemini/${cfg.model}`,
    async completeJSON({ system = "", user = "", maxTokens = 800, signal } = {}) {
      const url = `${cfg.baseUrl.replace(/\/$/, "")}/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
      const started = Date.now();
      let res;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal,
          body: JSON.stringify({
            system_instruction: { parts: [{ text: system }] },
            contents: [{ parts: [{ text: user }] }],
            generationConfig: { response_mime_type: "application/json", maxOutputTokens: maxTokens, temperature: 0.2 },
          }),
        });
      } catch (e) {
        if (e?.name === "AbortError") throw aiError("TIMEOUT", `AI quá thời gian (${cfg.timeoutMs}ms).`, 504, true);
        throw aiError("LLM_API_ERROR", "Không kết nối được dịch vụ AI.", 502, true);
      }
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) throw aiError("RATE_LIMITED", "Dịch vụ AI giới hạn tốc độ, thử lại sau.", 429, true);
      if (!res.ok) {
        const msg = data?.error?.message || `Dịch vụ AI lỗi HTTP ${res.status}.`;
        throw aiError("LLM_API_ERROR", `AI lỗi: ${String(msg).slice(0, 200)}`, 502, res.status >= 500);
      }
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const text = parts.map((p) => p.text || "").join("");
      const usage = data?.usageMetadata || {};
      return {
        text,
        inputTokens: usage.promptTokenCount ?? estimateTokens(system + user),
        outputTokens: usage.candidatesTokenCount ?? estimateTokens(text),
        latencyMs: Date.now() - started,
      };
    },
  };
}

export function createProvider(cfg = aiConfig()) {
  if (cfg.provider === "mock") return createMockProvider({});
  return createGeminiProvider(cfg);
}
