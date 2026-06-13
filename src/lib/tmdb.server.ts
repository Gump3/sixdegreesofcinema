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
  vote_count?: number;
  video?: boolean;
  genre_ids?: number[];
};

// ===== Notability thresholds =====
// Goal: keep "who is this?" actors and movies out of the picker, hints, and BFS,
// without making the path solver unable to find a route.
// Notes from tuning:
//   - TMDB `popularity` is a recency-weighted trending score. Older mainstream
//     films (e.g. Haywire 2011 = pop 3.3 with 1,476 votes) score low even
//     though they're widely known. So we use vote_count as the primary gate
//     and only apply a tiny popularity floor as a sanity check.
//   - vote_count >= 200 reliably filters out indie/obscure titles.
//   - popularity >= 4 for people removes background actors / non-notable crew.
//   - `video: true` flags music videos / promo shorts / direct-to-video — exclude.
//   - Documentary-only credits (genre 99) tend to be obscure festival shorts; keep
//     them only if they clear a higher vote bar (handled via vote_count gate above).
const MIN_MOVIE_VOTE_COUNT = 200;
const MIN_MOVIE_POPULARITY = 1; // sanity floor only; vote_count does the work
const MIN_PERSON_POPULARITY = 4;

export function isNotableMovie(m: { vote_count?: number; popularity?: number; video?: boolean }): boolean {
  if (m.video === true) return false; // TMDB flag for non-theatrical video/short releases
  return (m.vote_count ?? 0) >= MIN_MOVIE_VOTE_COUNT && (m.popularity ?? 0) >= MIN_MOVIE_POPULARITY;
}



export function isNotablePerson(p: { popularity?: number }): boolean {
  return (p.popularity ?? 0) >= MIN_PERSON_POPULARITY;
}

// ===== English Wikipedia presence check =====
// Pool actors must have an English Wikipedia article. We resolve TMDB person
// → Wikidata Q-ID (via /person/{id}/external_ids) → check `enwiki` sitelink
// via the Wikidata API. Results cached 30 days in tmdb_cache under a
// dedicated key namespace so they share the existing TTL/expiry plumbing.
async function readWikiCache(key: string): Promise<boolean | null> {
  const v = await readCache(key);
  if (v === null || typeof v !== "object") return null;
  const obj = v as { has?: boolean };
  return typeof obj.has === "boolean" ? obj.has : null;
}
async function writeWikiCache(key: string, has: boolean) {
  await writeCache(key, { has }, "release_dates");
}

