/**
 * Tracks recently-seen actor TMDB ids in localStorage so consecutive new
 * games don't keep surfacing the same handful of popular actors. Capped to
 * keep the variety window reasonable without starving small pools.
 */
const KEY = "sdh:recentActors";
const CAP = 20;

export function getRecentActorIds(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((n) => typeof n === "number") : [];
  } catch {
    return [];
  }
}

export function rememberActorIds(ids: Array<number | undefined | null>) {
  if (typeof window === "undefined") return;
  try {
    const fresh = ids.filter((x): x is number => typeof x === "number");
    const merged = [...fresh, ...getRecentActorIds().filter((x) => !fresh.includes(x))];
    window.localStorage.setItem(KEY, JSON.stringify(merged.slice(0, CAP)));
  } catch {
    // ignore
  }
}
