import { useLocalStorage } from "./use-local-storage";
import type { Generation } from "@/lib/types";

export type StreakMode = "noob" | "buff";
export type StreakDifficulty = "easy" | "medium" | "hard";

export type StreakState = {
  active: boolean;
  count: number;
  currentGameId: string | null;
  startedAt: number | null;
  settings: {
    mode: StreakMode;
    difficulty: StreakDifficulty;
    generation: Generation;
  } | null;
};

export type StreakStats = {
  best: number;
  totalRuns: number;
  totalSolved: number;
  lastEndedAt: number | null;
};

const INITIAL_STATE: StreakState = {
  active: false,
  count: 0,
  currentGameId: null,
  startedAt: null,
  settings: null,
};

const INITIAL_STATS: StreakStats = {
  best: 0,
  totalRuns: 0,
  totalSolved: 0,
  lastEndedAt: null,
};

export function useStreak() {
  const [state, setState, hydrated] = useLocalStorage<StreakState>(
    "sdh:streak:state",
    INITIAL_STATE,
  );
  const [stats, setStats] = useLocalStorage<StreakStats>("sdh:streak:stats", INITIAL_STATS);

  function start(
    gameId: string,
    settings: { mode: StreakMode; difficulty: StreakDifficulty; generation: Generation },
  ) {
    setState({
      active: true,
      count: 0,
      currentGameId: gameId,
      startedAt: Date.now(),
      settings,
    });
  }

  function recordSolved(nextGameIdNull: string | null = null) {
    setState((prev) => ({
      ...prev,
      count: prev.count + 1,
      currentGameId: nextGameIdNull,
    }));
  }

  function advance(nextGameId: string) {
    setState((prev) => ({ ...prev, currentGameId: nextGameId }));
  }

  function end(finalCount: number) {
    setStats((s) => ({
      best: Math.max(s.best, finalCount),
      totalRuns: s.totalRuns + 1,
      totalSolved: s.totalSolved + finalCount,
      lastEndedAt: Date.now(),
    }));
    setState(INITIAL_STATE);
  }

  function abandon() {
    setState(INITIAL_STATE);
  }

  return { state, stats, hydrated, start, recordSolved, advance, end, abandon };
}
