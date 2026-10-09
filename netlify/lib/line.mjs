// LINE Login（OAuth 2.0 授權碼流程）。端點依 LINE 官方文件：
// https://developers.line.biz/en/docs/line-login/integrate-line-login/
// https://developers.line.biz/en/docs/line-login/verify-id-token/
const AUTHORIZE_URL = "https://access.line.me/oauth2/v2.1/authorize";
const TOKEN_URL = "https://api.line.me/oauth2/v2.1/token";
const VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";

export function lineConfig(env = process.env) {
  const id = env.LINE_CHANNEL_ID, secret = env.LINE_CHANNEL_SECRET;
  if (!id || !secret) throw new Error("LINE_CHANNEL_ID 或 LINE_CHANNEL_SECRET 未設定");
  return { id, secret };
}

// callback 網址依請求來源自動組成，不需要設定 hostname。
// 經 ngrok 等代理時，以 X-Forwarded-Proto / X-Forwarded-Host 還原瀏覽器實際看到的網址。
// 無論如何，組出的網址仍必須在 LINE Console 登錄過，LINE 會逐字比對。
export function callbackUrl(req) {
  const u = new URL(req.url);
  const proto = (req.headers.get("x-forwarded-proto") || u.protocol.replace(":", "")).split(",")[0].trim();
  const host = (req.headers.get("x-forwarded-host") || u.host).split(",")[0].trim();
  return `${proto}://${host}/api/auth/line/callback`;
}

export function buildAuthorizeUrl({ channelId, redirectUri, state, nonce }) {
  const u = new URL(AUTHORIZE_URL);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", channelId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
  u.searchParams.set("scope", "profile openid");
  u.searchParams.set("nonce", nonce);
  return u.toString();
}

// 用授權碼換 token；Channel secret 只在這裡使用，且只在後端
export async function exchangeCode({ code, redirectUri, channelId, channelSecret }, fetchImpl = fetch) {
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: channelId,
      client_secret: channelSecret,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id_token) throw new Error(`line_token_failed:${data.error || res.status}`);
  return data;
}

// 由 LINE 驗證 id_token 並回傳使用者資訊；同時比對 nonce 防重放
export async function verifyIdToken({ idToken, channelId, nonce }, fetchImpl = fetch) {
  const res = await fetchImpl(VERIFY_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: idToken, client_id: channelId, nonce }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.sub) throw new Error(`line_verify_failed:${data.error || res.status}`);
  if (data.nonce !== nonce) throw new Error("line_verify_failed:nonce_mismatch");
  return { sub: data.sub, name: data.name || "LINE 使用者", picture: data.picture || null };
}
