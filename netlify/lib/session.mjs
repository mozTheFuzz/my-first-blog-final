import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE = "session";
const LOGIN_COOKIE = "line_login"; // 登入流程中暫存 state 與 nonce
const LOGIN_MAX_AGE_SEC = 10 * 60;
const MAX_AGE_SEC = 7 * 24 * 60 * 60;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET 未設定或太短（至少 16 字元）");
  return s;
}

function sign(payload, key) {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

// 產生簽章 token：base64url(JSON) + "." + HMAC
export function createToken(memberId, { key = secret(), now = Date.now() } = {}) {
  return signPayload({ memberId }, MAX_AGE_SEC, key, now);
}

function signPayload(data, maxAgeSec, key, now) {
  const payload = Buffer.from(JSON.stringify({ ...data, exp: now + maxAgeSec * 1000 })).toString("base64url");
  return `${payload}.${sign(payload, key)}`;
}

// 驗證簽章與效期，回傳 payload 物件或 null
function verifyPayload(token, key, now) {
  if (typeof token !== "string") return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload, key);
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof data.exp !== "number" || data.exp < now) return null;
    return data;
  } catch {
    return null;
  }
}

// ---- LINE 登入流程用的 state/nonce 短效 cookie ----
export function createLoginState({ state, nonce }, { key = secret(), now = Date.now() } = {}) {
  return signPayload({ state, nonce }, LOGIN_MAX_AGE_SEC, key, now);
}

export function verifyLoginState(token, { key = secret(), now = Date.now() } = {}) {
  const data = verifyPayload(token, key, now);
  if (!data || typeof data.state !== "string" || typeof data.nonce !== "string") return null;
  return { state: data.state, nonce: data.nonce };
}

export function loginStateCookieHeader(req, token) {
  return `${LOGIN_COOKIE}=${token}; Path=/api/auth/line; HttpOnly; SameSite=Lax; Max-Age=${LOGIN_MAX_AGE_SEC}${isSecure(req) ? "; Secure" : ""}`;
}

export function clearLoginStateCookieHeader(req) {
  return `${LOGIN_COOKIE}=; Path=/api/auth/line; HttpOnly; SameSite=Lax; Max-Age=0${isSecure(req) ? "; Secure" : ""}`;
}

export function readLoginStateCookie(req) {
  return readCookie(req, LOGIN_COOKIE);
}

// 驗證 token，回傳 memberId 或 null
export function verifyToken(token, { key = secret(), now = Date.now() } = {}) {
  const data = verifyPayload(token, key, now);
  return data && typeof data.memberId === "string" ? data.memberId : null;
}

function readCookie(req, name) {
  const header = req.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

export function readSessionCookie(req) {
  return readCookie(req, COOKIE);
}

function isSecure(req) {
  return new URL(req.url).protocol === "https:";
}

export function sessionCookieHeader(req, token) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_SEC}${isSecure(req) ? "; Secure" : ""}`;
}

export function clearCookieHeader(req) {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isSecure(req) ? "; Secure" : ""}`;
}

// 從請求取得目前 memberId（未登入為 null）
export function currentMemberId(req) {
  const token = readSessionCookie(req);
  return token ? verifyToken(token) : null;
}
