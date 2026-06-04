// Lightweight game analytics — privacy-first, no PII.
// Append-only events table accessed via service role from server functions.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const eventSchema = z.object({
  event_type: z.enum(["puzzle_started", "puzzle_completed", "puzzle_given_up", "share_used"]),
  anon_id: z.string().min(8).max(64),
  game_id: z.string().uuid().optional().nullable(),
  difficulty: z.string().max(32).optional().nullable(),
  mode: z.string().max(32).optional().nullable(),
  is_daily: z.boolean().optional(),
  is_bacon: z.boolean().optional(),
  device: z.enum(["mobile", "desktop"]).optional().nullable(),
  solve_seconds: z.number().int().min(0).max(60 * 60 * 24).optional().nullable(),
  degrees_used: z.number().int().min(0).max(20).optional().nullable(),
  share_target: z.string().max(32).optional().nullable(),
});

export const recordEvent = createServerFn({ method: "POST" })
  .inputValidator((input) => eventSchema.parse(input))
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await (supabaseAdmin as any).from("game_events").insert({
        event_type: data.event_type,
        anon_id: data.anon_id,
        game_id: data.game_id ?? null,
        difficulty: data.difficulty ?? null,
        mode: data.mode ?? null,
        is_daily: data.is_daily ?? false,
        is_bacon: data.is_bacon ?? false,
        device: data.device ?? null,
        solve_seconds: data.solve_seconds ?? null,
        degrees_used: data.degrees_used ?? null,
        share_target: data.share_target ?? null,
      });
    } catch {
      // analytics must never break gameplay
    }
    return { ok: true };
  });

const summarySchema = z.object({
  token: z.string().min(1),
  days: z.number().int().min(1).max(365).optional(),
});

type Row = {
  event_type: string;
  anon_id: string;
  difficulty: string | null;
  mode: string | null;
  is_daily: boolean;
  device: string | null;
  solve_seconds: number | null;
  degrees_used: number | null;
  created_at: string;
};

function summarize(rows: Row[]) {
  const starts = rows.filter((r) => r.event_type === "puzzle_started");
  const completes = rows.filter((r) => r.event_type === "puzzle_completed");
  const giveups = rows.filter((r) => r.event_type === "puzzle_given_up");
  const shares = rows.filter((r) => r.event_type === "share_used");

  const startCount = starts.length;
  const completeCount = completes.length;
  const giveupCount = giveups.length;

  const avg = (xs: number[]) =>
    xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0;

  const solveTimes = completes
    .map((r) => r.solve_seconds)
    .filter((n): n is number => typeof n === "number");
  const degrees = completes
    .map((r) => r.degrees_used)
    .filter((n): n is number => typeof n === "number");

  const byKey = (xs: Row[], k: "difficulty" | "mode" | "device") => {
    const m: Record<string, number> = {};
    for (const r of xs) {
      const v = r[k] ?? "unknown";
      m[v] = (m[v] ?? 0) + 1;
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  };

  const uniqueAnon = (xs: Row[]) => new Set(xs.map((r) => r.anon_id)).size;
  const dailyStarts = starts.filter((r) => r.is_daily).length;

  return {
    starts: startCount,
    completions: completeCount,
    giveups: giveupCount,
    completion_rate: startCount ? Math.round((completeCount / startCount) * 1000) / 10 : 0,
    giveup_rate: startCount ? Math.round((giveupCount / startCount) * 1000) / 10 : 0,
    avg_solve_seconds: avg(solveTimes),
    avg_degrees_used: avg(degrees),
    by_difficulty: byKey(starts, "difficulty"),
    by_mode: byKey(starts, "mode"),
    by_device: byKey(starts, "device"),
    unique_players: uniqueAnon(starts),
    daily_challenge_starts: dailyStarts,
    daily_share_of_starts: startCount ? Math.round((dailyStarts / startCount) * 1000) / 10 : 0,
    share_count: shares.length,
    share_rate_of_completions: completeCount
      ? Math.round((shares.length / completeCount) * 1000) / 10
      : 0,
  };
}

export const getAnalyticsSummary = createServerFn({ method: "POST" })
  .inputValidator((input) => summarySchema.parse(input))
  .handler(async ({ data }) => {
    const expected = process.env.ADMIN_TOKEN;
    if (!expected) return { configured: false as const };
    if (data.token !== expected) throw new Error("Unauthorized");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const fetchWindow = async (days: number) => {
      const since = new Date(Date.now() - days * 86400_000).toISOString();
      const { data: rows, error } = await (supabaseAdmin as any)
        .from("game_events")
        .select("event_type, anon_id, difficulty, mode, is_daily, device, solve_seconds, degrees_used, created_at")
        .gte("created_at", since)
        .limit(100000);
      if (error) throw new Error(error.message);
      return summarize((rows ?? []) as Row[]);
    };

    const [d7, d30] = await Promise.all([fetchWindow(7), fetchWindow(30)]);
    return { configured: true as const, last_7_days: d7, last_30_days: d30 };
  });
