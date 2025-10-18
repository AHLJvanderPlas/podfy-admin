import { getCookie, verifyJWT } from "../../../_utils/auth";

export const onRequestPut: PagesFunction<Env> = async ({ request, env, params }) => {
  const token = getCookie(request, env.COOKIE_NAME);
  const user = token && await verifyJWT(token, env.JWT_SECRET);
  if (!user || user.role !== "admin" || user.is_active === 0) {
    return new Response("Unauthorized", { status: 401 });
  }

  const id = String(params.id);
  const body = await request.json<any>().catch(()=> ({}));
  await env.DB.prepare(`
    UPDATE themes SET
      primary_color = COALESCE(?, primary_color),
      secondary_color = COALESCE(?, secondary_color),
      email_from_name = COALESCE(?, email_from_name),
      email_from_address = COALESCE(?, email_from_address),
      updated_at = CURRENT_TIMESTAMP
    WHERE id=?
  `).bind(body.primary_color, body.secondary_color, body.email_from_name, body.email_from_address, id).run();

  await env.DB.prepare(`
    INSERT INTO audit_log (actor_user_id, action, target, payload)
    VALUES (?, 'theme.update', ?, ?)
  `).bind(user.sub, id, JSON.stringify(body)).run();

  return new Response(null, { status: 204 });
};
