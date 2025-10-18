// ---- helpers ---------------------------------------------------
async function api(path, init) {
  const res = await fetch(path, {
    credentials: "include",
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init && init.headers ? init.headers : {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

function $(id) { return document.getElementById(id); }

function setHidden(el, hide) { el.classList[hide ? "add" : "remove"]("hidden"); }

// ---- state -----------------------------------------------------
let themes = [];
let current = null; // currently edited theme row

// ---- login flow -----------------------------------------------
async function checkAuth() {
  try {
    await api("/api/admin/me");
    // authed
    setHidden($("view-login"), true);
    $("nav-themes").classList.remove("hidden");
    $("btn-logout").classList.remove("hidden");
    setHidden($("view-themes"), false);
    await loadThemes();
  } catch {
    // not authed
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
  try {
    await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    await checkAuth();
  } catch (e) {
    $("login-error").textContent = String(e.message || e);
    $("login-error").classList.remove("hidden");
  }
}

function doLogout() {
  // Drop the cookie by overwriting with Max-Age=0.
  // (We don't have a /logout endpoint; this is enough for this UI.)
  const cookieName = "sida";
  document.cookie = `${cookieName}=; Max-Age=0; Path=/; SameSite=Strict; Secure;`;
  location.reload();
}

// ---- themes listing -------------------------------------------
async function loadThemes() {
  const list = await api("/api/admin/themes");
  themes = list;
  $("theme-count").textContent = `${themes.length} theme${themes.length===1?"":"s"}`;
  renderThemesTable();
}

function renderThemesTable() {
  const tbody = $("themes-tbody");
  tbody.innerHTML = "";
  for (const t of themes) {
    const tr = document.createElement("tr");
    tr.className = "border-t";
    tr.innerHTML = `
      <td class="p-3 font-mono text-xs">${t.slug}</td>
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
    tr.querySelector("button").addEventListener("click", () => openEditor(t));
    tbody.appendChild(tr);
  }
}

// ---- edit modal ------------------------------------------------
function openEditor(t) {
  current = t;
  $("edit-title").textContent = t.brand_name || t.slug;
  $("f-slug").value = t.slug;
  $("f-brand_name").value = t.brand_name || "";
  $("f-status").value = t.status || "";
  $("f-logo_path").value = t.logo_path || "";
  $("f-favicon_path").value = t.favicon_path || "";
  $("f-color_primary").value = t.color_primary || "";
  $("f-color_accent").value = t.color_accent || "";
  $("f-color_text").value = t.color_text || "";
  $("f-color_muted").value = t.color_muted || "";
  $("f-color_border").value = t.color_border || "";
  $("f-color_button_text").value = t.color_button_text || "";
  $("f-header_bg").value = t.header_bg || "";
  $("f-email").value = t.email || "";
  $("f-notes_internal").value = t.notes_internal || "";
  $("save-status").textContent = "";
  setHidden($("edit-modal"), false);
}

async function saveEdits(e) {
  e.preventDefault();
  if (!current) return;

  const payload = {
    brand_name: $("f-brand_name").value.trim() || null,
    status: $("f-status").value.trim() || null,
    logo_path: $("f-logo_path").value.trim() || null,
    favicon_path: $("f-favicon_path").value.trim() || null,
    // Accept both our old keys and your table keys (the API maps these)
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
    await api(`/api/admin/themes/${encodeURIComponent(current.slug)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    $("save-status").textContent = "Saved ✓";
    await loadThemes(); // refresh list
    setTimeout(() => setHidden($("edit-modal"), true), 400);
  } catch (e) {
    $("save-status").textContent = "Error: " + (e.message || e);
  }
}

// ---- wire up ---------------------------------------------------
window.addEventListener("DOMContentLoaded", () => {
  $("btn-login").addEventListener("click", doLogin);
  $("btn-logout").addEventListener("click", doLogout);
  $("nav-themes").addEventListener("click", () => {
    setHidden($("view-themes"), false);
  });
  $("btn-close").addEventListener("click", () => setHidden($("edit-modal"), true));
  $("edit-form").addEventListener("submit", saveEdits);

  checkAuth();
});
