// ---- helpers ---------------------------------------------------
async function api(path, init) {
  const res = await fetch(path, {
    credentials: "include",
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) throw new Error((await res.text().catch(()=> "")) || `HTTP ${res.status}`);
  return res.status === 204 ? null : res.json();
}
function $(id) { return document.getElementById(id); }
function setHidden(el, hide) { el.classList[hide ? "add" : "remove"]("hidden"); }

// ---- state -----------------------------------------------------
let themes = [];
let current = null;     // currently edited theme row
let isNew   = false;    // are we creating?
let q       = "";       // search query

// ---- auth ------------------------------------------------------
async function checkAuth() {
  try {
    await api("/api/admin/me");
    setHidden($("view-login"), true);
    $("nav-themes").classList.remove("hidden");
    $("btn-logout").classList.remove("hidden");
    setHidden($("view-themes"), false);
    await loadThemes();
  } catch {
    setHidden($("view-login"), false);
    $("nav-themes").classList.add("hidden");
    $("btn-logout").classList.add("hidden");
    setHidden($("view-themes"), true);
  }
}
async function doLogin() {
  $("login-error").classList.add("hidden");
  const email = $("login-email").value.trim();
  if (!email) return;
  try { await api("/api/admin/login", { method: "POST", body: JSON.stringify({ email }) }); await checkAuth(); }
  catch (e) { $("login-error").textContent = String(e.message || e); $("login-error").classList.remove("hidden"); }
}
function doLogout() {
  document.cookie = `sida=; Max-Age=0; Path=/; SameSite=Strict; Secure;`;
  location.reload();
}

// ---- themes ----------------------------------------------------
async function loadThemes() {
  themes = await api("/api/admin/themes");
  renderThemesTable();
}

function filteredSorted() {
  // default sort: slug ascending
  let rows = [...themes].sort((a,b) => (a.slug||"").localeCompare(b.slug||""));
  if (!q) return rows;
  const needle = q.toLowerCase();
  return rows.filter(t =>
    (t.slug||"").toLowerCase().includes(needle) ||
    (t.brand_name||"").toLowerCase().includes(needle) ||
    (t.email||"").toLowerCase().includes(needle)
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
      <td class="p-3">
        <button class="px-2 py-1 rounded bg-slate-900 text-white text-xs">Edit</button>
      </td>
    `;
    tr.querySelector("button").addEventListener("click", () => openEditor(t, false));
    tbody.appendChild(tr);
  }

  function normHex(v) {
  if (!v) return "";
  let s = v.trim();
  if (s[0] !== "#") s = "#" + s;
  s = s.toUpperCase();
  if (!/^#[0-9A-F]{3}([0-9A-F]{3})?$/.test(s)) return "";
  // expand #ABC to #AABBCC for color input
  if (s.length === 4) s = "#" + [...s.slice(1)].map(c => c + c).join("");
  return s;
}

function tintInput(el, value) {
  const hex = normHex(value);
  el.style.background = hex || "";
  el.style.color = hex ? (luma(hex) > 180 ? "#111827" : "#FFFFFF") : "";
}
function luma(hex) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return 0.2126*r + 0.7152*g + 0.0722*b;
}

/** link a text hex field with a color picker, keep both in sync and tint bg */
function wireColor(textId, pickerId) {
  const t = $(textId), p = $(pickerId);
  // text → picker + tint
  t.addEventListener("input", () => {
    const hex = normHex(t.value);
    if (hex) p.value = hex;
    tintInput(t, hex);
  });
  // picker → text + tint
  p.addEventListener("input", () => {
    const hex = normHex(p.value);
    t.value = hex;
    tintInput(t, hex);
  });
  // initialize on load
  const start = normHex(t.value || p.value);
  if (start) { t.value = start; p.value = start; }
  tintInput(t, start);
}

}

// ---- editor ----------------------------------------------------
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
  setHidden($("edit-modal"), false);

// after setting f-color_* values:
wireColor("f-color_primary", "p-color_primary");
wireColor("f-color_accent", "p-color_accent");
wireColor("f-color_text", "p-color_text");
wireColor("f-color_muted", "p-color_muted");
wireColor("f-color_border", "p-color_border");
wireColor("f-color_button_text", "p-color_button_text");

}

async function saveEdits(e) {
  e.preventDefault();
  const slug = $("f-slug").value.trim();
  if (!slug) { $("save-status").textContent = "Slug is required"; return; }

  const payload = {
    slug, // needed for POST
    brand_name: $("f-brand_name").value.trim() || null,
    status: $("f-status").value.trim() || null,
    logo_path: $("f-logo_path").value.trim() || null,
    favicon_path: $("f-favicon_path").value.trim() || null,
    primary_color: $("f-color_primary").value.trim() || null,   // API maps these
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
    setTimeout(() => setHidden($("edit-modal"), true), 300);
  } catch (e) {
    $("save-status").textContent = "Error: " + (e.message || e);
  }
}

// ---- wire up ---------------------------------------------------
window.addEventListener("DOMContentLoaded", () => {
  $("btn-login").addEventListener("click", doLogin);
  $("btn-logout").addEventListener("click", doLogout);
  $("nav-themes").addEventListener("click", () => setHidden($("view-themes"), false));
  $("btn-close").addEventListener("click", () => setHidden($("edit-modal"), true));
  $("edit-form").addEventListener("submit", saveEdits);

  $("btn-create").addEventListener("click", () => openEditor(null, true));
  $("search").addEventListener("input", (e) => { q = e.target.value; renderThemesTable(); });

  checkAuth();
});
