import { signJWT, setCookie } from "../../_utils/auth";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // Minimal email-only login for now (we’ll front this with CF Access later)
  const { email } = await request.json<any>().catch(() => ({}));
  if (!email) return new Response("Email required", { status: 400 });

  const row = await env.DB.prepare(
    "SELECT id, role, is_active FROM users WHERE email=?"
  ).bind(email).first<any>();

  if (!row || row.is_active === 0 || row.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  const token = await signJWT(
    { sub: row.id, role: "admin", is_active: row.is_active },
    env.JWT_SECRET,
    parseInt(env.COOKIE_MAX_AGE, 10)
  );

  const headers = new Headers();
  headers.set(
    "Set-Cookie",
    setCookie(env.COOKIE_NAME, token, env.COOKIE_DOMAIN, parseInt(env.COOKIE_MAX_AGE, 10))
  );
  return new Response(null, { status: 204, headers });
};
