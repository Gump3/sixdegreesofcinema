/**
 * Server-only TMDB v3 client + in-DB response cache + BFS pathfinder.
 *
 * NOTE: This file is server-only. It is imported by *.functions.ts modules
 * which run on the server. The TMDB_API_KEY is read INSIDE handlers via
 * process.env — never at module scope.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const TMDB_BASE = "https://api.themoviedb.org/3";
export const TMDB_IMG = "https://image.tmdb.org/t/p/w185";

// Per-process counters for the debug panel (reset on cold start)
let tmdbCallsThisProcess = 0;
let cacheHits = 0;
let cacheMisses = 0;
const recentErrors: { ts: string; endpoint: string; status: number; message: string }[] = [];

export function readDebugCounters() {
  return {
    tmdbCallsThisProcess,
    cacheHits,
    cacheMisses,
    recentErrors: [...recentErrors].slice(-10),
  };
}

export type TmdbCacheTTL = "credits" | "release_dates" | "search" | "person_popular" | "movie_details";

const TTL_SECONDS: Record<TmdbCacheTTL, number> = {
  credits: 60 * 60 * 24 * 7,           // 7 days
  release_dates: 60 * 60 * 24 * 30,    // 30 days
  search: 60 * 60 * 24,                // 1 day (search results change often)
  person_popular: 60 * 60 * 24,        // 1 day
  movie_details: 60 * 60 * 24 * 7,
};

function recordError(endpoint: string, status: number, message: string) {
  recentErrors.push({ ts: new Date().toISOString(), endpoint, status, message });
  if (recentErrors.length > 50) recentErrors.shift();
}

async function readCache(key: string): Promise<unknown | null> {
  const { data, error } = await supabaseAdmin
    .from("tmdb_cache")
    .select("payload, expires_at")
    .eq("cache_key", key)
    .maybeSingle();
  if (error || !data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return data.payload;
}

async function writeCache(key: string, payload: unknown, ttlKind: TmdbCacheTTL) {
  const expires = new Date(Date.now() + TTL_SECONDS[ttlKind] * 1000).toISOString();
  await supabaseAdmin
    .from("tmdb_cache")
    .upsert({ cache_key: key, payload: payload as never, expires_at: expires }, { onConflict: "cache_key" });
}

/**
 * Fetch a TMDB endpoint with cache + exponential backoff on 429.
 * - path: e.g. "/person/123/movie_credits"
 * - params: querystring params (api_key is added automatically)
 */
