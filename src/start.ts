import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";

// IMPORTANT: Do NOT import `attachSupabaseAuth` from
// `@/integrations/supabase/auth-attacher` here. This app has no
// `requireSupabaseAuth`-protected server functions, and the auth-attacher
// transitively imports the browser backend client, which throws
// "Missing Supabase environment variable(s): SUPABASE_URL,
// SUPABASE_PUBLISHABLE_KEY" during public SSR on the published site.

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware],
}));
