// 文章欄位驗證：回傳 { ok: true, fields } 或 { ok: false, error }
export function validatePostFields(body) {
  if (!body || typeof body !== "object") return { ok: false, error: "invalid_body" };
  const fields = {};
  for (const key of ["title", "summary", "content"]) {
    const v = body[key];
    if (typeof v !== "string") return { ok: false, error: `invalid_${key}` };
    const trimmed = v.trim();
    if (key !== "content" && trimmed.length === 0) return { ok: false, error: `empty_${key}` };
    if (trimmed.length > (key === "content" ? 20000 : 200)) return { ok: false, error: `too_long_${key}` };
    fields[key] = key === "content" ? v.replace(/\r\n/g, "\n") : trimmed;
  }
  return { ok: true, fields };
}
