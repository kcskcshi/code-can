# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**LUNCH WARS** (`code-can`) — a real-time, multiplayer voting battle rendered on a single HTML canvas. Many anonymous users vote for / attack lunch menus; every menu is a "planet with a face" and the shared battlefield animates votes, combat, and a Patapon-style marching army to a beat. Vanilla TypeScript + Vite, almost no dependencies (only `@supabase/supabase-js`). Backend is Supabase (Postgres + Realtime); there is also a fully self-contained in-memory demo mode.

> Note: `README.md` is partly stale — it describes an earlier "programming-language war" theme, GitHub Pages hosting, and a `/vote` Edge Function. The live app is themed as food menus, deploys on **Vercel**, and votes go through SECURITY DEFINER RPCs called directly from the client (no Edge Function in the live path). Trust the code over the README.

## Commands

```bash
npm run dev       # Vite dev server. Local URL is http://localhost:5173/code-can/  (see base path below)
npm run build     # tsc (typecheck) THEN vite build — the typecheck is the gate
npm run preview   # serve the production build
```

- **There is no test suite and no separate linter.** `npm run build` is the only check. `tsc` runs with `noUnusedLocals` + `noUnusedParameters`, so an unused variable, import, or parameter **fails the build** — clean these up as you go.
- **Base path matters.** Locally and on GitHub Pages the app is served under `/code-can/`, so dev is `localhost:5173/code-can/` (the root path 404s). Vercel builds with `base: '/'` (it sets `VERCEL=1`). Override with `VITE_BASE`. See `vite.config.ts`.

## Deployment

Pushing to `main` triggers a **Vercel** production deploy via its GitHub integration (no config file in-repo; settings live in the Vercel dashboard, including the `VITE_SUPABASE_*` env vars). A GitHub Pages workflow (`.github/workflows/deploy.yml`) also exists but Vercel is the active host. The frontend deploy and the database are independent — schema changes must be applied to Supabase separately (see SQL below).

## Architecture

### Backend abstraction (the core seam)
`src/types.ts` defines the `Backend` interface. Two implementations satisfy it:
- `src/backend/supabase.ts` (`SupabaseBackend`, `mode: 'live'`)
- `src/backend/demo.ts` (`DemoBackend`, `mode: 'demo'`, in-memory simulation so the site is fully playable with no Supabase)

`src/main.ts` `boot()` picks live when `IS_LIVE` (i.e. `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` are set, via `src/config.ts`), and **falls back to demo on any error**. Any new backend capability must be added to the interface AND both implementations or the build breaks.

### Client state hub
`src/store.ts` (`Store`) is the single source of truth on the client. Backends push events in (`applyVote`, `emitAssault`, `addChat`); UI and the canvas subscribe via `onChange` / `onFx` / `onAssault` / `onChatChange` / `onChampionChange`. `applyVote` drops `(slug,total)` echoes for idempotency and keeps votes monotonic (attacks may move a total down). `addChat` de-dupes by `(nick, ts, text)`.

### Votes are stored in TENTHS
A vote is `+10` (= 1.0), one attack tick is `−1` (= 0.1). Totals stay integer to avoid float drift; divide by 10 only for display (`fmtVotes` in `src/ui/format.ts`). Keep this convention when touching vote math anywhere (store, battle, RPCs).

### The battlefield renderer
`src/battle.ts` (`BattleField`) is the biggest file: a `requestAnimationFrame` loop with `update(dt)` then `draw(time)` (time is monotonic seconds since load). It owns:
- a shared **beat clock** (`BPM` in config) — the Patapon rhythm; planets thump and troopers hop/march on the beat, drums fire on `onBeat`.
- **troopers** = the per-menu squads (formerly orbiting "creatures") that march on a ground line; count scales with vote share.
- **spears** (`raiders`) — thrown from an attacking army's squad onto the target planet; queued in `onAssault` and launched on the beat.
- `src/audio/drums.ts` (`DrumKit`) — Web Audio synth, off by default; `toggleSound()` must be called from a user gesture (the 🥁 chip in `main.ts`) to satisfy autoplay policy.

Input: hold/click your champion planet to vote, any rival to attack; `combo` ramps damage and FX. `respects prefers-reduced-motion` throughout.

### Realtime channels (live mode)
- `battlefield` — `postgres_changes` UPDATEs on `languages` (authoritative vote totals).
- `arena` — ephemeral broadcast for live chat + assault animations.
- `lobby` — presence (live player count).

### Catalog
`src/languages.ts` is the canonical menu catalog (slug/name/tag/color/emoji) and the source of the DB seed. `rowToLanguage` prefers the local catalog for tag/color so the look stays consistent even if a DB row is sparse.

## Database / SQL

- **`supabase/deploy.sql` is the canonical one-shot setup** — paste the whole file into the Supabase SQL editor and Run. It is idempotent and safe to re-run. When you change schema/RPCs, mirror the change into `deploy.sql`.
- `supabase/migrations/000N_*.sql` are incremental migrations (`db push` order). The latest define daily rounds (`0008`) and chat persistence (`0009`).
- **`supabase/setup.sql` is an outdated older script** (no daily rounds, old language theme) — do not extend it; use `deploy.sql`.

Security model: anon clients can only **read** tables (RLS). All writes go through `SECURITY DEFINER` RPCs — `cast_vote`, `attack_language`, `post_message`, `roll_round_if_due` — so the anon key can't tamper with totals directly.

Daily rounds: `roll_round_if_due()` is called once at boot. On the first visit of a new KST day it archives yesterday's #1 into `winners`, resets every menu's `total_votes` to its `base_votes`, and sweeps `messages` older than today — so votes and chat both keep only "one day's worth".
