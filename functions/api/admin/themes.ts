import { getCookie, verifyJWT } from "../../_utils/auth";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    // auth
    const token = getCookie(request, env.COOKIE_NAME);
    const user = token && await verifyJWT(token, env.JWT_SECRET);
    if (!user || user.role !== "admin" || user.is_active === 0) {
      return new Response("Unauthorized", { status: 401 });
    }

    // 1) Pull raw rows without assuming columns
    const { results: rows = [] } = await env.DB.prepare("SELECT * FROM themes").all();

    // 2) Normalize to a unified shape the UI expects
    const normalized = rows.map((r: any) => ({
      // identifiers / names
      slug: r.slug ?? r.id ?? r.slug_id ?? null,
      brand_name: r.brand_name ?? r.name ?? r.display_name ?? null,

      // assets / status
      logo_path: r.logo_path ?? null,
      favicon_path: r.favicon_path ?? null,
      status: r.status ?? null,

      // colors (support both schemas)
      color_primary: r.color_primary ?? r.primary_color ?? null,
      color_accent: r.color_accent ?? r.secondary_color ?? null,
      color_text: r.color_text ?? null,
      color_muted: r.color_muted ?? null,
      color_border: r.color_border ?? null,
      color_button_text: r.color_button_text ?? null,
      header_bg: r.header_bg ?? null,

      // email (support both schemas)
      email: r.email ?? r.email_from_address ?? null,

      notes_internal: r.notes_internal ?? null,
      updated_at: r.updated_at ?? null,
    }));

    // 3) Sort nicely by brand
    normalized.sort((a, b) => (a.brand_name || "").localeCompare(b.brand_name || ""));

    return new Response(JSON.stringify(normalized), {
      headers: { "content-type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};
