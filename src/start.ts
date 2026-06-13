import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";

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
  // Keep this public app free of global functionMiddleware. In particular,
  // do NOT import/register `attachSupabaseAuth` here unless app code starts
  // using `requireSupabaseAuth`. The generated auth-attacher imports the
  // browser backend client, which triggers the published missing
  // SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY error during public SSR.
  requestMiddleware: [errorMiddleware],
}));
