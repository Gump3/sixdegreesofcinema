import { useLocalStorage } from "./use-local-storage";

export type GameStats = {
  played: number;
  won: number;
  currentStreak: number;
  maxStreak: number;
  totalDegrees: number; // sum across solved games
  recordedGameIds: string[]; // last N to prevent double-counting
};

const INITIAL: GameStats = {
  played: 0,
  won: 0,
  currentStreak: 0,
  maxStreak: 0,
  totalDegrees: 0,
  recordedGameIds: [],
};

export function useStats() {
  const [stats, setStats, hydrated] = useLocalStorage<GameStats>("sdh:stats", INITIAL);

  function recordResult(gameId: string, solved: boolean, degrees?: number) {
    setStats((s) => {
      if (s.recordedGameIds.includes(gameId)) return s;
      const won = s.won + (solved ? 1 : 0);
      const currentStreak = solved ? s.currentStreak + 1 : 0;
      return {
        played: s.played + 1,
        won,
        currentStreak,
        maxStreak: Math.max(s.maxStreak, currentStreak),
        totalDegrees: s.totalDegrees + (solved && degrees ? degrees : 0),
        recordedGameIds: [gameId, ...s.recordedGameIds].slice(0, 200),
      };
    });
  }

  function reset() {
    setStats(INITIAL);
  }

  return { stats, hydrated, recordResult, reset };
}
