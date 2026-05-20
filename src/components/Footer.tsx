import { useState } from "react";
import { AboutModal } from "./AboutModal";
import { PrivacyModal } from "./PrivacyModal";

export function Footer() {
  const [open, setOpen] = useState<null | "about" | "privacy">(null);

  return (
    <>
      <footer className="mt-12 border-t border-border/60 px-4 py-6 text-center text-xs text-muted-foreground">
        <p>
          This product uses the TMDB API but is not endorsed or certified by{" "}
          <a
            href="https://www.themoviedb.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gold hover:underline"
          >
            TMDB
          </a>
          .
        </p>
        <p className="mt-1 inline-flex items-center gap-2 flex-wrap justify-center">
          <span>© {new Date().getFullYear()} Six Degrees of Cinema.</span>
          <button
            type="button"
            onClick={() => setOpen("about")}
            className="text-gold hover:underline"
          >
            About
          </button>
          <span aria-hidden="true">|</span>
          <button
            type="button"
            onClick={() => setOpen("privacy")}
            className="text-gold hover:underline"
          >
            Privacy
          </button>
        </p>
      </footer>

      {open === "about" && <AboutModal onClose={() => setOpen(null)} />}
      {open === "privacy" && <PrivacyModal onClose={() => setOpen(null)} />}
    </>
  );
}
