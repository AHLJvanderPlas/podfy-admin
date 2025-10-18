// functions/api/admin/themes/[slug].ts
import { getCookie, verifyJWT } from "../../../_utils/auth";

async function requireAdmin(env: Env, request: Request) {
  const token = getCookie(request, env.COOKIE_NAME);
  const user = token && (await verifyJWT(token, env.JWT_SECRET));
  if (!user || user.role !== "admin" || user.is_active === 0) return null;
  return user;
}

export const onRequestPut: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    const admin = await requireAdmin(env, request);
    if (!admin) return new Response("Unauthorized", { status: 401 });

    const slug = String(params.slug || "").trim();
    if (!slug) return new Response("Missing slug in URL", { status: 400 });

    const body = await request.json<any>().catch(() => ({}));

    // Accept both UI keys and legacy keys; map to DB columns.
    // Only include fields that are present (!== undefined).
    const incoming: Record<string, any> = {
      brand_name: body.brand_name ?? body.name,
      logo_path: body.logo_path,
      favicon_path: body.favicon_path,
      status: body.status,

      // map primary/secondary to current schema
      color_primary: body.color_primary ?? body.primary_color,
      color_accent: body.color_accent ?? body.secondary_color,

      color_text: body.color_text,
      color_muted: body.color_muted,
      color_border: body.color_border,
      color_button_text: body.color_button_text,
      header_bg: body.header_bg,

      email: body.email ?? body.email_from_address,
      notes_internal: body.notes_internal,
    };

    const updates = Object.entries(incoming).filter(([, v]) => v !== undefined);
    if (updates.length === 0) {
      return new Response("No fields to update", { status: 400 });
    }

    const setSql = updates.map(([k]) => `${k}=?`).join(", ");
    const values = updates.map(([, v]) => v);

    const sql = `
      UPDATE themes
         SET ${setSql}, updated_at=CURRENT_TIMESTAMP
       WHERE slug=?
    `;

    const res = await env.DB.prepare(sql).bind(...values, slug).run();

    // Optional: insert if not found (upsert-on-PUT). Comment out if you prefer strict update.
    if (res.meta.changes === 0) {
      // create a minimal row with provided values + slug
      const cols = ["slug", ...updates.map(([k]) => k), "updated_at"];
      const placeholders = cols.map(() => "?");
      const insertVals = [slug, ...values, new Date().toISOString()];
      const insertSql = `
        INSERT INTO themes (${cols.join(", ")})
        VALUES (${placeholders.join(", ")})
      `;
      await env.DB.prepare(insertSql).bind(...insertVals).run();
    }

    await env.DB.prepare(
      `INSERT INTO audit_log (actor_user_id, action, target, payload)
       VALUES (?, 'theme.update', ?, ?)`
    )
      .bind(admin.sub, slug, JSON.stringify(incoming))
      .run();

    return new Response(null, { status: 204 });
  } catch (e: any) {
    // Always return JSON so the UI doesn’t render the HTML error page
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};
