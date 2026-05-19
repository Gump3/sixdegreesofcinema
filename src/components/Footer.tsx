export function Footer() {
  return (
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
      <p className="mt-1">
        © {new Date().getFullYear()} Six Degrees of Cinema. Code licensed under{" "}
        <a
          href="https://opensource.org/licenses/MIT"
          target="_blank"
          rel="noopener noreferrer"
          className="text-gold hover:underline"
        >
          MIT
        </a>
        .
      </p>
    </footer>
  );
}
