// Server-only admin token validation.
// The ONLY accepted value is the ADMIN_TOKEN secret from Lovable Cloud.
// Never hardcode a token, a hash of one, or any other fallback here.

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function isValidAdminToken(token: string): Promise<boolean> {
  const t = (token ?? "").trim();
  if (!t) return false;

  const expected = (process.env.ADMIN_TOKEN ?? "").trim();
  if (!expected) return false;

  return timingSafeEqualStr(t, expected);
}

export function hasConfiguredAdminToken(): boolean {
  return Boolean((process.env.ADMIN_TOKEN ?? "").trim());
}
