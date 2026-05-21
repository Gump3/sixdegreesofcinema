/**
 * Tracks recent endpoint actors and endpoint pairs in localStorage so back-to-back
 * games don't keep surfacing the same handful of popular actors / the same pairings.
 *
 * Three signals are exposed to the server:
 *   - hard-exclude:   the most recent ~30 actor IDs (never picked again until they age out)
 *   - soft-suppress:  actor IDs seen in the wider recent window (~100) — picked with a weight penalty
 *   - frequency map:  how often each actor in the recent window has been an endpoint
 *                     (used to downweight "hub" celebrities like Tom Hanks / Scarlett Johansson)
 *   - recent pairs:   canonical "lo-hi" keys of the last ~50 endpoint pairs (avoid exact reuse,
 *                     mildly suppress frequently-paired-together actors)
 */
const KEY_RECENT = "sdh:recentActors";
const KEY_PAIRS = "sdh:recentPairs";

const HARD_EXCLUDE_CAP = 30;
const RECENT_CAP = 100;
const PAIR_CAP = 50;

function readArr<T>(key: string, guard: (v: unknown) => v is T): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter(guard) : [];
  } catch {
    return [];
  }
}

function readRecent(): number[] {
  return readArr<number>(KEY_RECENT, (v): v is number => typeof v === "number");
}

/** Hard-exclude list: most recent N actor IDs. Backwards-compatible name. */
export function getRecentActorIds(): number[] {
  return readRecent().slice(0, HARD_EXCLUDE_CAP);
}

/** Soft-suppress list: older entries in the recent window (not in the hard cut). */
export function getSuppressActorIds(): number[] {
  return readRecent().slice(HARD_EXCLUDE_CAP);
}

/** Frequency of each actor across the recent window (RECENT_CAP entries). */
export function getActorFrequency(): Record<number, number> {
  const out: Record<number, number> = {};
  for (const id of readRecent()) out[id] = (out[id] ?? 0) + 1;
  return out;
}

export function pairKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

export function getRecentPairs(): string[] {
  return readArr<string>(KEY_PAIRS, (v): v is string => typeof v === "string");
}

/** Record a freshly-shown endpoint pair. Updates both the actor window and the pair window. */
export function rememberEndpointPair(
  a: number | undefined | null,
  b: number | undefined | null,
) {
  if (typeof window === "undefined") return;
  try {
    const ids = [a, b].filter((x): x is number => typeof x === "number");
    if (ids.length) {
      // Push to front; allow duplicates so frequency reflects true exposure.
      const merged = [...ids, ...readRecent()].slice(0, RECENT_CAP);
      window.localStorage.setItem(KEY_RECENT, JSON.stringify(merged));
    }
    if (ids.length === 2) {
      const key = pairKey(ids[0], ids[1]);
      const pairs = [key, ...getRecentPairs().filter((p) => p !== key)].slice(0, PAIR_CAP);
      window.localStorage.setItem(KEY_PAIRS, JSON.stringify(pairs));
    }
  } catch {
    // ignore
  }
}

/** @deprecated Use rememberEndpointPair. Kept for any stragglers. */
export function rememberActorIds(ids: Array<number | undefined | null>) {
  rememberEndpointPair(ids[0], ids[1]);
}
