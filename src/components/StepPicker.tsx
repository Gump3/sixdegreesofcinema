import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Search, X } from "lucide-react";
import {
  getMoviePeopleFn,
  getPersonMoviesFn,
  searchMoviesFn,
  searchPeopleFn,
} from "@/lib/game.functions";

type Mode = "noob" | "buff";

export type PersonOpt = {
  id: number;
  name: string;
  image: string | null;
  department?: string;
  role?: "cast" | "director";
};

export type MovieOpt = {
  id: number;
  title: string;
  image: string | null;
  year: string | null;
  role?: "acted" | "directed";
};

type ContextStep = { kind: "person"; id: number } | { kind: "movie"; id: number };

type Props = {
  mode: Mode;
  /** What kind of step the user is choosing NEXT. */
  nextKind: "person" | "movie";
  /** The last step in the chain (drives candidate list). For nextKind === person,
   *  pass the prior movie. For nextKind === movie, pass the prior person. */
  context: ContextStep;
  onPick: (opt: PersonOpt | MovieOpt) => void;
  onCancel?: () => void;
};

/**
 * Used to add the next step in the chain. Behavior:
 * - Noob mode: load the full candidate list and show as a scrollable dropdown.
 * - Buff mode: type-to-search; for person-after-movie, filter the cached list;
 *   for movie-after-person, filter the cached list; the first person (which
 *   doesn't happen in this app since chain starts with Actor A) would use TMDB search.
 */
