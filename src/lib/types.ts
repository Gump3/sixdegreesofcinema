// Shared client-safe types mirroring server-side ChainStep.
export type ChainStep =
  | { kind: "person"; id: number; name: string; image: string | null }
  | { kind: "movie"; id: number; title: string; image: string | null; year?: string | null };

// Generation cohorts used to bias actor pool by era.
export type Generation = "boomer" | "genx" | "millennial" | "genz" | "all";

export const GENERATION_META: Record<
  Generation,
  { label: string; sub: string; years: string; range: [number, number] | null; emoji: string }
> = {
  boomer: {
    label: "Baby Boomer",
    sub: "Born 1946–1964",
    years: "Peak: 1960s–80s",
    range: [1960, 1989],
    emoji: "📽️",
  },
  genx: {
    label: "Gen X",
    sub: "Born 1965–1980",
    years: "Peak: 1980s–90s",
    range: [1978, 2002],
    emoji: "📼",
  },
  millennial: {
    label: "Millennial",
    sub: "Born 1981–1996",
    years: "Peak: 90s–2010s",
    range: [1992, 2015],
    emoji: "💿",
  },
  genz: {
    label: "Gen Z",
    sub: "Born 1997–2012",
    years: "Peak: 2010s–now",
    range: [2008, new Date().getFullYear()],
    emoji: "📱",
  },
  all: {
    label: "All Eras",
    sub: "No bias",
    years: "Any era",
    range: null,
    emoji: "🎬",
  },
};

