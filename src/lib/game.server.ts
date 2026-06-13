/**
 * Server functions for Six Degrees: Hollywood.
 *
 * IMPORTANT: This file must contain ONLY createServerFn declarations + their
 * imports, per the import-protection rule. Helpers live in tmdb.server.ts.
 */
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  type ChainStep,
  type Movie,
  type Person,
  findAlternatePaths,
  findShortestPath,
  getMovieCredits,
  getPersonCredits,
  getPopularPeoplePage,
  movieDto,
  personDto,
  readDebugCounters,
  searchMovies,
  searchPeople,
  TMDB_IMG,
} from "./tmdb.server";

type ActorRecord = {
  id: number;
  name: string;
  image: string | null;
};

function asActor(p: Person): ActorRecord {
  return {
    id: p.id,
    name: p.name,
    image: p.profile_path ? `${TMDB_IMG}${p.profile_path}` : null,
  };
}

// ============== createGame ==============
const GENERATION_RANGES: Record<string, [number, number] | null> = {
  boomer: [1960, 1989],
  genx: [1978, 2002],
  millennial: [1992, 2015],
  genz: [2008, new Date().getFullYear()],
  all: null,
};

// "Bleed" ranges from the adjacent era(s). Endpoints from these years are
// allowed into the pool with a reduced weight so the primary era still
// dominates picks (~70%) but the candidate pool is meaningfully larger.
// This is especially important for Boomer + Easy where the strict era +
// notable-credits filters otherwise collapse to a few dozen people and
// the same pair keeps recurring.
const GENERATION_BLEED_RANGES: Record<string, [number, number] | null> = {
  boomer: [1985, 2000],      // bleed forward into early Gen X
  genx: [1970, 1977],        // small bleed back into late Boomer
  millennial: [2016, 2020],  // bleed forward into Gen Z
  genz: [2003, 2007],        // bleed back into late Millennial
  all: null,
};
// Weight multiplier applied to bleed-only actors. Boomer uses a higher value
// to compensate for the genuinely smaller primary-era pool.
const BLEED_WEIGHT_DEFAULT = 0.4;
const BLEED_WEIGHT_BOOMER = 0.6;

// Kevin Bacon — TMDB person id. Used for "Bacon Round" surprise pairs.
const KEVIN_BACON_TMDB_ID = 4724;
const BACON_ROUND_PROBABILITY = 0.05; // ~5% of new (non-daily) games

async function fetchKevinBacon(): Promise<Person | null> {
  try {
    const results = await searchPeople("Kevin Bacon");
    const exact = results.find((p) => p.id === KEVIN_BACON_TMDB_ID);
    if (exact) return exact;
    // Fallback: synthesize a minimal Person record (image will be null).
    return {
      id: KEVIN_BACON_TMDB_ID,
      name: "Kevin Bacon",
      profile_path: null,
      known_for_department: "Acting",
      popularity: 50,
    };
  } catch {
    return null;
  }
}

const createGameInputSchema = z.object({
  mode: z.enum(["noob", "buff"]).default("noob"),
  difficulty: z.enum(["easy", "medium", "hard"]).default("easy"),
  generation: z.enum(["boomer", "genx", "millennial", "genz", "all"]).default("all"),
  excludeIds: z.array(z.number().int()).max(50).optional(),
  suppressIds: z.array(z.number().int()).max(200).optional(),
  frequency: z.record(z.string(), z.number().int().nonnegative()).optional(),
  excludePairs: z.array(z.string().max(40)).max(60).optional(),
  recentEndpointIds: z.array(z.number().int()).max(40).optional(),
});

