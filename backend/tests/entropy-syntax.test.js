import test from "node:test";
import assert from "node:assert";
import { runRules, shannonEntropy } from "../src/modules/rules/rules.js";

test("shannonEntropy: chuỗi lặp có entropy cực thấp, chuỗi đa dạng có entropy cao", () => {
  const lowEnt = shannonEntropy("aaaaaaaaaaaa");
  const variedEnt = shannonEntropy("Thu do cua Viet Nam la Ha Noi phai khong?");
  assert.ok(lowEnt === 0);
  assert.ok(variedEnt > 3.0);
});

test("rules: bắt dấu hỏi ở đầu câu (? abcd test)", () => {
  const q = {
    content: "? abcd test",
    opt_a: "HI",
    opt_b: "HA",
    opt_c: "HO",
    opt_d: "HU",
    expected_answer: "A",
  };
  const f = runRules(q, { group_kind: "H" });
  assert.ok(f.some((x) => x.category === "dau_hoi_sai_vi_tri"));
  assert.ok(f.some((x) => x.category === "tu_khoa_test"));
  assert.ok(f.some((x) => x.category === "phuong_an_dummy"));
});

test("rules: bắt câu có từ để hỏi nhưng thiếu dấu '?' (Mạng máy tính là gì)", () => {
  const q = {
    content: "Mạng máy tính là gì",
    opt_a: "Kết nối các máy tính với nhau",
    opt_b: "Là một phần mềm",
    opt_c: "Là hệ điều hành",
    opt_d: "Là thiết bị phần cứng",
    expected_answer: "A",
  };
  const f = runRules(q, { group_kind: "H" });
  assert.ok(f.some((x) => x.category === "thieu_dau_hoi"));
});

test("rules: bắt chuỗi lặp có entropy thấp", () => {
  const q = {
    content: "aaaaaaaaaaaaaaaa",
    opt_a: "1",
    opt_b: "2",
    opt_c: "3",
    opt_d: "4",
    expected_answer: "A",
  };
  const f = runRules(q, { group_kind: "H" });
  assert.ok(f.some((x) => x.category === "entropy_thap"));
});

test("rules: bắt các phương án placeholder dummy (HI, HA, HO, HU)", () => {
  const q = {
    content: "Mạng máy tính là gì?",
    opt_a: "HI",
    opt_b: "HA",
    opt_c: "HO",
    opt_d: "HU",
    expected_answer: "A",
  };
  const f = runRules(q, { group_kind: "H" });
  assert.ok(f.some((x) => x.category === "phuong_an_dummy"));
});
