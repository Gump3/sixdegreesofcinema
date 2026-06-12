import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Film,
  Flag,
  Flame,
  Lightbulb,
  Loader2,
  Plus,
  Share2,
  Trophy,
  User,
  X,
  Zap,
  ArrowLeftRight,
} from "lucide-react";
import {
  createGame,
  getAlternatesFn,
  getHint,
  giveUp,
  loadGame,
  validateChain,
} from "@/lib/game.functions";
import { StepPicker, type MovieOpt, type PersonOpt } from "@/components/StepPicker";
import { PathDisplay } from "@/components/PathDisplay";
import { DebugPanel } from "@/components/DebugPanel";
import type { ChainStep } from "@/lib/types";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useStreak } from "@/hooks/use-streak";
import { useStats } from "@/hooks/use-stats";
import { track } from "@/lib/analytics";

export const Route = createFileRoute("/game/$gameId")({
  component: GameScreen,
  head: ({ params }) => ({
    meta: [
      { title: "Connection Challenge — Six Degrees of Cinema" },
      {
        name: "description",
        content:
          "Solve this Six Degrees of Cinema connection challenge: link two movie stars in six degrees or fewer.",
      },
      { property: "og:title", content: "Connection Challenge — Six Degrees of Cinema" },
      {
        property: "og:description",
        content:
          "Solve this Six Degrees of Cinema connection challenge: link two movie stars in six degrees or fewer.",
      },
      { property: "og:url", content: `/game/${params.gameId}` },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: `/game/${params.gameId}` }],
  }),
});

type GameData = {
  gameId: string;
  actorA: { id: number; name: string; image: string | null };
  actorB: { id: number; name: string; image: string | null };
  mode: "noob" | "buff";
  difficulty: "easy" | "medium" | "hard";
  isDaily: boolean;
  dailyDate: string | null;
  isBaconRound: boolean;
};

type ScoreEntry = {
  gameId: string;
  ts: number;
  username: string;
  score: number;
  degrees: number;
  actorA: string;
  actorB: string;
  mode: "noob" | "buff";
};

