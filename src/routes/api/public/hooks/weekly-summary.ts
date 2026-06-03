// Public webhook called by pg_cron to email a weekly metrics summary.
//
// Scaffolded as a no-op until both RESEND_API_KEY and LOVABLE_API_KEY are present
// and the cron schedule is created. See README / project notes for the SQL to schedule it.
//
// Security: validates `apikey` header against the Supabase anon key so only
// your own Supabase instance can trigger it.

import { createFileRoute } from "@tanstack/react-router";

const RECIPIENT = "thereeldispatch@gmail.com";

export const Route = createFileRoute("/api/public/hooks/weekly-summary")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!expected || apiKey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const resendKey = process.env.RESEND_API_KEY;
        const lovableKey = process.env.LOVABLE_API_KEY;
        if (!resendKey || !lovableKey) {
          console.log("[weekly-summary] Skipped — RESEND_API_KEY or LOVABLE_API_KEY not set.");
          return Response.json({ skipped: true, reason: "missing-secrets" });
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: rowsRaw, error } = await (supabaseAdmin as any)
            .from("admin_game_metrics")
            .select("*")
            .order("day", { ascending: false })
            .limit(7);
          if (error) throw new Error(error.message);
          const rows = (rowsRaw ?? []) as Array<{ day: string; total: number; daily: number; bacon: number }>;

          const last7 = rows;
          const totalGames = last7.reduce((sum, r) => sum + (r.total ?? 0), 0);

          const html = `
            <h2>Six Degrees of Cinema — weekly summary</h2>
            <p>Total games created in the last 7 days: <strong>${totalGames}</strong></p>
            <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
              <thead><tr>
                <th style="text-align:left;padding:4px 12px;border-bottom:1px solid #ccc">Day</th>
                <th style="text-align:right;padding:4px 12px;border-bottom:1px solid #ccc">Games</th>
                <th style="text-align:right;padding:4px 12px;border-bottom:1px solid #ccc">Daily</th>
                <th style="text-align:right;padding:4px 12px;border-bottom:1px solid #ccc">Bacon</th>
              </tr></thead>
              <tbody>
                ${last7
                  .map(
                    (r: { day: string; total: number; daily: number; bacon: number }) =>
                      `<tr><td style="padding:4px 12px">${new Date(r.day).toLocaleDateString()}</td><td style="text-align:right;padding:4px 12px">${r.total}</td><td style="text-align:right;padding:4px 12px">${r.daily}</td><td style="text-align:right;padding:4px 12px">${r.bacon}</td></tr>`,
                  )
                  .join("")}
              </tbody>
            </table>
          `;

          const res = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${lovableKey}`,
              "X-Connection-Api-Key": resendKey,
            },
            body: JSON.stringify({
              from: "Six Degrees of Cinema <onboarding@resend.dev>",
              to: [RECIPIENT],
              subject: `Weekly summary — ${totalGames} games`,
              html,
            }),
          });

          if (!res.ok) {
            const body = await res.text();
            throw new Error(`Resend ${res.status}: ${body}`);
          }

          return Response.json({ sent: true, totalGames });
        } catch (err) {
          console.error("[weekly-summary] error", err);
          return Response.json(
            { sent: false, error: err instanceof Error ? err.message : String(err) },
            { status: 500 },
          );
        }
      },
    },
  },
});
