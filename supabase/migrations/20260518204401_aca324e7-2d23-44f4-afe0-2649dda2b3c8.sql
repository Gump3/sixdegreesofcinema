ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS is_daily boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS daily_date date;

CREATE UNIQUE INDEX IF NOT EXISTS games_daily_date_unique
  ON public.games (daily_date)
  WHERE daily_date IS NOT NULL;