export async function tmdb<T = unknown>(
  path: string,
  params: Record<string, string | number | undefined> = {},
  ttlKind: TmdbCacheTTL = "credits",
): Promise<T> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    throw new Error("TMDB_API_KEY is not configured on the server.");
  }

  // Build deterministic cache key from path + params (excluding api_key)
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  const cacheKey = `${path}?${qs.toString()}`;

  const cached = await readCache(cacheKey);
  if (cached !== null) {
    cacheHits++;
    return cached as T;
  }
  cacheMisses++;

  qs.set("api_key", apiKey);
  const url = `${TMDB_BASE}${path}?${qs.toString()}`;

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      tmdbCallsThisProcess++;
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after") ?? "1");
        const waitMs = Math.min(8000, Math.max(500, retryAfter * 1000) * Math.pow(2, attempt));
        recordError(path, 429, `rate-limited, waiting ${waitMs}ms`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        recordError(path, res.status, text.slice(0, 200));
        throw new Error(`TMDB ${path} failed: ${res.status}`);
      }
      const json = (await res.json()) as T;
      await writeCache(cacheKey, json, ttlKind);
      return json;
    } catch (e) {
      lastErr = e;
      if (attempt === 3) break;
      await new Promise((r) => setTimeout(r, 300 * Math.pow(2, attempt)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`TMDB ${path} failed`);
}

// ============== Types ==============
export type Person = {
  id: number;
  name: string;
  profile_path: string | null;
  known_for_department?: string;
  popularity?: number;
};

export type Movie = {
  id: number;
  title: string;
  poster_path: string | null;
  release_date?: string;
  popularity?: number;
};

export type ChainStep =
  | { kind: "person"; id: number; name: string; image: string | null }
  | { kind: "movie"; id: number; title: string; image: string | null; year: string | null };

// ============== Eligibility ==============
function yearOf(date?: string | null): string | null {
  if (!date) return null;
  return date.slice(0, 4);
}

/** A movie is eligible if it has a past release_date and is not obviously TV/short. */
export function isEligibleMovieBasic(m: {
  release_date?: string | null;
  media_type?: string | null;
}): boolean {
  if (m.media_type && m.media_type !== "movie") return false;
  if (!m.release_date) return false;
  const t = Date.parse(m.release_date);
  if (Number.isNaN(t)) return false;
  return t <= Date.now();
}

// ============== People & movies (high-level) ==============
export async function getPersonCredits(personId: number): Promise<{
  acting: Movie[];
  directing: Movie[];
}> {
  const data = await tmdb<{
    cast?: Array<Movie & { release_date?: string }>;
    crew?: Array<Movie & { job?: string; department?: string; release_date?: string }>;
  }>(`/person/${personId}/movie_credits`, {}, "credits");

  const acting = (data.cast ?? [])
    .filter((m) => isEligibleMovieBasic(m))
    .map((m) => ({
      id: m.id,
      title: m.title,
      poster_path: m.poster_path ?? null,
      release_date: m.release_date,
      popularity: m.popularity,
    }));

  const directing = (data.crew ?? [])
    .filter((m) => (m.job ?? "").toLowerCase() === "director" && isEligibleMovieBasic(m))
    .map((m) => ({
      id: m.id,
      title: m.title,
      poster_path: m.poster_path ?? null,
      release_date: m.release_date,
      popularity: m.popularity,
    }));

  // Deduplicate by id (some people both acted and directed)
  const dedupe = (arr: Movie[]) => {
    const seen = new Set<number>();
    const out: Movie[] = [];
    for (const m of arr) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      out.push(m);
    }
    return out.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
  };

  return { acting: dedupe(acting), directing: dedupe(directing) };
}

export async function getMovieCredits(movieId: number): Promise<{
  cast: Person[];
  directors: Person[];
}> {
  const data = await tmdb<{
    cast?: Array<Person & { order?: number }>;
    crew?: Array<Person & { job?: string }>;
  }>(`/movie/${movieId}/credits`, {}, "credits");

  const cast = (data.cast ?? [])
    .slice() // copy
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .map((p) => ({
      id: p.id,
      name: p.name,
      profile_path: p.profile_path ?? null,
      popularity: p.popularity,
    }));

  const directors = (data.crew ?? [])
    .filter((c) => (c.job ?? "").toLowerCase() === "director")
    .map((p) => ({
      id: p.id,
      name: p.name,
      profile_path: p.profile_path ?? null,
      popularity: p.popularity,
    }));

  return { cast, directors };
}

type KnownForItem = { media_type?: string; original_language?: string; release_date?: string };

/**
 * Hollywood eligibility: the person's TMDB `known_for` array must contain
 * at least one English-language theatrical movie with a past release date.
 * Keeps the pool focused on actors a Hollywood player can recognize.
 */
function isHollywoodKnownFor(knownFor: KnownForItem[] | undefined): boolean {
  if (!knownFor || knownFor.length === 0) return false;
  return knownFor.some(
    (k) =>
      k.media_type === "movie" &&
      k.original_language === "en" &&
      !!k.release_date &&
      Date.parse(k.release_date) <= Date.now(),
  );
}

export async function searchPeople(query: string): Promise<Person[]> {
  if (!query.trim()) return [];
  const data = await tmdb<{ results?: (Person & { known_for?: KnownForItem[] })[] }>(
    `/search/person`,
    { query, include_adult: "false" },
    "search",
  );
  return (data.results ?? [])
    .filter((p) => p.known_for_department === "Acting" || p.known_for_department === "Directing")
    .filter((p) => isHollywoodKnownFor(p.known_for))
    .slice(0, 10)
    .map((p) => ({
      id: p.id,
      name: p.name,
      profile_path: p.profile_path ?? null,
      known_for_department: p.known_for_department,
      popularity: p.popularity,
    }));
}

