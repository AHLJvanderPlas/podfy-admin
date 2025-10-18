export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  // Try a lightweight DB call to verify binding (no schema required).
  try {
    const { results } = await env.DB.prepare("select 1 as ok").all();
    const ok = results?.[0]?.ok === 1;
    return new Response(JSON.stringify({
      ok,
      r2Bound: !!env.POD_BUCKET,
      runtime: "pages-functions",
      timestamp: new Date().toISOString()
    }), { headers: { "content-type": "application/json" }});
  } catch (e) {
    return new Response(JSON.stringify({ ok:false, error: String(e) }), { status: 500, headers: { "content-type": "application/json" }});
  }
};
