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
  // Do not add functionMiddleware here unless this public game introduces
  // requireSupabaseAuth-protected server functions. Registering the generated
  // auth attacher loads the browser backend client during server rendering and
  // causes the published missing SUPABASE_URL/PUBLISHABLE_KEY error.
  requestMiddleware: [errorMiddleware],
}));
