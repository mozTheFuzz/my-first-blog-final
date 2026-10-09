# 會員留言部落格 設計規格

日期：2026-10-09

## 目標

一個可部署到 Netlify 的部落格示範網站：文章列表／內容頁、文章編輯器、會員以暱稱登入後留言並可刪除自己的留言。本機先測試，之後部署，不串接 Netlify 以外的服務。

## 已確認的決定

| 項目 | 決定 |
|---|---|
| 登入方式 | 只輸入暱稱，無密碼。暱稱不存在時建立會員；已存在時視為同一會員。 |
| 編輯器權限 | 僅登入會員能編輯文章（任務 2 先開放，任務 4 完成後加上限制）。 |
| 內文格式 | 純文字，顯示時保留換行。不渲染 HTML。 |
| 文章增刪 | 不提供。預先建立 3 篇示範文章，只能編輯。 |

已知風險（使用者已知悉並接受）：暱稱登入無法防止冒用，任何人輸入同一暱稱即被視為同一會員。

## 技術棧

- **前端**：靜態 HTML + CSS + 原生 JavaScript（ES modules），不用打包工具。單一 `index.html` 以 hash 路由切換「列表／內容／編輯」畫面。
- **後端**：Netlify Functions（Node.js 22，ESM），路徑 `netlify/functions/`。
- **資料庫**：Netlify Blobs（`@netlify/blobs`）。本機由 Netlify CLI (`netlify dev`) 模擬，部署後自動使用正式儲存。
- **本機開發**：`npm run dev` 執行 `netlify dev`，於 http://localhost:8888。
- **秘密**：session 簽章密鑰 `SESSION_SECRET` 放在 `.env`（本機，不進版控）與 Netlify 環境變數（正式）。前端程式碼不含任何秘密。

## 資料模型（Netlify Blobs）

| Store | Key | 內容 |
|---|---|---|
| `posts` | `<postId>` | `{ id, title, summary, content, updatedAt }` |
| `comments` | `<postId>/<commentId>` | `{ id, postId, authorId, authorName, body, createdAt }` |
| `members` | `<memberId>` | `{ id, name, createdAt }`；`memberId` 為暱稱正規化（trim、小寫）後的值，天然避免重複建立。 |

示範文章在 `posts` store 為空時由後端自動植入。

## API（Netlify Functions）

| 方法 | 路徑 | 說明 | 權限 |
|---|---|---|---|
| GET | `/api/posts` | 列表（id、title、summary） | 公開 |
| GET | `/api/posts/:id` | 單篇完整內容 | 公開 |
| PUT | `/api/posts/:id` | 更新 title/summary/content | 任務 2：公開；任務 4 後：須登入 |
| GET | `/api/posts/:id/comments` | 該文章留言，依時間排序 | 公開 |
| POST | `/api/posts/:id/comments` | 新增留言 `{ body }` | 任務 3：公開（暫以匿名）；任務 5 後：須登入，401 回 `{ error: "login_required" }` |
| DELETE | `/api/comments/:id` | 刪除留言 | 須登入；`authorId !== session.memberId` 回 403 |
| POST | `/api/auth/login` | `{ name }`，建立或取得會員，設定 session cookie | 公開 |
| POST | `/api/auth/logout` | 清除 cookie | 公開 |
| GET | `/api/auth/me` | 回傳目前會員或 `null` | 公開 |

`/api/*` 以 `netlify.toml` redirect 對應到 functions。

## Session

- Cookie `session`，HttpOnly、SameSite=Lax、正式環境加 Secure，效期 7 天。
- 值為 `base64url(JSON{memberId, exp}) + "." + HMAC-SHA256(payload, SESSION_SECRET)`。
- 後端每次請求驗證簽章與效期；無效即視為未登入。所有權限判斷只在後端進行。

## 前端畫面

1. **列表**：標題 + 摘要卡片，點擊進內容頁。頁首顯示登入狀態（暱稱 + 登出，或登入表單）。
2. **內容頁**：標題、內文（`white-space: pre-wrap`）、「返回列表」、「編輯」按鈕、留言區（留言列表、新增表單、本人留言的刪除鈕）。按鈕隱藏只是輔助，真正的阻擋在後端。
3. **編輯頁**：標題、摘要、內文三欄位，儲存後回到內容頁。

## 錯誤處理

- 後端一律回 JSON `{ error: "<code>" }` 搭配 400/401/403/404。
- 前端在留言區顯示後端錯誤訊息，例如 `login_required` 顯示「請先登入再留言」。

## 測試與驗收

- 每個任務以 `node --test` 測試後端函式的純邏輯（session 簽章、權限檢查），並以 `netlify dev` 實際操作驗收；驗收步驟在每個任務完成時提供。
- 任務 5、6 額外用 `curl` 直接打 API 證明後端拒絕，而非只靠畫面。

## 實作順序

依使用者指定的任務 1 到 6 逐項進行，每項完成後說明修改內容與驗收方式，確認後才進行下一項。
