/**
 * Server functions for Six Degrees: Hollywood.
 *
 * IMPORTANT: This file must contain ONLY createServerFn declarations + their
 * imports, per the import-protection rule. Helpers live in tmdb.server.ts.
 */
import { createServerFn } from "@tanstack/react-start";
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

export const createGame = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        mode: z.enum(["noob", "buff"]).default("noob"),
        difficulty: z.enum(["easy", "medium", "hard"]).default("easy"),
        generation: z.enum(["boomer", "genx", "millennial", "genz", "all"]).default("all"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { mode, difficulty, generation } = data;
    const eraRange = GENERATION_RANGES[generation] ?? null;

    // Pull a popularity pool. Hard mode digs deeper for less obvious picks.
    // When a generation filter is on, sweep more pages since filtering shrinks each page.
    const basePages = difficulty === "hard" ? [1, 2, 3, 4, 5] : difficulty === "medium" ? [1, 2, 3] : [1, 2];
    const pages = eraRange ? [...basePages, basePages[basePages.length - 1] + 1, basePages[basePages.length - 1] + 2, basePages[basePages.length - 1] + 3] : basePages;
    const pool: Person[] = [];
    for (const page of pages) {
      try {
        const r = await getPopularPeoplePage(page, { eraRange });
        pool.push(...r.filter((p) => p.known_for_department === "Acting"));
      } catch {
        // ignore page errors
      }
    }
    // Fallback: if the era filter starved the pool, retry without it.
    if (pool.length < 2 && eraRange) {
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


    // Deduplicate by id
    const seen = new Set<number>();
    const unique = pool.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));

    let actorA: Person | null = null;
    let actorB: Person | null = null;

    for (let attempt = 0; attempt < 20; attempt++) {
      const a = unique[Math.floor(Math.random() * unique.length)];
      const b = unique[Math.floor(Math.random() * unique.length)];
      if (!a || !b || a.id === b.id) continue;

      // For Hard, avoid trivial direct-costar pairs (same movie).
      if (difficulty === "hard") {
        try {
          const [aCredits, bCredits] = await Promise.all([
            getPersonCredits(a.id),
            getPersonCredits(b.id),
          ]);
          const aMovieIds = new Set(aCredits.acting.slice(0, 30).map((m) => m.id));
          const shared = bCredits.acting.slice(0, 30).some((m) => aMovieIds.has(m.id));
          if (shared) continue;
        } catch {
          // ignore and accept the pair
        }
      }

      actorA = a;
      actorB = b;
      break;
    }

    if (!actorA || !actorB) {
      // Fallback: pick first two distinct
      actorA = unique[0];
      actorB = unique[1];
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
      })
      .select("id")
      .single();

    if (error || !row) throw new Error(`Failed to create game: ${error?.message ?? "unknown"}`);

    return { gameId: row.id, actorA: aRec, actorB: bRec, mode, difficulty };
  });

// ============== loadGame ==============
export const loadGame = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ gameId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { data: row, error } = await supabaseAdmin
      .from("games")
      .select("id, actor_a, actor_b, mode, difficulty")
      .eq("id", data.gameId)
      .single();
    if (error || !row) throw new Error("Game not found");
    return {
      gameId: row.id,
      actorA: row.actor_a as unknown as ActorRecord,
      actorB: row.actor_b as unknown as ActorRecord,
      mode: row.mode as "noob" | "buff",
      difficulty: row.difficulty as "easy" | "medium" | "hard",
    };
  });

// ============== searchPeopleFn (autocomplete) ==============
export const searchPeopleFn = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ query: z.string().min(1).max(100) }).parse(input))
  .handler(async ({ data }) => {
    const results = await searchPeople(data.query);
    return results.map(personDto);
  });

// ============== getPersonMoviesFn (eligible movies for a given person) ==============
export const getPersonMoviesFn = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ personId: z.number().int().positive() }).parse(input))
  .handler(async ({ data }) => {
    const credits = await getPersonCredits(data.personId);
    const mark = (movies: Movie[], role: "acted" | "directed") =>
      movies.map((m) => ({ ...movieDto(m), role }));
    const all = [...mark(credits.acting, "acted"), ...mark(credits.directing, "directed")];
    // Dedupe (same movie, prefer 'acted' first appearance)
    const seen = new Set<number>();
    const out: ReturnType<typeof mark>[number][] = [];
    for (const m of all) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      out.push(m);
    }
    // Keep top 60 by popularity (already sorted within each list, re-sort union loosely)
    return out.slice(0, 80);
  });

