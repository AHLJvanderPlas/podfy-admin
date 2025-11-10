// functions/api/admin/audit.ts
import { getCookie, verifyJWT } from "../../_utils/auth";

function ok(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function requireAdmin(env: Env, request: Request) {
  const token = getCookie(request, env.COOKIE_NAME);
  const user = token && (await verifyJWT(token, env.JWT_SECRET));
  if (!user || user.role !== "admin" || user.is_active === 0) return null;
  return user;
}

/**
 * GET /api/admin/audit?type=admin|user&q=...&limit=50&cursor=1234
 * - Sorted newest first by autoincrement id.
 * - Cursor is the last seen id (returns items with id < cursor).
 */
export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const me = await requireAdmin(env, request);
    if (!me) return new Response("Unauthorized", { status: 401 });

    const url = new URL(request.url);
    const type = (url.searchParams.get("type") || "admin").toLowerCase();
    const q = (url.searchParams.get("q") || "").trim();
    const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get("limit") || "50", 10)));
    const cursor = parseInt(url.searchParams.get("cursor") || "0", 10) || 0;

    // Build WHERE filters
    const like = `%${q}%`;
    const hasSearch = q.length > 0;

    // role filter: admin => users.role='admin'; user => users.role IS NULL OR != 'admin'
    const roleClause =
      type === "user"
        ? "(u.role IS NULL OR u.role <> 'admin')"
        : "(u.role = 'admin')";

    const cursorClause = cursor > 0 ? "AND a.id < ?" : "";
    const searchClause = hasSearch
      ? "AND (a.action LIKE ? OR a.target LIKE ? OR a.payload LIKE ? OR u.email LIKE ?)"
      : "";

    const sql = `
      SELECT a.id, a.actor_user_id, u.email AS actor_email,
             a.action, a.target, a.payload, a.created_at
      FROM audit_log a
      LEFT JOIN users u ON u.id = a.actor_user_id
      WHERE ${roleClause}
      ${cursorClause}
      ${searchClause}
      ORDER BY a.id DESC
      LIMIT ?
    `;

    const binds: any[] = [];
    if (cursor > 0) binds.push(cursor);
    if (hasSearch) binds.push(like, like, like, like);
    binds.push(limit + 1); // over-fetch to know if there's a next page

    const rows = await env.DB.prepare(sql).bind(...binds).all<any>();
    const items = rows.results || [];
    let nextCursor: number | null = null;

    if (items.length > limit) {
      const dropped = items.pop(); // remove the extra row
      nextCursor = dropped.id; // use its id as the next cursor
    } else if (items.length > 0) {
      nextCursor = null; // no more pages
    }

    return ok({ items, nextCursor });
  } catch (e: any) {
    return ok({ error: String(e) }, 500);
  }
};
