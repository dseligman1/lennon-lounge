# Lennon Lounge

Static FPL Draft betting app on GitHub Pages; Firebase Realtime Database stores the league.

## Lennon Score Shot — free £50 game

The homepage offers one free, irreversible prediction per manager per FPL gameweek. Pick one Draft fixture and enter both teams' exact final **FPL points**, not football goals. Every exact winner receives **£50 cash**, including when several managers win. All registered managers, including the house, can enter. No stake is required and there is no rollover.

Publishing or re-releasing odds opens the round automatically. Entries close at the earliest of the official FPL deadline, the app deadline and the first known kickoff. An existing round cannot be changed or recreated by republishing, reopening a gameweek, refreshing or using another device. The homepage replaces the form with the locked prediction until a later round opens. If round creation fails after odds publish, Bet Settler provides an **Open free game** retry.

`lennon-lounge-score-game` stores immutable rounds and entries separately from legacy saves. Database rules enforce ownership, one entry per team/event, server-time cutoff, whole scores, £50-per-winner terms and no edits/deletes. Other managers cannot read entries before the cutoff; admins can review participation. Only the service-account worker writes results; only admins can record a verified winner as paid.

The existing five-minute In-Play workflow also runs `scripts/engagement.cjs`. It grades prizes only after official Draft fixtures are finished, using the configured `FPL_LEAGUE_ID`, official deadlines and manager identities from the official league response. Mutable cached scores and mappings do not decide prizes. Stable event keys and create-only writes prevent repeat awards. **Bet Settler → Free £50 score game** lists entrants and winners; **Mark paid** records a manual cash payment and does not transfer funds. Prizes are separate from betting P&L.

## Matchday Live

Available from Home, desktop navigation, the mobile dock and the menu. Shows all six published Draft matchups, the viewer's match first, official current points, projected finishes, win/draw probabilities, player points, players with unfinished fixtures and a selectable score timeline. Before scores arrive, it shows a labelled forecast preview.

`lennon-lounge-matchday/<event>` stores the current snapshot and up to 144 changed snapshots. The worker refreshes the most recent started, published gameweek and stops after a reconciled final snapshot. It reuses recent model histories when available and fetches event-specific picks/current points. It never opens or republishes betting markets. A failing refresh retains the last good snapshot; updates older than 15 minutes are labelled delayed. Forecasts are hidden while team/player totals disagree. FPL and Actions scheduling latency remain uncertain: this is a periodically refreshed scoreboard, not a goal-by-goal feed.

Deploy database rules before the new app. `npm run test:rules` uses a local demo Firebase database (Java 21+ required); no production credentials. The weekly public-repo backup covers the legacy `lennon-lounge` branch only: preserve the separate score-game and matchday branches in any full Firebase backup. They are not affected by the existing app reset/restore actions. Round keys refer to the current season's events; archive and provision a fresh namespace before reusing event numbers in a new season.

## Forecasts and odds

`odds-model.js` is the shared, deterministic browser/Node engine. It uses recent player history (minutes, starts, expected goals/assists and other scoring components), availability, recent club goals for/against and each gameweek's fixtures. Draft and classic player IDs are joined by Opta code. Simulations share fixture goals, so opposing clean sheets and attacking returns are dependent. Legal formations, estimated manager selection, published event-specific lineups and ordered automatic substitutes build team totals. Blanks and doubles are explicit.

Player confidence is the simulated probability of finishing within **±2 points** of the forecast; team confidence uses **±10 points**. Central 80% ranges are also shown. These are model estimates, not exact-score probabilities or proven calibration. Win probabilities receive a ten-match neutral prior to temper small samples. Pre-match house gap/draw rails and the 10–28% competitiveness edge curve remain separate from the statistical forecast. Near-certain in-play markets are suspended when a 1.05 minimum price cannot retain that edge. Existing manual prices, boosts and accumulator rules retain their established behaviour.

Forecast snapshots, source timestamps and recommended prices are retained on recommendation/publication. Older seasons did not archive exact forecasts; `scripts/backtest.cjs` reconstructs comparable forecasts using pre-deadline backups and strictly earlier histories. It cannot recover unrecorded historical lineups, injuries, transfers or original recommendations. Never call a reconstruction an observed live forecast or treat its development-sample improvement as a future guarantee.

## In-play operation

1. Odds Setter → the open gameweek → **Generate in-play odds**.
2. The workflow fetches event-specific picks, current Draft scores/player stats, fixtures and player histories, then writes a **draft**. Instant dispatch uses the existing Back Office phone-alert Actions token; without it, the queued request runs on the five-minute schedule (GitHub may delay scheduled jobs).
3. Review current scores, predicted finishes, player confidence, price changes and freshness warnings. A disagreement between official team scores and reconstructed player scores blocks publishing.
4. Choose a future UK cutoff, then **Publish these in-play odds**. The market closes no later than the next kickoff; while games are active, each snapshot lasts at most two minutes. Regenerate to extend/reprice. A snapshot older than five minutes cannot first be published.
5. Players use Bet Builder → **In-Play**. The original odds are crossed out. Existing bets retain their frozen prices. Stale revisions and expired selections are rejected; database rules also validate new in-play legs using server time.

FPL does not expose a reliable publication timestamp. The UI shows when data was fetched, explicitly marks upstream latency unknown, and warns about provisional bonus/substitution corrections. In-match estimates use remaining time and per-fixture point deltas; they are not a real-time trading feed. Completed gameweeks cannot open another market. Special markets and match-price promotions remain pre-match only; existing reward rules are unchanged.

In-play drafts/publications live at `lennon-lounge-inplay`; archived published revisions live at `lennon-lounge-inplay-history` and are not downloaded on every app update. These are isolated from legacy whole-state saves. `database.rules.json` restricts this subtree to member reads/admin writes. `scripts/in-play.cjs` only generates drafts; publishing always remains an admin action. The workflow's `dry_run` option verifies current FPL generation without saving a market.

## Verification and deployment

- `npm test`: model, app rendering, workflow parity and in-play regressions (no live writes).
- `npm run test:rules`: emulator tests for prize ownership, simultaneous submissions, deadlines, private reads, immutable entries and payment permissions.
- `npm run test:browser`: isolated Chrome tests on macOS, mocked Firebase and blocked remote writes. Requires local audit inputs at `../data/2026-10-28-model-inputs.json`; screenshots go outside the repo under `../outputs/`.
- `node scripts/fpl-data.cjs <backup.json> <private-output.json>`: fetch public FPL audit inputs.
- `node scripts/backtest.cjs <private-input.json> <private-report.json>`: reproducible retrospective audit.

Push `main` for Pages. Deploy database rules with **Publish Database Rules**; manually run **FPL Data Sync** to populate model histories. **Generate In-Play Odds** with `dry_run=true` is the read-only production check. Regression Tests runs on pushes/PRs. No build is needed for the app.
