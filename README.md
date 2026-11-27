# Lennon Lounge

Static FPL Draft betting app on GitHub Pages; Firebase Realtime Database stores the league.

## Lennon Score Shot — free £50 game

The homepage offers one free, irreversible prediction per manager per FPL gameweek. Pick one Draft fixture and enter both teams' exact final **FPL points**, not football goals. Every exact winner receives **£50 cash**, including when several managers win. All registered managers, including the house, can enter. No stake is required and there is no rollover.

Publishing or re-releasing odds opens the round automatically. Entries close at the earliest of the official FPL deadline, the app deadline and the first known kickoff. An existing round cannot be changed or recreated by republishing, reopening a gameweek, refreshing or using another device. The homepage replaces the form with the locked prediction until a later round opens. A valid entry is automatically accepted and appears in **My Bets → Active**, with £0 stake and a £50 potential prize; final outcomes move it to Won/Lost. Admins also see every free entry in **Bet Review → Live book** as Accepted, with final outcomes in Closed bets. Score Shot cards have no approval/rejection controls; prize exposure is shown separately from staked betting exposure. Both views read protected entries directly, so there is no duplicate legacy bet or manual approval. If round creation fails after odds publish, Bet Settler provides an **Open free game** retry.

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

## Autopilot (2026-11-27)

`autopilot.yml` runs the week with no taps beyond sending to WhatsApp:

1. **Release**, ~24h before the gameweek's first Premier League kickoff: stages the gameweek if needed, resets its odds to the model's recommendation (`rerecommend`), publishes (`publishGw`: promos, free game, gate, player notifications) and makes the odds poster.
2. **Bet tracker**, 2–3 WhatsApp-ready updates: after 3–5 finished games, after 5–7 (at least two more than the last), and an optional third after 8–9 (two hours after the second). Each waits for a lull with no game in progress unless the window's top is reached. Skipped if there are no live bets. Text only, built from the Matchday Live snapshot: per leg ✅/❌/🟢/🟠, the model's live chance, and the house's live liability.
3. **Settle**, once every Draft match has its final score in synced history: fills scores, `settleGw`, recap poster. Unreviewed bets would expire, so it first pushes a warning and waits `settleGraceHours` (default 12).

Every WhatsApp item goes into `lennon-lounge-autopilot/outbox` (images under `/images`) and Dan's phone gets a push; tapping it opens the app on a share screen: **📲 Share to WhatsApp** (image + caption via the share sheet) or **💬 Send in WhatsApp** (text pre-typed), then pick the group. No WhatsApp bot: posting into an existing group needs an unofficial client, which breaks WhatsApp's terms and risks the number.

Publishing and settling drive the real app in headless Chrome (`scripts/house-browser.cjs`) logged in as the house with the PIN read by the service account; the browser's membership is deleted afterwards. So the autopilot does exactly what the buttons do. Decisions are pure and tested (`scripts/autopilot-core.cjs`, `tests/autopilot.test.cjs`); `scripts/autopilot-browser-check.cjs` runs publish + settle + posters offline against a backup with a fake Firebase.

**Timing.** GitHub ran "hourly" schedules every 3–7 hours in Nov 2026, so the schedule only wakes the autopilot. While a release is within 30h or a gameweek is in play it keeps running, checks every 5–15 min (5 while games are live), refreshes Matchday Live, runs the new-bet alert check, runs FPL sync when final scores are due, and starts its own successor before the 6h job limit. Otherwise it exits until the next hourly wake-up.

**Control tower.** Back Office → 🗼 Control tower (top card) is the house's one screen for a gameweek: a delivery-style tracker from odds release to the results poster, showing what ran, what runs next and when, and a button on each step that needs Dan. It reads the app's data plus `lennon-lounge-autopilot/{status.timeline,state/gws,outbox}`.

**Controls.** Back Office → 🤖 Autopilot settings (folded under the tower): pause/resume, release hours, settle grace, outbox, recent actions, link to the latest run. Actions → Autopilot → Run workflow: `mode=status` prints state; `dry_run` decides and logs only. Failures push an alert and retry up to three times, then hand back to Dan. It never republishes a published week, never touches a week set to in-play only, and warns rather than publishing with under 3h to kickoff.

