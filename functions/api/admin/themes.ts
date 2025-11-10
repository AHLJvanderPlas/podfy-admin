// functions/api/admin/themes.ts
//
// WHAT CHANGED (and why):
// - Table is now 'slug_details' (not 'themes').
// - 'logo_path' was renamed to 'logo'; 'favicon_path' and 'email' were removed.
// - Added five 1/0 flags: issue_report, driver_copy, gps_check, mail_notification, multi_file.
// - Kept the original behaviors: admin auth, GET list, POST upsert, PUT update, audit logging.
//
// WHAT THE UI STILL GETS (normalized):
// {
//   slug, brand_name, logo, status,
//   color_primary, color_accent, color_text, color_muted,
//   color_border, color_button_text, header_bg,
//   notes_internal, updated_at,
//   issue_report, driver_copy, gps_check, mail_notification, multi_file
// }
//
// ADDITIONAL NOTES:
// - POST remains an UPSERT (same as your original file) to keep your workflow smooth.
// - PUT updates an existing row by slug.
// - All five flags are coerced to 0/1 on write.
// - Default sorting is slug ascending for stable UI.
//

import { getCookie, verifyJWT } from "../../_utils/auth";

type ThemeRowUI = {
  slug: string | null;
  brand_name: string | null;
  logo: string | null;
  status: string | null;

  color_primary: string | null;
  color_accent: string | null;
  color_text: string | null;
  color_muted: string | null;
  color_border: string | null;
  color_button_text: string | null;
  header_bg: string | null;

  notes_internal: string | null;
  updated_at: string | null;

  issue_report: number | null;      // 1/0
  driver_copy: number | null;       // 1/0
  gps_check: number | null;         // 1/0
  mail_notification: number | null; // 1/0
  multi_file: number | null;        // 1/0
};

async function requireAdmin(env: Env, request: Request) {
  const token = getCookie(request, env.COOKIE_NAME);
  const user = token && (await verifyJWT(token, env.JWT_SECRET).catch(() => null));
  if (!user || user.role !== "admin" || user.is_active === 0) return null;
  return user;
}

/** Map any DB row shape into the UI's expected shape */
function normalize(r: any): ThemeRowUI {
  return {
    // primary keys / identity
    slug: r.slug ?? r.id ?? r.slug_id ?? null,
    brand_name: r.brand_name ?? r.name ?? r.display_name ?? null,

    // media / look & feel
    logo: r.logo ?? r.logo_path ?? null, // supports older dumps if any still exist in caches
    status: r.status ?? null,

    // colors
    color_primary: r.color_primary ?? r.primary_color ?? null,
    color_accent: r.color_accent ?? r.secondary_color ?? null,
    color_text: r.color_text ?? null,
    color_muted: r.color_muted ?? null,
    color_border: r.color_border ?? null,
    color_button_text: r.color_button_text ?? null,
    header_bg: r.header_bg ?? null,

    // misc
    notes_internal: r.notes_internal ?? null,
    updated_at: r.updated_at ?? null,

    // flags (1/0)
    issue_report: to01(r.issue_report),
    driver_copy: to01(r.driver_copy),
    gps_check: to01(r.gps_check),
    mail_notification: to01(r.mail_notification),
    multi_file: to01(r.multi_file),
  };
}

function to01(v: any): 0 | 1 | null {
  if (v === null || v === undefined) return null;
  return Number(v) ? 1 : 0;
}

function bool01(v: any): 0 | 1 {
  return Number(v) ? 1 : 0;
}

