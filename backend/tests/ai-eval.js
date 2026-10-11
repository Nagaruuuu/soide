// Bộ đánh giá AI Reviewer bằng Mock (0 phí): đúng / báo sai / bỏ sót + thời gian + chi phí.
// Chạy: node tests/ai-eval.js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMockProvider } from "../src/modules/aiReview/provider.js";
import { reviewQuestions } from "../src/modules/aiReview/review.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const files = ["aireview-ok", "aireview-ambiguous", "aireview-missing-data", "aireview-multi-valid", "aireview-wrong-key"];
let tp = 0, fp = 0, fn = 0, totalMs = 0, totalCost = 0;

for (const f of files) {
  const fix = JSON.parse(fs.readFileSync(path.join(dir, "fixtures", `${f}.json`), "utf8"));
  const provider = createMockProvider(fix.mock);
  const t0 = Date.now();
  const out = await reviewQuestions({ questions: [fix.question], validatorIssues: [], provider });
  const ms = Date.now() - t0;
  totalMs += ms;
  totalCost += out.usage.costUSD || 0;
  const got = out.findings.length > 0;
  const row = { case: fix.label, expect: fix.expectFinding, got, ms, costUSD: out.usage.costUSD || 0, type: out.findings[0]?.issueType ?? "-" };
  if (fix.expectFinding && got && out.findings[0].issueType === fix.expectType) { tp++; row.verdict = "ĐÚNG"; }
  else if (!fix.expectFinding && !got) { row.verdict = "ĐÚNG (im lặng)"; }
  else if (!fix.expectFinding && got) { fp++; row.verdict = "BÁO SAI"; }
  else { fn++; row.verdict = "BỎ SÓT"; }
  console.log(JSON.stringify(row));
}
console.log(JSON.stringify({ summary: { tp, fp, fn, totalMs, totalCostUSD: totalCost, note: "Mock — đo plumbing/tốc độ, KHÔNG đo chất lượng model thật" } }));
