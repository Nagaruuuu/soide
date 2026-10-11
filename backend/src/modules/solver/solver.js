// Solver sandbox (T5): chạy tiến trình Python riêng, timeout 5s, cấm mạng.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TIMEOUT_MS = Number(process.env.SOLVER_TIMEOUT_MS || 5000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOLVE_PY = path.join(__dirname, "..", "..", "..", "sandbox", "solve.py");
const PY = process.env.PYTHON_BIN || "python";

function optNumber(opt) {
  if (opt == null) return null;
  const m = String(opt).replace(",", ".").match(/[-+]?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

export async function solveNumeric(question = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    try {
      const payload = JSON.stringify({
        content: question.content || "",
        opt_a: question.opt_a || "", opt_b: question.opt_b || "",
        opt_c: question.opt_c || "", opt_d: question.opt_d || "",
      });
      const child = spawnSync(PY, [SOLVE_PY, payload], { timeout: TIMEOUT_MS, encoding: "utf8", windowsHide: true });
      if (child.error) {
        const e = new Error("Solver quá thời gian (5s).");
        e.code = "SOLVER_TIMEOUT"; e.retryable = true;
        return finish({ error: e, value: null });
      }
      if (child.status !== 0 || !child.stdout) {
        // sandbox thiếu python hoặc lỗi -> coi như không tính được, không chặn
        return finish({ value: null, steps: "solver không khả dụng", method: "computed", unavailable: true });
      }
      const out = JSON.parse(String(child.stdout).trim().split("\n").pop());
      const letterOf = { A: optNumber(question.opt_a), B: optNumber(question.opt_b), C: optNumber(question.opt_c), D: optNumber(question.opt_d) };
      let matchLetter = null;
      if (out && typeof out.value === "number") {
        for (const [L, v] of Object.entries(letterOf)) {
          if (v != null && Math.abs(v - out.value) < 1e-9) { matchLetter = L; break; }
        }
      }
      return finish({ value: out?.value ?? null, steps: out?.steps || "", method: "computed", matchLetter });
    } catch (e) {
      return finish({ value: null, steps: "solver lỗi", method: "computed", unavailable: true });
    }
  });
}
