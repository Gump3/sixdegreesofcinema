import { ModalShell } from "./StatsModal";
import { useTheme, THEME_META, type Theme } from "@/hooks/use-theme";
import { Check } from "lucide-react";

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { theme, setTheme } = useTheme();

  return (
    <ModalShell title="Settings" onClose={onClose}>
      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
          Theme
        </div>
        <div className="space-y-2">
          {(Object.keys(THEME_META) as Theme[]).map((t) => {
            const meta = THEME_META[t];
            const active = theme === t;
            return (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`w-full flex items-center gap-3 text-left px-4 py-3 rounded-md border transition ${
                  active
                    ? "border-gold bg-secondary"
                    : "border-border hover:border-muted-foreground"
                }`}
              >
                <ThemeSwatch theme={t} />
                <div className="flex-1 min-w-0">
                  <div className={`font-semibold ${active ? "text-gold-bright" : "text-foreground"}`}>
                    {meta.label}
                  </div>
                  <div className="text-xs text-muted-foreground">{meta.sub}</div>
                </div>
                {active && <Check className="h-4 w-4 text-gold-bright" />}
              </button>
            );
          })}
        </div>
      </div>
    </ModalShell>
  );
}

function ThemeSwatch({ theme }: { theme: Theme }) {
  const swatches: Record<Theme, string[]> = {
    default: ["#0d0d0d", "#1a1a1a", "#c9a84c", "#f0d78c"],
    bw: ["#000000", "#2a2a2a", "#888888", "#f5f5f5"],
    michaelBay: ["#0a1f2c", "#1d4f5c", "#e07a2e", "#ffb066"],
  };
  return (
    <div className="flex h-8 w-12 rounded overflow-hidden border border-border flex-shrink-0">
      {swatches[theme].map((c, i) => (
        <div key={i} className="flex-1" style={{ background: c }} />
      ))}
    </div>
  );
}
