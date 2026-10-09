import { json, error, matchPath } from "../lib/http.mjs";
import { listPosts, getPost, updatePost } from "../lib/posts.mjs";
import { validatePostFields } from "../lib/validate.mjs";
import { listComments, addComment, validateCommentBody, getComment, deleteComment, deleteDenialReason } from "../lib/comments.mjs";
import { findOrCreateMember, getMember } from "../lib/members.mjs";
import { createToken, currentMemberId, sessionCookieHeader, clearCookieHeader } from "../lib/session.mjs";

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
  // ---- 會員 ----
  if (method === "POST" && matchPath("/api/auth/login", pathname)) {
    const body = await req.json().catch(() => null);
    const result = await findOrCreateMember(body?.name);
    if (!result) return error("invalid_name", 400);
    const token = createToken(result.member.id);
    return json({ member: result.member, created: result.created }, 200, { "set-cookie": sessionCookieHeader(req, token) });
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
