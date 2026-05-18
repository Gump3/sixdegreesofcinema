-- Games: one row per round
CREATE TABLE public.games (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_a JSONB NOT NULL,
  actor_b JSONB NOT NULL,
  difficulty TEXT NOT NULL DEFAULT 'noob',
  mode TEXT NOT NULL DEFAULT 'noob',
  shortest_path JSONB,
  alternates JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

-- Anyone (anon) can create and read games — no auth in v1.
CREATE POLICY "Anyone can create games"
  ON public.games FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can read games"
  ON public.games FOR SELECT
  TO anon, authenticated
  USING (true);

-- Server-side TMDB response cache (service role only)
CREATE TABLE public.tmdb_cache (
  cache_key TEXT NOT NULL PRIMARY KEY,
  payload JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tmdb_cache ENABLE ROW LEVEL SECURITY;
-- No policies => no anon/authenticated access. Service role bypasses RLS.

CREATE INDEX tmdb_cache_expires_at_idx ON public.tmdb_cache (expires_at);