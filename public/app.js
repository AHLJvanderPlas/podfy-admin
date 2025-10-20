// ---------- tiny logger for quick debugging ----------
const LOG = (...a) => { console.log("[admin]", ...a); };
window.__PODFY_ADMIN_READY = () => true;

// ---------- helpers ----------
async function api(path, init) {
  const res = await fetch(path, {
    credentials: "include",
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers||{}) }
  });
  if (!res.ok) {
    const text = await res.text().catch(()=> "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}
const $ = (id) => document.getElementById(id);
const hide = (el, v) => el.classList[v ? "add" : "remove"]("hidden");

// --- recipients helpers ---
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const MAX_PER_LIST = 25;

function parseEmails(s) {
  if (!s) return [];
  // split by comma, semicolon, or whitespace
  return String(s).split(/[\s,;]+/).map(v => v.trim()).filter(Boolean);
}
function validateList(arr) {
  if (arr.length > MAX_PER_LIST) return `Max ${MAX_PER_LIST} addresses`;
  for (const e of arr) if (!EMAIL_RE.test(e)) return `Invalid email: ${e}`;
  return "";
}


// ---------- state ----------
let themes = [];
let isNew = false;
let current = null;
let q = "";

// ---------- color helpers ----------
function normHex(v) {
  if (!v) return "";
  let s = v.trim();
  if (s[0] !== "#") s = "#" + s;
  s = s.toUpperCase();
  if (!/^#[0-9A-F]{3}([0-9A-F]{3})?$/.test(s)) return "";
  if (s.length === 4) s = "#" + [...s.slice(1)].map(c => c + c).join("");
  return s;
}
function luma(hex) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return 0.2126*r + 0.7152*g + 0.0722*b;
}
function tintInput(el, value) {
  const hex = normHex(value);
  el.style.background = hex || "";
  el.style.color = hex ? (luma(hex) > 180 ? "#111827" : "#FFFFFF") : "";
}
function wireColor(textId, pickerId) {
  const t = $(textId), p = $(pickerId);
  const onText = () => { const hex = normHex(t.value); if (hex) p.value = hex; tintInput(t, hex); };
  const onPick = () => { const hex = normHex(p.value); t.value = hex; tintInput(t, hex); };
  t.addEventListener("input", onText);
  p.addEventListener("input", onPick);
  const start = normHex(t.value || p.value);
  if (start) { t.value = start; p.value = start; }
  tintInput(t, start);
}

// ---------- auth ----------
async function checkAuth() {
  LOG("checkAuth()");
  try {
    await api("/api/admin/me");
    hide($("view-login"), true);
    $("nav-themes").classList.remove("hidden");
    $("btn-logout").classList.remove("hidden");
    hide($("view-themes"), false);
    await loadThemes();
  } catch {
    hide($("view-login"), false);
    $("nav-themes").classList.add("hidden");
    $("btn-logout").classList.add("hidden");
    hide($("view-themes"), true);
  }
}
async function doLogin() {
  LOG("doLogin()");
  $("login-error").classList.add("hidden");
  const btn = $("btn-login");
  const email = $("login-email").value.trim();
  if (!email) return;
  btn.disabled = true;
  try {
    await api("/api/admin/login", { method: "POST", body: JSON.stringify({ email }) });
    LOG("login: 204 OK");
    await checkAuth();
  } catch (e) {
    LOG("login error:", e);
    $("login-error").textContent = String(e.message || e);
    $("login-error").classList.remove("hidden");
  } finally {
    btn.disabled = false;
  }
}
function doLogout() {
  document.cookie = `sida=; Max-Age=0; Path=/; SameSite=Strict; Secure;`;
  location.reload();
}

// ---------- data ----------
async function loadThemes() {
  LOG("loadThemes()");
  themes = await api("/api/admin/themes");
  renderThemesTable();
}
function filteredSorted() {
  let rows = [...themes].sort((a,b) => (a.slug||"").localeCompare(b.slug||""));
  if (!q) return rows;
  const n = q.toLowerCase();
  return rows.filter(t =>
    (t.slug||"").toLowerCase().includes(n) ||
    (t.brand_name||"").toLowerCase().includes(n) ||
    (t.email||"").toLowerCase().includes(n)
  );
}
function renderThemesTable() {
  const tbody = $("themes-tbody");
  tbody.innerHTML = "";
  const rows = filteredSorted();
  $("theme-count").textContent = `${rows.length} theme${rows.length===1?"":"s"}`;
  for (const t of rows) {
    const tr = document.createElement("tr");
    tr.className = "border-t";
    tr.innerHTML = `
      <td class="p-3 font-mono text-xs">${t.slug ?? "—"}</td>
      <td class="p-3">${t.brand_name ?? "—"}</td>
      <td class="p-3">
        <span class="inline-block w-4 h-4 rounded align-middle mr-2" style="background:${t.color_primary || "#fff"}"></span>
        <span class="align-middle">${t.color_primary || "—"}</span>
      </td>
      <td class="p-3">
        <span class="inline-block w-4 h-4 rounded align-middle mr-2" style="background:${t.color_accent || "#fff"}"></span>
        <span class="align-middle">${t.color_accent || "—"}</span>
      </td>
      <td class="p-3">${t.email || "—"}</td>
      <td class="p-3"><button class="px-2 py-1 rounded bg-slate-900 text-white text-xs">Edit</button></td>
    `;
    tr.querySelector("button").addEventListener("click", () => openEditor(t, false));
    tbody.appendChild(tr);
  }
  const settingsCache = new Map(); // slug -> {to,cc,bcc}
async function getRecipCounts(slug) {
  if (settingsCache.has(slug)) return settingsCache.get(slug);
  try {
    const s = await fetch(`/api/v1/slugs/${encodeURIComponent(slug)}/settings`, { credentials: "include" }).then(r => r.json());
    const rec = s?.email_recipients || { to:[], cc:[], bcc:[] };
    const val = { to: rec.to.length|0, cc: rec.cc.length|0, bcc: rec.bcc.length|0 };
    settingsCache.set(slug, val);
    return val;
  } catch { return { to:0, cc:0, bcc:0 }; }
}

}

// ---------- editor ----------
function openEditor(t, creating) {
  current = t || {};
  isNew   = !!creating;

  $("edit-title").textContent = creating ? "Create theme" : (current.brand_name || current.slug || "");
  $("f-slug").value = current.slug || "";
  $("f-slug").disabled = !creating;

  $("f-brand_name").value = current.brand_name || "";
  $("f-status").value = current.status || "";
  $("f-logo_path").value = current.logo_path || "";
  $("f-favicon_path").value = current.favicon_path || "";
  $("f-color_primary").value = current.color_primary || "";
  $("f-color_accent").value = current.color_accent || "";
  $("f-color_text").value = current.color_text || "";
  $("f-color_muted").value = current.color_muted || "";
  $("f-color_border").value = current.color_border || "";
  $("f-color_button_text").value = current.color_button_text || "";
  $("f-header_bg").value = current.header_bg || "";
  $("f-email").value = current.email || "";
  $("f-notes_internal").value = current.notes_internal || "";
  $("save-status").textContent = "";

  // sync color pickers and tint inputs
  wireColor("f-color_primary", "p-color_primary");
  wireColor("f-color_accent", "p-color_accent");
  wireColor("f-color_text", "p-color_text");
  wireColor("f-color_muted", "p-color_muted");
  wireColor("f-color_border", "p-color_border");
  wireColor("f-color_button_text", "p-color_button_text");

  hide($("edit-modal"), false);

  // Load slug settings (recipients)
(async () => {
  const slug = $("f-slug").value.trim();
  if (!slug) return;
  try {
    const s = await fetch(`/api/v1/slugs/${encodeURIComponent(slug)}/settings`, { credentials: "include" }).then(r => r.json());
    const rec = s?.email_recipients || { to:[], cc:[], bcc:[] };

    // Fill textareas (comma-separated)
    $("f-recip-to").value  = rec.to.join(", ");
    $("f-recip-cc").value  = rec.cc.join(", ");
    $("f-recip-bcc").value = rec.bcc.join(", ");

    // Backward-compat tip:
    const showTip = (rec?.to?.length || 0) > 0 && (current?.email || null) ? true : false; // legacy present
    $("legacy-tip").classList[showTip ? "remove" : "add"]("hidden");
  } catch (e) {
    console.warn("Load settings failed", e);
  }
})();

}

async function saveEdits(e) {
  e.preventDefault();
  const slug = $("f-slug").value.trim();
  if (!slug) { $("save-status").textContent = "Slug is required"; return; }

  const payload = {
    slug,
    brand_name: $("f-brand_name").value.trim() || null,
    status: $("f-status").value.trim() || null,
    logo_path: $("f-logo_path").value.trim() || null,
    favicon_path: $("f-favicon_path").value.trim() || null,
    primary_color: $("f-color_primary").value.trim() || null,
    secondary_color: $("f-color_accent").value.trim() || null,
    color_text: $("f-color_text").value.trim() || null,
    color_muted: $("f-color_muted").value.trim() || null,
    color_border: $("f-color_border").value.trim() || null,
    color_button_text: $("f-color_button_text").value.trim() || null,
    header_bg: $("f-header_bg").value.trim() || null,
    email: $("f-email").value.trim() || null,
    notes_internal: $("f-notes_internal").value.trim() || null,
  };

  $("save-status").textContent = "Saving…";
  try {
    if (isNew) {
      await api(`/api/admin/themes`, { method: "POST", body: JSON.stringify(payload) });
    } else {
      await api(`/api/admin/themes/${encodeURIComponent(slug)}`, { method: "PUT", body: JSON.stringify(payload) });
    }
    $("save-status").textContent = "Saved ✓";
    await loadThemes();
    setTimeout(() => hide($("edit-modal"), true), 300);
  } catch (e) {
    LOG("save error:", e);
    // Always show plain text; if server returned HTML, show a short hint
    const msg = String(e.message || e);
    $("save-status").textContent = msg.startsWith("<!DOCTYPE") ? "Server error (HTML response). Check function logs." : msg;
  }

  // Build recipients payload from textareas
const to  = parseEmails($("f-recip-to").value);
const cc  = parseEmails($("f-recip-cc").value);
const bcc = parseEmails($("f-recip-bcc").value);

// Validate before sending
const vTo  = validateList(to);
const vCc  = validateList(cc);
const vBcc = validateList(bcc);
let hasErr = false;
[["err-to", vTo], ["err-cc", vCc], ["err-bcc", vBcc]].forEach(([id, msg]) => {
  const el = $(id); el.textContent = msg; el.classList[msg ? "remove" : "add"]("hidden");
  if (msg) hasErr = true;
});
if (to.length === 0) {
  const el = $("err-to"); el.textContent = "At least one TO recipient is required"; el.classList.remove("hidden");
  hasErr = true;
}
if (hasErr) { $("save-status").textContent = "Fix recipients before saving"; return; }

// PATCH slug settings
try {
  const slug = $("f-slug").value.trim();
  await fetch(`/api/v1/slugs/${encodeURIComponent(slug)}/settings`, {
    method: "PATCH",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email_recipients: { to, cc, bcc } })
  }).then(async r => {
    if (!r.ok) throw new Error(await r.text());
  });
} catch (e) {
  console.error("Save settings failed", e);
  $("save-status").textContent = "Error saving recipients";
  return;
}

}

// ---------- bootstrap ----------
window.addEventListener("DOMContentLoaded", () => {
  LOG("DOMContentLoaded: wiring UI");
  $("btn-login").addEventListener("click", doLogin);
  $("login-email").addEventListener("keydown", (ev) => { if (ev.key === "Enter") doLogin(); });

  $("btn-logout").addEventListener("click", doLogout);
  $("nav-themes").addEventListener("click", () => hide($("view-themes"), false));
  $("btn-close").addEventListener("click", () => hide($("edit-modal"), true));
  $("edit-form").addEventListener("submit", saveEdits);
  $("btn-create").addEventListener("click", () => openEditor(null, true));
  $("search").addEventListener("input", (e) => { q = e.target.value; renderThemesTable(); });

  checkAuth();
});
