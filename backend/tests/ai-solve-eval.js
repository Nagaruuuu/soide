// Bộ đánh giá Independent Solver bằng Mock (0 phí): đúng / báo sai / bỏ sót + thời gian + chi phí.
// Chạy: node tests/ai-solve-eval.js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMockProvider } from "../src/modules/aiReview/provider.js";
import { solveQuestions } from "../src/modules/independentSolver/solver.js";
import { compareSolution } from "../src/modules/independentSolver/compare.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
// verdict kỳ vọng theo từng fixture: solver mù đúng -> so với đáp án GV
const cases = [
  { file: "aisolve-single.json", want: "match" },
  { file: "aisolve-essay.json", want: "match" },
  { file: "aisolve-insufficient.json", want: "needs_review" },
  { file: "aisolve-ambiguous.json", want: "needs_review" },
  { file: "aisolve-arithmetic.json", want: "match" },
  { file: "aisolve-wrong-expected.json", want: "mismatch" },
];
let ok = 0, bad = 0, totalMs = 0, totalCost = 0;
for (const c of cases) {
  const fix = JSON.parse(fs.readFileSync(path.join(dir, "fixtures", c.file), "utf8"));
  const provider = createMockProvider(fix.mock);
  const t0 = Date.now();
  const out = await solveQuestions({ questions: [fix.question], provider });
  const ms = Date.now() - t0;
  totalMs += ms;
  totalCost += out.usage.costUSD || 0;
  const verdict = out.solutions.length ? compareSolution(out.solutions[0], fix.question.expected_answer).verdict : "needs_review/error";
  const pass = verdict === c.want;
  if (pass) ok++; else bad++;
  console.log(JSON.stringify({ case: fix.label, want: c.want, got: verdict, ms, costUSD: out.usage.costUSD || 0, pass }));
}
console.log(JSON.stringify({ summary: { ok, bad, totalMs, totalCostUSD: totalCost, note: "Mock — đo plumbing/tốc độ, KHÔNG đo chất lượng model thật" } }));
