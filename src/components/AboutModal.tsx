import { ModalShell } from "./StatsModal";

export function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <ModalShell title="About" onClose={onClose}>
      <div className="space-y-5 text-sm text-muted-foreground leading-relaxed">
        <p>
          Inspired by the classic{" "}
          <span className="text-gold">Six Degrees of Kevin Bacon</span> game that has lived in pop
          culture for decades, this game brings that same idea to the entire world of Hollywood.
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

        <div className="pt-2 border-t border-border/60">
          <h3 className="text-xs uppercase tracking-widest text-gold mb-3">Attribution</h3>
          <a
            href="https://www.themoviedb.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center mb-3"
            aria-label="The Movie Database"
          >
            <img
              src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_long-8ba2ac31f354005783fab473602c34c3f4fd207150182061e425d366e4f34596.svg"
              alt="The Movie Database (TMDB)"
              className="h-6 w-auto"
              loading="lazy"
            />
          </a>
          <p>
            Actor, movie, and image data provided by{" "}
            <a
              href="https://www.themoviedb.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gold hover:underline"
            >
              The Movie Database (TMDB)
            </a>
            . This product uses the TMDB API but is not endorsed or certified by TMDB.
          </p>
        </div>

        <div>
          <h3 className="text-xs uppercase tracking-widest text-gold mb-2">Built with</h3>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <a
                href="https://react.dev/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground hover:text-gold hover:underline"
              >
                React
              </a>{" "}
              &middot;{" "}
              <a
                href="https://tanstack.com/start"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground hover:text-gold hover:underline"
              >
                TanStack Start
              </a>{" "}
              &middot;{" "}
              <a
                href="https://vite.dev/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground hover:text-gold hover:underline"
              >
                Vite
              </a>
            </li>
            <li>
              <a
                href="https://tailwindcss.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground hover:text-gold hover:underline"
              >
                Tailwind CSS
              </a>{" "}
              &middot;{" "}
              <a
                href="https://ui.shadcn.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground hover:text-gold hover:underline"
              >
                shadcn/ui
              </a>{" "}
              &middot;{" "}
              <a
                href="https://www.radix-ui.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground hover:text-gold hover:underline"
              >
                Radix UI
              </a>
            </li>
            <li>
              <a
                href="https://supabase.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground hover:text-gold hover:underline"
              >
                Supabase
              </a>{" "}
              (via Lovable Cloud)
            </li>
            <li>
              Fonts:{" "}
              <a
                href="https://fonts.google.com/specimen/Cormorant+Garamond"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground hover:text-gold hover:underline"
              >
                Cormorant Garamond
              </a>{" "}
              and{" "}
              <a
                href="https://fonts.google.com/specimen/Inter"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground hover:text-gold hover:underline"
              >
                Inter
              </a>{" "}
              — licensed under the{" "}
              <a
                href="https://openfontlicense.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground hover:text-gold hover:underline"
              >
                SIL Open Font License
              </a>
              .
            </li>
          </ul>
        </div>
      </div>
    </ModalShell>
  );
}