## Normal odds, in-play and the free game are independent (2026-11-07)

- **In-play runs on its own** for any gameweek until it is settled. Publishing in-play on a week whose normal odds were never published makes it an **in-play-only** week (`status: open`, `normalOff: true`): players see no pre-match board, while results, Bet Settler, Matchday and settlement treat it like any live week. Odds Setter → draft card → **🚫 Skip normal odds (in-play only)** does the same up front; the in-play-only card offers **🚀 Release normal odds after all** (before the normal cutoff) or **↺ Back to draft** (no bets, no live in-play).
- **Pulling back normal odds no longer touches in-play.** A week with live in-play or in-play bets stays open with normal odds off; otherwise it returns to draft as before. Pull in-play back on its own card.
- **Cutoffs:** the gameweek "Edit cutoff" only governs normal pre-match betting. In-play previews run to the FPL gameweek start, and the in-play cutoff picker now works (it previously rejected every choice because the picker returns text). Changing it on a live market updates that market's closing time.
- **Approvals:** an in-play bet placed while its price was live can be approved any time before settlement, even after a refresh or after the window closed (database rule relaxed to match; placement is still checked against the live market with server time). In-play bets are also allowed when the normal board is pulled back.
- **Free game:** opens automatically for the nearest gameweek that hasn't reached its FPL deadline, whether or not odds are published. An admin's open app creates it (the GitHub worker still never creates prize rounds from member-editable data). Pulling back normal odds still pauses entries. A gameweek whose FPL deadline has passed can't open (database rule: cutoff ≤ official deadline).

## In-play refresh (2026-11-07)

Odds Setter → each open gameweek → **🔄 Refresh in-play odds**. The button queues a request and immediately starts the **Generate In-Play Odds** Action using the GitHub token saved in Back Office → 📲 Phone alerts (the same token as bet alerts). The worker pulls fresh FPL Draft data (picks, league scores, live player points; draft API calls carry a cache-busting query because FPL's CDN was seen serving league scores ~8 hours old), reprices, and writes a draft in roughly a minute. If the gameweek's normal odds are released, the admin's open app publishes the fresh draft automatically at the latest allowed cutoff when nothing blocks it; otherwise the draft waits for **Publish these in-play odds**.

The status dot (admin card and player In-Play board): **green** = scores pulled within 10 minutes, or no games in play since the pull; **amber** = refresh running, or 10–30 minutes old with games in play; **red** = refresh failed, couldn't start (missing/expired token, with GitHub's reply code), no result after three minutes, blocked from publishing, or over 30 minutes old with games in play. The line beside it shows the FPL pull time and how many Premier League games are finished/in play. The five-minute schedule remains only as a safety net: GitHub actually ran it every 4–7 hours in late Oct/early Nov 2026.

## Odds calibration (2026-11-07, model `2026.11-calibrated-v2`)

