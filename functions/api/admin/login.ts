import { signJWT, setCookie } from "../../_utils/auth";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const { email } = await request.json();
    if (!email) throw new Error("Email required");

    const row = await env.DB.prepare(
      "SELECT id, role, is_active FROM users WHERE email=?"
    ).bind(email).first<any>();

    if (!row || row.is_active === 0 || row.role !== "admin") {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    const token = await signJWT(
      { sub: row.id, role: "admin", is_active: row.is_active },
      env.JWT_SECRET,
      parseInt(env.COOKIE_MAX_AGE, 10)
    );

    const headers = new Headers({
      "Set-Cookie": setCookie(
        env.COOKIE_NAME,
        token,
        env.COOKIE_DOMAIN,
        parseInt(env.COOKIE_MAX_AGE, 10)
      ),
    });

    return new Response(null, { status: 204, headers });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};
