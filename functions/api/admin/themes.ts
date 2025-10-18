import { getCookie, verifyJWT } from "../../_utils/auth";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const token = getCookie(request, env.COOKIE_NAME);
    const user = token && await verifyJWT(token, env.JWT_SECRET);
    if (!user || user.role !== "admin" || user.is_active === 0) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Don't assume columns — grab everything
    const { results } = await env.DB.prepare(`SELECT * FROM themes`).all();

    // Normalize shape for the UI/API
    const items = (results || []).map((r: any) => ({
      id: r.id ?? r.slug_id ?? r.theme_id ?? r.name,   // best-effort identifier
      name: r.name ?? r.display_name ?? r.slug_id ?? r.id,
      current_version: r.current_version ?? 1,
      primary_color: r.primary_color ?? null,
      secondary_color: r.secondary_color ?? null,
      email_from_name: r.email_from_name ?? null,
      email_from_address: r.email_from_address ?? null,
      updated_at: r.updated_at ?? null
    }));

    return new Response(JSON.stringify(items), {
      headers: { "content-type": "application/json" }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "content-type": "application/json" }
    });
  }
};
