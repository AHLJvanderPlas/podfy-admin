// functions/api/v1/slugs/[slug]/settings.ts
import { getCookie, verifyJWT } from "../../../../_utils/auth";

type Recipients = { to: string[]; cc: string[]; bcc: string[] };
type Branding = { logo_url: string | null };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const MAX_PER_LIST = 25;

function normalizeList(list: any): string[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((v) => String(v || "").trim())
    .filter((v) => v.length > 0);
}

function validateRecipients(r: any): Recipients {
  const out: Recipients = {
    to: normalizeList(r?.to),
    cc: normalizeList(r?.cc),
    bcc: normalizeList(r?.bcc),
  };
  for (const k of ["to", "cc", "bcc"] as const) {
    const arr = out[k];
    if (arr.length > MAX_PER_LIST) {
      throw new Error(`${k.toUpperCase()} exceeds ${MAX_PER_LIST} addresses`);
    }
    for (const e of arr) {
      if (!EMAIL_RE.test(e)) throw new Error(`Invalid email in ${k}: ${e}`);
    }
  }
  return out;
}

async function requireAdmin(env: Env, request: Request) {
  const token = getCookie(request, env.COOKIE_NAME);
  const user = token && (await verifyJWT(token, env.JWT_SECRET));
  if (!user || user.role !== "admin" || user.is_active === 0) return null;
  return user;
}

function okJson(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      // Minimal CSP for API responses
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none';",
    },
  });
}

export const onRequestGet: PagesFunction<Env> = async ({ env, request, params }) => {
  try {
    const admin = await requireAdmin(env, request);
    if (!admin) return new Response("Unauthorized", { status: 401 });

    const slug = String(params.slug || "").trim();
    if (!slug) return new Response("Bad Request", { status: 400 });

    // Try to find settings
    let row = await env.DB.prepare(
      "SELECT email_recipients, branding, updated_at FROM slug_settings WHERE slug=?"
    ).bind(slug).first<any>();

    // If missing, init an empty structure and (optionally) pull legacy themes.email as To
    if (!row) {
      // pull legacy email if present
      const legacy = await env.DB.prepare("SELECT email FROM themes WHERE slug=?")
        .bind(slug).first<{ email: string | null }>();
      const legacyEmail = (legacy?.email || "").trim();
      const initial: Recipients = {
        to: legacyEmail ? [legacyEmail] : [],
        cc: [],
        bcc: [],
      };
      const branding: Branding = { logo_url: null };

      await env.DB.prepare(
        "INSERT INTO slug_settings(slug, email_recipients, branding) VALUES (?,?,?)"
      )
        .bind(slug, JSON.stringify(initial), JSON.stringify(branding))
        .run();

      row = {
        email_recipients: JSON.stringify(initial),
        branding: JSON.stringify(branding),
        updated_at: new Date().toISOString(),
      };
    }

    const recipients: Recipients = (() => {
      try { return JSON.parse(row.email_recipients || "{}"); } catch { return { to:[], cc:[], bcc:[] }; }
    })();
    const branding: Branding = (() => {
      try { return JSON.parse(row.branding || "{}"); } catch { return { logo_url: null }; }
    })();

    // Ensure shape
    const safe: Recipients = {
      to: Array.isArray(recipients.to) ? recipients.to : [],
      cc: Array.isArray(recipients.cc) ? recipients.cc : [],
      bcc: Array.isArray(recipients.bcc) ? recipients.bcc : [],
    };

    return okJson({
      email_recipients: safe,
      branding: { logo_url: branding.logo_url ?? null },
      updated_at: row.updated_at,
    });
  } catch (e: any) {
    return okJson({ error: String(e) }, 500);
  }
};

export const onRequestPatch: PagesFunction<Env> = async ({ env, request, params, cf }) => {
  try {
    const admin = await requireAdmin(env, request);
    if (!admin) return new Response("Unauthorized", { status: 401 });

    const slug = String(params.slug || "").trim();
    if (!slug) return new Response("Bad Request", { status: 400 });

    // Simple per-IP rate-limit (best-effort, in-process)
    const ip = (request.headers.get("cf-connecting-ip") || "ip") + ":patch-settings";
    (globalThis as any).__rate = (globalThis as any).__rate || new Map<string, { t: number; n: number }>();
    const bucket = (globalThis as any).__rate as Map<string, { t: number; n: number }>;
    const now = Date.now();
    const winMs = 10_000; // 10s window
    const entry = bucket.get(ip) || { t: now, n: 0 };
    if (now - entry.t > winMs) { entry.t = now; entry.n = 0; }
    entry.n++;
    bucket.set(ip, entry);
    if (entry.n > 20) return new Response("Rate limit", { status: 429 });

    const body = await request.json<any>().catch(() => ({}));

    let recipients: Recipients | undefined;
    if (body.email_recipients !== undefined) {
      recipients = validateRecipients(body.email_recipients);
    }

    let branding: Branding | undefined;
    if (body.branding !== undefined) {
      const logo = body.branding?.logo_url;
      branding = { logo_url: logo === null || typeof logo === "string" ? logo : null };
    }

    // Upsert
    const existing = await env.DB.prepare("SELECT 1 FROM slug_settings WHERE slug=?")
      .bind(slug).first<any>();

    if (!existing) {
      await env.DB.prepare(
        "INSERT INTO slug_settings(slug, email_recipients, branding) VALUES (?,?,?)"
      ).bind(
        slug,
        JSON.stringify(recipients ?? { to: [], cc: [], bcc: [] }),
        JSON.stringify(branding ?? { logo_url: null })
      ).run();
    } else {
      // Build dynamic update
      const sets: string[] = [];
      const values: any[] = [];
      if (recipients !== undefined) {
        sets.push("email_recipients=?");
        values.push(JSON.stringify(recipients));
      }
      if (branding !== undefined) {
        sets.push("branding=?");
        values.push(JSON.stringify(branding));
      }
      if (sets.length === 0) return okJson({ updated: false });
      const sql = `UPDATE slug_settings SET ${sets.join(", ")}, updated_at=CURRENT_TIMESTAMP WHERE slug=?`;
      values.push(slug);
      await env.DB.prepare(sql).bind(...values).run();
    }

    // Audit log
    await env.DB.prepare(`
      INSERT INTO audit_log (actor_user_id, action, target, payload)
      VALUES (?, 'slug_settings.update', ?, ?)
    `).bind(admin.sub, slug, JSON.stringify({ recipients, branding })).run();

    return okJson({ updated: true });
  } catch (e: any) {
    return okJson({ error: String(e) }, 500);
  }
};
