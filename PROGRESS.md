# FPL Team Analysis Tool — Progress / Checkpoint

Scope: Next.js Vercel app. Input = FPL Entry ID. Output = best XI (legal formation) + C/VC + per-player reasons using free FPL API only, next gameweek focus.

## Todos
- [x] scaffold Next.js TS app config (package.json, tsconfig, next.config)
- [x] lib/fpl.ts types + pure scoring helpers (functional style)
- [x] lib/select.ts best-XI + C/VC pure functions
- [x] app/api proxy route (CORS bypass)
- [x] app/page.tsx UI (Entry-ID input + XI + C/VC + reasons)
- [x] CI workflow (typecheck, no local build) — fixed: npm install (no lockfile locally), hardened edge cases
- [ ] push to GitHub + Vercel deploy (needs your confirmation / repo URL)

## Changed files
- fpl-team-analysis/package.json — Next 14 + React 18, typecheck script
- fpl-team-analysis/tsconfig.json, next.config.mjs, .gitignore, .env.example
- fpl-team-analysis/lib/fpl.ts — FPL API types + num/availability/difficultyFor/isHome
- fpl-team-analysis/lib/select.ts — scorePlayer (form+ppg+xGI+ICT+ease heuristic) + pickXi (legal formations) + pickCaptaincy (outfield pref, empty-XI guard)
- fpl-team-analysis/app/layout.tsx, app/page.tsx — Entry-ID input, picks fallback (next→current GW), empty-XI guard
- fpl-team-analysis/app/api/fpl/[...path]/route.ts — upstream proxy with 5-min revalidate
- fpl-team-analysis/.github/workflows/ci.yml — setup-node 20 + npm install + npm run typecheck

## Commands
- No local npm install/build per your loop. CI runs `npm run typecheck` (tsc --noEmit).
- To deploy: create GitHub repo, push `fpl-team-analysis/`, import into Vercel.

## Gotchas
- FPL API is undocumented, CORS-blocked in browser → must proxy via Next API routes.
- Subagent models failing earlier (ling/deepseek flash not found) → implemented directly.
- LSP daemon unreachable in this env → verified by manual review, not lsp_diagnostics.
- Picks for future GW may 404 → UI falls back to current GW squad.
- Git identity: Jeff-tek <75492107+Jeff-tek@users.noreply.github.com> — no commit/push done, awaiting instruction.

## Resume
- Code is push-ready under /root/fpl-team-analysis/. Next: `git init + push` (if you confirm repo name), then Vercel import.
