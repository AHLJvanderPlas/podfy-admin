// Admin: GET + PUT /api/admin/themes/:slug
// Provides single-theme read and update for the admin portal.
// Updated for renamed table (slug_details) and integer flag columns.

import { getCookie, verifyJWT } from "../../../_utils/auth";

type AdminUser = {
  sub: string;
  role: string;
  is_active: number;
};

async function requireAdmin(env: Env, request: Request): Promise<AdminUser | null> {
  const token = getCookie(request, env.COOKIE_NAME);
  const user = token && (await verifyJWT(token, env.JWT_SECRET));
  if (!user || user.role !== "admin" || user.is_active === 0) return null;
  return user as AdminUser;
}

// Columns that can be updated
const ALLOWED_COLS = new Set<string>([
  "brand_name",
  "logo",
  "status",
  "color_primary",
  "color_accent",
  "color_text",
  "color_muted",
  "color_border",
  "color_button_text",
  "header_bg",
  "notes_internal",
  "issue_report",
  "driver_copy",
  "gps_check",
  "mail_notification",
  "multi_file",
]);

function sanitizeForUpdate(body: any): Record<string, any> {
  const candidate: Record<string, any> = {
    brand_name: body.brand_name ?? body.name,
    logo: body.logo ?? body.logo_path,
    status: body.status,

    color_primary: body.color_primary ?? body.primary_color,
    color_accent: body.color_accent ?? body.secondary_color,
    color_text: body.color_text,
    color_muted: body.color_muted,
    color_border: body.color_border,
    color_button_text: body.color_button_text,
    header_bg: body.header_bg,

    notes_internal: body.notes_internal,

    issue_report: body.issue_report,
    driver_copy: body.driver_copy,
    gps_check: body.gps_check,
    mail_notification: body.mail_notification,
    multi_file: body.multi_file,
  };

  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(candidate)) {
    if (!ALLOWED_COLS.has(key)) continue;
    if (value === undefined || value === null) continue; // prevent writing NULL into NOT NULL cols
    out[key] = value;
  }
  return out;
}

export const onRequestGet: PagesFunction<Env> = async ({ env, request, params }) => {
  const admin = await requireAdmin(env, request);
  if (!admin) return new Response("Unauthorized", { status: 401 });

  const slug = String(params.slug || "").trim();
  if (!slug) return new Response("Not found", { status: 404 });

  try {
    const row = await env.DB.prepare("SELECT * FROM slug_details WHERE slug = ?")
      .bind(slug)
      .first();
    if (!row) return new Response("Not found", { status: 404 });

    return new Response(JSON.stringify(row), {
      headers: { "content-type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};

export const onRequestPut: PagesFunction<Env> = async ({ env, request, params }) => {
  const admin = await requireAdmin(env, request);
  if (!admin) return new Response("Unauthorized", { status: 401 });

  try {
    const slug = String(params.slug || "").trim();
    if (!slug) return new Response("Slug missing", { status: 400 });

    const body = await request.json<any>().catch(() => ({}));
    const updates = sanitizeForUpdate(body);

    if (Object.keys(updates).length === 0) {
      return new Response("No valid fields to update", { status: 400 });
    }

    const sets = Object.keys(updates)
      .map((k) => `${k} = ?`)
      .join(", ");
    const sql = `UPDATE slug_details SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE slug = ?`;

    const values = [...Object.values(updates), slug];
    await env.DB.prepare(sql).bind(...values).run();

    // Audit log
    await env.DB.prepare(
      `INSERT INTO audit_log (actor_user_id, action, target, payload)
       VALUES (?, 'theme.update', ?, ?)`
    )
      .bind(admin.sub, slug, JSON.stringify(updates))
      .run();

    return new Response(null, { status: 204 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};