export async function createGame({ data }: { data: z.infer<typeof createGameInputSchema> }) {
    const { mode, difficulty, generation, excludeIds, suppressIds, frequency, excludePairs, recentEndpointIds } = data;
    const eraRange = GENERATION_RANGES[generation] ?? null;

    // Deeper popularity sweep — same TMDB cost per page (cached), much wider pool.
    // Boomer goes deepest because the era pool is genuinely small after filters.
    const baseDepth =
      difficulty === "hard" ? 8 : difficulty === "medium" ? 6 : 4;
    const boomerBoost = generation === "boomer" ? 4 : 0;
    const basePages = Array.from({ length: baseDepth + boomerBoost }, (_, i) => i + 1);
    const pages = eraRange
      ? [...basePages, basePages[basePages.length - 1] + 1, basePages[basePages.length - 1] + 2, basePages[basePages.length - 1] + 3]
      : basePages;
    // Gen Z floor: require the actor's known_for to include a movie with vote_count >= 500.
    // Filters out obscure indie / TV-only credits while keeping recognizably-Gen-Z stars.
    const minKnownForVotes = generation === "genz" ? 500 : 0;
    const pool: Person[] = [];
    for (const page of pages) {
      try {
        const r = await getPopularPeoplePage(page, { eraRange, minKnownForVotes });
        pool.push(...r.filter((p) => p.known_for_department === "Acting"));
      } catch {
        // ignore page errors
      }
    }

    // Bleed pool: actors whose known_for falls in the adjacent era. These get
    // mixed in at reduced weight to expand the candidate set (esp. Boomer/Easy).
    const bleedRange = GENERATION_BLEED_RANGES[generation] ?? null;
    const bleedIds = new Set<number>();
    if (bleedRange) {
      const primaryIds = new Set(pool.map((p) => p.id));
      for (const page of basePages) {
        try {
          const r = await getPopularPeoplePage(page, { eraRange: bleedRange, minKnownForVotes });
          for (const p of r) {
            if (p.known_for_department !== "Acting") continue;
            if (primaryIds.has(p.id)) continue;
            if (bleedIds.has(p.id)) continue;
            bleedIds.add(p.id);
            pool.push(p);
          }
        } catch {
          // ignore
        }
      }
    }
    const bleedWeight = generation === "boomer" ? BLEED_WEIGHT_BOOMER : BLEED_WEIGHT_DEFAULT;

    // Fallback: if the era/Gen Z filter starved the pool, retry without those filters.
    if (pool.length < 2 && (eraRange || minKnownForVotes > 0)) {
      for (const page of basePages) {
        try {
          const r = await getPopularPeoplePage(page);
          pool.push(...r.filter((p) => p.known_for_department === "Acting"));
        } catch {
          // ignore
        }
      }
    }
    if (pool.length < 2) {
      throw new Error("TMDB returned no candidates. Try again in a moment.");
    }


    // Deduplicate by id (keep first occurrence — primary wins over bleed).
    const seen = new Set<number>();
    const dedup = pool.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));

    // Require an English Wikipedia article for every pool member. Filters out
    // TMDB-only / obscure actors (e.g. background-credit Julia Doyle types) so
    // Give Up / Hint always have something meaningful to reveal. Fails open
    // per-person on lookup errors; cached 30d so steady-state cost is ~0.
    let unique = await filterWithEnglishWikipedia(dedup);
    // Safety: if Wikipedia filter starves the pool, fall back to the unfiltered set.
    if (unique.length < 2) unique = dedup;

    // Two-tier hard-exclude:
    //   - recentEndpointIds (last ~6 games): NEVER allow these — strict cooldown
    //   - excludeIds (older window of ~30): preferred to exclude, drop if pool too thin
    const strictBlock = new Set(recentEndpointIds ?? []);
    const excludeSet = new Set(excludeIds ?? []);
    const strictFiltered = strictBlock.size
      ? unique.filter((p) => !strictBlock.has(p.id))
      : unique;
    // If strict block alone leaves <2, we have no choice — relax it.
    const afterStrict = strictFiltered.length >= 2 ? strictFiltered : unique;
    const filteredForVariety = excludeSet.size
      ? afterStrict.filter((p) => !excludeSet.has(p.id))
      : afterStrict;
    // Lowered threshold (8 → 4): keep older exclusions in effect even when pool is tight.
    const candidates = filteredForVariety.length >= 4 ? filteredForVariety : afterStrict;

    // ===== Weighted sampling =====
    // Penalize: (1) actors seen anywhere in the recent window (soft suppression),
    //           (2) hub actors who appeared often as endpoints (frequency penalty, squared).
    const suppressSet = new Set(suppressIds ?? []);
    const freq = frequency ?? {};
    const pairBlock = new Set(excludePairs ?? []);
    const pairKey = (x: number, y: number) => (x < y ? `${x}-${y}` : `${y}-${x}`);

    const weightOf = (p: Person) => {
      const f = freq[String(p.id)] ?? 0;
      let w = 1 / Math.pow(1 + f, 2); // hub downweight, squared
      if (suppressSet.has(p.id)) w *= 0.3; // soft cooldown
      if (bleedIds.has(p.id)) w *= bleedWeight; // adjacent-era bleed actors
      return w;
    };
    const weights = candidates.map(weightOf);
    // Stratified: 80% of the time, pick actor A from the "fresh" bucket
    // (not in the wider recent suppress window). Falls back to full pool.
    const freshIdx: number[] = [];
    for (let i = 0; i < candidates.length; i++) {
      if (!suppressSet.has(candidates[i].id) && !excludeSet.has(candidates[i].id)) {
        freshIdx.push(i);
      }
    }
    const pickWeighted = (excludeId?: number, fresh = false): Person | null => {
      const indices = fresh && freshIdx.length >= 2 ? freshIdx : candidates.map((_, i) => i);
      let total = 0;
      for (const i of indices) {
        if (excludeId !== undefined && candidates[i].id === excludeId) continue;
        total += weights[i];
      }
      if (total <= 0) return null;
      let r = Math.random() * total;
      for (const i of indices) {
        if (excludeId !== undefined && candidates[i].id === excludeId) continue;
        r -= weights[i];
        if (r <= 0) return candidates[i];
      }
      return candidates[indices[indices.length - 1]] ?? null;
    };

    let actorA: Person | null = null;
    let actorB: Person | null = null;

    // Easy/Medium: require endpoints to have a meaningful filmography so casual
    // players aren't asked to connect relative unknowns. Medium relaxed 5 → 4.
    const minNotableCredits =
      difficulty === "easy" ? 8 : difficulty === "medium" ? 4 : 0;

    for (let attempt = 0; attempt < 30; attempt++) {
      const useFresh = Math.random() < 0.8;
      const a = pickWeighted(undefined, useFresh);
      const b = a ? pickWeighted(a.id, useFresh) : null;
      if (!a || !b || a.id === b.id) continue;

      // Avoid exact-pair reuse from recent history.
      if (pairBlock.has(pairKey(a.id, b.id))) continue;

      // Fetch credits if we need either the credits-count check (easy/medium)
      // or the same-movie-costar check (hard).
      if (minNotableCredits > 0 || difficulty === "hard") {
        try {
          const [aCredits, bCredits] = await Promise.all([
            getPersonCredits(a.id),
            getPersonCredits(b.id),
          ]);
          if (minNotableCredits > 0) {
            if (aCredits.acting.length < minNotableCredits) continue;
            if (bCredits.acting.length < minNotableCredits) continue;
          }
          if (difficulty === "hard") {
            const aMovieIds = new Set(aCredits.acting.slice(0, 30).map((m) => m.id));
            const shared = bCredits.acting.slice(0, 30).some((m) => aMovieIds.has(m.id));
            if (shared) continue;
          }
        } catch {
          // ignore and accept the pair
        }
      }

      actorA = a;
      actorB = b;
      break;
    }

    if (!actorA || !actorB) {
      // Fallback: weighted random pick ignoring pair-block, so a small
      // candidate pool (e.g. Boomer + Easy after era + min-credits filters)
      // doesn't keep returning the same deterministic candidates[0/1] pair.
      const a = pickWeighted();
      const b = a ? pickWeighted(a.id) : null;
      if (a && b && a.id !== b.id) {
        actorA = a;
        actorB = b;
      } else {
        // Last resort: shuffle and take two distinct.
        const shuffled = [...candidates].sort(() => Math.random() - 0.5);
        actorA = shuffled[0] ?? null;
        actorB = shuffled.find((p) => p && actorA && p.id !== actorA.id) ?? null;
      }
    }

    if (!actorA || !actorB) {
      throw new Error(
        "Couldn't find a good pair with these settings. Try a broader era or easier difficulty.",
      );
    }


    // 🎬 BACON ROUND: ~5% chance to swap one endpoint for Kevin Bacon.
    // Skip if either picked actor *is* already Bacon (rare but possible).
    let isBaconRound = false;
    if (
      actorA.id !== KEVIN_BACON_TMDB_ID &&
      actorB.id !== KEVIN_BACON_TMDB_ID &&
      Math.random() < BACON_ROUND_PROBABILITY
    ) {
      const bacon = await fetchKevinBacon();
      if (bacon) {
        // Replace a random side so start/end can both surprise.
        if (Math.random() < 0.5) actorA = bacon;
        else actorB = bacon;
        isBaconRound = true;
      }
    }

    const aRec = asActor(actorA);
    const bRec = asActor(actorB);

    const { data: row, error } = await supabaseAdmin
      .from("games")
      .insert({
        actor_a: aRec as never,
        actor_b: bRec as never,
        difficulty,
        mode,
        is_bacon_round: isBaconRound,
      })
      .select("id")
      .single();

    if (error || !row) throw new Error(`Failed to create game: ${error?.message ?? "unknown"}`);

    return { gameId: row.id, actorA: aRec, actorB: bRec, mode, difficulty, isBaconRound };
}

