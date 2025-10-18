// functions/api/admin/themes.ts
import { getCookie, verifyJWT } from "../../_utils/auth";

type ThemeRow = {
  // unified shape the UI expects
  slug: string | null;
  brand_name: string | null;
  logo_path: string | null;
  favicon_path: string | null;
  status: string | null;

  color_primary: string | null;
  color_accent: string | null;
  color_text: string | null;
  color_muted: string | null;
  color_border: string | null;
  color_button_text: string | null;
  header_bg: string | null;

  email: string | null;
  notes_internal: string | null;
  updated_at: string | null;
};

async function requireAdmin(env: Env, request: Request) {
  const token = getCookie(request, env.COOKIE_NAME);
  const user = token && (await verifyJWT(token, env.JWT_SECRET));
  if (!user || user.role !== "admin" || user.is_active === 0) {
    return null;
  }
  return user;
}

/** Normalize any themes row shape into the UI shape */
function normalize(r: any): ThemeRow {
  return {
    slug: r.slug ?? r.id ?? r.slug_id ?? null,
    brand_name: r.brand_name ?? r.name ?? r.display_name ?? null,

    logo_path: r.logo_path ?? null,
    favicon_path: r.favicon_path ?? null,
    status: r.status ?? null,

    // support both schemas
    color_primary: r.color_primary ?? r.primary_color ?? null,
    color_accent: r.color_accent ?? r.secondary_color ?? null,
    color_text: r.color_text ?? null,
    color_muted: r.color_muted ?? null,
    color_border: r.color_border ?? null,
    color_button_text: r.color_button_text ?? null,
    header_bg: r.header_bg ?? null,

    // email column in current schema OR legacy email_from_address
    email: r.email ?? r.email_from_address ?? null,

    notes_internal: r.notes_internal ?? null,
    updated_at: r.updated_at ?? null,
  };
}

/* ---------------------------- GET /themes ---------------------------- */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const admin = await requireAdmin(env, request);
    if (!admin) return new Response("Unauthorized", { status: 401 });

    // Don’t assume columns; SELECT * and normalize
    const { results = [] } = await env.DB.prepare("SELECT * FROM themes").all();
    const list = (results as any[]).map(normalize);

    // default sort: slug ascending
    list.sort((a, b) => (a.slug || "").localeCompare(b.slug || ""));

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

/* ---------------------------- POST /themes (create/upsert) ---------------------------- */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const admin = await requireAdmin(env, request);
    if (!admin) return new Response("Unauthorized", { status: 401 });

    const body = await request.json<any>().catch(() => ({}));

    const slug = String(body.slug || "").trim();
    if (!slug) return new Response("Slug is required", { status: 400 });
    // basic slug guard
    if (!/^[a-z0-9][a-z0-9-_]*$/.test(slug)) {
      return new Response("Invalid slug. Use lowercase letters, numbers, dashes or underscores.", { status: 400 });
    }

    // Accept both UI keys and legacy keys; map to *current* DB columns where possible.
    // (DB currently uses slug/brand_name/logo_path/.../email/etc.)
    const record: Record<string, any> = {
      slug,
      brand_name: body.brand_name ?? body.name ?? null,
      logo_path: body.logo_path ?? null,
      favicon_path: body.favicon_path ?? null,
      status: body.status ?? null,

      // UI may send primary_color/secondary_color; DB uses color_primary/color_accent
      color_primary: body.color_primary ?? body.primary_color ?? null,
      color_accent: body.color_accent ?? body.secondary_color ?? null,
      color_text: body.color_text ?? null,
      color_muted: body.color_muted ?? null,
      color_border: body.color_border ?? null,
      color_button_text: body.color_button_text ?? null,
      header_bg: body.header_bg ?? null,

      email: body.email ?? body.email_from_address ?? null,
      notes_internal: body.notes_internal ?? null,
    };

    // Build INSERT with only provided keys (undefined fields omitted)
    const entries = Object.entries(record).filter(([, v]) => v !== undefined);
    const columns = entries.map(([k]) => k);
    const placeholders = entries.map(() => "?");
    const values = entries.map(([, v]) => v);

    const sql = `
      INSERT INTO themes (${columns.join(", ")})
      VALUES (${placeholders.join(", ")})
      ON CONFLICT(slug) DO UPDATE SET
        ${columns
          .filter((c) => c !== "slug")
          .map((c) => `${c}=excluded.${c}`)
          .join(", ")},
        updated_at=CURRENT_TIMESTAMP
    `;

    await env.DB.prepare(sql).bind(...values).run();

    // audit trail
    await env.DB.prepare(
      `INSERT INTO audit_log (actor_user_id, action, target, payload)
       VALUES (?, 'theme.upsert', ?, ?)`
    )
      .bind(admin.sub, slug, JSON.stringify(record))
      .run();

    return new Response(null, { status: 204 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};
