import { getCookie, verifyJWT } from "../../../_utils/auth";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const token = getCookie(request, env.COOKIE_NAME);
  if (!token) return new Response("Unauthorized", { status: 401 });

  const user = await verifyJWT(token, env.JWT_SECRET);
  if (!user || user.role !== "admin" || user.is_active === 0) {
    return new Response("Unauthorized", { status: 401 });
  }
  return new Response(JSON.stringify({ id: user.sub, role: user.role }), {
    headers: { "content-type": "application/json" }
  });
};
