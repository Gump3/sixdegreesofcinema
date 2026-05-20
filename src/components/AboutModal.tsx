import { ModalShell } from "./StatsModal";

export function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <ModalShell title="About" onClose={onClose}>
      <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
        <p>
          Inspired by the classic{" "}
          <span className="text-gold">Six Degrees of Kevin Bacon</span> game that has lived in pop
          culture for decades, this app brings that same idea to the entire world of Hollywood.
        </p>
        <p>
          Movie fans of all kinds can test their knowledge and creativity by connecting two
          seemingly unrelated actors in six degrees or fewer — using only the films they've acted
          in (and the directors behind them). The challenge isn't just to find a connection, but
          to find the <span className="text-foreground">shortest</span> one.
        </p>
        <p>
          Along the way, you might rediscover forgotten roles, uncover surprising collaborations,
          and stumble upon movies you never knew existed. Whether you're a casual viewer or a
          full-on cinephile, every round is a mix of puzzle-solving, trivia, and movie
          exploration.
        </p>
        <p className="text-foreground italic">
          Every pair has a solution — the challenge is how efficiently you can find it.
        </p>
      </div>
    </ModalShell>
  );
}
