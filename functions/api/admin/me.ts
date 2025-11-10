// functions/api/admin/me.ts
import { getCookie, verifyJWT } from "../../_utils/auth";

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const cookieName = env.COOKIE_NAME || "sida";
    const token = getCookie(request, cookieName);
    if (!token) return new Response("Unauthorized", { status: 401 });

    const user = await verifyJWT(token, env.JWT_SECRET);
    if (!user || user.role !== "admin" || Number(user.is_active) !== 1) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Optionally, you can re-check D1 to ensure user still active:
    // const row = await env.DB.prepare(`SELECT is_active FROM users WHERE id=?`).bind(user.sub).first<any>();
    // if (!row || Number(row.is_active) !== 1) return new Response("Unauthorized", { status: 401 });

    return new Response(JSON.stringify({
      sub: user.sub, email: user.email, role: user.role, is_active: user.is_active
    }), {
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
};
