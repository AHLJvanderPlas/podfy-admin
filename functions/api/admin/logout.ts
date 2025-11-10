// functions/api/admin/logout.ts
export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  const cookieName = env.COOKIE_NAME || "sida";
  const url = new URL(request.url);
  const host = url.hostname;

  const base = "Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT";
  const sets = [
    `${cookieName}=; ${base}`,              // host-only
    `${cookieName}=; Domain=.${host}; ${base}`,
  ];
  const parts = host.split(".");
  if (parts.length >= 3) {
    const apex = parts.slice(-2).join(".");
    sets.push(`${cookieName}=; Domain=.${apex}; ${base}`);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // @ts-expect-error multiple set-cookie
      "set-cookie": sets,
    },
  });
};
