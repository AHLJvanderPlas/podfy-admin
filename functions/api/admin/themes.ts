import { getCookie, verifyJWT } from "../../_utils/auth";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const token = getCookie(request, env.COOKIE_NAME);
    const user = token && await verifyJWT(token, env.JWT_SECRET);
    if (!user || user.role !== "admin" || user.is_active === 0) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Return columns exactly as they exist in D1
    const { results } = await env.DB.prepare(`
      SELECT
        slug,
        brand_name,
        logo_path,
        favicon_path,
        status,
        color_primary,
        color_accent,
        color_text,
        color_muted,
        color_border,
        color_button_text,
        header_bg,
        email,
        notes_internal,
        updated_at
      FROM themes
      ORDER BY brand_name
    `).all();

    return new Response(JSON.stringify(results ?? []), {
      headers: { "content-type": "application/json" }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "content-type": "application/json" }
    });
  }
};
