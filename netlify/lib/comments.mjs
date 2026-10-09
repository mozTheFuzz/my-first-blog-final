import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";

function store() {
  return getStore({ name: "comments", consistency: "strong" });
}

// key 格式：<postId>/<createdAt>-<uuid>，用 prefix 查詢即可取得某篇文章的全部留言並依時間排序
export async function listComments(postId) {
  const s = store();
  const { blobs } = await s.list({ prefix: `${postId}/` });
  const items = await Promise.all(blobs.map((b) => s.get(b.key, { type: "json" })));
  return items.filter(Boolean).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function addComment(postId, { authorId, authorName, body }) {
  const createdAt = new Date().toISOString();
  const id = `${createdAt}-${randomUUID()}`;
  const comment = { id, postId, authorId, authorName, body, createdAt };
  await store().setJSON(`${postId}/${id}`, comment);
  return comment;
}

export async function getComment(postId, commentId) {
  return store().get(`${postId}/${commentId}`, { type: "json" });
}

export async function deleteComment(postId, commentId) {
  await store().delete(`${postId}/${commentId}`);
}

// 權限判斷：只有留言作者可刪除。回傳 null 表示允許，否則回傳錯誤代碼
export function deleteDenialReason(comment, memberId) {
  if (!memberId) return "login_required";
  if (!comment) return "not_found";
  if (comment.authorId !== memberId) return "forbidden";
  return null;
}

export function validateCommentBody(body) {
  if (!body || typeof body !== "object" || typeof body.body !== "string") return { ok: false, error: "invalid_body" };
  const text = body.body.replace(/\r\n/g, "\n").trim();
  if (!text) return { ok: false, error: "empty_body" };
  if (text.length > 2000) return { ok: false, error: "too_long_body" };
  return { ok: true, text };
}
