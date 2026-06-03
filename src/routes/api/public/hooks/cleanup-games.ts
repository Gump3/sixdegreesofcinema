// Public webhook called by pg_cron to purge stale `games` rows.
//
// "Stale" = rows older than 30 days. We treat every row as eligible for purge
// since play state isn't persisted on the games table (the table only stores
// puzzle definitions). Daily puzzles (is_daily=true) are preserved indefinitely
// so the archive remains intact.
//
// Security: validates `apikey` header against the Supabase anon key.

import { createFileRoute } from "@tanstack/react-router";

const RETENTION_DAYS = 30;

export const Route = createFileRoute("/api/public/hooks/cleanup-games")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!expected || apiKey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

          const { count, error } = await supabaseAdmin
            .from("games")
            .delete({ count: "exact" })
            .lt("created_at", cutoff)
            .eq("is_daily", false);

          if (error) throw new Error(error.message);
          return Response.json({ purged: count ?? 0, cutoff });
        } catch (err) {
          console.error("[cleanup-games] error", err);
          return Response.json(
            { error: err instanceof Error ? err.message : String(err) },
            { status: 500 },
          );
        }
      },
    },
  },
});
