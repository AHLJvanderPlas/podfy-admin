// functions/api/admin/themes.ts
import { getCookie, verifyJWT } from "../../_utils/auth";

type AdminUser = { sub: string; role: string; is_active: number };

async function requireAdmin(env: Env, request: Request): Promise<AdminUser | null> {
  const token = getCookie(request, env.COOKIE_NAME);
  const user = token && (await verifyJWT(token, env.JWT_SECRET));
  if (!user || user.role !== "admin" || user.is_active === 0) return null;
  return user as AdminUser;
}

// Columns that exist in the CURRENT themes table
const COLS = new Set<string>([
  "slug",
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
  "updated_at",
  "issue_report",
  "driver_copy",
  "gps_check",
  "mail_notification",
  "multi_file",
]);

function sanitizeForInsert(body: any) {
  // Map legacy keys → current columns
  const m: Record<string, any> = {
    slug: body.slug,
    brand_name: body.brand_name ?? body.name,
    logo: body.logo ?? body.logo_path, // UI does not send it, but keep compat
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

  // Keep only known columns
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(m)) {
    if (!COLS.has(k)) continue;
    // For INSERT we allow empty string, but not undefined
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function defaultsForRequired(slug: string, given: Record<string, any>) {
  // Make sure required columns exist on INSERT
  return {
    slug,
    brand_name: given.brand_name ?? slug,
    logo: given.logo ?? "/logos/default.svg",
    status: given.status ?? "Demo",
    color_primary: given.color_primary ?? "#000000",
    color_accent: given.color_accent ?? "#111111",
    color_text: given.color_text ?? "#0B1220",
    color_muted: given.color_muted ?? "#6B7280",
    color_border: given.color_border ?? "#E5E7EB",
    color_button_text: given.color_button_text ?? "#111111",
    header_bg: given.header_bg ?? "#FFFFFF",
    notes_internal: given.notes_internal ?? null,

    issue_report: given.issue_report ?? 1,
    driver_copy: given.driver_copy ?? 1,
    gps_check: given.gps_check ?? 1,
    mail_notification: given.mail_notification ?? 1,
    multi_file: given.multi_file ?? 1,
  };
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const admin = await requireAdmin(env, request);
  if (!admin) return new Response("Unauthorized", { status: 401 });

  try {
    const { results = [] } = await env.DB.prepare("SELECT * FROM themes").all();
    // Sort by slug ASC for the grid
    const list = (results as any[]).sort((a, b) =>
      String(a.slug || "").localeCompare(String(b.slug || ""))
    );
    return new Response(JSON.stringify(list), {
      headers: { "content-type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const admin = await requireAdmin(env, request);
  if (!admin) return new Response("Unauthorized", { status: 401 });

  try {
    const body = await request.json<any>().catch(() => ({}));
    const slug = String(body.slug || "").trim();
    if (!slug) return new Response("Slug is required", { status: 400 });
    if (!/^[a-z0-9][a-z0-9-_]*$/.test(slug))
      return new Response("Invalid slug", { status: 400 });

    const sanitized = sanitizeForInsert(body);
    const rec = defaultsForRequired(slug, sanitized);

    const cols = Object.keys(rec);
    const placeholders = cols.map(() => "?").join(", ");
    const sql = `INSERT INTO themes (${cols.join(", ")}) VALUES (${placeholders})
                 ON CONFLICT(slug) DO UPDATE SET
                 ${cols
                   .filter((c) => c !== "slug")
                   .map((c) => `${c}=excluded.${c}`)
                   .join(", ")},
                 updated_at=CURRENT_TIMESTAMP`;

    await env.DB.prepare(sql).bind(...cols.map((c) => rec[c])).run();

    await env.DB.prepare(
      `INSERT INTO audit_log (actor_user_id, action, target, payload)
       VALUES (?, 'theme.upsert', ?, ?)`
    )
      .bind(admin.sub, slug, JSON.stringify(rec))
      .run();

    return new Response(null, { status: 204 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};
