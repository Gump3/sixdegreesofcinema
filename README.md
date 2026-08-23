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

- **Framework:** [TanStack Start](https://tanstack.com/start) (React 19, SSR/SSG, typed server functions) on Vite 7
- **Styling:** [Tailwind CSS v4](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/) + [Radix UI](https://www.radix-ui.com/)
- **Backend / data:** [Supabase](https://supabase.com/) (Postgres + Row Level Security) via Lovable Cloud
- **Runtime:** Cloudflare Workers (serverless edge)
- **Routing & data fetching:** [TanStack Router](https://tanstack.com/router) + [TanStack Query](https://tanstack.com/query)
- **Movie data:** [The Movie Database (TMDB) API](https://www.themoviedb.org/)
- **Type safety:** TypeScript + Zod

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

## 🔎 Privacy & analytics

- **Gameplay events** — the app records anonymous events (puzzle started, completed, given up, share used) along with difficulty, mode, whether it was the Daily Challenge, device type (mobile/desktop), solve time, and degrees used. These are keyed to a random identifier generated and stored in your browser's local storage, and reset if you clear it.
- **Puzzle rows** — each puzzle (the actor pair, the chain, the score) is stored in the backend so solutions can be validated and shortest paths surfaced.
- **Local only** — your display name, theme, stats, and streaks live in your browser's local storage.
- **No ads or tracking pixels.** The hosting provider may log standard request data (e.g. IP address, timestamps) for security and reliability.
- **Error monitoring** — Sentry is scaffolded and only active when configured.

## 📄 License

Proprietary. All rights reserved. See [`LICENSE`](./LICENSE).

That license covers this project's **original source code only**. It does not grant any rights to third-party content (images, metadata, trademarks, photographs, names, or other materials) that the app fetches or displays.

## 🙏 Attribution

Actor, movie, and image data provided by **[The Movie Database (TMDB)](https://www.themoviedb.org/)**. This product uses the TMDB API but is **not endorsed or certified by TMDB**.

TMDB is the source of the movie and person metadata, cast/crew relationships, and poster and profile imagery used by the game. See the [TMDB API / developer documentation](https://developer.themoviedb.org/docs).

The app also performs [Wikidata](https://www.wikidata.org/) lookups to check for an English Wikipedia article when filtering the actor pool.

## 🧾 Third-party intellectual property

Movie titles, posters, backdrops, actor and filmmaker names, photographs, character names, logos, trademarks, and other third-party materials may belong to their respective copyright, trademark, publicity-rights, or other rights holders.

This project does not claim ownership of any of those materials. They are used to identify and present the movies, people, and connections represented by the game.

## ⚠️ Repository & image reuse notice

The presence of TMDB-sourced posters, actor images, backdrops, metadata, or other third-party materials in — or served by — this project does **not** mean those materials are free to reuse.

Do not copy, scrape, redistribute, republish, repackage, or commercially exploit TMDB-sourced imagery or other third-party copyrighted materials from this project without obtaining the appropriate rights or permissions from the relevant rights holders. Any software license applying to this repository applies to the original code, not to third-party content.

## 🚫 No affiliation or endorsement

This is an independent developer/fan project. It is not affiliated with, sponsored by, approved by, endorsed by, or certified by TMDB, movie studios, production companies, distributors, streaming services, actors, filmmakers, or any other rights holders, unless explicitly stated otherwise.

## 📬 Rights concerns

If you are a copyright, trademark, publicity-rights, or other rights holder with a concern about specific content shown by this project, please contact the project owner at [thereeldispatch@gmail.com](mailto:thereeldispatch@gmail.com) for review.

## 📌 Disclaimer

This game and the third-party materials it displays are provided for entertainment and informational purposes. The project does not claim ownership of third-party intellectual property, and nothing in this README is legal advice.

---

Made by the writer behind **[The Reel Dispatch](https://thereeldispatch.substack.com)**. 🍿
