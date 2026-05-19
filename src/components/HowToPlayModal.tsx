import { useEffect, useState } from "react";
import { ArrowRight, RotateCw, User } from "lucide-react";
import { ModalShell } from "./StatsModal";

type Step = {
  kind: "person" | "movie";
  name: string;
  img: string;
  connector?: string; // label above arrow leading into this step
};

// Hard-coded TMDB images for the demo chain (Denzel → Anne via Don Cheadle, Matt Damon).
const CHAIN: Step[] = [
  {
    kind: "person",
    name: "Denzel Washington",
    img: "https://image.tmdb.org/t/p/w185/jj2Gcobpopokal0YstuCQW0ldJ4.jpg",
  },
  {
    kind: "movie",
    name: "Flight",
    img: "https://image.tmdb.org/t/p/w185/q7nmCgfbDsHb4VbsfDR1Mz6BqA9.jpg",
    connector: "is in",
  },
  {
    kind: "person",
    name: "Don Cheadle",
    img: "https://image.tmdb.org/t/p/w185/r0bpyfBKbWoz7nIYDTcgkM2y8KP.jpg",
    connector: "also stars",
  },
  {
    kind: "movie",
    name: "Ocean's Eleven",
    img: "https://image.tmdb.org/t/p/w185/hQQCdZrsHtZyR6NbKH2YyCqd2fR.jpg",
    connector: "is in",
  },
  {
    kind: "person",
    name: "Matt Damon",
    img: "https://image.tmdb.org/t/p/w185/3xJWVl8E7vEhEwSXfgs6mhxXBjE.jpg",
    connector: "also stars",
  },
  {
    kind: "movie",
    name: "Interstellar",
    img: "https://image.tmdb.org/t/p/w185/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg",
    connector: "is in",
  },
  {
    kind: "person",
    name: "Anne Hathaway",
    img: "https://image.tmdb.org/t/p/w185/tLelKoPNiyJCSEtQTz1FGv4TLGc.jpg",
    connector: "also stars",
  },
];

export function HowToPlayModal({ onClose }: { onClose: () => void }) {
  // visibleCount: 1 starts with Denzel only, 2 = +Anne separated, 3+ adds inner steps
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    // Phase 0: both endpoints in center
    // Phase 1: endpoints split apart
    // Phase 2..N: progressively reveal chain pieces between
    if (phase >= CHAIN.length + 1) return;
    const delay = phase === 0 ? 700 : 1000;
    const id = setTimeout(() => setPhase((p) => p + 1), delay);
    return () => clearTimeout(id);
  }, [phase]);

  // What's currently visible:
  // - Always show Denzel (idx 0) and Anne (last)
  // - After phase >=1, they are "split"
  // - After phase 2: show idx 1 (Flight, first connector)
  // - After phase 3: show idx 2 (Don Cheadle)
  // - ... and so on
  const innerVisibleCount = Math.max(0, phase - 1); // 0,1,2,... up to CHAIN.length-2

  const visible: { step: Step; idx: number }[] = [];
  visible.push({ step: CHAIN[0], idx: 0 });
  for (let i = 1; i <= innerVisibleCount && i < CHAIN.length - 1; i++) {
    visible.push({ step: CHAIN[i], idx: i });
  }
  visible.push({ step: CHAIN[CHAIN.length - 1], idx: CHAIN.length - 1 });

  function replay() {
    setPhase(0);
  }

  return (
    <ModalShell title="How to Play" onClose={onClose}>
      <ul className="space-y-2 text-sm text-muted-foreground list-disc pl-5 mb-5">
        <li>You'll see two actors. Connect them in six degrees or fewer.</li>
        <li>
          Build the chain:{" "}
          <span className="text-foreground">Person → Movie → Person → Movie → …</span>
        </li>
        <li>
          Allowed: shared <span className="text-gold">acting</span> credit (incl. voice), or one
          person <span className="text-gold">directed</span> the movie.
        </li>
        <li>Writing/producing credits don't count.</li>
        <li>Stuck? Use a hint (-10 pts) or Give Up to reveal the shortest path.</li>
      </ul>

      <div className="border-t border-border pt-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs uppercase tracking-widest text-gold">Example — 3 degrees</div>
          <button
            onClick={replay}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition"
          >
            <RotateCw className="h-3 w-3" /> Replay
          </button>
        </div>

        <div className="bg-secondary/40 border border-border rounded-lg p-4 overflow-x-auto">
          <div className="flex items-stretch gap-2 min-w-max justify-center">
            {visible.map(({ step, idx }, i) => (
              <div key={idx} className="flex items-stretch gap-2 animate-fade-in">
                {i > 0 && (
                  <div className="flex flex-col items-center justify-center min-w-[70px]">
                    <div className="text-[10px] uppercase tracking-widest text-gold-bright whitespace-nowrap">
                      {step.connector}
                    </div>
                    <ArrowRight className="h-5 w-5 text-gold mt-1" />
                  </div>
                )}
                <ChainCard step={step} />
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-muted-foreground mt-3 text-center italic">
          Connect Denzel → Anne in 3 movies. Your turn.
        </p>
      </div>
    </ModalShell>
  );
}

function ChainCard({ step }: { step: Step }) {
  const isPerson = step.kind === "person";
  return (
    <div className="flex flex-col items-center w-[90px]">
      <div
        className={`w-[90px] h-[120px] rounded overflow-hidden border ${
          isPerson ? "border-gold/60" : "border-border"
        } bg-background flex items-center justify-center`}
      >
        {step.img ? (
          <img
            src={step.img}
            alt={step.name}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <User className="h-6 w-6 text-muted-foreground" />
        )}
      </div>
      <div
        className={`mt-1 text-[11px] font-semibold text-center leading-tight ${
          isPerson ? "text-gold-bright" : "text-foreground"
        }`}
      >
        {step.name}
      </div>
    </div>
  );
}