// ============== getDailyChallenge ==============
// Returns the daily challenge game for today (UTC). Creates one if it doesn't
// exist yet — same pair for everyone on the same day.
function seededInt(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function getDailyChallenge() {
  // Use UTC date so everyone shares the same daily.
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // Already created?
  const existing = await supabaseAdmin
    .from("games")
    .select("id, actor_a, actor_b, mode, difficulty, daily_date")
    .eq("daily_date", today)
    .maybeSingle();
  if (existing.data) {
    return {
      gameId: existing.data.id,
      actorA: existing.data.actor_a as unknown as ActorRecord,
      actorB: existing.data.actor_b as unknown as ActorRecord,
      mode: existing.data.mode as "noob" | "buff",
      difficulty: existing.data.difficulty as "easy" | "medium" | "hard",
      date: today,
    };
  }

  // Build pool deterministically (top stars, all eras).
  const pool: Person[] = [];
  for (const page of [1, 2, 3]) {
    try {
      const r = await getPopularPeoplePage(page);
      pool.push(...r.filter((p) => p.known_for_department === "Acting"));
    } catch { /* ignore */ }
  }
  if (pool.length < 2) throw new Error("TMDB unavailable for daily challenge.");
  const seen = new Set<number>();
  const unique = pool.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));

  const rand = mulberry32(seededInt(today));
  const ia = Math.floor(rand() * unique.length);
  let ib = Math.floor(rand() * unique.length);
  if (ib === ia) ib = (ib + 1) % unique.length;
  const actorA = unique[ia];
  const actorB = unique[ib];

  const aRec = asActor(actorA);
  const bRec = asActor(actorB);

  // Insert; if another request inserted first, fall back to that row.
  const ins = await supabaseAdmin
    .from("games")
    .insert({
      actor_a: aRec as never,
      actor_b: bRec as never,
      difficulty: "medium",
      mode: "noob",
      is_daily: true,
      daily_date: today,
    })
    .select("id")
    .single();

  if (ins.error) {
    const retry = await supabaseAdmin
      .from("games")
      .select("id, actor_a, actor_b, mode, difficulty")
      .eq("daily_date", today)
      .single();
    if (retry.error || !retry.data) throw new Error(`Failed to create daily: ${ins.error.message}`);
    return {
      gameId: retry.data.id,
      actorA: retry.data.actor_a as unknown as ActorRecord,
      actorB: retry.data.actor_b as unknown as ActorRecord,
      mode: retry.data.mode as "noob" | "buff",
      difficulty: retry.data.difficulty as "easy" | "medium" | "hard",
      date: today,
    };
  }

  return {
    gameId: ins.data.id,
    actorA: aRec,
    actorB: bRec,
    mode: "noob" as const,
    difficulty: "medium" as const,
    date: today,
  };
}

