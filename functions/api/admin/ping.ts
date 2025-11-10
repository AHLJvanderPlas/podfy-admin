export const onRequestGet: PagesFunction = async ({ request, env }) => {
  const cookie = request.headers.get("cookie") || "";
  return new Response(JSON.stringify({
    ok: true,
    hasCookie: cookie.includes((env.COOKIE_NAME || "sida") + "="),
  }), { headers: { "content-type": "application/json" }});
};
