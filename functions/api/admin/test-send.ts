// functions/api/admin/test-send.ts
import { getCookie, verifyJWT } from "../../../_utils/auth";

type Recipients = { to: string[]; cc: string[]; bcc: string[] };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const MAX_PER_LIST = 25;

function okJson(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}
async function requireAdmin(env: Env, request: Request) {
  const token = getCookie(request, env.COOKIE_NAME);
  const user  = token && (await verifyJWT(token, env.JWT_SECRET));
  if (!user || user.role !== "admin" || user.is_active === 0) return null;
  return user;
}

function validateRecipients(r: any): Recipients {
  const lists: Recipients = {
    to: Array.isArray(r?.to) ? r.to : [],
    cc: Array.isArray(r?.cc) ? r.cc : [],
    bcc: Array.isArray(r?.bcc) ? r.bcc : [],
  };
  for (const k of ["to", "cc", "bcc"] as const) {
    const arr = lists[k].map((v: any) => String(v || "").trim()).filter(Boolean);
    if (arr.length > MAX_PER_LIST) throw new Error(`${k.toUpperCase()} exceeds ${MAX_PER_LIST} addresses`);
    for (const e of arr) if (!EMAIL_RE.test(e)) throw new Error(`Invalid email in ${k}: ${e}`);
    (lists as any)[k] = arr;
  }
  if (lists.to.length === 0) throw new Error("At least one TO recipient is required");
  return lists;
}

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const admin = await requireAdmin(env, request);
    if (!admin) return new Response("Unauthorized", { status: 401 });

    const body = await request.json<any>().catch(() => ({}));
    const slug = String(body?.slug || "").trim();
    if (!slug) return okJson({ error: "slug required" }, 400);

    const recipients = validateRecipients(body?.email_recipients);

    // Optional: ensure slug exists
    const exists = await env.DB.prepare("SELECT 1 FROM themes WHERE slug=?").bind(slug).first<any>();
    if (!exists) return okJson({ error: "Unknown slug" }, 404);

    // Log only (no send yet)
    await env.DB.prepare(`
      INSERT INTO audit_log (actor_user_id, action, target, payload)
      VALUES (?, 'email.test_send', ?, ?)
    `).bind(admin.sub, slug, JSON.stringify({ recipients })).run();

    // Return a simple success payload
    return okJson({
      ok: true,
      slug,
      counts: {
        to: recipients.to.length,
        cc: recipients.cc.length,
        bcc: recipients.bcc.length,
      },
      note: "Test send recorded (no email sent). Wire this to your mail provider later.",
    });
  } catch (e: any) {
    return okJson({ error: String(e) }, 500);
  }
};