// ============== loadGame ==============
export async function loadGame({ data }: { data: { gameId: string } }) {
    const { data: row, error } = await supabaseAdmin
      .from("games")
      .select("id, actor_a, actor_b, mode, difficulty, is_daily, daily_date, is_bacon_round")
      .eq("id", data.gameId)
      .single();
    if (error || !row) throw new Error("Game not found");
    return {
      gameId: row.id,
      actorA: row.actor_a as unknown as ActorRecord,
      actorB: row.actor_b as unknown as ActorRecord,
      mode: row.mode as "noob" | "buff",
      difficulty: row.difficulty as "easy" | "medium" | "hard",
      isDaily: Boolean(row.is_daily),
      dailyDate: (row.daily_date as string | null) ?? null,
      isBaconRound: Boolean(row.is_bacon_round),
    };
}

// ============== searchPeopleFn (autocomplete) ==============
export async function searchPeopleFn({ data }: { data: { query: string } }) {
    const results = await searchPeople(data.query);
    return results.map(personDto);
}

// ============== getPersonMoviesFn (eligible movies for a given person) ==============
export async function getPersonMoviesFn({ data }: { data: { personId: number } }) {
    const credits = await getPersonCredits(data.personId);
    const mark = (movies: Movie[], role: "acted" | "directed") =>
      movies.map((m) => ({ ...movieDto(m), role }));
    // Prioritize directing credits so a director's filmography (e.g. Spielberg's
    // Amistad) is never displaced by long lists of "as himself" acting credits
    // from documentaries/interviews. Always include all directing credits first,
    // then fill the rest with acting credits up to the cap.
    const CAP = 120;
    const directed = mark(credits.directing, "directed");
    const acted = mark(credits.acting, "acted");
    const seen = new Set<number>();
    const out: ReturnType<typeof mark>[number][] = [];
    for (const m of [...directed, ...acted]) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      out.push(m);
      if (out.length >= CAP) break;
    }
    return out;
}

