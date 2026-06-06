/**
 * Client-safe server function declarations for Six Degrees: Hollywood.
 *
 * The real implementation lives in game.server.ts so backend clients and
 * secrets never enter the browser import graph. Keep this file thin.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const createGameSchema = z.object({
  mode: z.enum(["noob", "buff"]).default("noob"),
  difficulty: z.enum(["easy", "medium", "hard"]).default("easy"),
  generation: z.enum(["boomer", "genx", "millennial", "genz", "all"]).default("all"),
  excludeIds: z.array(z.number().int()).max(50).optional(),
  suppressIds: z.array(z.number().int()).max(200).optional(),
  frequency: z.record(z.string(), z.number().int().nonnegative()).optional(),
  excludePairs: z.array(z.string().max(40)).max(60).optional(),
  recentEndpointIds: z.array(z.number().int()).max(40).optional(),
});

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

export const createGame = createServerFn({ method: "POST" })
  .inputValidator((input) => createGameSchema.parse(input))
  .handler(async ({ data }) => {
    const game = await import("./game.server");
    return game.createGame({ data });
  });

export const getDailyChallenge = createServerFn({ method: "POST" }).handler(async () => {
  const game = await import("./game.server");
  return game.getDailyChallenge();
});

export const loadGame = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ gameId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const game = await import("./game.server");
    return game.loadGame({ data });
  });

export const searchPeopleFn = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ query: z.string().min(1).max(100) }).parse(input))
  .handler(async ({ data }) => {
    const game = await import("./game.server");
    return game.searchPeopleFn({ data });
  });

export const getPersonMoviesFn = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ personId: z.number().int().positive() }).parse(input))
  .handler(async ({ data }) => {
    const game = await import("./game.server");
    return game.getPersonMoviesFn({ data });
  });

export const getMoviePeopleFn = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ movieId: z.number().int().positive() }).parse(input))
  .handler(async ({ data }) => {
    const game = await import("./game.server");
    return game.getMoviePeopleFn({ data });
  });

export const validateChain = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        gameId: z.string().uuid(),
        chain: z.array(chainStepSchema).min(1).max(15),
        hintsUsed: z.number().int().min(0).max(20).default(0),
        invalidAttempts: z.number().int().min(0).max(100).default(0),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const game = await import("./game.server");
    return game.validateChain({ data });
  });

export const getAlternatesFn = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ gameId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const game = await import("./game.server");
    return game.getAlternatesFn({ data });
  });

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
    const game = await import("./game.server");
    return game.getHint({ data });
  });

export const giveUp = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ gameId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const game = await import("./game.server");
    return game.giveUp({ data });
  });

export const searchMoviesFn = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ query: z.string().min(1).max(100) }).parse(input))
  .handler(async ({ data }) => {
    const game = await import("./game.server");
    return game.searchMoviesFn({ data });
  });

export const getDebugStats = createServerFn({ method: "GET" }).handler(async () => {
  const game = await import("./game.server");
  return game.getDebugStats();
});