/* ---------------------------- GET /api/admin/themes ---------------------------- */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const admin = await requireAdmin(env, request);
    if (!admin) return new Response("Unauthorized", { status: 401 });

    // Select explicit columns from the new table 'slug_details'
    const { results = [] } = await env.DB.prepare(`
      SELECT
        slug, brand_name, logo, status,
        color_primary, color_accent, color_text, color_muted,
        color_border, color_button_text, header_bg,
        notes_internal, updated_at,
        issue_report, driver_copy, gps_check, mail_notification, multi_file
      FROM slug_details
      ORDER BY slug ASC
    `).all();

    const list = (results as any[]).map(normalize);

    return new Response(JSON.stringify(list), {
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
};

/* ------------------------ POST /api/admin/themes (UPSERT) ---------------------- */
/* Preserves original behavior: create OR update on conflict(slug). */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const admin = await requireAdmin(env, request);
    if (!admin) return new Response("Unauthorized", { status: 401 });

    const body = await request.json<any>().catch(() => ({}));

    const slug = String(body.slug || "").trim().toLowerCase();
    if (!slug) return new Response("Slug is required", { status: 400 });
    if (!/^[a-z0-9][a-z0-9-_]*$/.test(slug)) {
      return new Response("Invalid slug. Use lowercase letters, numbers, dashes or underscores.", { status: 400 });
    }

    // Prepare record for write (coerce flags to 1/0)
    const record = {
      slug,
      brand_name: body.brand_name ?? null,
      logo: body.logo ?? null,
      status: body.status ?? null,

      color_primary: body.color_primary ?? null,
      color_accent: body.color_accent ?? null,
      color_text: body.color_text ?? null,
      color_muted: body.color_muted ?? null,
      color_border: body.color_border ?? null,
      color_button_text: body.color_button_text ?? null,
      header_bg: body.header_bg ?? null,

      notes_internal: body.notes_internal ?? null,

      issue_report: bool01(body.issue_report),
      driver_copy: bool01(body.driver_copy),
      gps_check: bool01(body.gps_check),
      mail_notification: bool01(body.mail_notification),
      multi_file: bool01(body.multi_file),
    };

    // Build column list and values for upsert
    const cols = Object.keys(record);
    const vals = Object.values(record);
    const placeholders = cols.map(() => "?").join(", ");

    const setList = cols
      .filter((c) => c !== "slug")
      .map((c) => `${c}=excluded.${c}`)
      .join(", ");

    const sql = `
      INSERT INTO slug_details (${cols.join(", ")})
      VALUES (${placeholders})
      ON CONFLICT(slug) DO UPDATE SET
        ${setList},
        updated_at = CURRENT_TIMESTAMP
    `;

    await env.DB.prepare(sql).bind(...vals).run();

    // Audit trail (upsert)
    await env.DB.prepare(
      `INSERT INTO audit_log (actor_user_id, action, target, payload)
       VALUES (?, 'theme.upsert', ?, ?)`
    ).bind(admin.sub, slug, JSON.stringify(record)).run();

    return new Response(null, { status: 204 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
};

/* ---------------------- PUT /api/admin/themes/:slug (UPDATE) ------------------- */
export const onRequestPut: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    const admin = await requireAdmin(env, request);
    if (!admin) return new Response("Unauthorized", { status: 401 });

    const slug = String(params.slug || "").trim().toLowerCase();
    if (!slug) {
      return new Response(JSON.stringify({ error: "Missing slug parameter" }), {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    const body = await request.json<any>().catch(() => ({}));

    // Coerce flags to 0/1
    const issue_report      = bool01(body.issue_report);
    const driver_copy       = bool01(body.driver_copy);
    const gps_check         = bool01(body.gps_check);
    const mail_notification = bool01(body.mail_notification);
    const multi_file        = bool01(body.multi_file);

    // Perform update
    await env.DB.prepare(`
      UPDATE slug_details SET
        brand_name = ?,
        logo = ?,
        status = ?,
        color_primary = ?,
        color_accent = ?,
        color_text = ?,
        color_muted = ?,
        color_border = ?,
        color_button_text = ?,
        header_bg = ?,
        notes_internal = ?,
        issue_report = ?,
        driver_copy = ?,
        gps_check = ?,
        mail_notification = ?,
        multi_file = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE slug = ?
    `).bind(
      body.brand_name ?? null,
      body.logo ?? null,
      body.status ?? null,
      body.color_primary ?? null,
      body.color_accent ?? null,
      body.color_text ?? null,
      body.color_muted ?? null,
      body.color_border ?? null,
      body.color_button_text ?? null,
      body.header_bg ?? null,
      body.notes_internal ?? null,
      issue_report,
      driver_copy,
      gps_check,
      mail_notification,
      multi_file,
      slug
    ).run();

    // Audit trail (explicit update)
    await env.DB.prepare(
      `INSERT INTO audit_log (actor_user_id, action, target, payload)
       VALUES (?, 'theme.update', ?, ?)`
    ).bind(admin.sub, slug, JSON.stringify(body)).run();

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
};
