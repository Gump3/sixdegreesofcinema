import { ModalShell } from "./StatsModal";

export function PrivacyModal({ onClose }: { onClose: () => void }) {
  return (
    <ModalShell title="Privacy" onClose={onClose}>
      <div className="space-y-5 text-sm text-muted-foreground leading-relaxed">
        <Section title="Introduction">
          <p>
            Six Degrees of Cinema is a free movie trivia game. This policy explains the limited
            data the game involves and how it is used. We do not run ads, trackers, or analytics
            pixels.
          </p>
        </Section>

        <Section title="Information We Collect">
          <p className="font-semibold text-foreground">Usage information</p>
          <p>
            Our hosting provider may automatically log standard request data (IP address,
            browser/device type, timestamps) for security, abuse prevention, and reliability. This
            is not used for advertising or profiling.
          </p>
          <p className="font-semibold text-foreground mt-3">Game data</p>
          <p>
            Each puzzle you start is stored on our backend — the two actors, your guesses, the
            resulting chain, and your score — so we can validate solutions and surface shortest
            paths. It is not tied to any personal identifier.
          </p>
          <p className="font-semibold text-foreground mt-3">Local preferences</p>
          <p>
            The display name you pick, your theme, and your stats/streak history are stored only
            in your browser's local storage on your device. They never leave your device.
          </p>
        </Section>

        <Section title="How We Use Your Information">
          <p>
            To run the game, validate chains, generate the shared Daily Challenge, and keep the
            service reliable. We do not sell, rent, or share data with advertisers.
          </p>
        </Section>

        <Section title="Third-Party Services">
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <span className="text-foreground">TMDB</span> — actor, movie, and image data are
              fetched from The Movie Database. No personal information is sent to TMDB.
            </li>
            <li>
              <span className="text-foreground">Lovable Cloud</span> — hosting and backend storage
              for game sessions.
            </li>
          </ul>
        </Section>

        <Section title="Cookies and Similar Technologies">
          <p>
            We do not use advertising or tracking cookies. We use your browser's localStorage to
            remember your name, theme, and stats. You can clear it any time via your browser
            settings.
          </p>
        </Section>

        <Section title="Data Security">
          <p>
            We rely on industry-standard infrastructure provided by our hosting partner. No method
            of transmission over the internet is 100% secure, but we limit what we collect to keep
            risk low.
          </p>
        </Section>

        <Section title="Children's Privacy">
          <p>
            The game is suitable for all ages, but it is not directed at children under 13, and we
            do not knowingly collect personal information from children.
          </p>
        </Section>

        <Section title="Do Not Sell or Share">
          <p>
            We do not sell or share your personal information for advertising or any other
            commercial purpose.
          </p>
        </Section>

        <Section title="Contact Us">
          <p>
            Questions about this policy? Reach out via the project's public listing. (This is an
            anonymized hobby project — no personal email is published.)
          </p>
        </Section>
      </div>
    </ModalShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs uppercase tracking-widest text-gold mb-2">{title}</h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
