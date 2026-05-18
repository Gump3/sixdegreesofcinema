import { createFileRoute, useNavigate, useRouter, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  Film,
  Flag,
  Lightbulb,
  Loader2,
  Plus,
  Trophy,
  User,
  X,
} from "lucide-react";
import {
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

export const Route = createFileRoute("/game/$gameId")({
  component: GameScreen,
});

type GameData = {
  gameId: string;
  actorA: { id: number; name: string; image: string | null };
  actorB: { id: number; name: string; image: string | null };
  mode: "noob" | "buff";
  difficulty: "easy" | "medium" | "hard";
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
  const router = useRouter();
  const navigate = useNavigate();
  const loadGameFn = useServerFn(loadGame);
  const validateFn = useServerFn(validateChain);
  const hintFn = useServerFn(getHint);
  const giveUpFn = useServerFn(giveUp);

  const isDebug =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") === "true";

  const [username] = useLocalStorage<string>("sdh:username", "Anonymous");
  const [history, setHistory] = useLocalStorage<ScoreEntry[]>("sdh:history", []);

  const [game, setGame] = useState<GameData | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [chain, setChain] = useState<ChainStep[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [hintsUsed, setHintsUsed] = useState(0);
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
        shortestPath?: ChainStep[] | null;
        alternates?: ChainStep[][];
        gaveUp?: boolean;
      }
  >(null);
  const [debugInfo, setDebugInfo] = useState<Parameters<typeof DebugPanel>[0]["debug"]>(null);
  const [validationLog, setValidationLog] = useState<string[]>([]);

  // Load game
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const g = await loadGameFn({ data: { gameId } });
        if (cancelled) return;
        setGame(g);
        setChain([{ kind: "person", id: g.actorA.id, name: g.actorA.name, image: g.actorA.image }]);
      } catch (e) {
        if (!cancelled) setLoadErr(e instanceof Error ? e.message : "Failed to load game");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gameId, loadGameFn]);

  const lastStep = chain[chain.length - 1];
  const nextKind: "person" | "movie" = lastStep?.kind === "person" ? "movie" : "person";
  const degreesUsed = chain.filter((s) => s.kind === "movie").length;
  const canSubmit =
    game !== null &&
    chain.length >= 3 && // at minimum A → movie → B
    lastStep?.kind === "person" &&
    "id" in lastStep &&
    lastStep.id === game.actorB.id &&
    degreesUsed <= 6;
  const reachedTarget = canSubmit;
  const overLimit = degreesUsed > 6;

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
      const res = await validateFn({ data: { gameId, chain, hintsUsed } });
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
            actorA: game.actorA.name,
            actorB: game.actorB.name,
            mode: game.mode,
          },
          ...history,
        ].slice(0, 50));
      } else {
        setValidationLog((l) => [...l, `Invalid: ${res.reason}`]);
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
        setChain((c) => [...c, res.hint as ChainStep]);
        setValidationLog((l) => [...l, `Hint added: ${res.reason}`]);
      } else {
        setValidationLog((l) => [...l, `No hint available.`]);
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
    } catch (e) {
      setResult({ valid: false, reason: (e as Error).message });
    } finally {
      setGivingUp(false);
    }
  }

  function playAgain() {
    navigate({ to: "/" });
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
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Link to="/" className="inline-flex items-center text-muted-foreground hover:text-foreground text-sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Home
          </Link>
          <div className="text-xs uppercase tracking-widest text-gold">
            {game.mode === "buff" ? "Movie Buff" : "Movie Noob"} · {game.difficulty}
          </div>
        </div>

        {/* Actor pair */}
        <div className="grid grid-cols-[1fr_auto_1fr] gap-3 sm:gap-6 items-center mb-6">
          <ActorCard actor={game.actorA} label="Start" />
          <div className="text-gold text-2xl font-display">↔</div>
          <ActorCard actor={game.actorB} label="End" />
        </div>

        {/* Degrees meter */}
        <div className="mb-4 flex items-center justify-between text-sm">
          <div className="text-muted-foreground">
            Degrees used: <span className={overLimit ? "text-destructive" : "text-gold-bright font-semibold"}>{degreesUsed}/6</span>
          </div>
          {hintsUsed > 0 && (
            <div className="text-xs text-muted-foreground">
              Hints used: {hintsUsed} (-{hintsUsed * (game.mode === "buff" ? 20 : 10)} pts)
            </div>
          )}
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
                  disabled={pickerOpen || degreesUsed >= 6 || (lastStep?.kind === "person" && degreesUsed >= 6)}
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
                </div>
                <p className="text-muted-foreground text-sm mt-1">
                  {result.degrees} degree{result.degrees === 1 ? "" : "s"} ·{" "}
                  <span className="text-gold-bright font-semibold">{result.score} pts</span>
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

            <div className="mt-5 flex gap-2">
              <button
                onClick={playAgain}
                className="gradient-gold text-primary-foreground font-semibold py-2 px-4 rounded-md inline-flex items-center gap-2"
              >
                <Film className="h-4 w-4" />
                Play again
              </button>
              <button
                onClick={() => router.invalidate()}
                className="border border-border text-foreground py-2 px-4 rounded-md text-sm hover:bg-secondary"
              >
                Refresh
              </button>
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
