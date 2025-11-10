import { getCookie, verifyJWT } from "../../_utils/auth";

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const hints: string[] = [];
  try {
    const cookieName = env.COOKIE_NAME || "sida";
    const cookie = request.headers.get("cookie") || "";
    const token = getCookie(request, cookieName);
    if (!token) {
      return new Response("Unauthorized: no-cookie", { status: 401, headers: { "x-debug": "no-cookie" }});
    }
    hints.push("cookie-present");

    const user = await verifyJWT(token, env.JWT_SECRET);
    if (!user) {
      return new Response("Unauthorized: bad-token", { status: 401, headers: { "x-debug": "bad-token" }});
    }
    hints.push("jwt-ok");

    if (user.role !== "admin") {
      return new Response("Unauthorized: not-admin", { status: 401, headers: { "x-debug": "not-admin" }});
    }
    if (Number(user.is_active) !== 1) {
      return new Response("Unauthorized: inactive", { status: 401, headers: { "x-debug": "inactive" }});
    }
    hints.push("role-active-ok");

    return new Response(JSON.stringify({
      sub: user.sub, email: user.email, role: user.role, is_active: user.is_active
    }), {
      headers: { "content-type": "application/json; charset=utf-8", "x-debug": hints.join(",") },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8", "x-debug": "exception" },
    });
  }
};
