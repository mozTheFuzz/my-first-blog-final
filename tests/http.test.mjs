import { test } from "node:test";
import assert from "node:assert/strict";
import { matchPath } from "../netlify/lib/http.mjs";

test("matchPath 回傳參數", () => {
  assert.deepEqual(matchPath("/api/posts/:id", "/api/posts/abc"), { id: "abc" });
});
test("matchPath 長度不同回傳 null", () => {
  assert.equal(matchPath("/api/posts/:id", "/api/posts"), null);
  assert.equal(matchPath("/api/posts", "/api/posts/abc"), null);
});
test("matchPath 字面不符回傳 null", () => {
  assert.equal(matchPath("/api/posts/:id", "/api/users/abc"), null);
});