// ============== getMoviePeopleFn ==============
export async function getMoviePeopleFn({ data }: { data: { movieId: number } }) {
    const credits = await getMovieCredits(data.movieId);
    // Top 5 billed always shown; below that, require notability so the picker
    // doesn't surface obscure supporting actors no one would recognize.
    const NOTABLE_PERSON_POPULARITY = 4;
    const topBilled = credits.cast.slice(0, 5);
    const restNotable = credits.cast
      .slice(5, 40)
      .filter((p) => (p.popularity ?? 0) >= NOTABLE_PERSON_POPULARITY);
    const top = [...topBilled, ...restNotable]
      .slice(0, 30)
      .map((p) => ({ ...personDto(p), role: "cast" as const }));
    const dirs = credits.directors.map((p) => ({ ...personDto(p), role: "director" as const }));
    const seen = new Set<number>();
    const out: Array<ReturnType<typeof personDto> & { role: "cast" | "director" }> = [];
    for (const p of [...dirs, ...top]) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
    }
    return out;
}

// ============== validateChain ==============
const chainStepSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("person"), id: z.number().int().positive(), name: z.string(), image: z.string().nullable() }),
  z.object({
    kind: z.literal("movie"),
    id: z.number().int().positive(),
    title: z.string(),
    image: z.string().nullable(),
    year: z.string().nullable().optional(),
  }),
]);

const validateChainInputSchema = z.object({
  gameId: z.string().uuid(),
  chain: z.array(chainStepSchema).min(1).max(15),
  hintsUsed: z.number().int().min(0).max(20).default(0),
  invalidAttempts: z.number().int().min(0).max(100).default(0),
});

