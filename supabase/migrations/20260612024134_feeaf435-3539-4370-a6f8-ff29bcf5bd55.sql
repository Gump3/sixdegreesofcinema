CREATE POLICY "No client access on game_events"
  ON public.game_events FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "No client access on tmdb_cache"
  ON public.tmdb_cache FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);