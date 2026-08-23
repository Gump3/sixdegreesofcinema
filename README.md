# Six Degrees of Cinema

A daily Hollywood trivia puzzle: connect two movie stars in **six degrees or fewer** using shared acting and directing credits.

Play it live at **[sixdegreesofcinema.com](https://sixdegreesofcinema.com)**.

Inspired by the classic *Six Degrees of Kevin Bacon*, this game brings the idea to the whole world of Hollywood — bridge two seemingly unrelated actors as efficiently as you can.

> **Built with vibe-coding** 🎬 — created and refined through an iterative AI-assisted workflow in Lovable, not a traditional hand-written codebase.

## 🎮 How it works

You're given two random actors. Build a chain connecting them where each link is either a **movie** shared by two consecutive actors, or an **actor** connected through a shared film (directors are in scope too).

Every pair has a solution — the challenge is finding the **shortest** one. Your chain is validated server-side with a bidirectional search over the cached TMDB credit graph.

## ✨ Features

- **Free play** — pick your rules and start a random puzzle
- **Daily Challenge** — the same actor pair worldwide, resetting at 00:00 UTC
- **Survival Streak** — chain wins together without hints or mistakes; milestone dialogs at 3 / 5 / 10 / 15 / 20+
- **Two modes** — Casual and Movie Buff · **Three difficulties** — Easy / Medium / Hard
- **Era filters** — Baby Boomer, Gen X, Millennial, Gen Z, or All Eras
- **Reverse mode** — solve a pair right-to-left
- **Hints & Give Up** — get a nudge or reveal the answer
- **Local stats & streaks** — Wordle-style, stored in your browser, no account needed
- **Curated actor pool** — notable credits, English Wikipedia article, and no direct-to-video-only content

## 🧱 Tech stack

[TanStack Start](https://tanstack.com/start) (React 19, SSR, typed server functions) · Vite 7 · Tailwind CSS v4 + shadcn/ui + Radix · TanStack Router & Query · Supabase (Postgres + RLS) · Cloudflare Workers · TypeScript + Zod · [TMDB API](https://www.themoviedb.org/) for movie data.

## 🚀 Getting started (local dev)

```bash
bun install
bun run dev
```

Copy `.env.example` to `.env` and fill in your Supabase and TMDB credentials.

```bash
bun run build      # production build
bun run lint       # eslint
```

## 🔐 Security

RLS enabled on all backend tables with scoped grants; server logic and credentials stay in server-only modules (the client never sees them); public webhook/cron endpoints verify callers. No account needed to play.

## 📄 License

Proprietary. All rights reserved. See [`LICENSE`](./LICENSE).

## 🙏 Attribution

Actor, movie, and image data provided by **[The Movie Database (TMDB)](https://www.themoviedb.org/)**. This product uses the TMDB API but is **not endorsed or certified by TMDB**.

---

Made by the writer behind **[The Reel Dispatch](https://thereeldispatch.substack.com)**. 🍿