export async function getPopularPeoplePage(page: number): Promise<Person[]> {
  const data = await tmdb<{ results?: (Person & { known_for?: KnownForItem[] })[] }>(
    `/person/popular`,
    { page },
    "person_popular",
  );
  return (data.results ?? [])
    .filter((p) => p.known_for_department === "Acting" || p.known_for_department === "Directing")
    .filter((p) => isHollywoodKnownFor(p.known_for));
}

// ============== Public DTO helpers (with full image URLs) ==============
export function personDto(p: Person) {
  return {
    id: p.id,
    name: p.name,
    image: p.profile_path ? `${TMDB_IMG}${p.profile_path}` : null,
    department: p.known_for_department,
  };
}

export function movieDto(m: Movie) {
  return {
    id: m.id,
    title: m.title,
    image: m.poster_path ? `${TMDB_IMG}${m.poster_path}` : null,
    year: yearOf(m.release_date),
  };
}

// ============== BFS pathfinding ==============
/**
 * Bidirectional-ish BFS from personA → personB. Returns an alternating
 * Person→Movie→Person chain (including endpoints) or null if not found within maxDepth.
 *
 * Budget controls (per-movie cast cap, per-person movie cap) keep TMDB calls bounded.
 */
type Node =
  | { kind: "person"; id: number }
  | { kind: "movie"; id: number };

function nodeKey(n: Node): string {
  return `${n.kind}:${n.id}`;
}

export async function findShortestPath(
  personAId: number,
  personBId: number,
  opts: {
    maxDepth?: number;
    movieCastCap?: number;
    personMovieCap?: number;
    excludePersonIds?: Set<number>;
    budgetMs?: number;
    maxTmdbCalls?: number;
  } = {},
): Promise<ChainStep[] | null> {
  // Tight defaults so the BFS finishes inside a Worker request window.
  // Popular Hollywood pairs almost always connect within 2–3 degrees;
  // depth=4 keeps us safe without ballooning the call count.
  const maxDepth = opts.maxDepth ?? 4;
  const movieCastCap = opts.movieCastCap ?? 6;
  const personMovieCap = opts.personMovieCap ?? 10;
  const exclude = opts.excludePersonIds ?? new Set<number>();
  const deadline = Date.now() + (opts.budgetMs ?? 20_000);
  const startCalls = tmdbCallsThisProcess;
  const maxCalls = opts.maxTmdbCalls ?? 200;
  const callsExceeded = () => tmdbCallsThisProcess - startCalls >= maxCalls;
  const timeExceeded = () => Date.now() > deadline;

  if (personAId === personBId) return null;

  const [aDetails, bDetails] = await Promise.all([
    tmdb<Person>(`/person/${personAId}`, {}, "credits"),
    tmdb<Person>(`/person/${personBId}`, {}, "credits"),
  ]);

  const parents = new Map<string, { node: Node; via?: Node }>();
  parents.set(nodeKey({ kind: "person", id: personAId }), {
    node: { kind: "person", id: personAId },
  });

  let frontier: Array<{ kind: "person"; id: number }> = [{ kind: "person", id: personAId }];
  let found: { kind: "person"; id: number } | null = null;

  outer: for (let depth = 1; depth <= maxDepth / 2 + 0.5 && frontier.length > 0; depth++) {
    if (timeExceeded() || callsExceeded()) break;
    const nextFrontier: Array<{ kind: "person"; id: number }> = [];
    const movieIdsThisLevel = new Map<number, number>();

    for (const p of frontier) {
      if (timeExceeded() || callsExceeded()) break outer;
      let credits: { acting: Movie[]; directing: Movie[] };
      try {
        credits = await getPersonCredits(p.id);
      } catch {
        continue;
      }
      const combined = [...credits.acting, ...credits.directing]
        .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
        .slice(0, personMovieCap);
      for (const m of combined) {
        const mKey = nodeKey({ kind: "movie", id: m.id });
        if (parents.has(mKey)) continue;
        parents.set(mKey, { node: { kind: "movie", id: m.id }, via: p });
        movieIdsThisLevel.set(m.id, p.id);
      }
    }

    for (const [movieId] of movieIdsThisLevel) {
      if (timeExceeded() || callsExceeded()) break outer;
      let mc: { cast: Person[]; directors: Person[] };
      try {
        mc = await getMovieCredits(movieId);
      } catch {
        continue;
      }
      const peoplePool = [
        ...mc.cast
          .slice()
          .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
          .slice(0, movieCastCap),
        ...mc.directors,
      ];
      for (const p of peoplePool) {
        if (exclude.has(p.id)) continue;
        const pKey = nodeKey({ kind: "person", id: p.id });
        if (parents.has(pKey)) continue;
        parents.set(pKey, { node: { kind: "person", id: p.id }, via: { kind: "movie", id: movieId } });
        if (p.id === personBId) {
          found = { kind: "person", id: p.id };
          break outer;
        }
        nextFrontier.push({ kind: "person", id: p.id });
      }
    }

    frontier = nextFrontier;
  }

  if (!found) return null;

  // Reconstruct
  const path: Node[] = [];
  let cur: Node | undefined = found;
  const guard = new Set<string>();
  while (cur) {
    if (guard.has(nodeKey(cur))) break;
    guard.add(nodeKey(cur));
    path.push(cur);
    const rec = parents.get(nodeKey(cur));
    cur = rec?.via;
  }
  path.reverse();

  // Hydrate path with names/images
  return hydratePath(path, { [personAId]: aDetails, [personBId]: bDetails });
}

