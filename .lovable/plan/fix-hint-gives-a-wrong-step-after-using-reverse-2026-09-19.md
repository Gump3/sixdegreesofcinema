# Fix: Hint gives a wrong step after using "Reverse"

## Problem

The **Reverse** button lets a player start the chain from Actor B instead of Actor A. But the **Hint** feature always assumes the chain starts at Actor A.

When reversed, the hint logic can't find a sensible anchor in the stored shortest path, falls back to suggesting "the first move" — a movie the *original* Actor A is in — and the client appends it onto a chain that starts at Actor B. Result: a chain edge that can never validate, while the player still pays the hint penalty (lost points, ended survival streak).

## Root cause (confirmed)

`getHint` in `src/lib/game.server.ts` anchors the user's chain against `shortest_path`, which always runs Actor A → Actor B. In a reversed game the chain starts at Actor B, which sits at the *end* of `shortest_path` (index `length - 1`), so the `idx < shortest.length - 1` guard rejects it and the fallback `return { hint: shortest[1], truncateTo: 1 }` fires — a movie adjacent to Actor A, useless for a chain starting at Actor B. The client (`handleHint` in `src/routes/game.$gameId.tsx`) blindly appends it, and `validateChain` later rejects the impossible edge.

## Fix

**Server-side, in `getHint` (`src/lib/game.server.ts`) — no input/schema changes needed:**

1. Detect orientation by comparing `currentChain[0]` to the game's actors:
   - If `chain[0]` is a person matching `actorB.id`, work against `[...shortest].reverse()` (path now runs B → A).
   - Otherwise use the path as-is (normal direction).
2. Run the existing anchor-walk and fallback logic against the oriented path exactly as today.

This keeps everything else untouched: validation already accepts either endpoint order, the stored `shortest_path` stays canonical (A → B), and the client needs no changes — it just truncates and appends the returned step, which is now adjacent to the player's actual current end.

## Edge cases covered

- Reversed + hint at the very first step → suggests the first move from Actor B.
- Reversed + player wandered off the path → rewinds to the deepest on-path anchor, same as forward mode.
- Alternating person/movie integrity preserved by the existing `truncateTo` mechanism.

## Verification

- Playwright: create a game, press Reverse, take a hint → confirm the suggested movie actually belongs to Actor B's filmography and the chain can continue and submit successfully.
- Repeat for a hint mid-chain after wandering off the path, in both orientations.
- Confirm normal (non-reversed) hints behave exactly as before.

## Technical details

- Files touched: `src/lib/game.server.ts` only (the `getHint` function).
- No database changes, no client changes, no API shape changes.
