# README update: attribution and IP protection language

Update the existing `README.md` in place. All current sections (intro, How it works, Features, Tech stack, Getting started, Security) stay as-is. The existing TMDB attribution sentence is preserved verbatim.

## Changes

1. **Attribution section (expand existing)** — keep the current sentence "This product uses the TMDB API but is not endorsed or certified by TMDB." exactly. Add: TMDB is the source of movie/actor metadata, cast and crew relationships, and poster/profile imagery; links to themoviedb.org and the TMDB developer/API docs. Also note the secondary data source the app actually uses: Wikidata/English Wikipedia sitelink lookups for actor notability filtering.

2. **New: Third-party intellectual property** — movie titles, posters, backdrops, actor/filmmaker names, photographs, character names, logos and trademarks may belong to their respective rights holders; the project claims no ownership; such materials are used to identify and present the movies, people and relationships in the game. No fair-use / legality conclusions.

3. **New: Repository and image reuse notice** — presence of TMDB-sourced images or metadata in or served by this repo does not make them free to reuse; do not copy, scrape, redistribute, republish, repackage or commercially exploit them without permission from the relevant rights holders. Distinguish original source code (covered by the existing proprietary `LICENSE`) from third-party content, which that license does not grant any rights to.

4. **New: No affiliation or endorsement** — independent developer/fan project, not affiliated with, sponsored, approved, endorsed or certified by TMDB, studios, production companies, distributors, streaming services, actors, filmmakers or other rights holders.

5. **New: Rights concerns** — rights holders with a concern about specific content can contact the project owner at the email already documented in the app's Terms of Use (thereeldispatch@gmail.com). No new address invented.

6. **New: Privacy and analytics** — describe only what the code actually does: gameplay events (puzzle started / completed / given up / share used) with difficulty, mode, daily flag, device type (mobile/desktop), solve time and degrees used, keyed to a random identifier generated in browser localStorage; puzzle rows (the actor pair, chain, score) stored in the backend; display name, theme and stats/streaks stored only in localStorage; no ads or tracking pixels; the hosting provider may log standard request data such as IP addresses. Error monitoring (Sentry) is scaffolded and only active if configured.

7. **New: Disclaimer** — game and third-party materials provided for entertainment/informational purposes, no ownership claimed over third-party IP, README is not legal advice.

## Technical notes

- Only `README.md` is edited. No code, config, or LICENSE changes.
- New sections are appended near the end, before the closing byline, in the existing emoji-heading style, with the current Attribution section expanded rather than duplicated.

## Report to follow after the edit

Sections added/modified, TMDB attribution preservation, LICENSE presence (a proprietary `LICENSE` already exists), third-party services identified (TMDB, Wikidata/Wikipedia, Supabase via Lovable Cloud, Cloudflare Workers, shadcn/Radix/Tailwind, optional Sentry), and confirmation that no app code changed.