export function StepPicker({ mode, nextKind, context, onPick, onCancel }: Props) {
  const getPersonMovies = useServerFn(getPersonMoviesFn);
  const getMoviePeople = useServerFn(getMoviePeopleFn);
  const searchPeople = useServerFn(searchPeopleFn);
  const searchMovies = useServerFn(searchMoviesFn);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<(PersonOpt | MovieOpt)[]>([]);
  const [query, setQuery] = useState("");

  // Load candidates based on context
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        if (nextKind === "movie") {
          // context is a person; list their eligible movies
          if (context.kind !== "person") throw new Error("Bad context");
          const movies = await getPersonMovies({ data: { personId: context.id } });
          if (!cancelled) setCandidates(movies);
        } else {
          // nextKind === "person"; context is a movie; list its people
          if (context.kind !== "movie") throw new Error("Bad context");
          const people = await getMoviePeople({ data: { movieId: context.id } });
          if (!cancelled) setCandidates(people);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load options");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nextKind, context.kind, context.id, getPersonMovies, getMoviePeople]);

  // Optional remote search for people (Buff mode, person step, with empty cache match)
  const [remoteResults, setRemoteResults] = useState<PersonOpt[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);

  useEffect(() => {
    if (mode !== "buff") return;
    if (nextKind !== "person") return;
    const q = query.trim();
    if (q.length < 2) {
      setRemoteResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setRemoteLoading(true);
      try {
        const r = await searchPeople({ data: { query: q } });
        if (!cancelled) setRemoteResults(r);
      } catch {
        if (!cancelled) setRemoteResults([]);
      } finally {
        if (!cancelled) setRemoteLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [mode, nextKind, query, searchPeople]);

  // Remote MOVIE search (Buff mode, picking a movie) — informational, greyed-out.
  const [remoteMovies, setRemoteMovies] = useState<MovieOpt[]>([]);
  const [remoteMoviesLoading, setRemoteMoviesLoading] = useState(false);
  useEffect(() => {
    if (mode !== "buff") return;
    if (nextKind !== "movie") return;
    const q = query.trim();
    if (q.length < 2) {
      setRemoteMovies([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setRemoteMoviesLoading(true);
      try {
        const r = await searchMovies({ data: { query: q } });
        if (!cancelled) setRemoteMovies(r as MovieOpt[]);
      } catch {
        if (!cancelled) setRemoteMovies([]);
      } finally {
        if (!cancelled) setRemoteMoviesLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [mode, nextKind, query, searchMovies]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) => {
      const name = "name" in c ? c.name : c.title;
      return name.toLowerCase().includes(q);
    });
  }, [candidates, query]);

  const showRemote = mode === "buff" && nextKind === "person" && query.trim().length >= 2 && filtered.length === 0;
  const visible: (PersonOpt | MovieOpt)[] = showRemote ? remoteResults : filtered;
  // Buff mode hides the list until user types
  const shouldShowList = mode === "noob" || query.trim().length > 0;

  // Greyed-out, non-pickable movie hints: TMDB hits not in this person's filmography.
  const unconnectedMovies = useMemo<MovieOpt[]>(() => {
    if (mode !== "buff" || nextKind !== "movie") return [];
    if (query.trim().length < 2) return [];
    const localIds = new Set(candidates.map((c) => c.id));
    return remoteMovies.filter((m) => !localIds.has(m.id)).slice(0, 6);
  }, [mode, nextKind, query, candidates, remoteMovies]);

  const handlePick = useCallback(
    (opt: PersonOpt | MovieOpt) => {
      onPick(opt);
    },
    [onPick],
  );

  return (
    <div className="bg-card border border-gold/40 rounded-xl p-4 shadow-gold">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs uppercase tracking-widest text-gold-bright">
          Pick a {nextKind}
          {mode === "buff" && " (type to search)"}
        </div>
        {onCancel && (
          <button
            onClick={onCancel}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Cancel"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            mode === "buff"
              ? nextKind === "person"
                ? "Type a person's name…"
                : "Type a movie title…"
              : "Filter…"
          }
          className="w-full bg-input border border-border rounded-md pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="mt-3 max-h-80 overflow-y-auto -mx-1">
        {loading && (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Loading…
          </div>
        )}
        {!loading && error && <p className="text-sm text-destructive px-1 py-2">{error}</p>}
        {!loading && !error && !shouldShowList && (
          <p className="text-sm text-muted-foreground px-1 py-6 text-center">
            Start typing to search.
          </p>
        )}
        {!loading && !error && shouldShowList && visible.length === 0 && !remoteLoading && (
          <p className="text-sm text-muted-foreground px-1 py-6 text-center">
            No matches.
          </p>
        )}
        {!loading && !error && shouldShowList && (
          <ul className="space-y-1 px-1">
            {visible.map((opt) => (
              <li key={`${nextKind}-${opt.id}`}>
                <button
                  onClick={() => handlePick(opt)}
                  className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-secondary text-left transition"
                >
                  <div className="h-10 w-10 flex-shrink-0 rounded-md overflow-hidden bg-muted">
                    {opt.image ? (
                      <img
                        src={opt.image}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-muted-foreground text-xs">
                        {"title" in opt ? "🎬" : "👤"}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-foreground truncate">
                      {"name" in opt ? opt.name : opt.title}
                      {"year" in opt && opt.year && (
                        <span className="text-muted-foreground"> ({opt.year})</span>
                      )}
                    </div>
                    {opt.role && (
                      <div className="text-xs text-gold capitalize">{opt.role}</div>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
        {!loading && !error && shouldShowList && unconnectedMovies.length > 0 && (
          <div className="mt-3 border-t border-border/60 pt-2 px-1">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
              Not in this person's filmography
            </div>
            <ul className="space-y-1">
              {unconnectedMovies.map((m) => (
                <li
                  key={`unconnected-${m.id}`}
                  title="This movie exists, but the prior person is not in its cast/crew. Pick a different movie, or a person who is in it first."
                  className="w-full flex items-center gap-3 p-2 rounded-md opacity-40 cursor-not-allowed select-none"
                >
                  <div className="h-10 w-10 flex-shrink-0 rounded-md overflow-hidden bg-muted">
                    {m.image ? (
                      <img src={m.image} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-muted-foreground text-xs">🎬</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-foreground truncate">
                      {m.title}
                      {m.year && <span className="text-muted-foreground"> ({m.year})</span>}
                    </div>
                    <div className="text-[11px] text-muted-foreground">Not connected</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        {remoteMoviesLoading && shouldShowList && (
          <div className="px-1 py-2 text-xs text-muted-foreground inline-flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" /> Searching TMDB…
          </div>
        )}
      </div>
    </div>
  );
}
