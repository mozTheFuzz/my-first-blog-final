import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePostFields } from "../netlify/lib/validate.mjs";

test("合法欄位通過並 trim", () => {
  const r = validatePostFields({ title: " A ", summary: "B", content: "C\r\nD" });
  assert.deepEqual(r, { ok: true, fields: { title: "A", summary: "B", content: "C\nD" } });
});
test("缺欄位或非字串被拒絕", () => {
  assert.equal(validatePostFields({ title: "A", summary: "B" }).error, "invalid_content");
  assert.equal(validatePostFields(null).error, "invalid_body");
});
test("標題空白被拒絕", () => {
  assert.equal(validatePostFields({ title: "  ", summary: "B", content: "" }).error, "empty_title");
});
