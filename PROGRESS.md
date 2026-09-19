# FPL Team Analysis Tool — Progress / Checkpoint

Scope: Next.js Vercel app. Input = FPL Entry ID. Output = best XI (legal formation) + C/VC + per-player reasons using free FPL API only, next gameweek focus.

## Todos
- [x] scaffold Next.js TS app config (package.json, tsconfig, next.config)
- [x] lib/fpl.ts types + pure scoring helpers (functional style)
- [x] lib/select.ts best-XI + C/VC pure functions
- [x] app/api proxy route (CORS bypass)
- [x] app/page.tsx UI (Entry-ID input + XI + C/VC + reasons)
- [x] CI workflow (typecheck, no local build) — fixed: npm install (no lockfile locally), hardened edge cases
- [x] push to GitHub — DONE: https://github.com/Jeff-tek/fpl-xi-picker (main @ eb43e1b)
- [x] 502 diagnosis round 2 (2026-09-19): upstream healthy from non-Vercel (200, 1.7MB) → Vercel-egress specific. Proxy now aborts at 9s (Hobby 10s kill), validates JSON, streams raw body, includes fetch cause + upstream preview. UI surfaces proxy `error` message instead of bare status.
- [x] visual revamp (2026-09-19, visual-engineering+frontend): extended Scored with detail fields (teamName/price/selectedPct/avail/form/ppg/xgi/ict/opp/home/diff/ease, formula untouched); new app/globals.css dark pitch-green solid colors + layout import; rewrote app/page.tsx — XI grouped by lines, C/VC badges, stat chips, FDR pills, availability flags, reasons sub-lines, compact bench, styled loading/error/empty states, labeled form (Enter submits). No new deps, no emojis.
- [x] pitch view (visual-engineering+frontend): CSS-only pitch (markings via divs, aspect 3/4) with XI markers by line (FWD/MID/DEF/GKP rows), best-in-middle spread, formation label, C/VC badges, keyboard-focusable markers with title detail. Detail cards + bench preserved below.
- [x] team kits on pitch + FPL-style cards (2026-09-19): FplTeam.code + shirtUrl(teamCode,isGk) in lib/fpl.ts; Scored.teamCode threaded through scorePlayer via codesById param (formula untouched); Shirt component (official FPL 66px PNG, loading=lazy, width/height 66, onError hides img → CSS initial-letter fallback via data-initial + ::before, onLoad hides fallback); pitch markers now shirt + name bar + score chip; card heads gain 44px shirt thumbnail; card-name ellipsis. No new deps, no emojis, official FPL host only. Typecheck pending CI (no local build per loop).
- [x] P0+P1 bundle (2026-09-19, direct build after subagents returned no diffs): lib/fpl.ts gains UnderstatPlayer + understatPer90 + xPtsFor + matchUnderstat (FPL API + Understat only); lib/select.ts gains pickCaptaincyTop3 + isDifferential (<12% + top-half) + rateTeam 0-99 S-F + isHitWorthIt; new app/api/understat + app/api/fpl-search proxies (9s abort, cached); page.tsx gains 5-GW ticker, C-top3, DIFF badges + toggle, price risers/fallers, bank/hits explainer, S-F rating bar, team-name fallback input. No new deps.
- [x] 403 hardening (2026-09-19): upstream healthy from non-Vercel (200) → Vercel shared-egress IP/WAF block (matches r/FantasyPL reports on Render/AWS/Lambda). Proxy now retries 403/429/502/503 (3 attempts, 600/1500ms backoff), sends fuller browser headers (Chrome 131 + Sec-Fetch + XRW), tries FPL_MIRROR fallback when set, caches bootstrap 1h to cut request volume, and returns an actionable 403 message instead of a bare status.
- [x] transfer planner v1 (2026-09-19): new app/transfer-planner.tsx — 3-GW projection table (XI total + C/VC per GW, click GW to plan for it), sell/buy form with same-position affordable candidates ranked by GW score, bank + FT stepper (1–5) + hits (−4) math, per-GW chip labels (WC/FH/BB/TC), plan log + reset, grand total net of hits. Bank from entry_history; prices current (selling≈buy caveat labeled). No new deps.
- [x] tabs + true selling prices (2026-09-19): page.tsx gains Best XI / Captain / Fixtures / Prices / Planner tab bar (role=tablist, resets to XI per analysis); analyze fetches entry transfers (defensive); planner resolves true selling per selected sale via element-summary history (bought + floor(profit/2), tenths) with current-price fallback while resolving. No new deps.
- [x] P2 live matchday + deadline countdown + guidelines polish (2026-09-19): lib/fpl.ts gains LiveStats/asLiveStats + DEFCON thresholds + defconProgress + computeLivePoints (official scoring w/ provisional bonus + DefCon, C/VC armband logic incl. VC fallback); header DeadlineCountdown (cached bootstrap on mount, 20s tick, Intl narrow list); new app/live-matchday.tsx Live tab — user live total, per-fixture bonus watch with projected 3/2/1, DefCon watch for squad, mini-league compare (standings ±2 rivals, live GW totals), 60s auto-refresh + manual; guidelines pass — sticky tabs, skip link, color-scheme dark, touch-action, hover feedback, aria-live totals, tabular numerals, … placeholders, reduced-motion pulse kill. No new deps.
- [ ] Vercel deploy — import Jeff-tek/fpl-xi-picker, root dir fpl-team-analysis/
- Gotcha 2026-09-19: empty `FPL_API` env on Vercel + `??` kept `""` → relative fetch URL → "Failed to parse URL". Fixed with `.trim() || default`.

## Changed files
- fpl-team-analysis/package.json — Next 14 + React 18, typecheck script
- fpl-team-analysis/tsconfig.json, next.config.mjs, .gitignore, .env.example
- fpl-team-analysis/lib/fpl.ts — FPL API types + num/availability/difficultyFor/isHome + shirtUrl (official shirt CDN, GK `_1` variant)
- fpl-team-analysis/lib/select.ts — scorePlayer (form+ppg+xGI+ICT+ease heuristic, codesById param) + pickXi (legal formations) + pickCaptaincy (outfield pref, empty-XI guard)
- fpl-team-analysis/app/layout.tsx, app/page.tsx — Entry-ID input, picks fallback (next→current GW), empty-XI guard
- fpl-team-analysis/app/api/fpl/[...path]/route.ts — upstream proxy with 5-min revalidate
- fpl-team-analysis/.github/workflows/ci.yml — setup-node 20 + npm install + npm run typecheck

## Commands
- No local npm install/build per your loop. CI runs `npm run typecheck` (tsc --noEmit).
- Repo: https://github.com/Jeff-tek/fpl-xi-picker — local path /root/fpl-team-analysis, branch main.
- Vercel: import Jeff-tek/fpl-xi-picker (project root = repo root if repo was created from folder; else set root dir).

## Gotchas
- FPL API is undocumented, CORS-blocked in browser → must proxy via Next API routes.
- Subagent models failing earlier (ling/deepseek flash not found) → implemented directly.
- LSP daemon unreachable in this env → verified by manual review, not lsp_diagnostics.
- Picks for future GW may 404 → UI falls back to current GW squad.
- Git identity: Jeff-tek <75492107+Jeff-tek@users.noreply.github.com> — committed + pushed as eb43e1b.

## Resume
- Pushed to https://github.com/Jeff-tek/fpl-xi-picker (main). Next: Vercel import + enter Entry ID to verify XI.
