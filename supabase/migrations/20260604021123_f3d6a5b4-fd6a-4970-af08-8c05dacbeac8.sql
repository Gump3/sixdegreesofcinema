
CREATE TABLE public.game_events (
  id            bigserial PRIMARY KEY,
  event_type    text NOT NULL,
  anon_id       text NOT NULL,
  game_id       uuid,
  difficulty    text,
  mode          text,
  is_daily      boolean NOT NULL DEFAULT false,
  is_bacon      boolean NOT NULL DEFAULT false,
  device        text,
  solve_seconds integer,
  degrees_used  integer,
  share_target  text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX game_events_created_at_idx ON public.game_events (created_at DESC);
CREATE INDEX game_events_type_created_idx ON public.game_events (event_type, created_at DESC);
CREATE INDEX game_events_anon_idx ON public.game_events (anon_id);

GRANT ALL ON public.game_events TO service_role;
GRANT ALL ON SEQUENCE public.game_events_id_seq TO service_role;

ALTER TABLE public.game_events ENABLE ROW LEVEL SECURITY;

-- No policies: client (anon/authenticated) has no direct access.
-- All reads and writes go through server functions using the service role.
