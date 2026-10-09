import { getStore } from "@netlify/blobs";

function store() {
  return getStore({ name: "members", consistency: "strong" });
}

// 暱稱正規化後當作 memberId：同一暱稱永遠對應同一會員
export function normalizeName(name) {
  if (typeof name !== "string") return null;
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed.length < 1 || trimmed.length > 30) return null;
  return { id: trimmed.toLowerCase(), name: trimmed };
}

export async function getMember(id) {
  return store().get(id, { type: "json" });
}

// 首次登入建立，之後回傳既有會員
export async function findOrCreateMember(name) {
  const n = normalizeName(name);
  if (!n) return null;
  const existing = await getMember(n.id);
  if (existing) return { member: existing, created: false };
  const member = { id: n.id, name: n.name, createdAt: new Date().toISOString() };
  await store().setJSON(n.id, member);
  return { member, created: true };
}
