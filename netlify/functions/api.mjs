import { json, error, matchPath } from "../lib/http.mjs";
import { listPosts, getPost, updatePost } from "../lib/posts.mjs";
import { validatePostFields } from "../lib/validate.mjs";
import { listComments, addComment, validateCommentBody, getComment, deleteComment, deleteDenialReason } from "../lib/comments.mjs";
import { findOrCreateLineMember, getMember } from "../lib/members.mjs";
import {
  createToken, currentMemberId, sessionCookieHeader, clearCookieHeader,
  createLoginState, verifyLoginState, readLoginStateCookie, loginStateCookieHeader, clearLoginStateCookieHeader,
} from "../lib/session.mjs";
import { lineConfig, callbackUrl, buildAuthorizeUrl, exchangeCode, verifyIdToken } from "../lib/line.mjs";
import { randomBytes } from "node:crypto";

export const config = { path: "/api/*" };

export default async function handler(req) {
  // Netlify CLI 本機 dev 代理在 function 回 403/404 時會重試 ".html"、"/index.html" 等替代路徑，
  // 並以最後一次（404）為回應。這裡去掉這些後綴，讓本機也能回傳正確的 403。正式環境不會有這些後綴。
  const pathname = new URL(req.url).pathname.replace(/(\/index)?\.html?$/, "");
  const method = req.method;
  let p;

  if (method === "GET" && matchPath("/api/posts", pathname)) {
    return json(await listPosts());
  }
  if (method === "GET" && (p = matchPath("/api/posts/:id", pathname))) {
    const post = await getPost(p.id);
    return post ? json(post) : error("not_found", 404);
  }
  // ---- 會員（LINE Login）----
  if (method === "GET" && matchPath("/api/auth/line/start", pathname)) {
    const { id } = lineConfig();
    const state = randomBytes(16).toString("base64url");
    const nonce = randomBytes(16).toString("base64url");
    const url = buildAuthorizeUrl({ channelId: id, redirectUri: callbackUrl(req), state, nonce });
    return new Response(null, {
      status: 302,
      headers: { location: url, "set-cookie": loginStateCookieHeader(req, createLoginState({ state, nonce })) },
    });
  }
  if (method === "GET" && matchPath("/api/auth/line/callback", pathname)) {
    const q = new URL(req.url).searchParams;
    const redirectHome = (errorCode) =>
      new Response(null, {
        status: 302,
        headers: { location: errorCode ? `/?login_error=${errorCode}` : "/", "set-cookie": clearLoginStateCookieHeader(req) },
      });
    if (q.get("error")) return redirectHome("line_denied");
    const saved = verifyLoginState(readLoginStateCookie(req));
    if (!saved || !q.get("state") || q.get("state") !== saved.state) return redirectHome("invalid_state");
    const code = q.get("code");
    if (!code) return redirectHome("missing_code");
    try {
      const { id, secret } = lineConfig();
      const token = await exchangeCode({ code, redirectUri: callbackUrl(req), channelId: id, channelSecret: secret });
      const profile = await verifyIdToken({ idToken: token.id_token, channelId: id, nonce: saved.nonce });
      const result = await findOrCreateLineMember(profile);
      if (!result) return redirectHome("invalid_profile");
      const headers = new Headers({ location: "/" });
      headers.append("set-cookie", sessionCookieHeader(req, createToken(result.member.id)));
      headers.append("set-cookie", clearLoginStateCookieHeader(req));
      return new Response(null, { status: 302, headers });
    } catch (err) {
      console.error("LINE login failed:", err.message);
      return redirectHome("line_failed");
    }
  }
  if (method === "POST" && matchPath("/api/auth/logout", pathname)) {
    return json({ ok: true }, 200, { "set-cookie": clearCookieHeader(req) });
  }
  if (method === "GET" && matchPath("/api/auth/me", pathname)) {
    const id = currentMemberId(req);
    const member = id ? await getMember(id) : null;
    return json({ member });
  }

  if (method === "PUT" && (p = matchPath("/api/posts/:id", pathname))) {
    if (!currentMemberId(req)) return error("login_required", 401);
    const body = await req.json().catch(() => null);
    const v = validatePostFields(body);
    if (!v.ok) return error(v.error, 400);
    const updated = await updatePost(p.id, v.fields);
    return updated ? json(updated) : error("not_found", 404);
  }
  if (method === "GET" && (p = matchPath("/api/posts/:id/comments", pathname))) {
    if (!(await getPost(p.id))) return error("not_found", 404);
    return json(await listComments(p.id));
  }
  if (method === "POST" && (p = matchPath("/api/posts/:id/comments", pathname))) {
    if (!(await getPost(p.id))) return error("not_found", 404);
    const memberId = currentMemberId(req);
    const member = memberId ? await getMember(memberId) : null;
    if (!member) return error("login_required", 401);
    const v = validateCommentBody(await req.json().catch(() => null));
    if (!v.ok) return error(v.error, 400);
    const comment = await addComment(p.id, { authorId: member.id, authorName: member.name, body: v.text });
    return json(comment, 201);
  }
  if (method === "DELETE" && (p = matchPath("/api/posts/:id/comments/:commentId", pathname))) {
    const memberId = currentMemberId(req);
    const comment = memberId ? await getComment(p.id, p.commentId) : null;
    const reason = deleteDenialReason(comment, memberId);
    if (reason) return error(reason, { login_required: 401, not_found: 404, forbidden: 403 }[reason]);
    await deleteComment(p.id, p.commentId);
    return json({ ok: true });
  }
  return error("not_found", 404);
}
