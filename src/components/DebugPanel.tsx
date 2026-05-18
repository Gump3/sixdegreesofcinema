import { Activity, Database, Zap } from "lucide-react";

type DebugInfo = {
  tmdbCallsThisProcess: number;
  cacheHits: number;
  cacheMisses: number;
  recentErrors: { ts: string; endpoint: string; status: number; message: string }[];
};

export function DebugPanel({
  debug,
  validationLog,
}: {
  debug: DebugInfo | null;
  validationLog: string[];
}) {
  const total = debug ? debug.cacheHits + debug.cacheMisses : 0;
  const hitRate = total > 0 ? Math.round((debug!.cacheHits / total) * 100) : 0;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 max-w-[calc(100vw-2rem)] bg-card border border-gold/40 rounded-lg shadow-2xl p-4 text-xs">
      <div className="flex items-center gap-2 mb-3 text-gold-bright font-semibold">
        <Activity className="h-4 w-4" />
        Debug
      </div>
      {debug ? (
        <div className="space-y-2">
          <Row icon={<Zap className="h-3 w-3" />} label="TMDB calls (process)">
            {debug.tmdbCallsThisProcess}
          </Row>
          <Row icon={<Database className="h-3 w-3" />} label="Cache hit / miss">
            {debug.cacheHits} / {debug.cacheMisses} ({hitRate}%)
          </Row>
          {debug.recentErrors.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border">
              <div className="text-muted-foreground mb-1">Recent errors</div>
              <ul className="space-y-1 max-h-32 overflow-y-auto">
                {debug.recentErrors.slice().reverse().map((e, i) => (
                  <li key={i} className="text-destructive">
                    {e.status} {e.endpoint}: {e.message.slice(0, 60)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <p className="text-muted-foreground">Submit or give up to see counters.</p>
      )}

      {validationLog.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="text-muted-foreground mb-1">Validation log</div>
          <ul className="space-y-1 max-h-40 overflow-y-auto text-muted-foreground">
            {validationLog.map((l, i) => (
              <li key={i}>• {l}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-foreground">{children}</div>
    </div>
  );
}
