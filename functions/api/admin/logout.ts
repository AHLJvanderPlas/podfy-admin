// functions/api/admin/logout.ts
import { getCookie } from "../../../_utils/auth";

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  // Always respond with a Set-Cookie clearing the session cookie.
  // Use the same cookie name used during login.
  const cookieName = env.COOKIE_NAME || "sida";
  const headers = new Headers({
    "content-type": "application/json",
    // Expire the cookie. Path=/ is important to override.
    "set-cookie": `${cookieName}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict; Secure`,
  });
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
};
