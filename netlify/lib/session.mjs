import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE = "session";
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
  const payload = Buffer.from(JSON.stringify({ memberId, exp: now + MAX_AGE_SEC * 1000 })).toString("base64url");
  return `${payload}.${sign(payload, key)}`;
}

// 驗證 token，回傳 memberId 或 null
export function verifyToken(token, { key = secret(), now = Date.now() } = {}) {
  if (typeof token !== "string") return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload, key);
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof data.memberId !== "string" || typeof data.exp !== "number" || data.exp < now) return null;
    return data.memberId;
  } catch {
    return null;
  }
}

export function readSessionCookie(req) {
  const header = req.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === COOKIE) return v.join("=");
  }
  return null;
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
