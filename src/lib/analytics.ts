// Client-side analytics helper. Generates a stable anonymous ID in
// localStorage and fires fire-and-forget events to the server.

import { recordEvent } from "@/lib/analytics.functions";

const ANON_KEY = "sdh:anon_id";

function getAnonId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    let id = window.localStorage.getItem(ANON_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2) + Date.now().toString(36);
      window.localStorage.setItem(ANON_KEY, id);
    }
    return id;
  } catch {
    return "no-storage";
  }
}

function getDevice(): "mobile" | "desktop" {
  if (typeof window === "undefined") return "desktop";
  return window.innerWidth < 768 ? "mobile" : "desktop";
}

type Common = {
  game_id?: string | null;
  difficulty?: string | null;
  mode?: string | null;
  is_daily?: boolean;
  is_bacon?: boolean;
};

type Track =
  | ({ event_type: "puzzle_started" } & Common)
  | ({ event_type: "puzzle_completed"; solve_seconds: number; degrees_used: number } & Common)
  | ({ event_type: "puzzle_given_up"; solve_seconds?: number; degrees_used?: number } & Common)
  | ({ event_type: "share_used"; share_target: string } & Common);

export function track(evt: Track): void {
  if (typeof window === "undefined") return;
  try {
    void recordEvent({
      data: {
        ...evt,
        anon_id: getAnonId(),
        device: getDevice(),
      } as any,
    }).catch(() => {});
  } catch {
    // never throw
  }
}
