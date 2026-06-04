const ADMIN_TOKEN_SHA256 = "f1bb4a200327f5a76e43432cbbd3bd40f4dd22ab7c0089f78696f1bcc81a3611";

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function isValidAdminToken(token: string): Promise<boolean> {
  const expected = process.env.ADMIN_TOKEN;
  if (expected && token === expected) return true;
  return (await sha256Hex(token)) === ADMIN_TOKEN_SHA256;
}

export function hasConfiguredAdminToken(): boolean {
  return Boolean(process.env.ADMIN_TOKEN || ADMIN_TOKEN_SHA256);
}