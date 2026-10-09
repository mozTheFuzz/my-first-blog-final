import { test } from "node:test";
import assert from "node:assert/strict";
import { validateCommentBody } from "../netlify/lib/comments.mjs";

test("留言內容合法", () => {
  assert.deepEqual(validateCommentBody({ body: " 你好 " }), { ok: true, text: "你好" });
});
test("留言空白或缺欄位被拒絕", () => {
  assert.equal(validateCommentBody({ body: "   " }).error, "empty_body");
  assert.equal(validateCommentBody({}).error, "invalid_body");
});

import { deleteDenialReason } from "../netlify/lib/comments.mjs";
const c = { id: "c1", authorId: "moz" };
test("作者本人可刪除", () => assert.equal(deleteDenialReason(c, "moz"), null));
test("未登入不可刪除", () => assert.equal(deleteDenialReason(c, null), "login_required"));
test("其他會員不可刪除", () => assert.equal(deleteDenialReason(c, "bob"), "forbidden"));
test("留言不存在", () => assert.equal(deleteDenialReason(null, "moz"), "not_found"));
test("匿名舊留言無人可刪", () => assert.equal(deleteDenialReason({ authorId: null }, "moz"), "forbidden"));
