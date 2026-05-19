import { X } from "lucide-react";
import { useStats } from "@/hooks/use-stats";
import { useStreak } from "@/hooks/use-streak";

export function StatsModal({ onClose }: { onClose: () => void }) {
  const { stats, hydrated } = useStats();
  const streak = useStreak();

  const winPct = stats.played > 0 ? Math.round((stats.won / stats.played) * 100) : 0;
  const avgDeg = stats.won > 0 ? (stats.totalDegrees / stats.won).toFixed(1) : "—";

  return (
    <ModalShell title="Statistics" onClose={onClose}>
      {!hydrated ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-3 text-center">
            <Stat value={stats.played} label="Played" />
            <Stat value={`${winPct}`} label="Win %" />
            <Stat value={stats.currentStreak} label="Current Streak" />
            <Stat value={stats.maxStreak} label="Max Streak" />
          </div>
          <div className="grid grid-cols-3 gap-3 text-center mt-4">
            <Stat value={stats.won} label="Solved" />
            <Stat value={avgDeg} label="Avg Degrees" />
            <Stat value={streak.stats.best} label="Survival Best" />
          </div>
          <p className="text-xs text-muted-foreground mt-5 text-center">
            Stats are saved on this device. Sign-in & cross-device sync coming soon.
          </p>
        </>
      )}
    </ModalShell>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div>
      <div className="font-display text-3xl text-gold-bright leading-none">{value}</div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-2">
        {label}
      </div>
    </div>
  );
}

export function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl p-6 sm:p-8 animate-scale-in max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition"
        >
          <X className="h-4 w-4" />
        </button>
        <h2 className="font-display text-2xl text-gold-bright mb-5 uppercase tracking-wider text-center">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
