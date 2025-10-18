export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const cookie = request.headers.get("cookie") || "";
  const token = (cookie.match(new RegExp(`${env.COOKIE_NAME}=([^;]+)`)) || [])[1];
  if (!token) return new Response("Unauthorized", { status: 401 });

  // super-lightweight verify: just decode and check exp if present (we'll replace later)
  try {
    const [, bodyB64] = token.split(".");
    const body = JSON.parse(atob(bodyB64));
    if (body?.role !== "admin") throw new Error("role");
    if (body?.exp && Math.floor(Date.now()/1000) > body.exp) throw new Error("expired");
    return new Response(JSON.stringify({ id: body.sub, role: body.role }), {
      headers: { "content-type": "application/json" }
    });
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
};