function GameScreen() {
  const { gameId } = Route.useParams();
  const navigate = useNavigate();
  const loadGameFn = useServerFn(loadGame);
  const validateFn = useServerFn(validateChain);
  const hintFn = useServerFn(getHint);
  const giveUpFn = useServerFn(giveUp);
  const alternatesFn = useServerFn(getAlternatesFn);
  const createGameFn = useServerFn(createGame);

  const isDebug =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") === "true";

  const [username] = useLocalStorage<string>("sdh:username", "Anonymous");
  const [history, setHistory] = useLocalStorage<ScoreEntry[]>("sdh:history", []);
  const streak = useStreak();
  const stats = useStats();
  const isStreakGame = streak.hydrated && streak.state.active && streak.state.currentGameId === gameId;
  const [streakEnded, setStreakEnded] = useState<{ finalCount: number; best: number } | null>(null);
  const [streakMilestone, setStreakMilestone] = useState<{ count: number; message: string } | null>(null);
  const [advancingStreak, setAdvancingStreak] = useState(false);
  const [reversed, setReversed] = useState(false);

  const [game, setGame] = useState<GameData | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [chain, setChain] = useState<ChainStep[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [invalidAttempts, setInvalidAttempts] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [hintLoading, setHintLoading] = useState(false);
  const [givingUp, setGivingUp] = useState(false);
  const [result, setResult] = useState<
    | null
    | {
        valid: boolean;
        reason?: string;
        degrees?: number;
        score?: number;
        isBaconRound?: boolean;
        solveMultiplier?: number;
        invalidPenalty?: number;
        shortestPath?: ChainStep[] | null;
        alternates?: ChainStep[][];
        gaveUp?: boolean;
        fullyHinted?: boolean;
      }
  >(null);
  const [alternatesLoading, setAlternatesLoading] = useState(false);
  const [debugInfo, setDebugInfo] = useState<Parameters<typeof DebugPanel>[0]["debug"]>(null);
  const [validationLog, setValidationLog] = useState<string[]>([]);

  // Load game — reset all per-game state when gameId changes
  useEffect(() => {
    let cancelled = false;
    setGame(null);
    setLoadErr(null);
    setChain([]);
    setResult(null);
    setHintsUsed(0);
    setInvalidAttempts(0);
    setDebugInfo(null);
    setValidationLog([]);
    setStreakEnded(null);
    setStreakMilestone(null);
    setReversed(false);
    setRefreshing(false);
    setAdvancingStreak(false);
    setPickerOpen(false);
    (async () => {
      try {
        const g = await loadGameFn({ data: { gameId } });
        if (cancelled) return;
        setGame(g);
        setChain([{ kind: "person", id: g.actorA.id, name: g.actorA.name, image: g.actorA.image }]);
        startedAtRef.current = Date.now();
        track({
          event_type: "puzzle_started",
          game_id: g.gameId,
          difficulty: g.difficulty,
          mode: g.mode,
          is_daily: g.isDaily,
          is_bacon: g.isBaconRound,
        });
      } catch (e) {
        if (!cancelled) setLoadErr(e instanceof Error ? e.message : "Failed to load game");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gameId, loadGameFn]);

  const aActor = game ? (reversed ? game.actorB : game.actorA) : null;
  const bActor = game ? (reversed ? game.actorA : game.actorB) : null;
  const lastStep = chain[chain.length - 1];
  const nextKind: "person" | "movie" = lastStep?.kind === "person" ? "movie" : "person";
  const degreesUsed = chain.filter((s) => s.kind === "movie").length;
  const canSubmit =
    game !== null &&
    bActor !== null &&
    chain.length >= 3 && // at minimum A → movie → B
    lastStep?.kind === "person" &&
    "id" in lastStep &&
    lastStep.id === bActor.id &&
    degreesUsed <= 6;
  const reachedTarget = canSubmit;
  const overLimit = degreesUsed > 6;
  const canReverse = !!game && chain.length <= 1 && !result;

  function toggleReverse() {
    if (!game || chain.length > 1 || result) return;
    const next = !reversed;
    setReversed(next);
    const newA = next ? game.actorB : game.actorA;
    setChain([{ kind: "person", id: newA.id, name: newA.name, image: newA.image }]);
  }

  function milestoneMessage(count: number): string | null {
    if (count === 3) return "You've got momentum. Don't fade to black now.";
    if (count === 5) return "This is where the training montage pays off.";
    if (count === 10) return "You're entering legendary sequel territory.";
    if (count === 15) return "The box office records are getting nervous.";
    if (count >= 20 && count % 5 === 0) return "The Academy would like a word.";
    return null;
  }

  function addStep(opt: PersonOpt | MovieOpt) {
    if (nextKind === "person" && "name" in opt) {
      setChain((c) => [...c, { kind: "person", id: opt.id, name: opt.name, image: opt.image }]);
    } else if (nextKind === "movie" && "title" in opt) {
      setChain((c) => [
        ...c,
        { kind: "movie", id: opt.id, title: opt.title, image: opt.image, year: opt.year },
      ]);
    }
    setPickerOpen(false);
  }

  function removeFrom(index: number) {
    setChain((c) => c.slice(0, index));
    setResult(null);
  }

  async function handleSubmit() {
    if (!game) return;
    setSubmitting(true);
    setValidationLog((l) => [...l, `Submitting chain of ${chain.length} steps…`]);
    try {
      const res = await validateFn({
        data: { gameId, chain, hintsUsed, invalidAttempts },
      });
      setResult(res);
      if ("debug" in res && res.debug) setDebugInfo(res.debug);
      if (res.valid) {
        setValidationLog((l) => [
          ...l,
          `Valid! degrees=${res.degrees} score=${res.score}`,
        ]);
        // Save to local history
        setHistory([
          {
            gameId,
            ts: Date.now(),
            username,
            score: res.score ?? 0,
            degrees: res.degrees ?? 0,
            actorA: (aActor ?? game.actorA).name,
            actorB: (bActor ?? game.actorB).name,
            mode: game.mode,
          },
          ...history,
        ].slice(0, 50));

        // Streak: solved → increment, await next puzzle (Continue button).
        if (isStreakGame) {
          // Keep currentGameId pointing at THIS game so `isStreakGame` stays
          // true on the result screen — otherwise the "Continue Streak" CTA
          // collapses back to the generic "New pair" buttons.
          streak.recordSolved(gameId);
          const newCount = streak.state.count + 1;
          const msg = milestoneMessage(newCount);
          if (msg) setStreakMilestone({ count: newCount, message: msg });
        }
        // Wordle-style local stats.
        stats.recordResult(gameId, true, res.degrees ?? undefined);
        track({
          event_type: "puzzle_completed",
          game_id: gameId,
          difficulty: game.difficulty,
          mode: game.mode,
          is_daily: game.isDaily,
          is_bacon: game.isBaconRound,
          solve_seconds: startedAtRef.current
            ? Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000))
            : 0,
          degrees_used: res.degrees ?? degreesUsed,
        });


        // Kick off alternates BFS separately so it doesn't block validation.
        if (("alternatesPending" in res && res.alternatesPending) || !res.shortestPath) {
          setAlternatesLoading(true);
          alternatesFn({ data: { gameId } })
            .then((alt) => {
              setResult((r) =>
                r && r.valid
                  ? { ...r, shortestPath: alt.shortestPath, alternates: alt.alternates }
                  : r,
              );
              if (alt.debug) setDebugInfo(alt.debug);
              setValidationLog((l) => [
                ...l,
                `Alternates loaded (${alt.alternates.length}).`,
              ]);
            })
            .catch((e) => {
              setValidationLog((l) => [...l, `Alternates error: ${(e as Error).message}`]);
            })
            .finally(() => setAlternatesLoading(false));
        }
      } else {
        // Track each invalid submission so the penalty accumulates (Bacon rounds
        // double the per-attempt cost on the server).
        setInvalidAttempts((n) => n + 1);
        setValidationLog((l) => [...l, `Invalid: ${res.reason}`]);
        // Streak: an incorrect submission ends the run.
        if (isStreakGame) {
          const finalCount = streak.state.count;
          const newBest = Math.max(streak.stats.best, finalCount);
          streak.end(finalCount);
          setStreakEnded({ finalCount, best: newBest });
        }
      }
    } catch (e) {
      setResult({ valid: false, reason: e instanceof Error ? e.message : "Validation failed" });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleHint() {
    if (!game || hintLoading) return;
    setHintLoading(true);
    try {
      const res = await hintFn({ data: { gameId, currentChain: chain } });
      if (res.hint) {
        setHintsUsed((h) => h + 1);
        // If the user wandered off the shortest path, the server returns a
        // truncateTo index so we can rewind their chain back to the anchor
        // before appending the suggested step (keeps person/movie alternation).
        const truncateTo = "truncateTo" in res && typeof res.truncateTo === "number" ? res.truncateTo : null;
        setChain((c) => {
          const base = truncateTo !== null ? c.slice(0, truncateTo) : c;
          return [...base, res.hint as ChainStep];
        });
        setValidationLog((l) => [...l, `Hint added: ${res.reason}`]);
        // Streak: any hint ends the run.
        if (isStreakGame) {
          const finalCount = streak.state.count;
          const newBest = Math.max(streak.stats.best, finalCount);
          streak.end(finalCount);
          setStreakEnded({ finalCount, best: newBest });
        }
      } else {
        setValidationLog((l) => [...l, `No hint available: ${res.reason ?? ""}`]);
      }
    } catch (e) {
      setValidationLog((l) => [...l, `Hint error: ${(e as Error).message}`]);
    } finally {
      setHintLoading(false);
    }
  }

  async function handleGiveUp() {
    if (!game || givingUp) return;
    setGivingUp(true);
    try {
      const res = await giveUpFn({ data: { gameId } });
      setResult({
        valid: false,
        gaveUp: true,
        shortestPath: res.shortestPath,
        alternates: res.alternates,
        degrees: res.degrees ?? undefined,
        reason: res.shortestPath
          ? `Shortest path: ${res.degrees} degrees.`
          : "No path found within 6 degrees.",
      });
      if (res.debug) setDebugInfo(res.debug);

      // Streak: giving up ends the run.
      if (isStreakGame) {
        const finalCount = streak.state.count;
        const newBest = Math.max(streak.stats.best, finalCount);
        streak.end(finalCount);
        setStreakEnded({ finalCount, best: newBest });
      }
      // Wordle-style local stats — giving up counts as played + not solved.
      stats.recordResult(gameId, false);
      track({
        event_type: "puzzle_given_up",
        game_id: gameId,
        difficulty: game.difficulty,
        mode: game.mode,
        is_daily: game.isDaily,
        is_bacon: game.isBaconRound,
        solve_seconds: startedAtRef.current
          ? Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000))
          : undefined,
        degrees_used: degreesUsed,
      });


    } catch (e) {
      setResult({ valid: false, reason: (e as Error).message });
    } finally {
      setGivingUp(false);
    }
  }

  function playAgain() {
    navigate({ to: "/" });
  }

  const [refreshing, setRefreshing] = useState(false);
  async function newPair() {
    if (!game || refreshing) return;
    setRefreshing(true);
    try {
      let generation: "boomer" | "genx" | "millennial" | "genz" | "all" = "all";
      try {
        const raw = window.localStorage.getItem("sdh:generation");
        if (raw) generation = JSON.parse(raw);
      } catch { /* ignore */ }
      const { getRecentActorIds, getSuppressActorIds, getActorFrequency, getRecentPairs, getRecentEndpointIds, rememberEndpointPair } = await import("@/lib/recent-actors");
      const res = await createGameFn({ data: {
        mode: game.mode, difficulty: game.difficulty, generation,
        excludeIds: getRecentActorIds(),
        suppressIds: getSuppressActorIds(),
        frequency: getActorFrequency(),
        excludePairs: getRecentPairs(),
        recentEndpointIds: getRecentEndpointIds(),
      } });
      rememberEndpointPair(res.actorA?.id, res.actorB?.id);
      navigate({ to: "/game/$gameId", params: { gameId: res.gameId } });
    } catch (e) {
      setValidationLog((l) => [...l, `New pair error: ${(e as Error).message}`]);
      setRefreshing(false);
    }
  }

  async function continueStreak() {
    if (!streak.state.settings || advancingStreak) return;
    setAdvancingStreak(true);
    try {
      const { getRecentActorIds, getSuppressActorIds, getActorFrequency, getRecentPairs, getRecentEndpointIds, rememberEndpointPair } = await import("@/lib/recent-actors");
      const res = await createGameFn({ data: {
        ...streak.state.settings,
        excludeIds: getRecentActorIds(),
        suppressIds: getSuppressActorIds(),
        frequency: getActorFrequency(),
        excludePairs: getRecentPairs(),
        recentEndpointIds: getRecentEndpointIds(),
      } });
      rememberEndpointPair(res.actorA?.id, res.actorB?.id);
      streak.advance(res.gameId);
      navigate({ to: "/game/$gameId", params: { gameId: res.gameId } });
    } catch (e) {
      setValidationLog((l) => [...l, `Streak advance error: ${(e as Error).message}`]);
      setAdvancingStreak(false);
    }
  }

  function endStreakNow() {
    if (!isStreakGame) return;
    const finalCount = streak.state.count;
    const newBest = Math.max(streak.stats.best, finalCount);
    streak.end(finalCount);
    setStreakEnded({ finalCount, best: newBest });
  }


  // Share helpers
  const [shareCopied, setShareCopied] = useState<null | "link" | "result">(null);
  async function copyText(text: string, kind: "link" | "result") {
    let target: "native" | "clipboard" = "clipboard";
    try {
      if (navigator.share && kind === "result") {
        await navigator.share({ text }).then(() => { target = "native"; }).catch(async () => {
          await navigator.clipboard.writeText(text);
          target = "clipboard";
        });
      } else {
        await navigator.clipboard.writeText(text);
      }
      setShareCopied(kind);
      setTimeout(() => setShareCopied(null), 1800);
      if (game) {
        track({
          event_type: "share_used",
          game_id: game.gameId,
          difficulty: game.difficulty,
          mode: game.mode,
          is_daily: game.isDaily,
          is_bacon: game.isBaconRound,
          share_target: `${kind}:${target}`,
        });
      }
    } catch {
      // ignore
    }
  }
  function shareGameLink() {
    if (!game) return;
    const url = `${window.location.origin}/game/${game.gameId}`;
    const text = game.isDaily
      ? `🎬 Six Degrees of Cinema — Daily ${game.dailyDate}: ${game.actorA.name} ↔ ${game.actorB.name}. Can you connect them?\n${url}`
      : `🎬 Six Degrees of Cinema: connect ${game.actorA.name} ↔ ${game.actorB.name} in 6 degrees or fewer.\n${url}`;
    void copyText(text, "link");
  }
  function shareResult() {
    if (!game || !result?.valid) return;
    const url = `${window.location.origin}/game/${game.gameId}`;
    const tag = game.isDaily ? `Daily ${game.dailyDate}` : `${game.mode === "buff" ? "Movie Buff" : "Movie Noob"} · ${game.difficulty}`;
    const text =
      `🎬 Six Degrees of Cinema — ${tag}\n` +
      `${game.actorA.name} ↔ ${game.actorB.name}\n` +
      `Solved in ${result.degrees}° · ${result.score} pts${hintsUsed ? ` (${hintsUsed} hint${hintsUsed === 1 ? "" : "s"})` : ""}\n` +
      `Play: ${url}`;
    void copyText(text, "result");
  }

  if (loadErr) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-destructive mb-4">{loadErr}</p>
          <Link to="/" className="text-gold-bright underline">
            Back to home
          </Link>
        </div>
      </main>
    );
  }

  if (!game) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gold" />
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-6 pb-32">
      <div className="max-w-3xl mx-auto">
        <h1 className="sr-only">
          Connection Challenge: {game.actorA.name} to {game.actorB.name} — Six Degrees of Cinema
        </h1>
        {/* Header */}
        <div className="flex items-center justify-between gap-2 mb-6">
          <Link to="/" className="inline-flex items-center text-muted-foreground hover:text-foreground text-sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Home
          </Link>
          <div className="flex items-center gap-2">
            {game.isBaconRound && (
              <span
                className="inline-flex items-center gap-1 text-[11px] uppercase tracking-widest font-semibold text-amber-300 border border-amber-300/70 rounded px-2 py-0.5 bg-gradient-to-r from-amber-500/20 to-yellow-500/10 shadow-[0_0_12px_rgba(251,191,36,0.35)] animate-pulse"
                title="Kevin Bacon round — 3x points if you solve, 2x penalty per wrong attempt."
              >
                <Zap className="h-3 w-3" /> Bacon Round · 3×
              </span>
            )}
            {isStreakGame && (
              <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-widest text-orange-300 border border-orange-400/50 rounded px-2 py-0.5 bg-orange-500/10">
                <Flame className="h-3 w-3" /> Streak {streak.state.count}
              </span>
            )}
            {game.isDaily && (
              <span className="text-[10px] uppercase tracking-widest text-gold-bright border border-gold/50 rounded px-2 py-0.5 bg-secondary">
                Daily · {game.dailyDate}
              </span>
            )}
            <span className="text-xs uppercase tracking-widest text-gold hidden sm:inline">
              {game.mode === "buff" ? "Movie Buff" : "Movie Noob"} · {game.difficulty}
            </span>
            <button
              onClick={shareGameLink}
              className="inline-flex items-center gap-1 text-xs border border-border rounded-md px-2 py-1 text-muted-foreground hover:text-foreground hover:border-gold/40 transition"
              title="Copy a link to this puzzle"
            >
              {shareCopied === "link" ? (
                <>
                  <Check className="h-3 w-3 text-success" /> Copied
                </>
              ) : (
                <>
                  <Share2 className="h-3 w-3" /> Share
                </>
              )}
            </button>
          </div>
        </div>

        {/* Actor pair */}
        <div className="grid grid-cols-[1fr_auto_1fr] gap-3 sm:gap-6 items-center mb-6">
          <ActorCard actor={aActor ?? game.actorA} label="Start" />
          <div className="text-gold text-2xl font-display">→</div>
          <ActorCard actor={bActor ?? game.actorB} label="End" />
        </div>

        {/* Degrees meter */}
        <div className="mb-4 flex items-center justify-between text-sm flex-wrap gap-2">
          <div className="text-muted-foreground">
            Degrees used: <span className={overLimit ? "text-destructive" : "text-gold-bright font-semibold"}>{degreesUsed}/6</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {hintsUsed > 0 && (
              <span>
                Hints: {hintsUsed} (-{hintsUsed * (game.mode === "buff" ? 20 : 10)} pts)
              </span>
            )}
            {invalidAttempts > 0 && (
              <span className={game.isBaconRound ? "text-amber-300" : "text-destructive"}>
                Wrong tries: {invalidAttempts} (-{invalidAttempts * (game.isBaconRound ? 50 : 25)} pts)
              </span>
            )}
          </div>
        </div>

        {/* Chain */}
        <div className="bg-card border border-border rounded-xl p-4 mb-4">
          <div className="flex flex-wrap items-center gap-2">
            {chain.map((step, i) => (
              <div key={`${step.kind}-${step.id}-${i}`} className="flex items-center gap-2">
                <ChainChip
                  step={step}
                  removable={i > 0 && !result?.valid}
                  onRemove={() => removeFrom(i)}
                />
                {i < chain.length - 1 && (
                  <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                )}
              </div>
            ))}

            {!reachedTarget && !result?.valid && (
              <>
                {chain.length > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                <button
                  onClick={() => setPickerOpen(true)}
                  disabled={pickerOpen || (nextKind === "movie" && degreesUsed >= 6)}
                  className="inline-flex items-center gap-1 border border-dashed border-gold/60 text-gold-bright rounded-md px-3 py-2 text-xs hover:bg-secondary disabled:opacity-50"
                >
                  <Plus className="h-3 w-3" />
                  Add {nextKind}
                </button>
              </>
            )}
          </div>

          {overLimit && (
            <p className="mt-3 text-xs text-destructive">
              You've exceeded 6 degrees. Remove steps to retry, or give up.
            </p>
          )}
        </div>

        {/* Picker */}
        {pickerOpen && lastStep && (
          <div className="mb-4">
            <StepPicker
              mode={game.mode}
              nextKind={nextKind}
              context={{ kind: lastStep.kind, id: lastStep.id }}
              onPick={addStep}
              onCancel={() => setPickerOpen(false)}
            />
          </div>
        )}

        {/* Actions */}
        {!result?.valid && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className="flex-1 min-w-[10rem] gradient-gold text-primary-foreground font-semibold py-3 rounded-md shadow-gold disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />}
              Submit chain
            </button>
            <button
              onClick={handleHint}
              disabled={hintLoading || result?.gaveUp}
              className="inline-flex items-center justify-center gap-2 border border-border text-foreground rounded-md px-4 py-3 text-sm hover:bg-secondary disabled:opacity-50"
            >
              {hintLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lightbulb className="h-4 w-4" />}
              Hint
            </button>
            <button
              onClick={handleGiveUp}
              disabled={givingUp}
              className="inline-flex items-center justify-center gap-2 border border-destructive/50 text-destructive rounded-md px-4 py-3 text-sm hover:bg-secondary disabled:opacity-50"
            >
              {givingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />}
              Give up
            </button>
            {/* Reverse — solve the same pair in the opposite direction. Disabled once the user adds anything. */}
            <button
              onClick={toggleReverse}
              disabled={!canReverse}
              title={
                canReverse
                  ? reversed
                    ? "Switch back to the original direction"
                    : "Solve from right to left instead"
                  : "Remove your added steps to switch direction"
              }
              className="ml-2 inline-flex items-center justify-center gap-2 border border-gold/40 text-gold-bright rounded-md px-4 py-3 text-sm hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ArrowLeftRight className="h-4 w-4" />
              {reversed ? "Revert order" : "Reverse"}
            </button>
          </div>
        )}

        {/* Secondary actions during play — appear after at least one degree
            has been attempted (a step added, a hint used, or a wrong try). */}
        {!result && (degreesUsed >= 1 || hintsUsed > 0 || invalidAttempts > 0) && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={playAgain}
              className="border border-border text-foreground py-2 px-3 rounded-md text-xs hover:bg-secondary inline-flex items-center gap-2"
            >
              <Film className="h-3.5 w-3.5" /> Home
            </button>
            {isStreakGame ? (
              <button
                onClick={playAgain}
                className="border border-orange-500/40 text-orange-300 py-2 px-3 rounded-md text-xs hover:bg-orange-500/10 inline-flex items-center gap-2"
                title="Pop back home — your streak waits for you"
              >
                <Flame className="h-3.5 w-3.5" /> Keep the streak going!
              </button>
            ) : (
              !game.isDaily && (
                <button
                  onClick={newPair}
                  disabled={refreshing}
                  className="border border-border text-foreground py-2 px-3 rounded-md text-xs hover:bg-secondary inline-flex items-center gap-2 disabled:opacity-50"
                >
                  {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  New pair
                </button>
              )
            )}
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="mt-6 bg-card border border-border rounded-xl p-5">
            {result.valid ? (
              <>
                <div className="flex items-center gap-2 text-success">
                  <Trophy className="h-5 w-5" />
                  <h2 className="font-display text-2xl">You solved it!</h2>
                  {result.isBaconRound && (
                    <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-widest font-semibold text-amber-300 border border-amber-300/70 rounded px-2 py-0.5 bg-gradient-to-r from-amber-500/20 to-yellow-500/10">
                      <Zap className="h-3 w-3" /> Bacon {result.solveMultiplier ?? 3}×
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground text-sm mt-1">
                  {result.degrees} degree{result.degrees === 1 ? "" : "s"} ·{" "}
                  <span className={
                    (result.score ?? 0) <= 0
                      ? "text-destructive font-semibold"
                      : "text-gold-bright font-semibold"
                  }>{result.score} pts</span>
                  {result.fullyHinted && (
                    <span className="ml-1 text-destructive/90">
                      (every step was a hint — no points awarded)
                    </span>
                  )}
                  {result.isBaconRound && (result.invalidPenalty ?? 0) > 0 && (
                    <span className="ml-1 text-amber-300/80">
                      (Bacon penalty: −{result.invalidPenalty})
                    </span>
                  )}
                </p>
              </>
            ) : result.gaveUp ? (
              <>
                <div className="flex items-center gap-2 text-foreground">
                  <Flag className="h-5 w-5 text-gold" />
                  <h2 className="font-display text-2xl">Here's a path</h2>
                </div>
                <p className="text-muted-foreground text-sm mt-1">{result.reason}</p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 text-destructive">
                  <X className="h-5 w-5" />
                  <h2 className="font-display text-2xl">Not quite</h2>
                </div>
                <p className="text-muted-foreground text-sm mt-1">{result.reason}</p>
              </>
            )}

            {result.shortestPath && (
              <div className="mt-4 space-y-3">
                <PathDisplay
                  path={result.shortestPath}
                  label={result.valid ? "Shortest known path" : "Shortest path"}
                  highlight
                />
                {result.alternates && result.alternates.length > 0 && (
                  <div className="space-y-3">
                    <div className="text-xs uppercase tracking-widest text-muted-foreground">
                      Other ways
                    </div>
                    {result.alternates.map((alt, i) => (
                      <PathDisplay key={i} path={alt} label={`Alternate ${i + 1}`} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {result.valid && !result.shortestPath && alternatesLoading && (
              <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-gold" />
                Finding the shortest known path & alternates…
              </div>
            )}

            {/* Streak-specific banners */}
            {streakEnded && (
              <div className="mt-4 rounded-lg border border-orange-500/40 bg-orange-500/10 p-4">
                <div className="flex items-center gap-2 text-orange-300">
                  <Flame className="h-5 w-5" />
                  <h3 className="font-display text-lg">That's a wrap! Your streak ended at {streakEnded.finalCount}.</h3>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Best streak: <span className="text-orange-300 font-semibold">{streakEnded.best}</span>. Start a new run anytime.
                </p>
              </div>
            )}
            {isStreakGame && result.valid && !streakEnded && (
              <div className="mt-4 rounded-lg border border-orange-500/40 bg-orange-500/10 p-4">
                <div className="flex items-center gap-2 text-orange-300">
                  <Flame className="h-5 w-5" />
                  <h3 className="font-display text-lg">Streak: {streak.state.count} 🔥</h3>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Keep it going — one fail or give-up ends the run.
                </p>
              </div>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              {isStreakGame && result.valid && !streakEnded && (
                <>
                  <button
                    onClick={continueStreak}
                    disabled={advancingStreak}
                    className="bg-orange-500 hover:bg-orange-400 text-white font-semibold py-2 px-4 rounded-md inline-flex items-center gap-2 disabled:opacity-60"
                  >
                    {advancingStreak ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flame className="h-4 w-4" />}
                    Continue Streak →
                  </button>
                  <button
                    onClick={endStreakNow}
                    className="border border-orange-500/40 text-orange-300 py-2 px-4 rounded-md text-sm hover:bg-orange-500/10 inline-flex items-center gap-2"
                  >
                    Bank streak ({streak.state.count})
                  </button>
                </>
              )}
              {result.valid && (
                <button
                  onClick={shareResult}
                  className={`${isStreakGame && !streakEnded ? "border border-border text-foreground hover:bg-secondary text-sm" : "gradient-gold text-primary-foreground font-semibold"} py-2 px-4 rounded-md inline-flex items-center gap-2`}
                  title="Share your result"
                >
                  {shareCopied === "result" ? (
                    <>
                      <Check className="h-4 w-4" /> Copied!
                    </>
                  ) : (
                    <>
                      <Share2 className="h-4 w-4" /> Share
                    </>
                  )}
                </button>
              )}
              <button
                onClick={playAgain}
                className={`${result.valid && !(isStreakGame && !streakEnded) ? "border border-border text-foreground hover:bg-secondary" : "gradient-gold text-primary-foreground font-semibold"} py-2 px-4 rounded-md inline-flex items-center gap-2 text-sm`}
              >
                <Film className="h-4 w-4" />
                Home
              </button>
              {!isStreakGame && !game.isDaily && (
                <button
                  onClick={newPair}
                  disabled={refreshing}
                  className="border border-border text-foreground py-2 px-4 rounded-md text-sm hover:bg-secondary inline-flex items-center gap-2 disabled:opacity-50"
                >
                  {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  New pair
                </button>
              )}
            </div>
          </div>
        )}

        {/* Score history (local) */}
        {history.length > 0 && !result && (
          <details className="mt-8 bg-card/50 border border-border rounded-lg px-4 py-3">
            <summary className="cursor-pointer text-sm text-gold-bright font-semibold">
              Your recent scores
            </summary>
            <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
              {history.slice(0, 10).map((h, i) => (
                <li key={i} className="flex justify-between">
                  <span className="truncate">
                    {h.actorA} → {h.actorB}
                  </span>
                  <span className="text-gold-bright">
                    {h.score} pts · {h.degrees}°
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {/* Streak milestone — pop-up dialog on hitting a win-streak milestone. */}
      {streakMilestone && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setStreakMilestone(null)}
        >
          <div
            className="relative w-full max-w-sm rounded-xl border border-orange-500/50 bg-card p-6 shadow-gold"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setStreakMilestone(null)}
              className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 text-orange-300 mb-2">
              <Flame className="h-5 w-5" />
              <h3 className="font-display text-lg">Streak: {streakMilestone.count} 🔥</h3>
            </div>
            <p className="text-sm text-foreground">{streakMilestone.message}</p>
          </div>
        </div>
      )}

      {/* Streak-ended dialog — separate modal so the user sees it immediately. */}
      {streakEnded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setStreakEnded(null)}
        >
          <div
            className="relative w-full max-w-sm rounded-xl border border-orange-500/50 bg-card p-6 shadow-gold"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setStreakEnded(null)}
              className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 text-orange-300 mb-2">
              <Flame className="h-5 w-5" />
              <h3 className="font-display text-lg">That's a wrap!</h3>
            </div>
            <p className="text-sm text-foreground">
              Your streak ended at {streakEnded.finalCount}.
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Best streak: <span className="text-orange-300 font-semibold">{streakEnded.best}</span>.
            </p>
          </div>
        </div>
      )}

      {isDebug && <DebugPanel debug={debugInfo} validationLog={validationLog} />}
    </main>
  );
}

function ActorCard({
  actor,
  label,
}: {
  actor: { id: number; name: string; image: string | null };
  label: string;
}) {
  return (
    <div className="text-center">
      <div className="aspect-[2/3] rounded-lg overflow-hidden bg-muted mb-2 border border-border max-w-[160px] mx-auto">
        {actor.image ? (
          <img src={actor.image} alt={actor.name} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-muted-foreground">
            <User className="h-10 w-10" />
          </div>
        )}
      </div>
      <div className="text-xs uppercase tracking-widest text-gold">{label}</div>
      <div className="font-display text-lg sm:text-xl text-foreground leading-tight mt-1">
        {actor.name}
      </div>
    </div>
  );
}

function ChainChip({
  step,
  removable,
  onRemove,
}: {
  step: ChainStep;
  removable: boolean;
  onRemove: () => void;
}) {
  const isPerson = step.kind === "person";
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-md px-2 py-1.5 border ${
        isPerson ? "bg-secondary border-gold/30" : "bg-card border-border"
      }`}
    >
      <div className="h-8 w-8 rounded overflow-hidden bg-muted flex-shrink-0">
        {step.image ? (
          <img src={step.image} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-muted-foreground">
            {isPerson ? <User className="h-4 w-4" /> : <Film className="h-4 w-4" />}
          </div>
        )}
      </div>
      <div className="min-w-0">
        <div className="text-sm text-foreground max-w-[8rem] truncate">
          {isPerson ? step.name : step.title}
        </div>
        {!isPerson && "year" in step && step.year && (
          <div className="text-[10px] text-muted-foreground leading-none">{step.year}</div>
        )}
      </div>
      {removable && (
        <button
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive flex-shrink-0 ml-1"
          aria-label="Remove from chain"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
