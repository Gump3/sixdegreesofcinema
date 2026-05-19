import { useEffect } from "react";
import { useLocalStorage } from "./use-local-storage";

export type Theme = "default" | "bw" | "michaelBay";

export const THEME_META: Record<Theme, { label: string; sub: string }> = {
  default: { label: "Hollywood Noir", sub: "The original gold-on-black." },
  bw: { label: "Black & White", sub: "Classic monochrome cinema." },
  michaelBay: { label: "Michael Bay", sub: "Sun-bleached teal & orange." },
};

export function useTheme() {
  const [theme, setTheme, hydrated] = useLocalStorage<Theme>("sdh:theme", "default");

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.classList.remove("theme-bw", "theme-michael-bay");
    if (theme === "bw") root.classList.add("theme-bw");
    if (theme === "michaelBay") root.classList.add("theme-michael-bay");
  }, [theme]);

  return { theme, setTheme, hydrated };
}
