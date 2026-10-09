import { getStore } from "@netlify/blobs";

function store() {
  return getStore({ name: "members", consistency: "strong" });
}

// LINE 使用者 id（id_token 的 sub）對應的會員 id：同一個 LINE 帳號永遠是同一位會員
export function lineMemberId(sub) {
  if (typeof sub !== "string" || !/^U[0-9a-f]{32}$/.test(sub)) return null;
  return `line:${sub}`;
}

export async function getMember(id) {
  return store().get(id, { type: "json" });
}

// 首次登入建立，之後回傳既有會員；每次登入更新顯示名稱與頭像
export async function findOrCreateLineMember({ sub, name, picture }) {
  const id = lineMemberId(sub);
  if (!id) return null;
  const s = store();
  const existing = await s.get(id, { type: "json" });
  const now = new Date().toISOString();
  const member = {
    id,
    provider: "line",
    name,
    picture,
    createdAt: existing?.createdAt || now,
    lastLoginAt: now,
  };
  await s.setJSON(id, member);
  return { member, created: !existing };
}