// ============== getMoviePeopleFn ==============
export const getMoviePeopleFn = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ movieId: z.number().int().positive() }).parse(input))
  .handler(async ({ data }) => {
    const credits = await getMovieCredits(data.movieId);
    const top = credits.cast.slice(0, 30).map((p) => ({ ...personDto(p), role: "cast" as const }));
    const dirs = credits.directors.map((p) => ({ ...personDto(p), role: "director" as const }));
    const seen = new Set<number>();
    const out: Array<ReturnType<typeof personDto> & { role: "cast" | "director" }> = [];
    for (const p of [...dirs, ...top]) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
    }
    return out;
  });

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

export const validateChain = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        gameId: z.string().uuid(),
        chain: z.array(chainStepSchema).min(1).max(15),
        hintsUsed: z.number().int().min(0).max(20).default(0),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const game = await supabaseAdmin
      .from("games")
      .select("actor_a, actor_b, difficulty, mode, shortest_path, alternates")
      .eq("id", data.gameId)
      .single();
    if (game.error || !game.data) throw new Error("Game not found");

    const actorA = game.data.actor_a as unknown as ActorRecord;
    const actorB = game.data.actor_b as unknown as ActorRecord;

    const chain = data.chain;

    // Must start with Actor A and end with Actor B
    if (chain[0]?.kind !== "person" || chain[0].id !== actorA.id) {
      return { valid: false, reason: `Chain must start with ${actorA.name}.`, invalidStepIndex: 0 };
    }
    const last = chain[chain.length - 1];
    if (last.kind !== "person" || last.id !== actorB.id) {
      return {
        valid: false,
        reason: `Chain must end with ${actorB.name}.`,
        invalidStepIndex: chain.length - 1,
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
        };
      }
    }

    // Degrees used = number of movies in the chain (i.e., edges between persons)
    const degrees = chain.filter((s) => s.kind === "movie").length;
    if (degrees > 6) {
      return { valid: false, reason: "Too many degrees (max 6).", invalidStepIndex: -1 };
    }

    // Score
    const isHardMode = game.data.mode === "buff";
    const base = isHardMode ? 200 : 100;
    const degreeBonus =
      degrees <= 2 ? (isHardMode ? 50 : 25) :
      degrees === 3 ? (isHardMode ? 30 : 15) :
      degrees === 4 ? (isHardMode ? 20 : 10) :
      degrees === 5 ? (isHardMode ? 10 : 5) : 0;
    const hintPenalty = data.hintsUsed * (isHardMode ? 20 : 10);
    const score = Math.max(0, base + degreeBonus - hintPenalty);

    // Return cached shortest path if already computed; otherwise client can fetch
    // it separately via getAlternatesFn so we don't block this response with a
    // potentially-minutes-long BFS (which causes upstream request timeouts).
    const shortest = game.data.shortest_path as unknown as ChainStep[] | null;
    const alternates = game.data.alternates as unknown as ChainStep[][] | null;

    return {
      valid: true,
      degrees,
      score,
      shortestPath: shortest,
      alternates: alternates ?? [],
      alternatesPending: !shortest,
      debug: readDebugCounters(),
    };
  });

// ============== getAlternatesFn ==============
// Heavy BFS lives behind its own endpoint so the validate call returns instantly.
// The client calls this after a successful submit; it may take a while on first run.
export const getAlternatesFn = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ gameId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
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
        budgetMs: 20_000,
        maxTmdbCalls: 200,
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
  });

// ============== getHint ==============
export const getHint = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        gameId: z.string().uuid(),
        currentChain: z.array(chainStepSchema).min(1),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
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
      shortest = await findShortestPath(actorA.id, actorB.id, { maxDepth: 4, budgetMs: 20_000, maxTmdbCalls: 200 });
      if (shortest) {
        await supabaseAdmin
          .from("games")
          .update({ shortest_path: shortest as never })
          .eq("id", data.gameId);
      }
    }

    if (!shortest) return { hint: null, reason: "No path found within 6 degrees." };

    // Find where the user's chain joins the canonical path.
    const cur = data.currentChain;
    const lastUser = cur[cur.length - 1];
    const idx = shortest.findIndex(
      (s) => s.kind === lastUser.kind && s.id === (lastUser as { id: number }).id,
    );
    if (idx >= 0 && idx < shortest.length - 1) {
      return { hint: shortest[idx + 1], reason: "Try this next step." };
    }
    return {
      hint: null,
      reason:
        "Your chain has wandered off the shortest known path — remove a step or give up to see the answer.",
    };
  });

// ============== giveUp ==============
export const giveUp = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ gameId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
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
      shortest = await findShortestPath(actorA.id, actorB.id, { maxDepth: 4, budgetMs: 20_000, maxTmdbCalls: 200 });
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
  });

// ============== getDebug (read counters) ==============
export const getDebugStats = createServerFn({ method: "GET" }).handler(async () => {
  return readDebugCounters();
});
