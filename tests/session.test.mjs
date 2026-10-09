import { test } from "node:test";
import assert from "node:assert/strict";
import { createToken, verifyToken } from "../netlify/lib/session.mjs";


const key = "test-secret-key-1234567890";

test("簽章 token 可驗證回 memberId", () => {
  const t = createToken("alice", { key });
  assert.equal(verifyToken(t, { key }), "alice");
});
test("竄改 payload 或簽章會失敗", () => {
  const t = createToken("alice", { key });
  const [p, s] = t.split(".");
  const forged = Buffer.from(JSON.stringify({ memberId: "bob", exp: Date.now() + 1e9 })).toString("base64url");
  assert.equal(verifyToken(`${forged}.${s}`, { key }), null);
  assert.equal(verifyToken(`${p}.${s}x`, { key }), null);
  assert.equal(verifyToken(t, { key: "another-secret-key-xxxxx" }), null);
});
test("過期 token 失敗", () => {
  const t = createToken("alice", { key, now: 0 });
  assert.equal(verifyToken(t, { key }), null);
});
