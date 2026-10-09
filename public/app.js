const app = document.getElementById("app");
const authArea = document.getElementById("auth-area");
let currentMember = null; // 僅供畫面顯示；真正的權限判斷在後端

async function api(path, options = {}) {
  const res = await fetch("/api" + path, {
    headers: { "content-type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || "request_failed"), { status: res.status });
  return data;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function loadMember() {
  try {
    currentMember = (await api("/auth/me")).member;
  } catch {
    currentMember = null;
  }
  renderAuth();
}

function renderAuth() {
  if (currentMember) {
    const avatar = currentMember.picture ? `<img class="avatar" src="${esc(currentMember.picture)}" alt="" />` : "";
    authArea.innerHTML = `${avatar}<span class="muted">你好，<strong>${esc(currentMember.name)}</strong></span> <button id="logout-btn">登出</button>`;
    document.getElementById("logout-btn").addEventListener("click", async () => {
      await api("/auth/logout", { method: "POST" });
      currentMember = null;
      renderAuth();
      route();
    });
  } else {
    authArea.innerHTML = `<a class="btn line-login" href="/api/auth/line/start">用 LINE 登入</a>`;
  }
}

// LINE callback 失敗時會轉回 /?login_error=<code>
function showLoginError() {
  const code = new URLSearchParams(location.search).get("login_error");
  if (!code) return;
  const msgs = {
    line_denied: "你取消了 LINE 授權。",
    invalid_state: "登入狀態已失效，請重新登入。",
    line_failed: "LINE 登入失敗，請稍後再試。",
  };
  const el = document.createElement("p");
  el.className = "error banner";
  el.textContent = msgs[code] || `登入失敗：${code}`;
  app.before(el);
  history.replaceState(null, "", location.pathname + location.hash);
}

async function renderList() {
  app.innerHTML = `<p class="muted">載入中…</p>`;
  const posts = await api("/posts");
  app.innerHTML =
    `<h1>文章列表</h1>` +
    posts.map((p) => `<a class="card" href="#/posts/${esc(p.id)}"><h2>${esc(p.title)}</h2><p>${esc(p.summary)}</p></a>`).join("");
}

async function renderPost(id) {
  app.innerHTML = `<p class="muted">載入中…</p>`;
  let post;
  try {
    post = await api(`/posts/${encodeURIComponent(id)}`);
  } catch {
    app.innerHTML = `<p class="error">找不到這篇文章。</p><a class="btn" href="#/">返回列表</a>`;
    return;
  }
  app.innerHTML = `
    <div class="actions"><a class="btn" href="#/">← 返回列表</a>${currentMember ? `<a class="btn" href="#/posts/${esc(post.id)}/edit">編輯</a>` : ""}</div>
    <h1>${esc(post.title)}</h1>
    <p class="muted">${esc(post.summary)}</p>
    <div class="post-content">${esc(post.content)}</div>
    <section class="comments">
      <h2>留言</h2>
      <div id="comment-list"><p class="muted">載入中…</p></div>
      ${currentMember ? "" : `<p class="muted">登入後即可留言。</p>`}
      <form id="comment-form" class="form">
        <label>新增留言<textarea name="body" rows="3" required maxlength="2000"></textarea></label>
        <p id="comment-error" class="error"></p>
        <button type="submit" class="primary">送出留言</button>
      </form>
    </section>
  `;
  await renderComments(post.id);
  const form = document.getElementById("comment-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = new FormData(form).get("body");
    const errEl = document.getElementById("comment-error");
    errEl.textContent = "";
    try {
      await api(`/posts/${encodeURIComponent(post.id)}/comments`, { method: "POST", body: JSON.stringify({ body }) });
      form.reset();
      await renderComments(post.id);
    } catch (err) {
      errEl.textContent = err.message === "login_required" ? "請先登入再留言。" : `留言失敗：${err.message}`;
    }
  });
}

function formatTime(iso) {
  return new Date(iso).toLocaleString("zh-TW", { hour12: false });
}

async function renderComments(postId) {
  const list = document.getElementById("comment-list");
  const comments = await api(`/posts/${encodeURIComponent(postId)}/comments`);
  if (comments.length === 0) {
    list.innerHTML = `<p class="muted">還沒有留言。</p>`;
    return;
  }
  list.innerHTML = comments
    .map(
      (c) => `<div class="comment">
        <div class="comment-meta"><strong>${esc(c.authorName)}</strong> <span class="muted">${esc(formatTime(c.createdAt))}</span>
          ${currentMember && c.authorId === currentMember.id ? `<button class="danger small" data-delete="${esc(c.id)}">刪除</button>` : ""}
        </div>
        <div class="comment-body">${esc(c.body)}</div>
      </div>`
    )
    .join("");
  // 刪除鈕只是方便操作；是否允許由後端依留言作者判斷
  list.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await api(`/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(btn.dataset.delete)}`, { method: "DELETE" });
        await renderComments(postId);
      } catch (err) {
        const msgs = { login_required: "請先登入。", forbidden: "只能刪除自己的留言。", not_found: "留言已不存在。" };
        document.getElementById("comment-error").textContent = msgs[err.message] || `刪除失敗：${err.message}`;
        btn.disabled = false;
      }
    });
  });
}

async function renderEdit(id) {
  app.innerHTML = `<p class="muted">載入中…</p>`;
  let post;
  try {
    post = await api(`/posts/${encodeURIComponent(id)}`);
  } catch {
    app.innerHTML = `<p class="error">找不到這篇文章。</p><a class="btn" href="#/">返回列表</a>`;
    return;
  }
  app.innerHTML = `
    <div class="actions"><a class="btn" href="#/posts/${esc(post.id)}">← 取消</a></div>
    <h1>編輯文章</h1>
    <form id="edit-form" class="form">
      <label>標題<input name="title" required maxlength="200" value="${esc(post.title)}" /></label>
      <label>摘要<input name="summary" required maxlength="200" value="${esc(post.summary)}" /></label>
      <label>內文<textarea name="content" rows="12">${esc(post.content)}</textarea></label>
      <p id="edit-error" class="error"></p>
      <button type="submit" class="primary">儲存</button>
    </form>
  `;
  const form = document.getElementById("edit-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const body = { title: fd.get("title"), summary: fd.get("summary"), content: fd.get("content") };
    try {
      await api(`/posts/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) });
      location.hash = `#/posts/${encodeURIComponent(id)}`;
    } catch (err) {
      const msg = err.message === "login_required" ? "請先登入才能編輯文章" : err.message;
      document.getElementById("edit-error").textContent = `儲存失敗：${msg}`;
    }
  });
}

function route() {
  const hash = location.hash || "#/";
  let m;
  if ((m = hash.match(/^#\/posts\/([^/]+)\/edit$/))) return renderEdit(decodeURIComponent(m[1]));
  if ((m = hash.match(/^#\/posts\/([^/]+)$/))) return renderPost(decodeURIComponent(m[1]));
  return renderList();
}

window.addEventListener("hashchange", route);
showLoginError();
loadMember().then(route);