async function hydratePath(
  path: Node[],
  preloadedPeople: Record<number, Person> = {},
): Promise<ChainStep[]> {
  const out: ChainStep[] = [];
  for (const n of path) {
    if (n.kind === "person") {
      const p = preloadedPeople[n.id] ?? (await tmdb<Person>(`/person/${n.id}`, {}, "credits"));
      out.push({
        kind: "person",
        id: n.id,
        name: p.name,
        image: p.profile_path ? `${TMDB_IMG}${p.profile_path}` : null,
      });
    } else {
      const m = await tmdb<Movie>(`/movie/${n.id}`, {}, "movie_details");
      out.push({
        kind: "movie",
        id: n.id,
        title: m.title,
        image: m.poster_path ? `${TMDB_IMG}${m.poster_path}` : null,
        year: yearOf(m.release_date),
      });
    }
  }
  return out;
}

/**
 * Find up to N meaningfully-different shortest-ish paths between two people.
 * Re-runs BFS excluding each intermediate Person to get genuinely different paths.
 */
export async function findAlternatePaths(
  personAId: number,
  personBId: number,
  count: number,
  primary: ChainStep[] | null,
): Promise<ChainStep[][]> {
  if (!primary) return [];
  const alternates: ChainStep[][] = [];
  const seenSignatures = new Set<string>([signaturePath(primary)]);

  const intermediates = primary
    .filter((s, i) => s.kind === "person" && i !== 0 && i !== primary.length - 1)
    .map((s) => (s as Extract<ChainStep, { kind: "person" }>).id);

  for (const blockId of intermediates) {
    if (alternates.length >= count) break;
    const exclude = new Set<number>([blockId]);
    const alt = await findShortestPath(personAId, personBId, { excludePersonIds: exclude, maxDepth: 6 });
    if (!alt) continue;
    const sig = signaturePath(alt);
    if (seenSignatures.has(sig)) continue;
    seenSignatures.add(sig);
    alternates.push(alt);
  }
  return alternates;
}

function signaturePath(p: ChainStep[]): string {
  return p.map((s) => `${s.kind}:${s.id}`).join("|");
}
