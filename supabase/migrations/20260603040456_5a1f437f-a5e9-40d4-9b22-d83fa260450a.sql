-- Aggregate view for admin metrics dashboard + weekly email summary.
CREATE OR REPLACE VIEW public.admin_game_metrics AS
SELECT
  date_trunc('day', created_at)::date AS day,
  COUNT(*)::int AS total,
  COUNT(*) FILTER (WHERE is_daily)::int AS daily,
  COUNT(*) FILTER (WHERE is_bacon_round)::int AS bacon
FROM public.games
WHERE created_at >= now() - INTERVAL '60 days'
GROUP BY 1
ORDER BY 1 DESC;

-- Service role only; do NOT grant to anon/authenticated.
REVOKE ALL ON public.admin_game_metrics FROM PUBLIC;
REVOKE ALL ON public.admin_game_metrics FROM anon, authenticated;
GRANT SELECT ON public.admin_game_metrics TO service_role;

-- Make sure pg_cron + pg_net are enabled for the scheduled cleanup + weekly summary jobs.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;