export async function validateChain({ data }: { data: z.infer<typeof validateChainInputSchema> }) {
    const game = await supabaseAdmin
      .from("games")
      .select("actor_a, actor_b, difficulty, mode, shortest_path, alternates, is_bacon_round")
      .eq("id", data.gameId)
      .single();
    if (game.error || !game.data) throw new Error("Game not found");

    const actorA = game.data.actor_a as unknown as ActorRecord;
    const actorB = game.data.actor_b as unknown as ActorRecord;
    const isBaconRound = Boolean(game.data.is_bacon_round);

    const chain = data.chain;

    // Must start with Actor A and end with Actor B
    if (chain[0]?.kind !== "person" || chain[0].id !== actorA.id) {
      return { valid: false, reason: `Chain must start with ${actorA.name}.`, invalidStepIndex: 0, isBaconRound };
    }
    const last = chain[chain.length - 1];
    if (last.kind !== "person" || last.id !== actorB.id) {
      return {
        valid: false,
        reason: `Chain must end with ${actorB.name}.`,
        invalidStepIndex: chain.length - 1,
        isBaconRound,
      };
    }

    // Alternating types
    for (let i = 0; i < chain.length; i++) {
      const expected = i % 2 === 0 ? "person" : "movie";
      if (chain[i].kind !== expected) {
        return {
          valid: false,
          reason: `Step ${i + 1} must be a ${expected}.`,
          invalidStepIndex: i,
          isBaconRound,
        };
      }
    }

    // Each adjacent pair must be a real edge (person acted in OR directed the movie)
    for (let i = 0; i < chain.length - 1; i++) {
      const a = chain[i];
      const b = chain[i + 1];
      const personStep = a.kind === "person" ? a : b;
      const movieStep = a.kind === "movie" ? a : b;
      // Verify via movie credits
      const credits = await getMovieCredits(movieStep.id);
      const inCast = credits.cast.some((c) => c.id === (personStep as { id: number }).id);
      const isDirector = credits.directors.some((c) => c.id === (personStep as { id: number }).id);
      if (!inCast && !isDirector) {
        return {
          valid: false,
          reason: `${(personStep as { kind: "person"; name: string }).name} did not act in or direct ${
            (movieStep as { kind: "movie"; title: string }).title
          }.`,
          invalidStepIndex: i,
          isBaconRound,
        };
      }
    }

    // Degrees used = number of movies in the chain (i.e., edges between persons)
    const degrees = chain.filter((s) => s.kind === "movie").length;
    if (degrees > 6) {
      return { valid: false, reason: "Too many degrees (max 6).", invalidStepIndex: -1, isBaconRound };
    }

    // ====== Score ======
    const isHardMode = game.data.mode === "buff";
    const base = isHardMode ? 200 : 100;
    const degreeBonus =
      degrees <= 2 ? (isHardMode ? 50 : 25) :
      degrees === 3 ? (isHardMode ? 30 : 15) :
      degrees === 4 ? (isHardMode ? 20 : 10) :
      degrees === 5 ? (isHardMode ? 10 : 5) : 0;
    const hintPenalty = data.hintsUsed * (isHardMode ? 20 : 10);

    // 🎬 Bacon round multipliers:
    //   - Solve reward: 3x (applied to base + degreeBonus, before hint penalty)
    //   - Invalid-attempt penalty: 2x (and Bacon games penalize more per attempt)
    const solveMultiplier = isBaconRound ? 3 : 1;
    const perInvalidPenalty = isBaconRound ? 50 : 25;
    const invalidPenalty = data.invalidAttempts * perInvalidPenalty;
    const solveScore = (base + degreeBonus) * solveMultiplier - hintPenalty;

    // Allow negative for Bacon rounds (high risk / high reward). Normal games
    // still floor at 0 so casual players never see negatives.
    const rawScore = solveScore - invalidPenalty;
    let score = isBaconRound ? rawScore : Math.max(0, rawScore);

    // Anti-cheese rule: if the player hinted their way through every
    // intermediate step (everything between Actor A and Actor B was added
    // by Hint), the solve doesn't count for points — same effect as Give Up.
    // chain.length - 2 = number of steps the player has to fill in.
    const stepsBetween = Math.max(0, chain.length - 2);
    const fullyHinted = stepsBetween > 0 && data.hintsUsed >= stepsBetween;
    if (fullyHinted) score = 0;

    const shortest = game.data.shortest_path as unknown as ChainStep[] | null;
    const alternates = game.data.alternates as unknown as ChainStep[][] | null;

    return {
      valid: true,
      degrees,
      score,
      fullyHinted,
      isBaconRound,
      solveMultiplier,
      invalidPenalty,
      hintPenalty,
      shortestPath: shortest,
      alternates: alternates ?? [],
      alternatesPending: !shortest,
      debug: readDebugCounters(),
    };
}

// ============== getAlternatesFn ==============
// Heavy BFS lives behind its own endpoint so the validate call returns instantly.
// The client calls this after a successful submit; it may take a while on first run.
export async function getAlternatesFn({ data }: { data: { gameId: string } }) {
    const game = await supabaseAdmin
      .from("games")
      .select("actor_a, actor_b, shortest_path, alternates")
      .eq("id", data.gameId)
      .single();
    if (game.error || !game.data) throw new Error("Game not found");

    let shortest = game.data.shortest_path as unknown as ChainStep[] | null;
    let alternates = game.data.alternates as unknown as ChainStep[][] | null;

    if (!shortest) {
      const actorA = game.data.actor_a as unknown as ActorRecord;
      const actorB = game.data.actor_b as unknown as ActorRecord;
      shortest = await findShortestPath(actorA.id, actorB.id, {
        maxDepth: 4,
        budgetMs: 22_000,
        maxTmdbCalls: 500,
      });
      alternates = shortest ? await findAlternatePaths(actorA.id, actorB.id, 2, shortest) : [];
      await supabaseAdmin
        .from("games")
        .update({ shortest_path: (shortest ?? null) as never, alternates: (alternates ?? []) as never })
        .eq("id", data.gameId);
    }

    return {
      shortestPath: shortest,
      alternates: alternates ?? [],
      degrees: shortest ? shortest.filter((s) => s.kind === "movie").length : null,
      debug: readDebugCounters(),
    };
}

