#!/usr/bin/env node
/**
 * Zero-dependency secret scanner.
 *
 *   node scripts/scan-secrets.mjs          # staged files (pre-commit)
 *   node scripts/scan-secrets.mjs --all    # every tracked file (CI)
 *
 * Never prints matched values — only file + line number + rule name.
 */
import { execSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const ALL = process.argv.includes("--all");

const SKIP_PATH =
  /(^|\/)(node_modules|dist|build|\.git|\.output|\.vercel|\.wrangler)\//;
const BINARY_EXT =
  /\.(png|jpe?g|gif|webp|ico|svg|woff2?|ttf|eot|mp4|mp3|pdf|zip|lock)$/i;

const RULES = [
  {
    name: "env file committed",
    test: (_line, file) =>
      /(^|\/)\.env(\..*)?$/.test(file) && !/\.env\.example$/.test(file),
    whole: true,
  },
  { name: "Supabase secret key", re: /sb_secret_[A-Za-z0-9_-]{10,}/ },
  { name: "Supabase access token", re: /\bsbp_[A-Za-z0-9]{20,}/ },
  { name: "OpenAI-style key", re: /\bsk-[A-Za-z0-9]{20,}/ },
  { name: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{20,}/ },
  { name: "AWS access key id", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "private key block", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  {
    name: "Postgres URL with password",
    re: /postgres(ql)?:\/\/[^\s:@/]+:[^\s:@/]+@/,
  },
  {
    name: "hardcoded secret assignment",
    re: /\b(TMDB_API_KEY|ADMIN_TOKEN|SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY|DB_PASSWORD|DATABASE_PASSWORD|SMTP_PASSWORD|SENTRY_AUTH_TOKEN)\b\s*[:=]\s*["'`][^"'`\s]{12,}["'`]/,
  },
];

/** JWTs are only a problem when the payload is not the public anon role. */
function jwtFindings(line) {
  const out = [];
  for (const m of line.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})/g)) {
    let role = "";
    try {
      const json = Buffer.from(
        m[1].replace(/-/g, "+").replace(/_/g, "/"),
        "base64",
      ).toString("utf8");
      role = (JSON.parse(json).role ?? "").toString();
    } catch {
      role = "unknown";
    }
    if (role !== "anon") out.push(`privileged JWT (role: ${role || "unknown"})`);
  }
  return out;
}

function files() {
  const cmd = ALL
    ? "git ls-files"
    : "git diff --cached --name-only --diff-filter=ACMR";
  return execSync(cmd, { encoding: "utf8" })
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean)
    .filter((f) => !SKIP_PATH.test(f) && !BINARY_EXT.test(f))
    .filter((f) => f !== "scripts/scan-secrets.mjs");
}

const findings = [];

for (const file of files()) {
  for (const rule of RULES) {
    if (rule.whole && rule.test(null, file)) {
      findings.push({ file, line: 0, rule: rule.name });
    }
  }

  let text;
  try {
    if (statSync(file).size > 2_000_000) continue;
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (text.includes("\u0000")) continue;

  text.split("\n").forEach((line, i) => {
    if (line.length > 5000) return;
    for (const rule of RULES) {
      if (rule.re && rule.re.test(line)) {
        findings.push({ file, line: i + 1, rule: rule.name });
      }
    }
    for (const name of jwtFindings(line)) {
      findings.push({ file, line: i + 1, rule: name });
    }
  });
}

if (findings.length === 0) {
  console.log(
    `secret-scan: clean (${ALL ? "all tracked files" : "staged files"})`,
  );
  process.exit(0);
}

console.error("secret-scan: potential secrets detected\n");
for (const f of findings) {
  console.error(`  ${f.file}${f.line ? `:${f.line}` : ""}  — ${f.rule}`);
}
console.error(
  "\nValues are not printed. Remove the secret, store it in the Cloud secret store,\n" +
    "and reference it via process.env at runtime. Bypass (not recommended): git commit --no-verify",
);
process.exit(1);
