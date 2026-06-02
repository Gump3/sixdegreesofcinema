import { ModalShell } from "./StatsModal";

export function TermsModal({ onClose }: { onClose: () => void }) {
  return (
    <ModalShell title="Terms of Use" onClose={onClose}>
      <div className="space-y-5 text-sm text-muted-foreground leading-relaxed">
        <Section title="Acceptance">
          <p>
            By accessing or playing Six Degrees of Cinema ("the game", "we", "us"), you agree to
            these Terms of Use. If you do not agree, please do not use the game.
          </p>
        </Section>

        <Section title="The Service">
          <p>
            Six Degrees of Cinema is a free, non-commercial movie trivia game. We may add, change,
            or remove features at any time, and we may pause or discontinue the service without
            notice.
          </p>
        </Section>

        <Section title="Acceptable Use">
          <p>You agree not to:</p>
          <ul className="list-disc pl-5 space-y-1 mt-1">
            <li>Use automated scripts, scrapers, or bots to play or harvest data from the game.</li>
            <li>Attempt to disrupt, overload, or probe the service for vulnerabilities.</li>
            <li>Reverse-engineer, resell, or repackage the game or its content.</li>
            <li>Use the game in any way that violates applicable laws or third-party rights.</li>
          </ul>
        </Section>

        <Section title="Intellectual Property">
          <p>
            Movie, actor, and image data are provided by The Movie Database (TMDB) and remain the
            property of their respective rights holders. This product uses the TMDB API but is not
            endorsed or certified by TMDB. The game's name, branding, and original code are owned
            by Six Degrees of Cinema.
          </p>
        </Section>

        <Section title="User-Generated Content">
          <p>
            The display name you choose is stored locally on your device. Please do not pick a name
            that is offensive, infringing, or impersonates another person. We reserve the right to
            block names that appear in any shared or backend context.
          </p>
        </Section>

        <Section title="Disclaimers">
          <p>
            The game is provided "as is" and "as available", without warranties of any kind, express
            or implied. We do not guarantee that the game will be uninterrupted, error-free, or
            that puzzle data will always be accurate.
          </p>
        </Section>

        <Section title="Limitation of Liability">
          <p>
            To the fullest extent permitted by law, Six Degrees of Cinema and its operators will
            not be liable for any indirect, incidental, special, consequential, or punitive damages
            arising out of your use of, or inability to use, the game.
          </p>
        </Section>

        <Section title="Changes to These Terms">
          <p>
            We may update these Terms from time to time. Continued use of the game after changes
            take effect constitutes acceptance of the revised Terms.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about these Terms? Reach out via the channels listed on the game's About
            page.
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
