// Admin metrics dashboard — gated by a query param secret.
//
// Usage: /admin?token=<ADMIN_TOKEN>
//
// ADMIN_TOKEN must be set as a secret in Lovable Cloud. If unset, this page
// shows a setup hint rather than a blank screen.

import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { z } from "zod";

const getAdminMetrics = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ token: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    const expected = process.env.ADMIN_TOKEN;
    if (!expected) {
      return { configured: false as const };
    }
    if (data.token !== expected) {
      throw new Error("Unauthorized");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin.rpc("admin_game_metrics");
    if (error) throw new Error(error.message);

    return { configured: true as const, rows: rows ?? [] };
  });

const adminQueryOptions = (token: string) =>
  queryOptions({
    queryKey: ["admin-metrics", token],
    queryFn: () => getAdminMetrics({ data: { token } }),
    retry: false,
  });

const adminSearchSchema = z.object({ token: z.string().optional() });

export const Route = createFileRoute("/admin")({
  validateSearch: adminSearchSchema,
  component: AdminPage,
  errorComponent: ({ error }) => (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md text-center text-muted-foreground">
        <h1 className="text-xl text-gold-bright font-display mb-2">Access denied</h1>
        <p className="text-sm">{error.message}</p>
      </div>
    </div>
  ),
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
});

function AdminPage() {
  const { token } = Route.useSearch();

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md text-center text-muted-foreground text-sm">
          <h1 className="text-xl text-gold-bright font-display mb-2">Admin</h1>
          <p>Append <code className="text-foreground">?token=YOUR_TOKEN</code> to the URL.</p>
        </div>
      </div>
    );
  }

  return <AdminInner token={token} />;
}

function AdminInner({ token }: { token: string }) {
  const { data } = useSuspenseQuery(adminQueryOptions(token));

  if (!data.configured) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md text-center text-muted-foreground text-sm space-y-2">
          <h1 className="text-xl text-gold-bright font-display">Setup required</h1>
          <p>
            Set the <code className="text-foreground">ADMIN_TOKEN</code> secret in Lovable Cloud,
            then reload with <code className="text-foreground">?token=...</code>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl text-gold-bright font-display mb-6">Daily game metrics</h1>
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-foreground">
              <tr>
                <th className="text-left px-4 py-2">Day</th>
                <th className="text-right px-4 py-2">Games created</th>
                <th className="text-right px-4 py-2">Daily puzzles</th>
                <th className="text-right px-4 py-2">Bacon rounds</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              {data.rows.map((r: { day: string; total: number; daily: number; bacon: number }) => (
                <tr key={r.day} className="border-t border-border">
                  <td className="px-4 py-2">{new Date(r.day).toLocaleDateString()}</td>
                  <td className="px-4 py-2 text-right">{r.total}</td>
                  <td className="px-4 py-2 text-right">{r.daily}</td>
                  <td className="px-4 py-2 text-right">{r.bacon}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
