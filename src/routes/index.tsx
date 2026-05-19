import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Film, Sparkles, Loader2, CalendarDays, Flame, Trophy, BarChart3, HelpCircle, Settings } from "lucide-react";
import { createGame, getDailyChallenge } from "@/lib/game.functions";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useStreak } from "@/hooks/use-streak";
import { GENERATION_META, type Generation } from "@/lib/types";
import { getRecentActorIds, rememberActorIds } from "@/lib/recent-actors";
import { Footer } from "@/components/Footer";
import { StatsModal } from "@/components/StatsModal";
import { HowToPlayModal } from "@/components/HowToPlayModal";
import { SettingsModal } from "@/components/SettingsModal";

export const Route = createFileRoute("/")({
  component: HomePage,
  head: () => ({
    meta: [
      { title: "Six Degrees of Cinema — A Hollywood Movie Trivia Game" },
      {
        name: "description",
        content:
          "Daily Hollywood puzzle: connect two movie stars in six degrees or fewer using acting and directing credits.",
      },
      { property: "og:title", content: "Six Degrees of Cinema — A Hollywood Movie Trivia Game" },
      {
        property: "og:description",
        content:
          "Daily Hollywood puzzle: connect two movie stars in six degrees or fewer using acting and directing credits.",
      },
      { property: "og:url", content: "/" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
});


type Mode = "noob" | "buff";
type Difficulty = "easy" | "medium" | "hard";

function HomePage() {
  const navigate = useNavigate();
  const createGameFn = useServerFn(createGame);
  const dailyFn = useServerFn(getDailyChallenge);
  const [username, setUsername, hydrated] = useLocalStorage<string>("sdh:username", "");
  const [draftName, setDraftName] = useState("");
  const [mode, setMode] = useLocalStorage<Mode>("sdh:mode", "noob");
  const [difficulty, setDifficulty] = useLocalStorage<Difficulty>("sdh:difficulty", "easy");
  const [generation, setGeneration] = useLocalStorage<Generation>("sdh:generation", "all");
  const [loading, setLoading] = useState(false);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [streakLoading, setStreakLoading] = useState(false);
  const streak = useStreak();
  const [openModal, setOpenModal] = useState<null | "stats" | "how" | "settings">(null);

  const [error, setError] = useState<string | null>(null);

  const effectiveName = username || draftName;

  async function handleStart() {
    setError(null);
    const finalName = (draftName || username).trim();
    if (!finalName) {
      setError("Pick a username to keep your scores.");
      return;
    }
    if (finalName.length > 24) {
      setError("Username must be 24 characters or fewer.");
      return;
    }
    setUsername(finalName);
    setLoading(true);
    try {
      const res = await createGameFn({ data: { mode, difficulty, generation, excludeIds: getRecentActorIds() } });
      rememberActorIds([res.actorA?.id, res.actorB?.id]);
      navigate({ to: "/game/$gameId", params: { gameId: res.gameId } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start a game.");
      setLoading(false);
    }
  }

  async function handleDaily() {
    setError(null);
    const finalName = (draftName || username).trim();
    if (finalName) {
      if (finalName.length > 24) {
        setError("Username must be 24 characters or fewer.");
        return;
      }
      setUsername(finalName);
    }
    setDailyLoading(true);
    try {
      const res = await dailyFn();
      navigate({ to: "/game/$gameId", params: { gameId: res.gameId } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load daily challenge.");
      setDailyLoading(false);
    }
  }

  async function handleStreak() {
    setError(null);
    const finalName = (draftName || username).trim();
    if (finalName) {
      if (finalName.length > 24) {
        setError("Username must be 24 characters or fewer.");
        return;
      }
      setUsername(finalName);
    }
    setStreakLoading(true);
    try {
      const settings = { mode, difficulty, generation };
      const res = await createGameFn({ data: { ...settings, excludeIds: getRecentActorIds() } });
      rememberActorIds([res.actorA?.id, res.actorB?.id]);
      streak.start(res.gameId, settings);
      navigate({ to: "/game/$gameId", params: { gameId: res.gameId } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start streak.");
      setStreakLoading(false);
    }
  }

  async function handleContinueStreak() {
    if (!streak.state.currentGameId) return;
    navigate({ to: "/game/$gameId", params: { gameId: streak.state.currentGameId } });
  }

  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <main className="min-h-screen flex flex-col items-center justify-start px-4 py-6 sm:py-10">
      <div className="w-full max-w-xl">
        {/* Top icon bar (Wordle-style) */}
        <div className="flex items-center justify-end gap-1 mb-4">
          <IconBtn label="Statistics" onClick={() => setOpenModal("stats")}>
            <BarChart3 className="h-5 w-5" />
          </IconBtn>
          <IconBtn label="How to Play" onClick={() => setOpenModal("how")}>
            <HelpCircle className="h-5 w-5" />
          </IconBtn>
          <IconBtn label="Settings" onClick={() => setOpenModal("settings")}>
            <Settings className="h-5 w-5" />
          </IconBtn>
        </div>

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 text-gold text-xs uppercase tracking-[0.3em] mb-3">
            <Sparkles className="h-3 w-3" />
            <span>A Hollywood Puzzle</span>
            <Sparkles className="h-3 w-3" />
          </div>
          <h1 className="font-display text-5xl sm:text-6xl text-gold-bright leading-none">
            <span className="block">Six Degrees</span>
            <span className="block font-display text-2xl text-foreground mt-1 italic">of Cinema</span>
          </h1>
          <p className="text-muted-foreground mt-4 max-w-md mx-auto text-sm">
            We'll give you two stars. Connect them in six degrees or fewer using only{" "}
            <span className="text-gold">acting</span> and{" "}
            <span className="text-gold">directing</span> credits.
          </p>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 sm:p-8 shadow-2xl">
          {/* Username */}
          <label className="block">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">
              Your name
            </span>
            <input
              type="text"
              maxLength={24}
              placeholder={hydrated && username ? username : "e.g. Marty"}
              value={draftName || (hydrated ? username : "")}
              onChange={(e) => setDraftName(e.target.value)}
              className="mt-2 w-full bg-input border border-border rounded-md px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
            />
          </label>

          {/* Mode */}
          <div className="mt-6">
            <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
              Mode
            </div>
            <div className="grid grid-cols-2 gap-2">
              <ModeButton
                label="Movie Noob"
                sub="Dropdowns"
                active={mode === "noob"}
                onClick={() => setMode("noob")}
              />
              <ModeButton
                label="Movie Buff"
                sub="Type to search"
                active={mode === "buff"}
                onClick={() => setMode("buff")}
              />
            </div>
          </div>

          {/* Generation */}
          <div className="mt-6">
            <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
              Your era
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {(Object.keys(GENERATION_META) as Generation[]).map((g) => {
                const meta = GENERATION_META[g];
                const active = generation === g;
                return (
                  <button
                    key={g}
                    onClick={() => setGeneration(g)}
                    title={`${meta.sub} — ${meta.years}`}
                    className={`group relative py-2 px-2 rounded-md border text-center transition ${
                      active
                        ? "border-gold bg-secondary shadow-gold"
                        : "border-border hover:border-muted-foreground"
                    }`}
                  >
                    <div className="text-lg leading-none">{meta.emoji}</div>
                    <div
                      className={`mt-1 text-[11px] font-semibold leading-tight ${
                        active ? "text-gold-bright" : "text-foreground"
                      }`}
                    >
                      {meta.label}
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              <span className="text-gold">{GENERATION_META[generation].label}</span>
              {GENERATION_META[generation].sub ? ` — ${GENERATION_META[generation].sub}.` : "."}{" "}
              {GENERATION_META[generation].years}.
            </p>
          </div>

          {/* Difficulty */}
          <div className="mt-6">
            <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
              Difficulty
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(["easy", "medium", "hard"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  className={`py-2 rounded-md text-sm capitalize border transition ${
                    difficulty === d
                      ? "border-gold text-gold-bright bg-secondary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {difficulty === "easy" && "Top-tier stars. Mostly easy bridges."}
              {difficulty === "medium" && "Broader pool. Trickier pairs."}
              {difficulty === "hard" && "No trivial costars. Dig deeper."}
            </p>
          </div>

          {/* CTA */}
          {error && (
            <p className="mt-4 text-sm text-destructive">{error}</p>
          )}
          <button
            onClick={handleStart}
            disabled={loading}
            className="mt-6 w-full gradient-gold text-primary-foreground font-semibold py-4 rounded-md shadow-gold disabled:opacity-60 disabled:cursor-not-allowed transition-transform hover:scale-[1.01] active:scale-[0.99] inline-flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Film className="h-5 w-5" />}
            <span>{loading ? "Casting…" : "Start Game"}</span>
          </button>

          {hydrated && username && (
            <p className="text-center text-xs text-muted-foreground mt-3">
              Playing as <span className="text-gold">{effectiveName || username}</span>
            </p>
          )}
        </div>

        {/* Special game modes — below the standard launch so they feel optional */}
        <div className="mt-8">
          <div className="text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-3">
            — or try a special mode —
          </div>

          {/* Daily Challenge */}
          <button
            onClick={handleDaily}
            disabled={dailyLoading}
            className="w-full mb-3 group relative overflow-hidden rounded-xl border border-gold/40 bg-gradient-to-br from-secondary to-card p-4 text-left shadow-gold transition hover:border-gold disabled:opacity-60"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full gradient-gold text-primary-foreground">
                {dailyLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <CalendarDays className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-display text-lg text-gold-bright">Today's Daily</span>
                  <span className="text-[10px] uppercase tracking-widest text-gold/80 border border-gold/40 rounded px-1.5 py-0.5">
                    New
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  One puzzle. Same pair worldwide. {todayLabel}.
                </div>
              </div>
              <div className="text-gold-bright text-xl">→</div>
            </div>
          </button>

          {/* Survival Streak */}
          {streak.hydrated && streak.state.active && streak.state.currentGameId ? (
            <button
              onClick={handleContinueStreak}
              className="w-full group relative overflow-hidden rounded-xl border border-orange-500/50 bg-gradient-to-br from-orange-950/40 to-card p-4 text-left transition hover:border-orange-400"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-orange-500/20 text-orange-300">
                  <Flame className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-lg text-orange-300">Continue Streak</span>
                    <span className="text-[10px] uppercase tracking-widest text-orange-300/80 border border-orange-400/40 rounded px-1.5 py-0.5">
                      🔥 {streak.state.count}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Pick up where you left off. One fail ends the run.
                  </div>
                </div>
                <div className="text-orange-300 text-xl">→</div>
              </div>
            </button>
          ) : (
            <button
              onClick={handleStreak}
              disabled={streakLoading}
              className="w-full group relative overflow-hidden rounded-xl border border-orange-500/40 bg-gradient-to-br from-orange-950/30 to-card p-4 text-left transition hover:border-orange-400/80 disabled:opacity-60"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-orange-500/20 text-orange-300">
                  {streakLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Flame className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-lg text-orange-300">Survival Streak</span>
                    {streak.hydrated && streak.stats.best > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-orange-300/80 border border-orange-400/40 rounded px-1.5 py-0.5">
                        <Trophy className="h-2.5 w-2.5" /> Best {streak.stats.best}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Solve back-to-back. One fail and the run ends. Uses your settings above.
                  </div>
                </div>
                <div className="text-orange-300 text-xl">→</div>
              </div>
            </button>
          )}
        </div>
      </div>

      {openModal === "stats" && <StatsModal onClose={() => setOpenModal(null)} />}
      {openModal === "how" && <HowToPlayModal onClose={() => setOpenModal(null)} />}
      {openModal === "settings" && <SettingsModal onClose={() => setOpenModal(null)} />}

      <Footer />
    </main>
  );
}

function IconBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="p-2 rounded-md text-muted-foreground hover:text-gold-bright hover:bg-secondary transition"
    >
      {children}
    </button>
  );
}

function ModeButton({
  label,
  sub,
  active,
  onClick,
}: {
  label: string;
  sub: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`py-3 rounded-md border transition text-left px-4 ${
        active
          ? "border-gold bg-secondary"
          : "border-border hover:border-muted-foreground"
      }`}
    >
      <div className={active ? "text-gold-bright font-semibold" : "text-foreground font-semibold"}>
        {label}
      </div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </button>
  );
}
