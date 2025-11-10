// Public: GET /api/themes/:slug
// Returns the theme configuration for a given slug.
// NOTE: This matches the updated schema where:
// - table name is `slug_details`
// - `logo_path`/`favicon_path` were removed
// - `logo` column exists
// - five integer flags exist (gps_check, driver_copy, issue_report, mail_notification, multi_file)

type Row = {
  brandName: string;
  logo: string | null;
  status: string | null;
  primary: string;
  accent: string;
  text: string;
  muted: string;
  border: string;
  buttonText: string;
  headerBg: string;
  issue_report: number;
  driver_copy: number;
  gps_check: number;
  mail_notification: number;
  multi_file: number;
};

export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  try {
    const DB = env.DB;
    const slug = String(params?.slug || "").toLowerCase();

    if (!slug) {
      return new Response("Bad Request", { status: 400 });
    }

    const sql = `
      SELECT
        slug,
        brand_name                AS brandName,
        logo,
        status,
        color_primary             AS primary,
        color_accent              AS accent,
        color_text                AS text,
        color_muted               AS muted,
        color_border              AS border,
        color_button_text         AS buttonText,
        header_bg                 AS headerBg,
        issue_report,
        driver_copy,
        gps_check,
        mail_notification,
        multi_file
      FROM slug_details
      WHERE slug = ?
      LIMIT 1
    `;

    const row = (await DB.prepare(sql).bind(slug).first()) as Row | null;
    if (!row) return new Response("Not found", { status: 404 });

    const payload = {
      brandName: row.brandName,
      logo: row.logo,
      colors: {
        primary: row.primary,
        accent: row.accent,
        text: row.text,
        muted: row.muted,
        border: row.border,
        buttonText: row.buttonText,
      },
      header: { bg: row.headerBg },
      status: row.status,
      flags: {
        gps_check: !!row.gps_check,
        driver_copy: !!row.driver_copy,
        issue_report: !!row.issue_report,
        mail_notification: !!row.mail_notification,
        multi_file: !!row.multi_file,
      },
    };

    return new Response(JSON.stringify(payload), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        // edge cache 5 minutes, allow background refresh for a day
        "cache-control": "s-maxage=300, stale-while-revalidate=86400",
      },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};
