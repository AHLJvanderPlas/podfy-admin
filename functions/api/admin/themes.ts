import { getCookie, verifyJWT } from "../../_utils/auth";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const token = getCookie(request, env.COOKIE_NAME);
    const user = token && await verifyJWT(token, env.JWT_SECRET);
    if (!user || user.role !== "admin" || user.is_active === 0) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { results } = await env.DB.prepare(`
      SELECT id, name, current_version, primary_color, secondary_color,
             email_from_name, email_from_address, updated_at
      FROM themes ORDER BY name
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
