// functions/api/v1/slugs/[slug]/settings.ts
import { getCookie, verifyJWT } from "../../../../_utils/auth";

type Recipients = { to: string[]; cc: string[]; bcc: string[] };
type Branding   = { logo_url: string | null };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const MAX_PER_LIST = 25;

/* ----------------------- helpers ----------------------- */
function normalizeList(list: any): string[] {
  if (!Array.isArray(list)) return [];
  return list.map((v) => String(v || "").trim()).filter(Boolean);
}
function validateRecipients(r: any): Recipients {
  const out: Recipients = {
    to: normalizeList(r?.to),
    cc: normalizeList(r?.cc),
    bcc: normalizeList(r?.bcc),
  };
  for (const key of ["to", "cc", "bcc"] as const) {
    const arr = out[key];
    if (arr.length > MAX_PER_LIST) throw new Error(`${key.toUpperCase()} exceeds ${MAX_PER_LIST} addresses`);
    for (const e of arr) if (!EMAIL_RE.test(e)) throw new Error(`Invalid email in ${key}: ${e}`);
  }
  return out;
}
async function requireAdmin(env: Env, request: Request) {
  const token = getCookie(request, env.COOKIE_NAME);
  const user  = token && (await verifyJWT(token, env.JWT_SECRET));
  if (!user || user.role !== "admin" || user.is_active === 0) return null;
  return user;
}
function okJson(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none';",
    },
  });
}

/** Deterministic logo path from the Podfy app */
async function fetchLogoUrl(env: Env, slug: string): Promise<string | null> {
  const base = (env as any).PODFY_PUBLIC_BASE || "https://podfy.app";
  return `${base}/logos/${encodeURIComponent(slug)}.svg`;
}

/* ----------------------- GET /settings ----------------------- */
export const onRequestGet: PagesFunction<Env> = async ({ env, request, params }) => {
  try {
    const admin = await requireAdmin(env, request);
    if (!admin) return new Response("Unauthorized", { status: 401 });

    const url = new URL(request.url);
    const refreshLogo = url.searchParams.get("refreshLogo") === "1";

    const slug = String(params.slug || "").trim();
    if (!slug) return new Response("Bad Request", { status: 400 });

    // Load current settings or initialize
    let row = await env.DB.prepare(
      "SELECT email_recipients, branding, updated_at FROM slug_settings WHERE slug=?"
    ).bind(slug).first<any>();

    if (!row) {
      // Seed recipients from legacy themes.email if present
      const legacy = await env.DB.prepare("SELECT email FROM themes WHERE slug=?")
        .bind(slug).first<{ email: string | null }>();
      const legacyEmail = (legacy?.email || "").trim();

      const initialRecipients: Recipients = { to: legacyEmail ? [legacyEmail] : [], cc: [], bcc: [] };
      const branding: Branding = { logo_url: null };

      await env.DB.prepare(
        "INSERT INTO slug_settings(slug, email_recipients, branding) VALUES (?,?,?)"
      ).bind(slug, JSON.stringify(initialRecipients), JSON.stringify(branding)).run();

      row = {
        email_recipients: JSON.stringify(initialRecipients),
        branding: JSON.stringify(branding),
        updated_at: new Date().toISOString(),
      };
    }

    // Parse saved values
    let recipients: Recipients = { to: [], cc: [], bcc: [] };
    try { recipients = JSON.parse(row.email_recipients || "{}"); } catch {}

    let branding: Branding = { logo_url: null };
    try { branding = JSON.parse(row.branding || "{}"); } catch {}

    // Refresh or set missing logo_url deterministically
    if (refreshLogo || branding.logo_url == null || branding.logo_url === "") {
      const discovered = await fetchLogoUrl(env, slug).catch(() => null);
      if (discovered && discovered !== branding.logo_url) {
        branding.logo_url = discovered;
        await env.DB.prepare(
          "UPDATE slug_settings SET branding=?, updated_at=CURRENT_TIMESTAMP WHERE slug=?"
        ).bind(JSON.stringify(branding), slug).run();
      }
    }

    // Ensure recipients arrays
    const safeRecipients: Recipients = {
      to: Array.isArray(recipients.to) ? recipients.to : [],
      cc: Array.isArray(recipients.cc) ? recipients.cc : [],
      bcc: Array.isArray(recipients.bcc) ? recipients.bcc : [],
    };

    return okJson({
      email_recipients: safeRecipients,
      branding: { logo_url: branding.logo_url ?? null },
      updated_at: row.updated_at,
    });
  } catch (e: any) {
    return okJson({ error: String(e) }, 500);
  }
};

/* ----------------------- PATCH /settings ----------------------- */
export const onRequestPatch: PagesFunction<Env> = async ({ env, request, params }) => {
  try {
    const admin = await requireAdmin(env, request);
    if (!admin) return new Response("Unauthorized", { status: 401 });

    const slug = String(params.slug || "").trim();
    if (!slug) return new Response("Bad Request", { status: 400 });

    // Simple in-memory rate limit (best-effort)
    const ip = (request.headers.get("cf-connecting-ip") || "ip") + ":patch-settings";
    (globalThis as any).__rate = (globalThis as any).__rate || new Map<string, { t: number; n: number }>();
    const bucket = (globalThis as any).__rate as Map<string, { t: number; n: number }>;
    const now = Date.now(), win = 10_000;
    const entry = bucket.get(ip) || { t: now, n: 0 };
    if (now - entry.t > win) { entry.t = now; entry.n = 0; }
    entry.n++; bucket.set(ip, entry);
    if (entry.n > 20) return new Response("Rate limit", { status: 429 });

    const body = await request.json<any>().catch(() => ({}));

    let recipients: Recipients | undefined;
    if (body.email_recipients !== undefined) recipients = validateRecipients(body.email_recipients);

    let branding: Branding | undefined;
    if (body.branding !== undefined) {
      const logo = body.branding?.logo_url;
      branding = { logo_url: logo === null || typeof logo === "string" ? (logo?.trim?.() ?? null) : null };
    }

    const exists = await env.DB.prepare("SELECT 1 FROM slug_settings WHERE slug=?")
      .bind(slug).first<any>();

    if (!exists) {
      await env.DB.prepare(
        "INSERT INTO slug_settings(slug, email_recipients, branding) VALUES (?,?,?)"
      ).bind(
        slug,
        JSON.stringify(recipients ?? { to: [], cc: [], bcc: [] }),
        JSON.stringify(branding ?? { logo_url: null })
      ).run();
    } else {
      const sets: string[] = [];
      const values: any[]  = [];
      if (recipients !== undefined) { sets.push("email_recipients=?"); values.push(JSON.stringify(recipients)); }
      if (branding   !== undefined) { sets.push("branding=?");         values.push(JSON.stringify(branding));   }
      if (sets.length > 0) {
        const sql = `UPDATE slug_settings SET ${sets.join(", ")}, updated_at=CURRENT_TIMESTAMP WHERE slug=?`;
        values.push(slug);
        await env.DB.prepare(sql).bind(...values).run();
      }
    }

    // Audit log
    await env.DB.prepare(
      `INSERT INTO audit_log (actor_user_id, action, target, payload)
       VALUES (?, 'slug_settings.update', ?, ?)`
    ).bind(admin.sub, slug, JSON.stringify({ recipients, branding })).run();

    return okJson({ updated: true });
  } catch (e: any) {
    return okJson({ error: String(e) }, 500);
  }
};
