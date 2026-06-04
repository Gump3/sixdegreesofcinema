// Admin metrics dashboard — gated by a query param secret.
//
// Usage: /admin?token=<ADMIN_TOKEN>

import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { hasConfiguredAdminToken, isValidAdminToken } from "@/lib/admin-token";
import { getAnalyticsSummary } from "@/lib/analytics.functions";

const getAdminMetrics = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ token: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    if (!hasConfiguredAdminToken()) {
      return { configured: false as const };
    }
    if (!(await isValidAdminToken(data.token))) {
      throw new Error("Unauthorized");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await (supabaseAdmin as any)
      .from("admin_game_metrics")
      .select("*")
      .order("day", { ascending: false })
      .limit(60);
    if (error) throw new Error(error.message);

    return { configured: true as const, rows: (rows ?? []) as Array<{ day: string; total: number; daily: number; bacon: number }> };
  });

const adminQueryOptions = (token: string) =>
  queryOptions({
    queryKey: ["admin-metrics", token],
    queryFn: () => getAdminMetrics({ data: { token } }),
    retry: false,
  });

const engagementQueryOptions = (token: string) =>
  queryOptions({
    queryKey: ["admin-engagement", token],
    queryFn: () => getAnalyticsSummary({ data: { token } }),
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
      <div className="max-w-4xl mx-auto space-y-10">
        <EngagementSection token={token} />

        <section>
          <h2 className="text-2xl text-gold-bright font-display mb-4">Daily game metrics</h2>
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
                {data.rows.map((r) => (
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
        </section>
      </div>
    </div>
  );
}

function EngagementSection({ token }: { token: string }) {
  const { data } = useSuspenseQuery(engagementQueryOptions(token));
  if (!data.configured) return null;
  return (
    <section>
      <h2 className="text-2xl text-gold-bright font-display mb-4">Gameplay engagement</h2>
      <div className="grid md:grid-cols-2 gap-6">
        <WindowCard title="Last 7 days" s={data.last_7_days} />
        <WindowCard title="Last 30 days" s={data.last_30_days} />
      </div>
    </section>
  );
}

type Summary = {
  starts: number;
  completions: number;
  giveups: number;
  completion_rate: number;
  giveup_rate: number;
  avg_solve_seconds: number;
  avg_degrees_used: number;
  by_difficulty: [string, number][];
  by_mode: [string, number][];
  by_device: [string, number][];
  unique_players: number;
  daily_challenge_starts: number;
  daily_share_of_starts: number;
  share_count: number;
  share_rate_of_completions: number;
};

function WindowCard({ title, s }: { title: string; s: Summary }) {
  return (
    <div className="border border-border rounded-lg p-4 space-y-4">
      <h3 className="text-sm uppercase tracking-widest text-gold">{title}</h3>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Stat label="Unique players" value={s.unique_players} />
        <Stat label="Starts" value={s.starts} />
        <Stat label="Completions" value={s.completions} />
        <Stat label="Give-ups" value={s.giveups} />
        <Stat label="Completion rate" value={`${s.completion_rate}%`} />
        <Stat label="Give-up rate" value={`${s.giveup_rate}%`} />
        <Stat label="Avg solve time" value={`${s.avg_solve_seconds}s`} />
        <Stat label="Avg degrees" value={s.avg_degrees_used} />
        <Stat label="Daily plays" value={`${s.daily_challenge_starts} (${s.daily_share_of_starts}%)`} />
        <Stat label="Shares" value={`${s.share_count} (${s.share_rate_of_completions}%/win)`} />
      </div>
      <Breakdown title="By difficulty" rows={s.by_difficulty} />
      <Breakdown title="By mode" rows={s.by_mode} />
      <Breakdown title="By device" rows={s.by_device} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-border/50 rounded px-3 py-2 bg-secondary/30">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="text-foreground font-mono">{value}</div>
    </div>
  );
}

function Breakdown({ title, rows }: { title: string; rows: [string, number][] }) {
  if (!rows.length) return null;
  const total = rows.reduce((a, [, n]) => a + n, 0);
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{title}</div>
      <div className="space-y-1">
        {rows.map(([k, n]) => (
          <div key={k} className="flex justify-between text-xs text-muted-foreground">
            <span className="text-foreground">{k}</span>
            <span className="font-mono">
              {n} {total ? `(${Math.round((n / total) * 100)}%)` : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
