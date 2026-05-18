// Shared client-safe types mirroring server-side ChainStep.
export type ChainStep =
  | { kind: "person"; id: number; name: string; image: string | null }
  | { kind: "movie"; id: number; title: string; image: string | null; year?: string | null };
