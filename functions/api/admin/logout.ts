// functions/api/admin/logout.ts
export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  // Use the same cookie name your login uses
  const cookieName = env.COOKIE_NAME || "sida";
  const host = new URL(request.url).hostname;

  // Build several delete variants to cover host-only and parent domains
  const del = (attrs: string) =>
    `${cookieName}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; ${attrs}`;

  const setCookies = [
    del("SameSite=Strict; Secure"),                                // host-only
    del(`SameSite=Strict; Secure; Domain=.${host}`),               // this host as registrable domain
  ];

  // If your production domain is like admin.podfy.net, also clear .podfy.net explicitly:
  const parts = host.split(".");
  if (parts.length >= 3) {
    const apex = parts.slice(-2).join(".");
    setCookies.push(del(`SameSite=Strict; Secure; Domain=.${apex}`));
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // multiple Set-Cookie headers
      "set-cookie": setCookies,
      // (optional) tighten response
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    } as unknown as HeadersInit, // CF accepts array for set-cookie
  });
};
