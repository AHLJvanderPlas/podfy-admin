// _utils/auth.ts
// Robust cookie + JWT helpers for Cloudflare Pages Functions

export function getCookie(req: Request, name: string): string | null {
  const cookie = req.headers.get("cookie") || "";
  const parts = cookie.split(/; */).map((p) => p.trim());
  for (const part of parts) {
    if (!part) continue;
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx);
    const v = part.slice(idx + 1);
    if (k === name) return decodeURIComponent(v);
  }
  return null;
}

export async function signJWT(payload: any, secret: string, expSeconds = 60 * 60 * 24 * 7): Promise<string> {
  // HMAC SHA-256 (HS256)
  const header = { alg: "HS256", typ: "JWT" };
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + expSeconds;
  const toB64Url = (obj: any) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  const headerB64 = toB64Url(header);
  const payloadB64 = toB64Url({ ...payload, iat, exp });

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const sig = await crypto.subtle.sign("HMAC", key, data);
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `${headerB64}.${payloadB64}.${sigB64}`;
}

export async function verifyJWT(token: string, secret: string): Promise<any | null> {
  try {
    const [h, p, s] = token.split(".");
    if (!h || !p || !s) return null;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const data = new TextEncoder().encode(`${h}.${p}`);
    const sigBytes = Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
    const ok = await crypto.subtle.verify("HMAC", key, sigBytes, data);
    if (!ok) return null;

    const json = JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/")));
    if (!json || typeof json !== "object") return null;
    const now = Math.floor(Date.now() / 1000);
    if (json.exp && now > json.exp) return null;
    return json;
  } catch {
    return null;
  }
}

export function buildSetCookie(name: string, value: string, attrs: string[]): string[] {
  // Returns multiple Set-Cookie header values (one per variant)
  return attrs.map(a => `${name}=${encodeURIComponent(value)}; ${a}`);
}
