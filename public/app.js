// ---------- tiny logger ----------
const LOG = (...a) => console.log("[admin]", ...a);

// ---------- generic helpers ----------
async function api(path, init) {
  const res = await fetch(path, {
    credentials: "include",
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) throw new Error((await res.text().catch(() => "")) || `HTTP ${res.status}`);
  return res.status === 204 ? null : res.json();
}
const $ = (id) => document.getElementById(id);
const hide = (el, v) => el.classList[v ? "add" : "remove"]("hidden");

// ---------- color helpers ----------
function normHex(v) {
  if (!v) return "";
  let s = v.trim(); if (s[0] !== "#") s = "#" + s; s = s.toUpperCase();
  if (!/^#[0-9A-F]{3}([0-9A-F]{3})?$/.test(s)) return "";
  if (s.length === 4) s = "#" + [...s.slice(1)].map((c) => c + c).join("");
  return s;
}
function luma(hex) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return 0.2126*r + 0.7152*g + 0.0722*b;
}
function tintInput(el, value) {
  const hex = normHex(value);
  el.value = hex || el.value;
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

// ---------- recipients + branding ----------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const MAX_PER_LIST = 25;
const parseEmails = (s) => (!s ? [] : String(s).split(/[\s,;]+/).map((v)=>v.trim()).filter(Boolean));
function validateList(arr) {
  if (arr.length > MAX_PER_LIST) return `Max ${MAX_PER_LIST} addresses`;
  for (const e of arr) if (!EMAIL_RE.test(e)) return `Invalid email: ${e}`;
  return "";
}
function setBrandingLogo(url) {
  const img = $("branding-logo-preview");
  const code = $("branding-logo-url");
  if (!img || !code) return;
  code.textContent = url || "(none)";
  if (url) { img.style.display = ""; img.src = url; } else { img.style.display = "none"; img.removeAttribute("src"); }
}
function setHeaderLogo(url) {
  const img = $("brand-header-logo");
  if (!img) return;
  if (url && url.trim()) { img.src = url; img.style.display = ""; }
  else { img.style.display = "none"; img.removeAttribute("src"); }
}

// ---------- state ----------
let themes = [];
let isNew = false;
let current = null;
let q = "";
const settingsCache = new Map(); // slug -> {to,cc,bcc}
let auditType = "admin";
let auditQ = "";
let auditCursor = null;
let auditLoading = false;

// ---------- auth ----------
async function checkAuth() {
  try {
    await api("/api/admin/me");
    hide($("view-login"), true);
    $("nav-themes").classList.remove("hidden");
    $("nav-audit").classList.remove("hidden");
    $("btn-logout").classList.remove("hidden");
    showView("themes");
    await loadThemes();
  } catch {
    hide($("view-login"), false);
    $("nav-themes").classList.add("hidden");
    $("nav-audit").classList.add("hidden");
    $("btn-logout").classList.add("hidden");
    hide($("view-themes"), true);
    hide($("view-audit"), true);
  }
}
async function doLogin() {
  $("login-error").classList.add("hidden");
  const btn = $("btn-login");
  const email = $("login-email").value.trim();
  if (!email) return;
  btn.disabled = true;
  try {
    await api("/api/admin/login", { method: "POST", body: JSON.stringify({ email }) });
    await checkAuth();
  } catch (e) {
    $("login-error").textContent = String(e.message || e);
    $("login-error").classList.remove("hidden");
  } finally {
    btn.disabled = false;
  }
}
async function doLogout() {
  try {
    await fetch("/api/admin/logout", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } finally {
    // hard reload + cache bust
    location.replace(`/?t=${Date.now()}`);
  }
}

// ---------- simple view switch ----------
function showView(which) {
  hide($("view-themes"), which !== "themes");
  hide($("view-audit"),  which !== "audit");
}

// ---------- THEMES: data & UI ----------
async function loadThemes() {
  themes = await api("/api/admin/themes");
  renderThemesTable();
}
function filteredSorted() {
  let rows = [...themes].sort((a, b) => (a.slug || "").localeCompare(b.slug || ""));
  if (!q) return rows;
  const n = q.toLowerCase();
  return rows.filter((t) =>
    (t.slug || "").toLowerCase().includes(n) || (t.brand_name || "").toLowerCase().includes(n)
  );
}
async function getRecipCounts(slug) {
  if (settingsCache.has(slug)) return settingsCache.get(slug);
  try {
    const s = await fetch(`/api/v1/slugs/${encodeURIComponent(slug)}/settings`, { credentials: "include" }).then((r)=>r.json());
    const rec = s?.email_recipients || { to: [], cc: [], bcc: [] };
    const val = { to: rec.to.length|0, cc: rec.cc.length|0, bcc: rec.bcc.length|0 };
    settingsCache.set(slug, val);
    return val;
  } catch {
    return { to: 0, cc: 0, bcc: 0 };
  }
}
function flagPills(t) {
  const on = (v) => (v === 1 || v === "1" || v === true);
  const flags = [
    ["GPS", on(t.gps_check)],
    ["Driver", on(t.driver_copy)],
    ["Issue", on(t.issue_report)],
    ["Mail", on(t.mail_notification)],
    ["Multi", on(t.multi_file)],
  ];
  return flags.map(([k, v]) =>
    `<span class="pill">${k}<strong>${v ? "✓" : "—"}</strong></span>`
  ).join(" ");
}
function renderThemesTable() {
  const tbody = $("themes-tbody");
  tbody.innerHTML = "";
  const rows = filteredSorted();
  $("theme-count").textContent = `${rows.length} theme${rows.length === 1 ? "" : "s"}`;
  for (const t of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="font-mono text-xs">${t.slug ?? "—"}</td>
      <td>${t.brand_name ?? "—"}</td>
      <td><span class="pill" style="background:#f1f5f9"><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${t.color_primary || "#fff"}"></span><code>${t.color_primary || "—"}</code></span></td>
      <td><span class="pill" style="background:#f1f5f9"><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${t.color_accent || "#fff"}"></span><code>${t.color_accent || "—"}</code></span></td>
      <td class="recip"><span class="muted">…</span></td>
      <td>${flagPills(t)}</td>
      <td><button class="btn small">Edit</button></td>
    `;
    tbody.appendChild(tr);

    tr.querySelector("button").addEventListener("click", () => openEditor(t, false));

    // recipients count async
    const pillTd = tr.querySelector(".recip");
    getRecipCounts(t.slug).then(({ to, cc, bcc }) => {
      pillTd.innerHTML = `<span class="pill"><span class="font-mono">${to}</span> to, <span class="font-mono">${cc}</span> cc, <span class="font-mono">${bcc}</span> bcc</span>`;
    });
  }
}

// ---------- THEMES: editor ----------
function setBool(id, v) { $(id).checked = v === 1 || v === "1" || v === true; }
function getBool(id) { return $(id).checked ? 1 : 0; }

function openEditor(t, creating) {
  current = t || {};
  isNew = !!creating;

  setHeaderLogo(null);
  $("edit-title").textContent = creating ? "Create theme" : current.brand_name || current.slug || "";
  $("f-slug").value = current.slug || "";
  $("f-slug").disabled = !creating;

  $("f-brand_name").value = current.brand_name || "";
  $("f-status").value = current.status || "";

  $("f-color_primary").value = current.color_primary || "";
  $("f-color_accent").value = current.color_accent || "";
  $("f-color_text").value = current.color_text || "";
  $("f-color_muted").value = current.color_muted || "";
  $("f-color_border").value = current.color_border || "";
  $("f-color_button_text").value = current.color_button_text || "";
  $("f-header_bg").value = current.header_bg || "";
  $("f-notes_internal").value = current.notes_internal || "";

  setBool("f-gps_check", current.gps_check);
  setBool("f-driver_copy", current.driver_copy);
  setBool("f-issue_report", current.issue_report);
  setBool("f-mail_notification", current.mail_notification);
  setBool("f-multi_file", current.multi_file);

  wireColor("f-color_primary", "p-color_primary");
  wireColor("f-color_accent", "p-color_accent");
  wireColor("f-color_text", "p-color_text");
  wireColor("f-color_muted", "p-color_muted");
  wireColor("f-color_border", "p-color_border");
  wireColor("f-color_button_text", "p-color_button_text");

  // Load recipients + branding logo from /settings
  (async () => {
    const slug = $("f-slug").value.trim();
    if (!slug) return;
    try {
      const s = await fetch(`/api/v1/slugs/${encodeURIComponent(slug)}/settings`, { credentials: "include" }).then((r)=>r.json());
      const rec = s?.email_recipients || { to: [], cc: [], bcc: [] };
      $("f-recip-to").value  = rec.to.join(", ");
      $("f-recip-cc").value  = rec.cc.join(", ");
      $("f-recip-bcc").value = rec.bcc.join(", ");

      const logoUrl = s?.branding?.logo_url ?? null;
      setBrandingLogo(logoUrl);
      setHeaderLogo(logoUrl);
    } catch (e) {
      console.warn("Load settings failed", e);
      setBrandingLogo(null); setHeaderLogo(null);
    }
  })();

  hide($("edit-modal"), false);
}

async function saveEdits(e) {
  e.preventDefault();
  const slug = $("f-slug").value.trim();
  if (!slug) { $("save-status").textContent = "Slug is required"; return; }

  const themePayload = {
    slug,
    brand_name: $("f-brand_name").value.trim() || null,
    status: $("f-status").value.trim() || null,
    color_primary: $("f-color_primary").value.trim() || null,
    color_accent: $("f-color_accent").value.trim() || null,
    color_text: $("f-color_text").value.trim() || null,
    color_muted: $("f-color_muted").value.trim() || null,
    color_border: $("f-color_border").value.trim() || null,
    color_button_text: $("f-color_button_text").value.trim() || null,
    header_bg: $("f-header_bg").value.trim() || null,
    notes_internal: $("f-notes_internal").value.trim() || null,

    // NEW flags
    gps_check: getBool("f-gps_check"),
    driver_copy: getBool("f-driver_copy"),
    issue_report: getBool("f-issue_report"),
    mail_notification: getBool("f-mail_notification"),
    multi_file: getBool("f-multi_file"),
  };

  $("save-status").textContent = "Saving…";
  try {
    if (isNew) await api(`/api/admin/themes`, { method: "POST", body: JSON.stringify(themePayload) });
    else await api(`/api/admin/themes/${encodeURIComponent(slug)}`, { method: "PUT", body: JSON.stringify(themePayload) });
  } catch (e) {
    console.error(e);
    $("save-status").textContent = "Error saving theme";
    return;
  }

  // Recipients PATCH
  const to = parseEmails($("f-recip-to").value);
  const cc = parseEmails($("f-recip-cc").value);
  const bcc = parseEmails($("f-recip-bcc").value);
  const vTo = validateList(to), vCc = validateList(cc), vBcc = validateList(bcc);
  let hasErr = false;
  [["err-to", vTo], ["err-cc", vCc], ["err-bcc", vBcc]].forEach(([id,msg]) => {
    const el = $(id); el.textContent = msg; el.classList[msg ? "remove" : "add"]("hidden"); if (msg) hasErr = true;
  });
  if (to.length === 0) { const el = $("err-to"); el.textContent = "At least one TO recipient is required"; el.classList.remove("hidden"); hasErr = true; }
  if (hasErr) { $("save-status").textContent = "Fix recipients before saving"; return; }

  try {
    await fetch(`/api/v1/slugs/${encodeURIComponent(slug)}/settings`, {
      method: "PATCH", credentials: "include", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email_recipients: { to, cc, bcc } }),
    }).then(async (r)=>{ if(!r.ok) throw new Error(await r.text()); });
    settingsCache.set(slug, { to: to.length, cc: cc.length, bcc: bcc.length });
  } catch (e) {
    console.error(e); $("save-status").textContent = "Error saving recipients"; return;
  }

  $("save-status").textContent = "Saved ✓";
  await loadThemes();
  setTimeout(()=> hide($("edit-modal"), true), 250);
}

// Test send
async function testSend() {
  const slug = $("f-slug").value.trim();
  if (!slug) return;
  const to = parseEmails($("f-recip-to").value);
  const cc = parseEmails($("f-recip-cc").value);
  const bcc = parseEmails($("f-recip-bcc").value);
  const vTo = validateList(to), vCc = validateList(cc), vBcc = validateList(bcc);
  let hasErr = false;
  [["err-to", vTo], ["err-cc", vCc], ["err-bcc", vBcc]].forEach(([id,msg]) => {
    const el = $(id); el.textContent = msg; el.classList[msg ? "remove" : "add"]("hidden"); if (msg) hasErr = true;
  });
  if (to.length === 0) { const el = $("err-to"); el.textContent = "At least one TO recipient is required"; el.classList.remove("hidden"); hasErr = true; }
  if (hasErr) { $("save-status").textContent = "Fix recipients before testing"; return; }
  $("save-status").textContent = "Sending test…";
  try {
    const res = await fetch("/api/admin/test-send", {
      method: "POST", credentials: "include", headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug, email_recipients: { to, cc, bcc } }),
    }).then((r)=>r.json());
    $("save-status").textContent = res?.ok
      ? `Test recorded ✓ (${res.counts.to} to, ${res.counts.cc} cc, ${res.counts.bcc} bcc)`
      : (res?.error || "Test send failed");
  } catch (e) { console.error(e); $("save-status").textContent = "Test send failed"; }
  finally { setTimeout(()=>{ $("save-status").textContent = ""; }, 2000); }
}

// Branding logo refresh from /settings?refreshLogo=1
async function refreshLogo() {
  const slug = $("f-slug").value.trim();
  if (!slug) return;
  $("save-status").textContent = "Refreshing logo…";
  try {
    const s = await fetch(`/api/v1/slugs/${encodeURIComponent(slug)}/settings?refreshLogo=1`, { credentials: "include" }).then((r)=>r.json());
    const logoUrl = s?.branding?.logo_url ?? null;
    setBrandingLogo(logoUrl);
    setHeaderLogo(logoUrl);
    $("save-status").textContent = "Logo refreshed ✓";
    setTimeout(()=>{ $("save-status").textContent = ""; }, 1200);
  } catch (e) { console.error(e); $("save-status").textContent = "Failed to refresh logo"; }
}

// ---------- AUDIT ----------
async function fetchAudit({ append = false } = {}) {
  if (auditLoading) return;
  auditLoading = true;
  $("audit-status").textContent = "Loading…";
  try {
    const params = new URLSearchParams();
    params.set("type", auditType);
    if (auditQ) params.set("q", auditQ);
    if (auditCursor) params.set("cursor", String(auditCursor));
    params.set("limit", "50");
    const data = await api(`/api/admin/audit?${params.toString()}`);
    const items = data.items || [];
    auditCursor = data.nextCursor || null;

    const tbody = $("audit-tbody");
    if (!append) tbody.innerHTML = "";

    for (const r of items) {
      const tr = document.createElement("tr");
      tr.className = "align-top";
      const payloadPreview = (r.payload && r.payload.length > 140) ? r.payload.slice(0, 140) + "…" : (r.payload || "");
      tr.innerHTML = `
        <td class="muted">${r.created_at ?? ""}</td>
        <td>${r.actor_email ?? r.actor_user_id ?? "—"}</td>
        <td><strong>${r.action ?? "—"}</strong></td>
        <td>${r.target ?? "—"}</td>
        <td><code style="font-size:12px;">${payloadPreview}</code></td>
      `;
      tbody.appendChild(tr);
    }
    $("audit-status").textContent = `Newest first • ${append ? "appended" : "loaded"} ${items.length} rows` + (auditCursor ? " • more available" : "");
    $("audit-more").disabled = !auditCursor;
  } catch (e) {
    console.error(e); $("audit-status").textContent = "Error loading audit";
  } finally { auditLoading = false; }
}

// ---------- bootstrap ----------
window.addEventListener("DOMContentLoaded", () => {
  // Auth
  $("btn-login").addEventListener("click", doLogin);
  $("login-email").addEventListener("keydown", (ev) => { if (ev.key === "Enter") doLogin(); });
  $("btn-logout").addEventListener("click", doLogout);

  // Nav
  $("nav-themes").addEventListener("click", async () => { showView("themes"); await loadThemes(); });
  $("nav-audit").addEventListener("click", async () => { showView("audit"); auditCursor = null; await fetchAudit({ append: false }); });

  // Themes controls
  $("btn-close").addEventListener("click", () => hide($("edit-modal"), true));
  $("edit-form").addEventListener("submit", saveEdits);
  $("btn-create").addEventListener("click", () => openEditor(null, true));
  $("search").addEventListener("input", (e) => { q = e.target.value; renderThemesTable(); });
  $("btn-test-send")?.addEventListener("click", testSend);
  $("btn-refresh-logo")?.addEventListener("click", refreshLogo);

  // Audit controls
  $("audit-type-admin").addEventListener("click", () => {
    auditType = "admin";
    $("audit-type-admin").className = "btn small";
    $("audit-type-user").className  = "btn small alt";
    auditCursor = null; fetchAudit({ append: false });
  });
  $("audit-type-user").addEventListener("click", () => {
    auditType = "user";
    $("audit-type-user").className  = "btn small";
    $("audit-type-admin").className = "btn small alt";
    auditCursor = null; fetchAudit({ append: false });
  });
  let auditSearchTimer = null;
  $("audit-search").addEventListener("input", (e) => {
    auditQ = e.target.value.trim();
    clearTimeout(auditSearchTimer);
    auditSearchTimer = setTimeout(() => { auditCursor = null; fetchAudit({ append: false }); }, 250);
  });
  $("audit-more").addEventListener("click", () => { if (auditCursor) fetchAudit({ append: true }); });

  checkAuth();
});
