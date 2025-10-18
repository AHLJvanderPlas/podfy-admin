export type JWTPayload = Record<string, any>;

export function getCookie(req: Request, name: string) {
  const m = (req.headers.get("cookie") || "").match(new RegExp(`${name}=([^;]+)`));
  return m?.[1];
}

export function setCookie(name: string, value: string, domain: string, maxAge: number) {
  return `${name}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Domain=${domain}; Max-Age=${maxAge}`;
}

export async function signJWT(payload: JWTPayload, secret: string, expSec: number) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body   = base64url(JSON.stringify({ iat: now, exp: now + expSec, ...payload }));
  const data = `${header}.${body}`;

  const key = await crypto.subtle.importKey("raw", enc(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc(data));
  const sig = base64urlBytes(sigBuf);
  return `${data}.${sig}`;
}

export async function verifyJWT(token: string, secret: string) {
  try {
    const [h, b, s] = token.split(".");
    if (!h || !b || !s) return null;

    const data = `${h}.${b}`;
    const key = await crypto.subtle.importKey("raw", enc(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);

    // ✅ Correct arg order: verify(alg, key, signatureBytes, dataBytes)
    const sigBytes = b64urlToUint8(s);
    const ok = await crypto.subtle.verify("HMAC", key, sigBytes, enc(data));
    if (!ok) return null;

    // ✅ Proper base64url decode of body
    const bodyJson = b64urlToString(b);
    const body = JSON.parse(bodyJson);
    if (body.exp && Math.floor(Date.now() / 1000) > body.exp) return null;
    return body; // { sub, role, is_active, ... }
  } catch {
    return null;
  }
}

/* --- helpers --- */
const enc = (s: string) => new TextEncoder().encode(s);

function base64url(s: string) {
  return btoa(s).replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_');
}
function base64urlBytes(buf: ArrayBuffer) {
  const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
  return b64.replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_');
}
function b64urlToString(u: string) {
  const s = u.replace(/-/g,'+').replace(/_/g,'/');
  const padded = s + "===".slice((s.length + 3) % 4);
  return atob(padded);
}
function b64urlToUint8(u: string) {
  const s = u.replace(/-/g,'+').replace(/_/g,'/');
  const padded = s + "===".slice((s.length + 3) % 4);
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}