// ============== getHint ==============
const getHintInputSchema = z.object({
  gameId: z.string().uuid(),
  currentChain: z.array(chainStepSchema).min(1),
});

export async function getHint({ data }: { data: z.infer<typeof getHintInputSchema> }) {
    const game = await supabaseAdmin
      .from("games")
      .select("actor_a, actor_b, shortest_path")
      .eq("id", data.gameId)
      .single();
    if (game.error || !game.data) throw new Error("Game not found");

    const actorA = game.data.actor_a as unknown as ActorRecord;
    const actorB = game.data.actor_b as unknown as ActorRecord;

    // Compute (and cache) the canonical shortest path if not yet stored.
    let shortest = game.data.shortest_path as unknown as ChainStep[] | null;
    if (!shortest) {
      shortest = await findShortestPath(actorA.id, actorB.id, { maxDepth: 4, budgetMs: 22_000, maxTmdbCalls: 500 });
      if (shortest) {
        await supabaseAdmin
          .from("games")
          .update({ shortest_path: shortest as never })
          .eq("id", data.gameId);
      }
    }

    if (!shortest) return { hint: null, reason: "No path found within 6 degrees.", truncateTo: null };

    // Walk the user's chain from the end backwards: the deepest step that's
    // also on the canonical shortest path becomes our anchor, and we suggest
    // the next step from there. This makes Hint useful at ANY point in the
    // game — even after the user has wandered off the optimal path.
    const cur = data.currentChain;
    for (let i = cur.length - 1; i >= 0; i--) {
      const step = cur[i];
      const idx = shortest.findIndex(
        (s) => s.kind === step.kind && s.id === (step as { id: number }).id,
      );
      if (idx >= 0 && idx < shortest.length - 1) {
        const wandered = i < cur.length - 1;
        return {
          hint: shortest[idx + 1],
          // Client should truncate the chain to length (i + 1) before appending
          // the hint — this keeps person/movie alternation intact when the user
          // had wandered off the shortest path.
          truncateTo: i + 1,
          reason: wandered
            ? `You've drifted — rewinding to ${
                (step as { name?: string; title?: string }).name ??
                (step as { title?: string }).title
              } and suggesting the next step.`
            : "Try this next step.",
        };
      }
    }

    // Fallback: chain shares nothing with the path (shouldn't happen since
    // chain[0] is always Actor A = shortest[0]) — suggest the first move.
    if (shortest.length >= 2) {
      return { hint: shortest[1], truncateTo: 1, reason: "Start with this move." };
    }
    return { hint: null, reason: "No further hint available.", truncateTo: null };
}

// ============== giveUp ==============
export async function giveUp({ data }: { data: { gameId: string } }) {
    const game = await supabaseAdmin
      .from("games")
      .select("actor_a, actor_b, shortest_path, alternates")
      .eq("id", data.gameId)
      .single();
    if (game.error || !game.data) throw new Error("Game not found");

    const actorA = game.data.actor_a as unknown as ActorRecord;
    const actorB = game.data.actor_b as unknown as ActorRecord;

    let shortest = game.data.shortest_path as unknown as ChainStep[] | null;
    let alternates = game.data.alternates as unknown as ChainStep[][] | null;

    if (!shortest) {
      shortest = await findShortestPath(actorA.id, actorB.id, { maxDepth: 4, budgetMs: 22_000, maxTmdbCalls: 500 });
      alternates = shortest ? await findAlternatePaths(actorA.id, actorB.id, 2, shortest) : [];
      await supabaseAdmin
        .from("games")
        .update({ shortest_path: (shortest ?? null) as never, alternates: (alternates ?? []) as never })
        .eq("id", data.gameId);
    }

    return {
      shortestPath: shortest,
      alternates: alternates ?? [],
      degrees: shortest ? shortest.filter((s) => s.kind === "movie").length : null,
      debug: readDebugCounters(),
    };
}

// ============== getDebug (read counters) ==============
// ============== searchMoviesFn (TMDB title search; used for greyed-out hints) ==============
export async function searchMoviesFn({ data }: { data: { query: string } }) {
    const results = await searchMovies(data.query);
    return results.map(movieDto);
}

export async function getDebugStats() {
  return readDebugCounters();
}
