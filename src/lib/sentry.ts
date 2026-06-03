// Sentry initialization scaffold.
//
// This is a no-op until you set SENTRY_DSN (server) and/or VITE_SENTRY_DSN (browser).
// When you're ready:
//   1. Sign up at https://sentry.io and create a project (pick "React" for browser).
//   2. Add the DSN as `VITE_SENTRY_DSN` (browser) and optionally `SENTRY_DSN` (server)
//      via Lovable Cloud → Secrets.
//   3. Install the SDK:    bun add @sentry/react
//   4. Uncomment the dynamic import block below.
//
// We intentionally do NOT import @sentry/react at module scope so the bundle stays
// the same size until you opt in.

export async function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;

  try {
    // @ts-expect-error - optional dependency, only installed once user adds DSN
    const Sentry = await import("@sentry/react");
    Sentry.init({
      dsn,
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0.1,
      environment: import.meta.env.MODE,
    });
  } catch (err) {
    // Package not installed yet — fail silently in dev.
    console.warn("[sentry] DSN set but @sentry/react is not installed. Run: bun add @sentry/react");
  }
}

export function captureServerError(error: unknown, context?: Record<string, unknown>) {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  // Server-side Sentry uses the same SDK in the Workers runtime.
  // Lazy import so the bundle isn't paying for it when unused.
  import("@sentry/react")
    // @ts-expect-error - optional dep
    .then((Sentry) => {
      if (!Sentry.getCurrentHub().getClient()) {
        Sentry.init({ dsn, environment: process.env.NODE_ENV });
      }
      Sentry.captureException(error, { extra: context });
    })
    .catch(() => {
      /* package not installed — silent */
    });
}