async function checkEnwikiSitelink(qid: string): Promise<boolean> {
  const cacheKey = `wikidata:sitelink:enwiki:${qid}`;
  const cached = await readWikiCache(cacheKey);
  if (cached !== null) return cached;
  try {
    const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(
      qid,
    )}&props=sitelinks&sitefilter=enwiki&format=json&origin=*`;
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) return true; // fail open
    const json = (await res.json()) as {
      entities?: Record<string, { sitelinks?: { enwiki?: { title?: string } } }>;
    };
    const ent = json.entities?.[qid];
    const has = !!ent?.sitelinks?.enwiki?.title;
    await writeWikiCache(cacheKey, has);
    return has;
  } catch {
    return true; // fail open on network errors
  }
}

export async function hasEnglishWikipedia(personId: number): Promise<boolean> {
  try {
    const ext = await tmdb<{ wikidata_id?: string | null }>(
      `/person/${personId}/external_ids`,
      {},
      "release_dates",
    );
    const qid = ext.wikidata_id;
    if (!qid) return false;
    return await checkEnwikiSitelink(qid);
  } catch {
    return true; // fail open: don't starve the pool on TMDB hiccups
  }
}

/** Concurrent filter — keeps only persons with an English Wikipedia article. */
export async function filterWithEnglishWikipedia<T extends { id: number }>(
  people: T[],
): Promise<T[]> {
  if (people.length === 0) return people;
  const results = await Promise.all(people.map((p) => hasEnglishWikipedia(p.id)));
  return people.filter((_, i) => results[i]);
}

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

// Cameo / uncredited / "as self" detection. TMDB exposes these signals via the
// `character` string and (rarely) by listing a person in "Self" department.
// We exclude them so chain edges only reflect real acting roles.
const CAMEO_RE = /\b(cameo|uncredited|himself|herself|themselves|themself|as self|self\b|narrator)\b/i;
function isCameoCharacter(character?: string | null): boolean {
  if (!character) return false;
  return CAMEO_RE.test(character);
}

// ===== Direct-to-video / TV-movie filter =====
// TMDB release types: 1=Premiere, 2=Theatrical(limited), 3=Theatrical,
// 4=Digital, 5=Physical, 6=TV. We exclude movies whose release types are
// EXCLUSIVELY physical (5) or TV (6) AND that have a low vote_count. This
// catches Hallmark / SyFy / DTV-sequel junk without touching prestige
// streaming originals (which carry type 4 and/or 1).
const DTV_MIN_VOTES_BYPASS = 1000;

async function getMovieReleaseTypes(movieId: number): Promise<Set<number>> {
  try {
    const data = await tmdb<{
      results?: Array<{ release_dates?: Array<{ type?: number }> }>;
    }>(`/movie/${movieId}/release_dates`, {}, "release_dates");
    const types = new Set<number>();
    for (const c of data.results ?? []) {
      for (const rd of c.release_dates ?? []) {
        if (typeof rd.type === "number") types.add(rd.type);
      }
    }
    return types;
  } catch {
    return new Set<number>();
  }
}

/**
 * Returns true if a movie passes the theatrical/streaming filter.
 * Bypasses the TMDB call for well-known films (vote_count >= 1000).
 * Fails open (keeps the movie) if release_dates is empty/unavailable.
 */
async function passesTheatricalFilter(m: { id: number; vote_count?: number }): Promise<boolean> {
  if ((m.vote_count ?? 0) >= DTV_MIN_VOTES_BYPASS) return true;
  const types = await getMovieReleaseTypes(m.id);
  if (types.size === 0) return true; // no data → don't penalize
  // Drop only when EVERY release type is in {5, 6}.
  for (const t of types) {
    if (t !== 5 && t !== 6) return true;
  }
  return false;
}

async function filterTheatrical<T extends { id: number; vote_count?: number }>(
  movies: T[],
): Promise<T[]> {
  if (movies.length === 0) return movies;
  const results = await Promise.all(movies.map((m) => passesTheatricalFilter(m)));
  return movies.filter((_, i) => results[i]);
}

// ============== People & movies (high-level) ==============
export async function getPersonCredits(personId: number): Promise<{
  acting: Movie[];
  directing: Movie[];
}> {
  const data = await tmdb<{
    cast?: Array<Movie & { release_date?: string; vote_count?: number; character?: string }>;
    crew?: Array<Movie & { job?: string; department?: string; release_date?: string; vote_count?: number }>;
  }>(`/person/${personId}/movie_credits`, {}, "credits");

  const acting = (data.cast ?? [])
    .filter((m) => !isCameoCharacter(m.character))
    .filter((m) => isEligibleMovieBasic(m))
    .filter((m) => isNotableMovie(m))
    .map((m) => ({
      id: m.id,
      title: m.title,
      poster_path: m.poster_path ?? null,
      release_date: m.release_date,
      popularity: m.popularity,
      vote_count: m.vote_count,
    }));

  const directing = (data.crew ?? [])
    .filter((m) => (m.job ?? "").toLowerCase() === "director" && isEligibleMovieBasic(m))
    .filter((m) => isNotableMovie(m))
    .map((m) => ({
      id: m.id,
      title: m.title,
      poster_path: m.poster_path ?? null,
      release_date: m.release_date,
      popularity: m.popularity,
      vote_count: m.vote_count,
    }));

  // Drop direct-to-video / TV-movie titles (release types ⊆ {5,6} & vote_count < 1000).
  const [actingFiltered, directingFiltered] = await Promise.all([
    filterTheatrical(acting),
    filterTheatrical(directing),
  ]);

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

  return { acting: dedupe(actingFiltered), directing: dedupe(directingFiltered) };
}

export async function getMovieCredits(movieId: number): Promise<{
  cast: Person[];
  directors: Person[];
}> {
  const data = await tmdb<{
    cast?: Array<Person & { order?: number; character?: string }>;
    crew?: Array<Person & { job?: string }>;
  }>(`/movie/${movieId}/credits`, {}, "credits");

  const cast = (data.cast ?? [])
    .filter((p) => !isCameoCharacter(p.character))
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

type KnownForItem = { media_type?: string; original_language?: string; release_date?: string; vote_count?: number; popularity?: number };

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
    .slice(0, 10)
    .map((p) => ({
      id: p.id,
      name: p.name,
      profile_path: p.profile_path ?? null,
      known_for_department: p.known_for_department,
      popularity: p.popularity,
    }));
}

export async function searchMovies(query: string): Promise<Movie[]> {
  if (!query.trim()) return [];
  const data = await tmdb<{ results?: (Movie & { original_language?: string })[] }>(
    `/search/movie`,
    { query, include_adult: "false" },
    "search",
  );
  const eligible = (data.results ?? [])
    .filter((m) => isEligibleMovieBasic(m))
    .slice(0, 20)
    .map((m) => ({
      id: m.id,
      title: m.title,
      poster_path: m.poster_path ?? null,
      release_date: m.release_date,
      popularity: m.popularity,
      vote_count: m.vote_count,
    }));
  const theatrical = await filterTheatrical(eligible);
  return theatrical.slice(0, 12);
}


export async function getPopularPeoplePage(
  page: number,
  opts: { eraRange?: [number, number] | null; minKnownForVotes?: number } = {},
): Promise<Person[]> {
  const data = await tmdb<{ results?: (Person & { known_for?: KnownForItem[] })[] }>(
    `/person/popular`,
    { page },
    "person_popular",
  );
  const era = opts.eraRange ?? null;
  const minVotes = opts.minKnownForVotes ?? 0;
  const inEra = (k: KnownForItem) => {
    if (!era || !k.release_date) return true;
    const y = Number(k.release_date.slice(0, 4));
    return !Number.isNaN(y) && y >= era[0] && y <= era[1];
  };
  return (data.results ?? [])
    .filter((p) => p.known_for_department === "Acting" || p.known_for_department === "Directing")
    .filter((p) => isHollywoodKnownFor(p.known_for))
    .filter((p) => isNotablePerson(p))
    .filter((p) =>
      era
        ? (p.known_for ?? []).some(
            (k) =>
              k.media_type === "movie" &&
              k.original_language === "en" &&
              inEra(k) &&
              (k.vote_count ?? 0) >= minVotes,
          )
        : minVotes > 0
          ? (p.known_for ?? []).some((k) => k.media_type === "movie" && (k.vote_count ?? 0) >= minVotes)
          : true,
    );
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
    excludeMovieIds?: Set<number>;
    budgetMs?: number;
    maxTmdbCalls?: number;
  } = {},
): Promise<ChainStep[] | null> {
  // Bidirectional BFS: expand from A and B alternately (smaller frontier
  // first) and stop as soon as a person is reached from both sides. This
  // gives roughly sqrt(N) of the calls a one-sided BFS would need, so we
  // can actually cover paths up to ~4 degrees within our TMDB budget.
  //
  // `maxDepth` is the total number of DEGREES (movies) allowed in the
  // final path. Side A hops + side B hops sum to that.
  const maxDepth = opts.maxDepth ?? 4;
  const movieCastCap = opts.movieCastCap ?? 12;
  const personMovieCap = opts.personMovieCap ?? 20;
  const exclude = opts.excludePersonIds ?? new Set<number>();
  const excludeMovies = opts.excludeMovieIds ?? new Set<number>();
  const deadline = Date.now() + (opts.budgetMs ?? 22_000);
  const startCalls = tmdbCallsThisProcess;
  const maxCalls = opts.maxTmdbCalls ?? 400;
  const budgetExceeded = () =>
    Date.now() > deadline || tmdbCallsThisProcess - startCalls >= maxCalls;

  if (personAId === personBId) return null;

  type Back = { prevPersonId: number; viaMovieId: number } | null;
  const visitedA = new Map<number, Back>([[personAId, null]]);
  const visitedB = new Map<number, Back>([[personBId, null]]);
  let frontierA: number[] = [personAId];
  let frontierB: number[] = [personBId];
  let depthA = 0;
  let depthB = 0;
  let meet: number | null = null;

  async function expandLayer(
    frontier: number[],
    visitedSelf: Map<number, Back>,
    visitedOther: Map<number, Back>,
  ): Promise<{ next: number[]; meet: number | null }> {
    const next: number[] = [];
    for (const pid of frontier) {
      if (budgetExceeded()) return { next, meet: null };
      let credits: { acting: Movie[]; directing: Movie[] };
      try {
        credits = await getPersonCredits(pid);
      } catch {
        continue;
      }
      const movies = [...credits.acting, ...credits.directing]
        .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
        .slice(0, personMovieCap)
        .filter((m) => !excludeMovies.has(m.id));
      for (const m of movies) {
        if (budgetExceeded()) return { next, meet: null };
        let mc: { cast: Person[]; directors: Person[] };
        try {
          mc = await getMovieCredits(m.id);
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
        for (const c of peoplePool) {
          if (exclude.has(c.id)) continue;
          if (visitedSelf.has(c.id)) continue;
          visitedSelf.set(c.id, { prevPersonId: pid, viaMovieId: m.id });
          if (visitedOther.has(c.id)) {
            return { next, meet: c.id };
          }
          next.push(c.id);
        }
      }
    }
    return { next, meet: null };
  }

  while (
    frontierA.length > 0 &&
    frontierB.length > 0 &&
    depthA + depthB < maxDepth
  ) {
    if (budgetExceeded()) break;
    // Always expand the smaller frontier next to keep cost balanced.
    if (frontierA.length <= frontierB.length) {
      const r = await expandLayer(frontierA, visitedA, visitedB);
      frontierA = r.next;
      depthA++;
      if (r.meet !== null) {
        meet = r.meet;
        break;
      }
    } else {
      const r = await expandLayer(frontierB, visitedB, visitedA);
      frontierB = r.next;
      depthB++;
      if (r.meet !== null) {
        meet = r.meet;
        break;
      }
    }
  }

  if (meet === null) return null;

  // Reconstruct A-side: walk visitedA from meet back to personA, then reverse.
  const path: Node[] = [];
  {
    const aChain: Node[] = [];
    let cur: number | null = meet;
    const guard = new Set<number>();
    while (cur !== null && !guard.has(cur)) {
      guard.add(cur);
      aChain.push({ kind: "person", id: cur });
      const back = visitedA.get(cur);
      if (!back) break;
      aChain.push({ kind: "movie", id: back.viaMovieId });
      cur = back.prevPersonId;
    }
    aChain.reverse();
    path.push(...aChain);
  }
  // Reconstruct B-side: walk visitedB from meet → B and append (skipping meet).
  {
    let cur: number | null = meet;
    const guard = new Set<number>([meet]);
    while (cur !== null) {
      const back = visitedB.get(cur);
      if (!back) break;
      path.push({ kind: "movie", id: back.viaMovieId });
      if (guard.has(back.prevPersonId)) break;
      guard.add(back.prevPersonId);
      path.push({ kind: "person", id: back.prevPersonId });
      cur = back.prevPersonId;
    }
  }

  const [aDetails, bDetails] = await Promise.all([
    tmdb<Person>(`/person/${personAId}`, {}, "credits"),
    tmdb<Person>(`/person/${personBId}`, {}, "credits"),
  ]);
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

  const primaryMovies = primary
    .filter((s) => s.kind === "movie")
    .map((s) => (s as Extract<ChainStep, { kind: "movie" }>).id);

  // Build attempt list: first try excluding each movie used in the primary
  // (yields a different path even when there are no intermediate persons),
  // then try excluding each intermediate person.
  const attempts: Array<{ persons?: Set<number>; movies?: Set<number> }> = [];
  for (const mId of primaryMovies) attempts.push({ movies: new Set([mId]) });
  for (const pId of intermediates) attempts.push({ persons: new Set([pId]) });

  for (const a of attempts) {
    if (alternates.length >= count) break;
    const alt = await findShortestPath(personAId, personBId, {
      excludePersonIds: a.persons,
      excludeMovieIds: a.movies,
      maxDepth: 4,
      budgetMs: 12_000,
      maxTmdbCalls: 200,
    });
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
