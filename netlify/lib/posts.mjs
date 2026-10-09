import { getStore } from "@netlify/blobs";

const SEED = [
  {
    id: "hello-netlify",
    title: "用 Netlify 架設第一個網站",
    summary: "從零開始，把靜態網頁與 Functions 一起部署到 Netlify。",
    content:
      "Netlify 可以同時託管靜態檔案與無伺服器函式。\n\n本機用 netlify dev 就能模擬正式環境，包含 Blobs 儲存。\n\n這篇文章示範最小可行的部署流程。",
  },
  {
    id: "blobs-intro",
    title: "Netlify Blobs 入門",
    summary: "不用額外資料庫，用 Netlify 內建的 key-value 儲存保存資料。",
    content:
      "Blobs 是以 store 與 key 組織的儲存空間。\n\n每個 key 可以存文字或 JSON，適合文章、留言這類小型資料。\n\n在本機開發時，CLI 會用沙箱模擬，不會動到正式資料。",
  },
  {
    id: "member-comments",
    title: "設計會員留言功能",
    summary: "登入後才能留言，而且只能刪除自己的留言，權限要在後端檢查。",
    content:
      "前端隱藏按鈕只是體驗上的輔助。\n\n真正的權限判斷必須在後端完成，否則直接送 API 請求就能繞過。\n\n這個網站會用簽章 cookie 辨識會員。",
  },
];

function store() {
  return getStore({ name: "posts", consistency: "strong" });
}

async function seedIfEmpty() {
  const s = store();
  const { blobs } = await s.list();
  if (blobs.length > 0) return;
  const now = new Date().toISOString();
  await Promise.all(SEED.map((p) => s.setJSON(p.id, { ...p, updatedAt: now })));
}

export async function listPosts() {
  await seedIfEmpty();
  const s = store();
  const { blobs } = await s.list();
  const posts = await Promise.all(blobs.map((b) => s.get(b.key, { type: "json" })));
  return posts
    .filter(Boolean)
    .map(({ id, title, summary }) => ({ id, title, summary }))
    .sort((a, b) => a.title.localeCompare(b.title, "zh-Hant"));
}

export async function getPost(id) {
  await seedIfEmpty();
  return store().get(id, { type: "json" });
}

export async function updatePost(id, fields) {
  const s = store();
  const existing = await s.get(id, { type: "json" });
  if (!existing) return null;
  const updated = { ...existing, ...fields, id, updatedAt: new Date().toISOString() };
  await s.setJSON(id, updated);
  return updated;
}
