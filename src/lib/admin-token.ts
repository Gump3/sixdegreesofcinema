// Server-only admin token validation.
// The SHA-256 below is for the originally generated token; we also accept
// the raw value from the ADMIN_TOKEN secret when present.

const ADMIN_TOKEN_SHA256 = "f1bb4a200327f5a76e43432cbbd3bd40f4dd22ab7c0089f78696f1bcc81a3611";

async function sha256Hex(value: string): Promise<string> {
  // Prefer Web Crypto (works in Workers + Node 20+).
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // Fallback to Node's crypto module.
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(value).digest("hex");
}

export async function isValidAdminToken(token: string): Promise<boolean> {
  const t = (token ?? "").trim();
  if (!t) return false;

  const expected = (process.env.ADMIN_TOKEN ?? "").trim();
  if (expected && t === expected) return true;

  try {
    const hashed = await sha256Hex(t);
    if (hashed === ADMIN_TOKEN_SHA256) return true;
  } catch (err) {
    console.error("[admin-token] hash failed", err);
  }

  console.warn("[admin-token] token rejected", {
    hasEnvToken: Boolean(expected),
    envMatches: expected ? t === expected : false,
    tokenLen: t.length,
  });
  return false;
}

export function hasConfiguredAdminToken(): boolean {
  return Boolean(process.env.ADMIN_TOKEN || ADMIN_TOKEN_SHA256);
}
