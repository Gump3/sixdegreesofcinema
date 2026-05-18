import { ChevronRight, Film, User } from "lucide-react";
import type { ChainStep } from "@/lib/types";

export function PathDisplay({
  path,
  label,
  highlight = false,
}: {
  path: ChainStep[];
  label?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        highlight ? "border-gold/60 bg-secondary" : "border-border bg-card/50"
      }`}
    >
      {label && (
        <div className="text-xs uppercase tracking-widest text-gold mb-2">{label}</div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {path.map((step, i) => (
          <div key={`${step.kind}-${step.id}-${i}`} className="flex items-center gap-2">
            <StepChip step={step} />
            {i < path.length - 1 && (
              <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function StepChip({ step }: { step: ChainStep }) {
  return (
    <div className="inline-flex items-center gap-2 bg-card border border-border rounded-md px-2 py-1 text-xs">
      <div className="h-6 w-6 rounded overflow-hidden bg-muted flex-shrink-0">
        {step.image ? (
          <img src={step.image} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-muted-foreground">
            {step.kind === "person" ? <User className="h-3 w-3" /> : <Film className="h-3 w-3" />}
          </div>
        )}
      </div>
      <span className="text-foreground max-w-[10rem] truncate">
        {step.kind === "person" ? step.name : step.title}
      </span>
    </div>
  );
}
