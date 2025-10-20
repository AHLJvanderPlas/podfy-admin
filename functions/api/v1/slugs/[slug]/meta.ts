// functions/api/v1/slugs/[slug]/meta.ts
import { getCookie, verifyJWT } from "../../../../_utils/auth";

async function requireAdmin(env: Env, request: Request) {
  const token = getCookie(request, env.COOKIE_NAME);
  const user = token && (await verifyJWT(token, env.JWT_SECRET));
  if (!user || user.role !== "admin" || user.is_active === 0) return null;
  return user;
}
function okJson(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const onRequestGet: PagesFunction<Env> = async ({ env, request, params }) => {
  const admin = await requireAdmin(env, request);
  if (!admin) return new Response("Unauthorized", { status: 401 });

  const slug = String(params.slug || "").trim();
  if (!slug) return new Response("Bad Request", { status: 400 });

  const row = await env.DB.prepare(
    "SELECT * FROM brand_config WHERE slug=?"
  ).bind(slug).first<any>();

  if (!row) return okJson({ error: "Not found" }, 404);

  let email_recipients = { to: [], cc: [], bcc: [] };
  try { email_recipients = JSON.parse(row.email_recipients || "{}"); } catch {}

  let branding = { logo_url: null };
  try { branding = JSON.parse(row.branding || "{}"); } catch {}

  const theme = {
    slug: row.slug,
    brand_name: row.brand_name,
    logo_path: row.logo_path,
    favicon_path: row.favicon_path,
    status: row.status,
    color_primary: row.color_primary,
    color_accent: row.color_accent,
    color_text: row.color_text,
    color_muted: row.color_muted,
    color_border: row.color_border,
    color_button_text: row.color_button_text,
    header_bg: row.header_bg,
  };

  return okJson({
    theme,
    settings: { email_recipients, branding, updated_at: row.updated_at },
  });
};