GW2–8 backtest: the model's pre-match win probabilities beat a coin flip only marginally (log loss 0.685–0.688 vs 0.693), favourites in stored odds won ~42% of matches, simulated team scores were too tight (sd ~8.5 vs ~10.6 observed) and ~3 points low. Pricing therefore uses calibrated samples (`CALIBRATION` in `odds-model.js`): points already scored stay exact; the still-to-play part keeps the advantage of having more players left, but only 25% of the model's player-quality gap, is widened 1.25× and lifted 6%. Pre-match sides stay on a 44.5–55.5% rail, so a normal underdog prices ~1.85–1.95 and the longest is ~2.0 (backtest median 1.92, none above 2.0). In-play has no rail: genuine leads move prices. A pick too likely to carry the house edge even at 1.05 is shown **OFF** (null price) while the other picks stay open; only a decided match (>97%) is suspended. Unconfirmed bonus is estimated from live BPS (FPL's 3/2/1 tie rules), weighted by minutes played, and kept out of the official-score reconciliation. Displayed "Predicted finish" uses the calibrated projection.

## In-play operation

1. Odds Setter → any open or draft gameweek → **Generate in-play odds**. Later staged gameweeks have expandable preview cards. The gameweek cutoff is visible before generation.
2. Before the official deadline, the workflow copies the normal board prices exactly (including manual odds, weekly boosts and flash promotions) into a **draft** with zero current scores. It needs no unpublished event picks. This checks price consistency; it does not validate live score reconstruction. After the deadline, it fetches event-specific picks, current Draft scores/player stats, fixtures and player histories, then writes a **draft**. Instant dispatch uses the existing Back Office phone-alert Actions token; without it, the queued request runs on the five-minute schedule (GitHub may delay scheduled jobs).
3. Review current scores, predicted finishes, player confidence, price changes and freshness warnings. Current scores come from live player points (with confirmed automatic subs) because FPL's league table lags them during matches; a difference is shown as a note, not a blocker. Once every fixture is finished the official table decides.
4. Publish the normal gameweek first, then choose a future UK cutoff and **Publish these in-play odds**. Pre-gameweek previews close by the earlier app/official cutoff and must be regenerated if normal prices change or the gameweek starts. The market closes no later than the next kickoff; while games are active, each snapshot lasts at most 15 minutes (changed from two on 2026-11-07 because every bet is still admin-approved). Regenerate to extend/reprice. A snapshot older than five minutes cannot first be published.
5. Players use Bet Builder → **In-Play**. Changed original odds are crossed out. Existing bets retain their frozen prices. Stale revisions and expired selections are rejected; database rules also validate new in-play legs using server time.

FPL does not expose a reliable publication timestamp. The UI shows when data was fetched, explicitly marks upstream latency unknown, and warns about provisional bonus/substitution corrections. In-match estimates use remaining time and per-fixture point deltas; they are not a real-time trading feed. Completed gameweeks cannot open another market. Special markets remain pre-match only; pre-start previews include existing normal-board promotions, but live recalculations do not add them; existing reward rules are unchanged.

In-play drafts/publications live at `lennon-lounge-inplay`; archived published revisions live at `lennon-lounge-inplay-history` and are not downloaded on every app update. These are isolated from legacy whole-state saves. `database.rules.json` restricts this subtree to member reads/admin writes. `scripts/in-play.cjs` only generates drafts; publishing always remains an admin action. The workflow's `dry_run` option verifies both the latest started event and nearest future event without saving a market, asserting exact normal-board price equality for the pre-start preview.

## Verification and deployment

- `npm test`: model, app rendering, workflow parity and in-play regressions (no live writes).
- `npm run test:rules`: emulator tests for prize ownership, simultaneous submissions, deadlines, private reads, immutable entries and payment permissions.
- `npm run test:browser`: isolated Chrome tests on macOS, mocked Firebase and blocked remote writes. Requires local audit inputs at `../data/2026-10-28-model-inputs.json`; screenshots go outside the repo under `../outputs/`.
- `node scripts/fpl-data.cjs <backup.json> <private-output.json>`: fetch public FPL audit inputs.
- `node scripts/backtest.cjs <private-input.json> <private-report.json>`: reproducible retrospective audit.

Push `main` for Pages. Deploy database rules with **Publish Database Rules**; manually run **FPL Data Sync** to populate model histories. **Generate In-Play Odds** with `dry_run=true` is the read-only production check. Regression Tests runs on pushes/PRs. No build is needed for the app.

## Pulling odds back

Odds Setter offers **Pull back odds** for a released gameweek and **Pull back in-play odds** for a published in-play market. Both return prices to draft and retain existing bets, frozen prices and free predictions. Pulling back the whole gameweek also removes its release banner, disables its promos, withdraws its in-play market and pauses new free entries. Re-release reopens entry only before the original cutoff, without giving anyone a second free go. Previously released gameweeks with bets/free rounds cannot be deleted from draft.

The admin-owned `lennon-lounge-publication` gate prevents stale browser state from reopening withdrawn odds. Database rules block new bets and new acceptance while withdrawn, but allow existing accepted bets to settle. Normal publication/withdrawal uses an atomic update that leaves the bets branch untouched. In-play re-release receives a different revision so old selections cannot become valid again. Previously delivered notifications/posters are not erased.
