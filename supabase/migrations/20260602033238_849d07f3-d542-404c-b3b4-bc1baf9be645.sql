DROP POLICY IF EXISTS "Anyone can create games" ON public.games;

CREATE POLICY "No client inserts on games"
ON public.games
FOR INSERT
TO anon, authenticated
WITH CHECK (false);