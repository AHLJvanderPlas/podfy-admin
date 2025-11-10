// functions/api/admin/login.ts
import { getCookie, signJWT, buildSetCookie } from "../../_utils/auth";

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const { email } = await request.json<any>().catch(() => ({}));
    const addr = String(email || "").trim().toLowerCase();
    if (!addr) return new Response("Email required", { status: 400 });

    // Look up admin in D1
    const row = await env.DB.prepare(
      `SELECT id, email, name, role, is_active
       FROM users
       WHERE lower(email)=? LIMIT 1`
    ).bind(addr).first<any>();

    if (!row || row.role !== "admin" || Number(row.is_active) !== 1) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Sign JWT with role & is_active (what requireAdmin checks)
    const token = await signJWT(
      { sub: row.id, email: row.email, role: row.role, is_active: Number(row.is_active) },
      env.JWT_SECRET
    );

    const url = new URL(request.url);
    const host = url.hostname;                  // e.g. admin.podfy.net
    const cookieName = env.COOKIE_NAME || "sida";

    // Multiple variants so it sticks regardless of how CF resolves domain
    const common = "Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=1209600"; // 14 days
    const variants = [common, `Domain=.${host}; ${common}`];

    const parts = host.split(".");
    if (parts.length >= 3) {
      const apex = parts.slice(-2).join(".");
      variants.push(`Domain=.${apex}; ${common}`); // .podfy.net
    }

    const setCookies = buildSetCookie(cookieName, token, variants);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        // @ts-expect-error CF accepts array for set-cookie
        "set-cookie": setCookies,
      },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
};
