import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAuthorizeUrl, callbackUrl, exchangeCode, verifyIdToken, lineConfig } from "../netlify/lib/line.mjs";
import { createLoginState, verifyLoginState } from "../netlify/lib/session.mjs";
import { lineMemberId } from "../netlify/lib/members.mjs";

const key = "test-secret-key-1234567890";
const SUB = "U" + "a".repeat(32);

test("authorize URL 含必要參數", () => {
  const u = new URL(buildAuthorizeUrl({ channelId: "123", redirectUri: "http://localhost:8888/api/auth/line/callback", state: "s", nonce: "n" }));
  assert.equal(u.origin + u.pathname, "https://access.line.me/oauth2/v2.1/authorize");
  assert.equal(u.searchParams.get("response_type"), "code");
  assert.equal(u.searchParams.get("client_id"), "123");
  assert.equal(u.searchParams.get("scope"), "profile openid");
  assert.equal(u.searchParams.get("state"), "s");
  assert.equal(u.searchParams.get("nonce"), "n");
});
test("callback URL 依請求 origin 組成", () => {
  assert.equal(callbackUrl(new Request("http://localhost:8888/api/auth/line/start")), "http://localhost:8888/api/auth/line/callback");
  assert.equal(callbackUrl(new Request("https://example.netlify.app/api/auth/line/start")), "https://example.netlify.app/api/auth/line/callback");
});
test("經代理時以 X-Forwarded-* 組 callback URL", () => {
  const req = new Request("http://localhost:8888/api/auth/line/start", {
    headers: { "x-forwarded-proto": "https", "x-forwarded-host": "abc.ngrok-free.app" },
  });
  assert.equal(callbackUrl(req), "https://abc.ngrok-free.app/api/auth/line/callback");
});test("缺環境變數時明確報錯", () => {
  assert.throws(() => lineConfig({}), /LINE_CHANNEL_ID/);
});
test("login state cookie 可驗證，竄改失敗", () => {
  const t = createLoginState({ state: "abc", nonce: "xyz" }, { key });
  assert.deepEqual(verifyLoginState(t, { key }), { state: "abc", nonce: "xyz" });
  assert.equal(verifyLoginState(t + "x", { key }), null);
  assert.equal(verifyLoginState(createLoginState({ state: "a", nonce: "b" }, { key, now: 0 }), { key }), null);
});
test("LINE sub 轉會員 id", () => {
  assert.equal(lineMemberId(SUB), `line:${SUB}`);
  assert.equal(lineMemberId("bad"), null);
});
test("exchangeCode 送出正確表單並回傳 token", async () => {
  let captured;
  const fakeFetch = async (url, init) => {
    captured = { url, body: Object.fromEntries(new URLSearchParams(init.body)) };
    return { ok: true, json: async () => ({ id_token: "idt", access_token: "at" }) };
  };
  const r = await exchangeCode({ code: "c", redirectUri: "r", channelId: "id", channelSecret: "sec" }, fakeFetch);
  assert.equal(captured.url, "https://api.line.me/oauth2/v2.1/token");
  assert.deepEqual(captured.body, { grant_type: "authorization_code", code: "c", redirect_uri: "r", client_id: "id", client_secret: "sec" });
  assert.equal(r.id_token, "idt");
});
test("verifyIdToken 比對 nonce", async () => {
  const ok = async () => ({ ok: true, json: async () => ({ sub: SUB, name: "Moz", picture: "p", nonce: "n1" }) });
  assert.deepEqual(await verifyIdToken({ idToken: "t", channelId: "id", nonce: "n1" }, ok), { sub: SUB, name: "Moz", picture: "p" });
  await assert.rejects(verifyIdToken({ idToken: "t", channelId: "id", nonce: "other" }, ok), /nonce_mismatch/);
  const bad = async () => ({ ok: false, status: 400, json: async () => ({ error: "invalid_request" }) });
  await assert.rejects(verifyIdToken({ idToken: "t", channelId: "id", nonce: "n1" }, bad), /line_verify_failed/);
});
