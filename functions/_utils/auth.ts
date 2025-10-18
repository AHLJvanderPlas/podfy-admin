export type JWTPayload = Record<string, any>;

export function getCookie(req: Request, name: string) {
  const m = (req.headers.get("cookie") || "").match(new RegExp(`${name}=([^;]+)`));
  return m?.[1];
}

export function setCookie(name: string, value: string, domain: string, maxAge: number) {
  // SameSite=Strict to keep the admin isolated
  return `${name}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Domain=${domain}; Max-Age=${maxAge}`;
}

export async function signJWT(payload: JWTPayload, secret: string, expSec: number) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify({ iat: now, exp: now + expSec, ...payload }));
  const data = `${header}.${body}`;
  const key = await crypto.subtle.importKey("raw", enc(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc(data));
  const sig = base64url(bytes(sigBuf));
  return `${data}.${sig}`;
}

export async function verifyJWT(token: string, secret: string) {
  try {
    const [h, b, s] = token.split(".");
    if (!h || !b || !s) return null;
    const data = `${h}.${b}`;
    const key = await crypto.subtle.importKey("raw", enc(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const sig = s.replace(/-/g,'+').replace(/_/g,'/');
    const ok = await crypto.subtle.verify("HMAC", key, enc(data), Uint8Array.from(atob(sig), c=>c.charCodeAt(0)));
    if (!ok) return null;
    const body = JSON.parse(atob(b));
    if (body.exp && Math.floor(Date.now()/1000) > body.exp) return null;
    return body; // { sub, role, is_active, ... }
  } catch { return null; }
}

const enc = (s: string) => new TextEncoder().encode(s);
function bytes(buf: ArrayBuffer) { return String.fromCharCode(...new Uint8Array(buf)); }
function base64url(s: string) {
  return btoa(s).replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_');
}
