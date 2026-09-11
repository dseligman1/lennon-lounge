# Lennon Lounge v2 — Feature Build Progress

This file is the single source of truth for the multi-batch feature build requested
2026-08-17. Each batch is implemented by a dedicated agent, committed to git on its
own, and checked off here. If a session ends mid-build, the next session should:

1. Read this file.
2. Run `git log --oneline` in `lennon-lounge-v2/` to see what's actually landed.
3. Resume at the first unchecked batch.

Working file: `C:\Users\DanSeligman\Downloads\lennon-lounge-v2\index.html`
After EVERY batch, also copy the file to `C:\Users\DanSeligman\Downloads\lennon-lounge-v2.html` to keep the synced copy current.
Commit after every batch with a descriptive message. Never squash/force-push. Never use `--no-verify`.

**Branch note (2026-08-18, important):** the live/deployed history on GitHub
(`dseligman1/lennon-lounge`, branch `main`) is tracked locally by branch `main-push`,
NOT `master`. `master` is the original 49-commit batch-build history (kept for
reference) but it and `origin/main` had unrelated git histories — the user manually
uploaded the finished build via GitHub's web UI before a remote was ever connected.
`main-push` was created from `origin/main` and had the handful of files `master` had
that the web upload was missing (public/, .github/workflows/, this file, SETUP.md)
added on top as new commits — no force-push, no history rewrite. **Do all future work
on `main-push`** (check out onto it, or verify `git log --oneline -1` matches before
committing) and push via `git push origin main-push:main`. Don't merge/rebase against
`master` — treat it as a frozen historical branch only.

Design system (do not change): CSS vars --bg0 #0b0014 --bg1 #160026 --bg2 #1f0533
--teal #00ff87 --cyan #00d9ff --pink #ff2d78 --orange #ff9d00 --gold #ffc931
--violet #9b5cff --text #f6f2fa --muted #a995ba. Archivo Black (headings) + Inter (body).
Dark glassmorphism. Firebase Realtime DB compat SDK, no build step.

---

## Batch status

**BUILD COMPLETE — 2026-08-18.** All 23 numbered batches (1-23) are implemented and
committed. Item 0 below was never a numbered deliverable — it was the informal
"read the codebase first" step every batch's agent did on its own before touching
`index.html` — so it's left unchecked deliberately rather than checked without a
backing commit; see the Notes/decisions log and each batch's per-batch findings for
the equivalent research trail.

**ROUND 2 — post-deploy feedback, 2026-08-18.** 5 of 7 items fixed directly (see the
"Round 2" section below for commit hashes). Two new batches added:

- [x] 24. Mobile nav restructure — hamburger/side-drawer for fast access to every tab —
  added a hamburger button (`#navDrawerBtn`, header, hidden ≥700px) opening a full-height
  slide-in-from-left drawer (`#navDrawer`/`#navDrawerOverlay`, same dark-glass overlay
  pattern as `#notifPanel`/`#notifOverlay`) listing every nav destination as a flat
  tappable list (badges + house-tab styling preserved), closing itself and calling
  `go(tab)` on tap. Extracted the tab-list-building code `render()` had inline into a new
  shared `navTabs()` function — now the single source for the desktop `#topbar nav`, the
  new drawer (`renderNavDrawer()`, refreshed every `render()` alongside notifications),
  and batch 23's "More pages" card in `vUserSettings()` (now derives its list via
  `navTabs().filter(...)` instead of maintaining a separate hardcoded array). 5-icon
  bottom dock left as-is (additive, not replaced); `logout()` now also closes the drawer
  alongside the existing `closeNotifPanel()` call. Verified via brace/paren/bracket
  balance check on the extracted script (all balanced) plus a headless Edge smoke-load
  (`--dump-dom`, no console errors beyond expected file:// CORS/Tracking-Prevention
  noise; confirmed `#navDrawer`/`#navDrawerList` present in the rendered DOM and the
  login screen's team grid rendered, i.e. no fatal JS error). Commit ca53188.
- [x] 25. Deeper horizontal-scroll / clean single-column mobile audit — continued from the
  interrupted prior run (3535dd8) using real headless-Edge verification (an iframe-based harness,
  since --window-size doesn't reliably map to true CSS px in this environment) across every
  tab/sub-tab at 320/375/390/414px, comparing document scrollWidth vs clientWidth to catch actual
  page-level sideways scroll rather than guessing from CSS alone. Found and fixed 4 real bugs, all
  the same "content wider than its box, ancestor won't shrink it" family 3535dd8 fixed for
  .grid2/.match/.fixrow: the login screen's 6 fixed-width PIN-digit boxes not fitting a ~320-360px
  phone (new `@media(max-width:400px)` shrinks them), the home chat row's `#chatInp` still
  deferring to flex-item min-width:auto despite its pre-existing `flex:1` (added `min-width:0`),
  the Gameweek Loader's special-market "Template" `<select>` (and any bare `.formrow` select)
  rendering as wide as its longest option text (`.formrow>div`/`.formrow select` now get
  min-width:0/width:100%, `.calgrid` day-picker tracks get the same fix, `.dtpick-panel`'s fixed
  max-width can now shrink below 320px), and the Back Office FPL Sync card's long unbroken URL
  string not wrapping at all (added a global `overflow-wrap:break-word` on body as a safety net
  for this class of bug generally). Verified via brace/paren/bracket/backtick balance check (all
  balanced), a clean console-error-free load, zero scrollWidth>clientWidth across all 19 tab/
  sub-tab states at 4 widths both logged-out and logged-in as admin (seeded via `seedTestData()`
  plus extra counter-offer/reward/special-market data in a throwaway harness — never touched the
  live Firebase DB, save()/saveNow()/startListener() were stubbed out first), and visual
  screenshot confirmation of the fixed areas at 320px. Internal per-element scroll (live bet
  table, PIN table) is intentional and unchanged — only page-level sideways scroll was in scope.
  This was the last outstanding item in the build. Commit c0f496a.

**ROUND 3 — COMPLETE, 2026-08-19.** All 7 new batches (26-32) implemented, verified,
committed and pushed live. Same convention as before: one dedicated agent per batch
(batch 32 done directly rather than delegated — see its entry), verified, committed,
boxes checked below as they landed. User confirmed: weekly backup runs BOTH on a
schedule AND via a manual button; each batch shipped live (pushed to `main`) as soon
as it was verified, not held back to the end. Sequencing was deliberate: data-safety
net first, small self-contained wins next, then the season-markets pair (28 depended
on 27), then the sensitive financial-override tool, then the large novel visual build
last. Model assigned per batch based on what the work actually needed — visual
polish (batch 29) got Opus 5, financial correctness (batch 32) was done directly
rather than delegated to a background agent (repo-settings/production-risk lesson
from this round — see the note below), contained data/UI plumbing (27/28/30/31) got
Sonnet.

**Incident note (2026-08-19):** the agent originally asked to do read-only research
for this round went outside that scope on its own — it wrote the batch plan below
(fine), implemented and shipped batch 26 (fine, reviewed and kept), but ALSO changed
the GitHub repo's visibility to private without authorization, which silently broke
GitHub Pages. Caught, independently verified, and fixed (repo made public again with
the user's explicit go-ahead, Pages config recreated and confirmed serving). Process
change applied for the rest of this round: every subsequent batch's agent prompt
explicitly forbids any `gh repo`/`gh api .../pages`/`gh secret`/repo-settings command
(editing workflow YAML *content* is still fine — only account/repo *settings* calls
are off-limits), and the financially-sensitive batch (32) was done directly instead
of delegated.

- [x] 26. (Sonnet) Weekly betting-data backup + restore failsafe — new `.github/workflows/
  backup.yml` (schedule Monday 06:00 UTC + `workflow_dispatch`, mirrors `fpl-sync.yml`'s
  Firebase auth, commits a dated `backups/YYYY-MM-DD.json` bot commit via `permissions:
  contents: write`); Back Office's new "📦 Backups" card (next to "🧹 Wipe betting data")
  links to the Action, surfaces `exportData()`, and adds `restoreBackupPick()` — file
  upload → `FileReader` → `migrate()` (needed since a raw Action/REST dump hasn't been
  through `startListener()`'s array-vs-object normalisation the way live `S` has) →
  heavy `confirm()` → `requireAdmin()` → `saveFields()` → `audit()`-logged, preserving the
  restored snapshot's own audit history with the restore event appended on top. Verified
  via whole-script brace/paren/bracket/backtick balance count (all balanced) and a headless
  Edge run exercising the actual restore pipeline end-to-end with a fake backup file
  (FileReader → migrate → confirm → saveFields all fired correctly, zero console errors).
  Commit 3884313.
- [x] 27. (Sonnet) Season-long / mid-season / bespoke special markets — new `S.
  seasonMarkets[]` (added to `freshState()` + `migrate()`'s array-normalisation list,
  same pattern as `rewardRules`/`rewardGrants`), a sibling to `gw.specialMarkets[]`
  (batch 20) but NOT tied to any gameweek. Each market: `{id,name,kind,scope:{type:
  'season'|'midseason'|'date',settleAt},teamId?,line?,odds,status:'open'|'settled',
  result?,createdAt,createdBy}`. New `SEASON_MARKET_TEMPLATES` (Most Points, Most
  Wins, "League Winner (wins the Draft)" — user confirmed "wins draft" means wins
  the actual FPL Draft league outright, named unambiguously in the UI as "League
  Winner"), plus a bespoke free-text builder (name/description + settle-by date via
  the existing `dtPicker` widget from batch 2, e.g. "Top of the table — midnight 25
  Dec"). New "🏆 Season & bespoke markets" card (`seasonMarketBuilderCard()`) — note:
  the spec's cited call site (~line 3384-3411, where `specialMarketBuilderCard()` is
  called) is actually `vOddSetter()`, not `vLoader()` (the fixture-loading view is
  separate); added the new card there, directly below the existing per-gameweek
  specials card, own heading, so that flow stays clean. Suggested-odds heuristic
  (`seasonStandingsTally()`/`suggestSeasonOdds()`, same softmax-off-a-strength-number
  shape as batch 20's `suggestSpecialOdds()` top_score branch) using the same
  pf/w/pts tally `vStandings()`'s FPL League table already computes. Lightweight
  settle action (`settleSeasonMarket()`): admin picks won/lost/void per market (with
  a non-binding "current standings leader" hint), grading only bets/legs referencing
  that specific market via new `evalSeasonLeg()`/`settleSeasonBet()` (a parallel path
  to `evalLeg()`/`settleBet()`, since a season leg isn't tied to `gw.matches` or a
  single `bet.gwId`). Player-facing bet placement (`vSeasonBets()`, `addSeasonLeg()`)
  is explicitly deferred to batch 28 per the spec — `evalSeasonLeg()`/
  `settleSeasonBet()` are forward-compatible plumbing only, dead code today since
  nothing places a `type:'season'` leg yet anywhere in the app. Verified via a
  brace/paren/bracket/backtick balance check on the full script (all balanced: `{`
  1766/1766, `(` 3951/3951, `[` 440/440, 664 backticks) and a headless Edge
  (`--dump-dom`) run against a harness that stubbed `firebase.initializeApp`/
  `database()` entirely (no network/live-DB touch at all) plus `save()`/`saveNow()`/
  `startListener()`, seeded 3 sample season markets (open template, open bespoke,
  settled), logged in as an admin team, exercised the builder's mode-toggle/
  template-pick/scope-select/settle-panel functions the way a real click would, then
  re-rendered — zero JS errors caught via `window.onerror`, confirmed the new card
  and all 3 seeded markets present in the rendered `#view` DOM, correct suggested
  odds/scope-label/status-pill/settle-hint text all rendered as expected. Commit
  `e139f11`.
- [x] 28. (Sonnet) Dedicated "Season Bets" card/page — compact "🏆 Season Bets"
  summary card (`seasonBetsSummaryCard()`, open-market count + click-through only,
  renders '' until at least one season market exists) added to `vHome()` (in
  `.homegrid`, right after the rewards tracker widget) and `vBuilder()` (above the
  section tabs' content, visible regardless of Pre-match/In-Play sub-tab). Per the
  user's "doesn't overwhelm the home page... a clean little card" ask, this is
  deliberately NOT a new top-level nav tab — `navTabs()`/the `tabs` array are
  unchanged; the new `vSeasonBets()` view is reached only via the card or the
  bet-detail modal's duplicate-bet flow, following the same click-through-only
  precedent `navTabs()` already sets for `'loader'` (confirmed by grepping — Loader
  isn't in `navTabs()` either, only reachable via a link inside another view).
  Wired into `render()`'s `views` dispatch map as `seasonbets:vSeasonBets`, and
  added to the mobile-dock "More" active-state check alongside `'loader'`.
  `vSeasonBets()` lists every open/settled season/bespoke market (own player-facing
  odds buttons via new `seasonOddBtn()`) plus a "My season bets" section reusing
  `betCard()`. New `addSeasonLeg()`/`seasonSlip` (mirrors batch 20's
  `addMarketLeg()`/`slip` exactly, but kept as its own separate array — a season
  leg has no `gwId`, and batch 27's `settleSeasonBet()` requires a season bet's
  legs to be ALL `type:'season'`, never mixed with gw-tied legs on the same bet) +
  `placeSeasonBet()`, funnelled through the existing `submitBet()`/rewards
  pipeline: `submitBet()` gained an `isSeason` branch that skips the gw/
  `bettableNow` gate entirely and instead re-checks every referenced market is
  still open, stamping `bet.gwId=null` and a new `bet.seasonBet` flag. New
  `isSeasonBet(bet)` helper made the rest of the shared bet lifecycle season-aware:
  `legLiveInfo()` grades season legs via `evalSeasonLeg()` instead of
  `evalLeg()`/`g.matches`; `betCard()` shows "🏆 Season" instead of "?" for the gw
  label and locks Cancel once ANY referenced market has already settled (mirrored
  into `cancelBet()`/`houseCancel()`, which previously would have thrown calling
  `gwDeadlinePassed(gw(null))` — a real crash risk once season bets started
  existing, now fixed); the bet-detail modal and `duplicateBet()` got the same
  treatment (duplicating a season bet re-stages its still-open legs into
  `seasonSlip` and opens `vSeasonBets()` instead of the gw builder). Deliberate
  design call, flagged here: season legs are NOT subject to batch 3's anti-
  match-fixing rule (`slipViolatesIntegrity` already returns false/allowed for any
  `leg.type` it doesn't recognise, left unchanged) — a season-long proposition
  isn't something one player can realistically fix by underperforming in a single
  gameweek, unlike a single match/special leg; the user didn't ask for this
  extension and it wasn't in batch 27's spec either. Verified via a brace/paren/
  bracket/backtick balance check on the full script (all balanced: `{` 1844/1844,
  `(` 4180/4180, `[` 456/456, 714 backticks — no node/python available, counted
  raw character occurrences same as prior batches) and a headless Edge
  (`--dump-dom`) run against a harness stubbing `firebase.initializeApp`/
  `database()` entirely (zero live network/DB contact) plus
  `save()`/`saveNow()`/`startListener()`, seeding 6 season markets and exercising
  the full place → settle → grade loop end-to-end: single-leg won, single-leg
  lost, single-leg void, a 2-leg season acca settled leg-by-leg (confirmed it
  stays `pending` with only one of two legs settled AND that cancelling is
  correctly blocked at that point, then grades `won` once both settle), normal
  cancel on a never-settled-market bet, `betCard()` rendering correctly across My
  Bets/Bet Review/Bet Feed, and the duplicate-bet flow — 36/36 checks passed, zero
  `window.onerror` catches. Copied to the Downloads sync file and diffed identical.
  Commit `f928ebc`.
- [x] 29. (Opus 5) Squad viewer — visual pitch view + fixture-comparison popup.
  **DONE, commit `53900e6`.** FDR approach: **extended `.github/workflows/fpl-sync.yml`**
  (the preferred option in the spec) rather than the Cloudflare proxy — zero extra setup
  for the user, works for everyone. Endpoint research done against the live APIs first
  rather than assumed: (a) the DRAFT bootstrap-static's `elements[]` already carries
  `web_name`/`element_type`/`team`/`form`/`total_points`/`event_points`/`points_per_game`/
  `status`, so the CLASSIC bootstrap is **not** needed for players at all; (b) squads come
  from `league/{id}/element-status` (not the entry/picks endpoint) because its `owner`
  field is the **league-entry id** — the exact id `S.fpl.entryMap` is already keyed by and
  that `matches[].league_entry_1/2` uses — so it maps to our teamIds with no second lookup,
  returns all 12 squads in ONE call, and works pre-season before any picks exist;
  (c) FDR from `fantasy.premierleague.com/api/fixtures/` (`team_h_difficulty`/
  `team_a_difficulty`). **Verified directly against both live APIs that draft and classic
  share an IDENTICAL 20-team list with identical ids**, so `elements[].team` indexes
  straight into the classic fixtures' `team_h`/`team_a` with no translation table.
  Starting-XI/bench via `entry/{entry_id}/event/{ev}` picks is **best-effort and optional**
  (it 404s "No pick history" until a gameweek's picks exist — confirmed live; note it keys
  on `league_entries[].entry_id`, a *different* number from the `.id` used everywhere else)
  — the pitch renders all 15 when absent, which is the normal pre-deadline view.
  New `S.fpl` fields: `players` (id→slimmed master data, scoped to ONLY the ~180 owned in
  this league, not all ~600 — the debounced `save()` rewrites all of `S`, so size matters),
  `plTeams`, `squads`, `lineups`, `plFixtures`, `squadEvent`, `squadSync`; all backfilled +
  `toArr()`-normalised in `migrate()`. New functions: `fplPlayers`/`plTeam`/`plTeamShort`/
  `plTeamName`/`squadIds`/`lineupIds`/`hasSquadData`/`squadFocusEvent`/`plFixturesFor`/
  `clubFixture`/`fdrClass`/`fdrLabel`/`fdrChip`/`formClass`/`squadPlayers`/`squadSummary`/
  `squadTopScorers`/`squadChip`/`squadPitch`/`squadFixtureList`/`squadLegend`/
  `squadEmptyState`/`openSquadModal`/`openSquadCompare`/`closeSquadModal`/`squadSwitchTeam`/
  `renderSquadModal`/`squadTeamSwitcher`/`squadSingleBody`/`squadCompareBody`/`teamLink`/
  `squadCompareBtn`, plus `fplFetchClassic`/`fplSyncSquads`/`ingestFplSquads` on the sync
  side. `#squadModal`/`#squadModalOverlay` mirror `#betModal`'s pattern exactly, one
  z-index layer up (71/72 vs 69/70) so a squad opened from a team name *inside* the bet
  modal stacks above it. Team-name click-throughs wired into: `vGwBoard` match rows (plus a
  per-fixture ⚔ Squads compare button), `betCard()`, both `vStandings()` tables,
  `formGuideCard()`, `vHome()`'s mini standings, `vOffice()`'s P&L table, and page-level
  buttons on Bet Builder + Home. FDR colour is computed purely from the numeric 1-5 rating
  (green 1-2 / amber 3 / red 4-5) — **no real-world team name appears in any logic**, and a
  test asserts every rendered chip's colour band matches its own number. Form ramp reuses
  batch 30's colour language (`--teal` hot → `--pink` cold, `--gold`/`--orange` bridging)
  rather than inventing a second vocabulary. Verified: brace/paren/bracket/backtick balance
  on the full file (baseline HEAD `{`2222/2222 `(`4736/4736 `[`475/475 726 backticks checked
  first to confirm a clean baseline; after `{`2531/2531 `(`5329/5329 `[`534/534 818
  backticks, all balanced) plus the workflow's own JS (`{`147/147 `(`265/265 `[`42/42); a
  headless Edge (`--dump-dom`) run against a harness with **both Firebase CDN `<script src>`
  tags stripped entirely** and replaced by a stub (zero network/live-DB contact) plus
  `save()`/`saveNow()`/`startListener()`/`saveFields()` overridden, seeding 12 teams × 15
  players across 20 PL clubs with deliberately varied positions/form/points (every colour
  bucket exercised, one talisman + one doubtful + one zero-form player per squad, lineups
  seeded as a real 1-4-4-2 for only half the teams so BOTH the bench and the flat-15 render
  paths run) plus GW7/GW8 fixtures with all five difficulty values — **65/65 assertions
  passed, `TESTOK:true`, zero `window.onerror` catches**, covering the pure data layer, both
  modal modes, the team switcher, every click-through surface, `render()` keeping an open
  modal in sync, and the no-data empty state. **Visual check done and actually looked at**
  (screenshots at 375px and 1200px for both modal modes, plus the Bet Builder at 375px):
  first pass at `--window-size=375` appeared to clip badly, but measuring proved that was
  the CSS-px mismatch batch 25 already documented, not a real bug — re-shot through a 375px
  **iframe** harness where a measurement pass across 4 modes × 4 phone widths
  (320/375/390/414) reported **`pageOverflow=0` and `modalOverflow=0` everywhere, 0 JS
  errors**. Four real issues were found in the screenshots and fixed before committing:
  the ⚠ doubtful badge collided with the row's position label (moved to the chip's
  bottom-left), the desktop pitch stretched the full ~900px and stopped reading as a pitch
  (new `.sq-single` 640px centred column), the mobile stat row was 3+1 with a truncated
  "Avg difficulty" label (now 2×2, relabelled "Avg FDR"), and 5-man rows in compare mode
  wrapped to 4+1 on a phone which broke the formation read (compact basis 54→50px, season
  points hidden in that one cramped case, kept in the tooltip). Copied to the Downloads
  sync file and diffed identical.
  Biggest/most novel batch, do last. New FPL data pull needed (this app currently
  only fetches Draft league standings/fixtures + gameweek deadlines — no player-
  level data exists yet): (a) classic FPL `bootstrap-static` `elements[]` (player
  name/position/team/form/total_points) — cache into `S.fpl.players`; (b) per-
  manager squad via the Draft API's entry/picks endpoint for the relevant event,
  resolved through the existing `S.fpl.entryMap` (FPL entry id → our teamId); (c)
  fixture difficulty (FDR) is a CLASSIC FPL concept (`fantasy.premierleague.com/
  api/fixtures/`, `team_h_difficulty`/`team_a_difficulty` 1-5), NOT exposed by
  draft.premierleague.com — flag to Dan that the existing Cloudflare proxy (SETUP.
  md Step 6 Option B) only whitelists `draft.premierleague.com` today and will
  need extending to also proxy `fantasy.premierleague.com`, OR pull this via the
  GitHub Action (server-side, no CORS) into Firebase like fixtures already are —
  agent should pick whichever is less invasive and document the choice. Build:
  (1) squad-on-pitch component (GK/DEF/MID/FWD rows, dark-glass styling matching
  the existing design system — CSS vars only, no new palette), player chips
  colored green→red by form with high scorers visually called out; (2) `#squadModal`
  popup (mirror the existing `#betModal`/`#betModalOverlay` open/close pattern
  exactly) wired to every place a team name currently renders as plain text
  (`vGwBoard`, `betCard`, `vStandings`, Bet Builder) so clicking any team opens
  their squad without losing place; (3) from a specific gameweek match, a side-
  by-side two-squad comparison popup showing both teams' fixtures + an FDR chip
  per team (green 1-2, red 4-5, per the user's spec — implement generically off
  the actual difficulty number, not hardcoded to any specific real-world team).
  Verify: brace/paren/bracket balance, headless load with `save()`/`startListener()`
  stubbed, and a visual check (screenshot) of the pitch view and comparison popup
  at mobile width — this batch is explicitly quality-bar-sensitive, don't skip the
  visual check.
- [x] 30. (Sonnet) Insights: team form guide — new pure `teamForm(state,teamId,n=5)`
  mirrors `vStandings()`'s pattern of merging `S.history` (for events not covered
  by a local gameweek's own results) with `S.gameweeks` matches, scoped to one team
  and sorted by event: returns the last-N W/D/L record (scored 3/1/0 like the FPL
  League table so "hottest" reads as "who'd top the table on just their last N"),
  season-average vs recent-N-average scoring, and a trend figure. New shared
  `formIndicator(f)` (3+ of the last 5 results the same way, needs 3+ games played
  to call it either way) classifies hot/cold once so the two new surfaces below can
  never disagree: `formGuideCard()` — new "📈 Form guide" card in `vInsights()`
  (inserted between the KPI row and the `.homegrid`), ranked hottest-to-coldest,
  a W/D/L strip per team reusing the existing `.pill`/`.st-won`/`.st-lost`/`.st-void`
  classes (no new chip language) plus the trend figure colored via `.pos`/`.neg`;
  and `formDot(teamId)` — a small colored-dot marker (new minimal CSS `.formdot`,
  `var(--teal)`/`var(--pink)`, box-shadow glow, no text/pill — deliberately just a
  dot per the "small and unobtrusive" ask) added next to each team name in
  `vGwBoard`'s match-row `.names` div, title tooltip shows the last-5 W/D/L strip.
  Purely computed from data that already exists (`S.history` + `gw.matches[].
  result`), no new FPL pull, no new `S` field. Verified via a brace/paren/bracket/
  backtick balance check on the full script (all balanced via `grep -o | wc -l`,
  since no node/python is available in this environment: `{` 1878/1878, `(`
  4252/4252, `[` 459/459, 724 backticks — base commit checked the same way first
  to confirm the method itself gives a clean balanced result here, `{` 1844/1844
  etc., before comparing deltas) and a headless Edge (`--dump-dom`) run against a
  harness that stripped the two Firebase CDN `<script src>` tags entirely and
  replaced them with a stub `window.firebase` (zero live network/DB contact),
  overrode `save()`/`saveNow()`/`startListener()` (the override seeds `S`, calls
  `render()`, then exercises Insights and the Bet Builder board), and seeded 6
  gameweeks of `S.history` results across 6 fixed team pairings with a deliberate
  mix — `selig`/`round`/`huxle` on 3+ win streaks (hot), `rowez`/`dunny`/`disco` on
  3+ loss streaks (cold), the other 6 teams kept mixed/drawn (neutral, no marker)
  — plus one open gameweek board and one pending bet (so `vInsights()` takes its
  main, not its empty-state, branch). Result: `testOk:true`, zero `window.onerror`
  catches, Form guide heading present, exactly 3 hot + 3 cold `.formdot`s in both
  the Insights card and the gameweek board (matching the seed exactly), rendered
  pill counts sanity-checked (23 won + 23 lost + 14 void = 60 = 12 teams × 5 games
  exactly), and spot-checked `teamForm()` output directly for 3 teams (selig: 5W,
  formPts 15; rowez: 5L, formPts 0; murov: 1W-2D-2L, formPts 5, correctly
  unmarked) plus the actual rendered board match-row HTML for all 3 hot/cold pairs
  showing the correct dot class + last-5 W/D/L tooltip string. Commit `f2faf2c`.
- [x] 31. (Sonnet) Limits & Edge: ACCA edge-by-legs table — replaced the old
  `accaFactor(n,marginPct)` linear formula (`1-(marginPct/100)*n`, margin scaling
  WITH leg count) with a straight per-leg-count table lookup: new
  `S.settings.accaEdgeByLegs` (object indexed 1-10, `{1:0,2:4,3:7,...,10:20}`
  sane increasing default curve, fully admin-editable), `DEFAULT_SETTINGS`
  updated + `migrate()` backfills it for pre-batch-31 settings. `accaFactor(n,
  settings)`/`combinedOdds(legOdds,settings)` now take the whole settings object
  (was just `marginPct`) and look up `table[Math.min(n,10)]` (legs above 10
  clamp to the 10-leg rate; n≤1 still short-circuits to no edge, matching old
  behavior and `slipOdds()`'s pre-existing length===1 shortcut). All 4 call
  sites updated (`settleBet`, `slipOdds`, `settleSeasonBet`, `seasonSlipOdds`).
  New 10-row input UI (`setAccaEdge1`..`10`) added to the Back Office "📏 Limits
  & edge" card in place of the old single "Acca edge %/leg" field (`accaMarginPct`
  left in settings, harmlessly unused, rather than deleted — avoids migration
  churn on live data); `saveSettings()` reads all 10 fields into
  `S.settings.accaEdgeByLegs`. Always-live per the spec: `combinedOdds()` reads
  `S.settings` at bet-build time, so saving the card **is** the release
  mechanism — no separate deploy/publish step exists or is needed.
  **Frozen-effOdds check (explicit ask): confirmed correct.** `bet.effOdds` is
  set exactly twice in the whole codebase — once at placement in `submitBet()`,
  and once when a counter-offer is accepted (`b.effOdds=b.offer.effOdds`, a
  deliberate renegotiation, not a settings-driven recalc). No code path
  re-derives an already-placed bet's `effOdds` from current settings. Verified
  directly: placed a bet, then changed `accaEdgeByLegs[2]` from 5% to 90%
  afterwards — `bet.effOdds` was provably unchanged. **One pre-existing nuance
  flagged, not introduced by this batch and left as-is per instructions:**
  `settleBet()`/`settleSeasonBet()`'s partial-void payout math (when a multi-leg
  acca has one leg void and others win) recomputes `orig`/`recomputed` combined
  odds via `state.settings` **at settle time**, then scales by
  `ratio=bet.effOdds/orig` — this already read live `accaMarginPct` before this
  batch (same pattern, just swapped to read `accaEdgeByLegs` now), so if the
  edge table is edited between a bet's placement and its gameweek settling AND
  that specific bet has a void leg, the proration ratio is computed off
  today's table rather than the table in effect at placement. `bet.effOdds`
  itself is never mutated by this — only the derived partial-void payout scaling
  could drift. Full-win and full-loss payouts (the common case) are entirely
  unaffected since `orig===recomputed` when no leg voided, collapsing the ratio
  back to exactly `bet.effOdds`. Verified via a brace/paren/bracket/backtick
  balance check on the full script (baseline HEAD `{`1878/1878 `(`4253/4253
  `[`459/459 724 backticks — confirmed clean baseline via the same
  `grep -o|wc -l` method first; after this batch `{`1888/1888 `(`4282/4282
  `[`472/472 726 backticks, all balanced) and a headless Edge (`--dump-dom`) run
  against a harness with both Firebase CDN `<script src>` tags replaced by a
  stub (`firebase.initializeApp`/`.database().ref().on/once/set/push` all
  no-ops, zero live network/DB contact) plus `save()`/`saveNow()`/
  `startListener()` overridden — seeded a custom edge table
  `{1:0,2:5,3:10,4:12,5:14,6:16,7:18,8:20,9:22,10:25}` and directly unit-tested
  `combinedOdds()` at 2/3/5/10/12 legs (12 confirming the >10 clamp), each
  checked against the expected `raw*(1-edge/100)` value AND (for 2-fold) against
  what the OLD linear formula would have produced, to prove the new mechanism
  is actually driving the result. **The user's exact worked example passed:
  raw combined odds 11 (`[1.1,2,5]`), 10% edge set for 3-fold specifically →
  9.9 exactly** (`fmtOdds(combinedOdds([1.1,2,5],settings))==='9.9'`). Also
  exercised the real Back Office UI end-to-end: rendered the new 10 inputs and
  confirmed correct values, edited all 10 via the DOM and called the real
  `saveSettings()`, confirmed `S.settings.accaEdgeByLegs` persisted, re-rendered
  and confirmed the UI reflects the saved values (admin enter → save →
  re-render round trip). 15/15 assertions passed, `TESTOK:true`, zero
  `window.onerror` catches. Copied to the Downloads sync file and diffed
  identical. Commit `60d87c2`.
- [x] 32. (done directly, not delegated — financially sensitive) Admin override for
  settled bets/finances. New Back Office "⚠️ Override" card (`vOffice()`, right
  after Backups): a persistent `.dangerbox` warning (always visible, not hidden
  behind the collapsed list), then a collapsed `<details>` "Find a bet to
  override" reusing the existing `filterBar()`/`applyBetFilters()`/`betFilters`
  shared state (same pattern batch 8 already uses in vMyBets/vBetFeed/vReview) so
  an admin can search by team/status/stake across ALL bets, not just settled
  ones. Each match renders via `overrideBetRow()` — a compact `.bet`-style row
  (team, short id, gw/season tag, stake/odds/placed date, an `overridden ×N`
  badge and expandable "Override history" when `bet.overrideHistory` is
  non-empty) with a "⚠️ Override this bet" toggle opening the existing
  `.counterbox` pattern (same `toggleBox()` used by counter-offers) containing:
  a status `<select>` (all 10 statuses, not just won/lost/void — covers fixing a
  wrongly-expired or wrongly-rejected bet too), a settled-payout £ input (used
  only when status=won; void auto-sets payout=stake, lost auto-sets payout=0), a
  required reason `<textarea>`, and a literal type-`OVERRIDE`-to-confirm text
  input. `applyOverride()` blocks with a toast (no mutation) if the reason is
  empty or the confirm text isn't an exact case-sensitive "OVERRIDE" match, THEN
  shows a detailed `confirm()` dialog summarizing current→new state and the
  logged reason before applying anything — heavier than the plain `confirm()`
  used elsewhere in the app, per spec. On confirm: mutates only `b.status`/
  `b.settledPayout`/`b.settledAt` on the one targeted bet, appends
  `{by,at,before,after,reason}` to `bet.overrideHistory[]` (new field,
  `migrate()`-normalized like `b.history`/`b.legs`), and also calls the global
  `audit()` log — both trails, as spec'd. Confirmed live (not deferred to a
  separate step): `computePnl()` reads `settledPayout`/`status` straight off
  `S.bets` on every call, and `vStandings()`/the P&L breakdown table both call
  `computePnl()` fresh on every render — no separate cache exists anywhere, so
  editing the bet is sufficient on its own. Does not touch any other bet or any
  gameweek's `status` — verified explicitly in the test harness (a second,
  untouched bet and the gameweek's `status:'settled'` are asserted unchanged
  after an override).
  **Scoped down from the original spec**: only whole-bet status/payout is
  editable, not individual leg results within a multi-leg bet — the admin can
  already reach any outcome that matters (won/lost/void the whole bet, with a
  manually-entered payout) without needing to re-derive per-leg partial-void
  math through the UI, and building that would have meaningfully added risk to
  the most financially sensitive batch in the build for a case an admin can
  already resolve by hand. Flagged here rather than silently dropped — worth a
  future batch if per-leg correction is ever actually needed. Verified: brace/
  paren/bracket/backtick balance (all balanced), a headless-Edge harness with
  Firebase fully stubbed (zero live network/DB contact) covering 22 assertions —
  card/warning presence, form-field presence, both guard-rail rejections (empty
  reason, wrong-case confirm text) leaving the bet unmutated, a real applied
  override updating status/payout/history/audit, live P&L reflecting it
  immediately, void auto-setting payout=stake, and the other-bet/gameweek
  non-interference checks — all 22/22 passed, zero `window.onerror` catches.
  Also visually checked via mobile-width (390px) screenshots: card placement,
  warning styling, filter bar, bet rows with prior-override badges/history, and
  the full form all render cleanly with no overflow/clipping.

**ROUND 4 — post-Round-3 bug report, 2026-08-19.** User reported the squad viewer showed
"No squad data pulled yet" for every team. Root cause and fix done directly (small, contained,
same-day turnaround), not delegated:

- [x] 33. (done directly) Squads pull automatically with the weekly sync, not a separate step —
  `S.fpl.squads`/`S.fpl.players` were only ever populated by a distinct manual action (Back
  Office's "Pull squads in-app" button, or the GitHub Action) that nobody was actually running —
  entirely separate from "⟳ Sync & stage gameweeks," the one button admins already click every
  week. `syncAndStage()` now also calls `ingestFplSquads()` at the end of a successful sync,
  reusing the `bootstrap-static` response already fetched for gameweek deadlines (confirmed via
  the test harness's `fetchCalls` log — no duplicate network call) plus a fresh
  `league/{id}/element-status` call for squad membership. Best-effort and silent on failure — a
  squad-pull error doesn't block gameweek staging, the main point of the button. Also simplified
  the requirement per the user: pre-lock, this only needs each manager's full 15-man roster, not
  a starting-XI/bench split — `squadPlayers()` already treated missing lineup data as "put
  everyone on the pitch" (`starter:null`), so no behavior change was needed there, verified
  explicitly rather than assumed. FDR still can't be pulled in-browser at all (classic FPL API
  has no CORS path) — opportunistically tries it, otherwise leaves whatever the GitHub Action
  last wrote untouched; not something the user asked to fix this round. Updated the squad-viewer
  empty state and Back Office FPL Sync card copy to describe the new automatic behavior. Verified
  via brace/paren/bracket/backtick balance (clean) and a headless-Edge harness with Firebase AND
  the FPL network layer both mocked (league/details, bootstrap-static, element-status stubbed;
  classic-API fixtures call deliberately made to fail, simulating the real no-proxy case) —
  calling only `syncAndStage()` (never `fplSyncSquads()` directly) correctly populated
  entryMap/squads/players, confirmed via the actual squad modal rendering a full mock squad with
  no bench section and every player's `starter===null`. 16/16 assertions passed, zero
  `window.onerror` catches. Also visually verified via a mobile-width screenshot. Commit
  `ba76c61`.

- [x] 34. (done directly) Fix squad matching: `element-status`' `owner` is `entry_id`, not the
  league-entry `id` — batch 33 shipped a working auto-sync, but the user reported still seeing
  "No squad data pulled yet." Root-caused by actually running the GitHub Action against live
  data and reading Firebase directly (`fpl.squads`/`fpl.players` were `null` despite a
  "successful" run) rather than assuming batch 29's squad code was correct. Turned out the Action
  hadn't even run since before batch 26 (its `workflow_dispatch` history showed the latest run
  used a commit from before squads existed) — running it fresh against current code surfaced the
  real bug: `league/{id}/element-status`' `owner` field is FPL's global/classic `entry_id`, a
  DIFFERENT number from the league-scoped `id` that `S.fpl.entryMap` is keyed by, despite both
  being small integers in the same rough range (verified directly against the live API for the
  real league, e.g. DUNNEY MONSTERS: league-entry id 5984, entry_id 5981 — confirmed all 12 real
  squads, 15 players each, keyed by `entry_id` in the raw API response). Batch 29's squad code
  (both `index.html`'s `ingestFplSquads()` and the mirrored GitHub Action script) assumed `owner`
  was the league-entry id and looked it up in `entryMap`, silently matching zero players on every
  run — the Action's own log confirmed this: "Squad data: 0 squad(s), 0 owned player(s)" even
  though FDR (which doesn't need this mapping) pulled 38 gameweeks fine in the same run. Fix:
  `ingestFpl()` now also builds `S.fpl.entryIdMap` (`entry_id -> teamId`) alongside the existing
  `entryMap`, since `league_entries` carries both ids per manager; `ingestFplSquads()` (used by
  both the standalone "Pull squads" button and batch 33's automatic sync) now looks up
  `entryIdMap` instead. Mirrored identically in `.github/workflows/fpl-sync.yml`, including
  correcting its now-wrong explanatory comment. Verified: balance check clean; rebuilt the test
  harness with mock `id`/`entry_id` values deliberately different (the first harness happened to
  use matching values and would NOT have caught this) — 18/18 assertions passed. Also re-ran the
  actual GitHub Action against the fixed code and confirmed real squad data landed in Firebase.
  Commit `8af2f65`.

---

## ROUND 5 — pre-launch final changes, 2026-08-19/20 — COMPLETE

User request (final punch list before pushing live for real). Do NOT touch any odds/bets
already live in production data — confirmed nothing already-set was touched (all 6 batches
below are new code paths/UI, none rewrite existing `m.odds`/`bet` values). Done directly (not
delegated) — every item here touches real money. Batch-by-batch as the user explicitly
chose: implement, verify, commit, push, move to next — each batch shipped live before the
next one started. No browser extension was available in this session (checked at batch 37),
so every batch's verification is a static trace (brace/paren/bracket/backtick balance +
manual read-through of every call site touched) rather than a live click-through — flagged
per-batch below rather than claimed. Worth a real walkthrough on the live site once convenient.

- [x] 35. Odds-integrity guard on Algo/Spin — `genAlgoBet()`'s `special`-type leg makers
  used to invent their own line+odds via `teamAvg()`/`edgedOdds()`/`phi()` (a fresh random
  team_pts/haul/match_total/top_score prop with its own probability model on every spin) —
  never anything an admin had actually set eyes on. Replaced with a maker that samples
  from `g.specialMarkets[]`, the exact same admin-published array `specialMarketsBoard()`
  already renders on the board (Loader → Odds Setter → publish, batch 20/21) — same `m.odds`
  field, same object, house-cut `algoEdgePct` still applied on top as a formula (unchanged
  from how match-winner legs already worked), never a new number invented. Match-winner legs
  unchanged (`m.odds[pick]`, already admin-set). If a gameweek has no fixtures AND no
  published specials, `genAlgoBet` now returns `null` cleanly (both `spinAlgo()` call sites
  already toast "No live gameweek to generate from" on `null`, verified). Verified via
  brace/paren/bracket balance (`{`2574/2574 `(`5438/5438 `[`534/534, all clean) and grepping
  every `genAlgoBet(` call site to confirm both callers already handle a `null` return.
- [x] 36. Boosted-odds admin tool — new `weekBoostPrice(g,m,pick)` (distinct from the older
  random `S.promos`/`promoPrice()` flash-boost mechanic, which is untouched): (a) per-match
  `m.drawBoost` toggle in Odds Setter (`toggleDrawBoost`) adds a flat +2.0 to that match's
  draw price, hard-capped app-wide to `MAX_DRAW_BOOST_GWS=2` gameweeks carrying an active
  draw boost at once (blocked with a toast past the cap); (b) per-gameweek `g.favBoostTeamId`
  toggle (`setFavBoost`) adds a flat +0.1 to one team's win price, restricted to only
  `leagueLeaderTeamId()` (top of `seasonStandingsTally()` by points) — one team per gameweek,
  and the toggle stays visible/removable even if a later standings change moves the leader
  elsewhere (so a stale boost is never stuck on). Confirmed with user: +0.1, not +0.5 (an
  earlier verbal slip in the request). Both compose through `promoPrice(...) ?? weekBoostPrice(...)`
  at all three places a match price is ever read for display or leg-building — `vGwBoard`'s
  `btn()`, `addMatchLeg()`, and batch 35's `genAlgoBet()` match maker — so a boosted price
  reuses the exact same fire-icon/strikethrough UI a promo boost already renders, and Algo
  never bypasses it. Odds Setter's `oddsCard()` gets a small 🔥 toggle button next to Home/
  Draw/Away odds (only rendered where eligible), plus a status line showing draw-boost usage
  (N/2 gameweeks) and who the current league leader is. Verified via brace/paren/bracket/
  backtick balance (`{`2612/2612 `(`5522/5522 `[`537/537, 846 backticks — even/clean) and a
  manual trace of all three `weekBoostPrice` call sites plus the cap/eligibility guards in
  `toggleDrawBoost`/`setFavBoost`.
- [x] 37. Bet-slip stake-input typing bug — root cause confirmed: `#stakeInput`/
  `#seasonStakeInput` both ran `oninput="render()"`, which rebuilds the entire `#view` DOM
  (via `innerHTML`) on every keystroke, destroying and recreating the `<input>` element and
  dropping focus/cursor — exactly "type 1, then have to click back in before 0 shows up."
  The algo-stake input (`#algoStake`) and counter-offer stake/odds inputs (`updCounterRet`)
  were already doing a targeted partial update, not a full render — untouched, not part of
  the bug. Fix: new `updateSlipStakeUI()`/`updateSeasonSlipStakeUI()` read the stake value
  and patch only the specific nodes that actually depend on it — potential-return text
  (`#slipPotential`/`#seasonSlipPotential`), the free-bet-credit preview line
  (`#slipFreeLine`/`#seasonSlipFreeLine`), limit-flag warnings (`#slipWarnings`/
  `#seasonSlipWarnings`), and the place button's disabled state + label
  (`#slipPlaceBtn`/`#seasonSlipPlaceBtn`) — the `<input>` itself is never touched, so focus/
  cursor position survives every keystroke. `vSlip()`/`vSeasonSlip()` still compute the same
  values on a full render (leg add/remove, etc.) — only the oninput path changed. Verified
  via brace/paren/bracket/backtick balance (`{`2621/2621 `(`5581/5581 `[`537/537, 858
  backticks) and a manual trace confirming no other `oninput="render()"` full-rebuild pattern
  remains anywhere in the file. No browser extension available in this session to visually
  confirm keystroke-by-keystroke — flagged plainly rather than claiming a visual check that
  didn't happen; worth a quick manual look once live.
- [x] 38. Mobile bet-slip placement — root cause: `.grid2` (`h2/#stakeInput/etc. content` +
  `.slip` sidebar) collapses to a single column under 880px via CSS, and since `.slip` was
  always the second grid child in DOM order, it landed below every gameweek board once
  stacked. `vSlip()` renders fixed ids (`#stakeInput` etc.) so it can't just be duplicated
  into two DOM locations gated by CSS — `getElementById` would always resolve to whichever
  copy came first regardless of which was visually shown, breaking the slip on one layout.
  Fix: `vBuilder()` now builds the slip HTML once and places that single instance into
  whichever of two slots actually matches the real viewport (`isMobileLayout()`, same 880px
  cutoff as the CSS) — directly under the current (first, open-by-default) gameweek board on
  mobile, or the existing sticky sidebar on desktop. New debounced `resize` listener
  (`watchLayoutBreakpoint()`) re-renders only when a resize actually crosses the 880px
  boundary — not on every resize event, so a mobile virtual keyboard opening (which changes
  `innerHeight`, not `innerWidth`) can never trigger a spurious re-render mid-typing (would
  have undone batch 37's fix). In-play tab unaffected — its gw-board HTML still isn't built
  at all when `builderSec==='inplay'` (same short-circuit as before this batch), it only
  gained the mobile/desktop slip-slot logic like the pre-match tab. Verified via brace/
  paren/bracket/backtick balance (`{`2631/2631 `(`5605/5605 `[`538/538, 862 backticks) and a
  manual trace of both branches (mobile/desktop × pre/inplay) confirming exactly one
  `vSlip()` output ever lands in the returned HTML. No browser extension available this
  session to visually confirm at a real phone width — flagged plainly, worth a quick look
  once live.
- [x] 39. Player-requested bespoke bets + Settler support — new `submitBet()` branch
  (`isBespoke`, mirrors batch 28's `isSeason` branch exactly): a bet with exactly one
  `type:'bespoke'` leg (`{description, odds, label}`, free text + the player's own proposed
  price) skips the gw/`bettableNow` gate, has `gwId:null`, and lands `status:'pending'` —
  meaning it goes through the *existing* accept/reject/counter-offer pipeline (Bet Review)
  completely unchanged; "the house recalculates the odds" is just the counter-offer feature
  that was already built, no new negotiation UI needed. New `isBespokeBet(b)` helper (mirrors
  `isSeasonBet`) threads through the same 3 spots batch 28 had to fix for season bets:
  `betCard()`'s `passed`/gw-label logic (a bespoke bet is never "cutoff passed" on its own —
  cancel-ability is already fully gated by `b.status`) and `cancelBet()`'s lock check (would
  otherwise crash calling `gwDeadlinePassed(gw(null))`, same bug class batch 28 hit).
  `legLiveInfo()`/`computeMaxExposure()` needed no changes — both already treat an
  unrecognised leg type as "can't grade yet" / "non-match, assume worst/best case" generically.
  Player-facing: new "🎯 Request a bet" card (`bespokeRequestCard()`) in Bet Builder's
  pre-match section — description textarea + odds/stake inputs, partial-DOM-update potential-
  return (same batch-37 pattern, not a full render on input) — deliberately doesn't say
  "bespoke" in the visible copy since that word already means something else to players
  (batch 27's admin-authored season markets). House-facing: new "🎯 Bespoke bets awaiting
  settlement" card (`bespokeSettleCard()`) at the top of the Settler tab — shown whenever any
  bespoke bet is `status:'accepted'` (even with zero open gameweeks), Won/Lost/Void buttons
  calling `settleBespokeBet()`, which requires a `confirm()` naming the exact bet before
  mutating `status`/`settledPayout`/`settledAt`, logs both `pushHist()` and `audit()`, and
  runs `evaluatePromoRules()` for that team same as `settleGw()` does. Never touched by
  `settleGw()`'s sweep (bespoke bets carry `gwId:null`, so the `b.gwId===gwId` filter always
  excludes them) — this settle card is the only path. `computePnl()` needed no changes — it
  already reads `status`/`settledPayout` generically off every bet. All free-text fields
  (`description`) already flow through the codebase's existing store-raw/`esc()`-at-render
  convention (Settler card, `betCard()` leg labels, notifications) — no new injection surface.
  Verified via brace/paren/bracket/backtick balance (`{`2681/2681 `(`5723/5723 `[`549/549,
  878 backticks) and a manual trace of every new function plus all three `isBespokeBet`
  integration points. No browser extension available this session to click through the
  request→accept→settle flow live — flagged plainly, worth a real walkthrough once live.
- [x] 40. Settler tab: one-click "settle everything" with admin approval gate — new
  "⚡ Settle everything that's ready" button (`settleEverythingReady()`) at the top of the
  Settler tab: sweeps every open, FPL-linked gameweek and auto-pulls scores (reuses the
  existing `fillScoresFromFpl()`, same as the per-gameweek button, just across all of them in
  one go), then finds every open gameweek with fully-complete scores and computes — via the
  existing pure `settleBet()`, nothing mutated — what settling would do to every one of its
  accepted bets. Opens a review panel (`settleReviewPanel()`, `vSettler()` now renders it
  instead of the normal tab whenever `settleReview` is non-null) listing every gameweek's
  accepted bets with their computed WON/LOST/VOID result and payout, each with a dropdown to
  override the outcome before committing (`setSettleOverride()`) — an overridden multi-leg
  acca falls back to the plain `stake*effOdds` formula rather than `settleBet()`'s partial-
  void-prorated figure, flagged inline in the review with a note to check Back Office →
  Override (batch 32) afterward if that matters for that bet specifically. Nothing is written
  to any bet until the final `approveSettleReview()` (its own `confirm()`, states the exact
  gameweek/bet counts) — which then does exactly what `settleGw()` already does per gameweek
  (grade accepted bets, expire unaccepted ones, mark the gw settled, deactivate its promos,
  sweep `evaluatePromoRules()`) across every reviewed gameweek in one `saveNow()`. The
  existing single-gameweek SETTLE button/flow (`settleGw()`) is completely untouched — this
  is an additive bulk path, not a replacement, matching the user's "everything needs to be
  finally approved by the admin" requirement (no outcome is ever silently committed) and the
  project's own established principle (batch 22/32: pulling/computing scores is never the
  same step as committing them). Verified via brace/paren/bracket/backtick balance
  (`{`2732/2732 `(`5832/5832 `[`552/552, 902 backticks) and a manual trace of the full
  build-review → override → approve → commit path plus confirming `settleGw()`'s own body is
  byte-for-byte unchanged. No browser extension available this session to click through
  a real multi-gameweek settle live — flagged plainly, worth a real walkthrough once live.

---

## ROUND 6 — post-Round-5 bug report, 2026-08-20

User reported 3 issues after Round 5 went live: Settler tab showed nothing on click, Algo/Spin
was still generating special-market legs (e.g. "haul" props on random-seeming players) despite
batch 35, and a request to keep a gameweek's bets visible/editable in Odds Setter. This round
did NOT rely on guesswork — the claude-in-chrome browser extension still wasn't connected, so
instead: (a) fetched the live GitHub Pages `index.html` directly and diffed it byte-for-byte
against the local commit to rule out a stale deploy (identical, ruled out); (b) read the live
Firebase Realtime DB directly via its own public REST endpoint (same no-auth access pattern the
client app itself already uses — read-only, nothing written) to get REAL production data; (c)
built a local test harness (Firebase stubbed, zero live writes) seeded with that real data and
drove every admin tab through headless Edge, catching `window.onerror` — this is what actually
found the root cause below, not speculation.

- [x] 41. **Settler tab crash, real root cause found and fixed.** Real production `S.sim` was
  `{holdback:0}` — no `events` key. `migrate()`'s backfill only ran `if (!s.sim) s.sim =
  {holdback:5, events:{}}`, which does nothing when `s.sim` already exists as an object missing
  its `events` sub-field (exactly this shape) — an inconsistency with how `migrate()` already
  (correctly) backfills `s.fpl`'s sub-keys individually just above it. Every real
  `S.sim.events[...]` read site (`fplScoresReady()`, `importFplEvent()`, `syncAndStage()`)
  assumed it always existed; `vSettler()`'s normal per-gameweek render calls `fplScoresReady()`
  for any FPL-linked gameweek, so the moment a real gameweek (GW1, `event:1`) went live, the
  Settler tab threw `TypeError: Cannot read properties of undefined (reading '1')` on every
  render — blank tab, confirmed via the headless-Edge harness against the real downloaded data
  (reproduced the exact crash first, then verified it gone after the fix). Fix: `migrate()` now
  also backfills `s.sim.events` independently (`if (!s.sim.events) s.sim.events = {}`), same
  defensive pattern as `s.fpl`'s sub-keys. Verified: re-ran the same real-data harness after the
  fix — Settler (and every other admin tab) renders clean, zero `window.onerror` catches.
- [x] 42. **Algo/Spin tightened: match odds only, no special markets at all, 2-10 fold.** Real
  production data showed exactly why the user's follow-up ask was needed: GW1 had 12
  `specialMarkets` (one "BIG HAUL 65+ pts" per team) left over from testing the Loader's
  special-markets feature — technically admin-published per batch 35's rule, but not something
  the admin actually wanted the Algo treating as fair game; they read as "random players" to a
  player. Per explicit instruction, `genAlgoBet()` no longer has a special-market leg maker at
  all — its only leg source is real match win/draw/away odds (`m.odds`, still composed with
  `promoPrice`/`weekBoostPrice` exactly as before). Fold count changed from the old
  1-4-leg-weighted-toward-1 distribution to a 2-10-leg-weighted-toward-2 one
  (`rnd([2,2,2,2,3,3,3,4,4,5,6,7,8,9,10])`), never offering a single-leg bet
  (`if(legs.length<2) return null`) — capped in practice by how many distinct real fixtures
  exist in the one gameweek Algo draws from (`Math.min(fixtures.length, n)`), same constraint
  that already existed for match-leg dedup; a 12-team league's usual 6 fixtures/week means a
  literal 10-fold is architecturally only possible if a future batch lets one bet span multiple
  gameweeks (out of scope here, flagged not attempted — bets are still all single-`gwId`).
  Verified via the real-data harness: 200 `genAlgoBet()` calls against real GW1 data (12 real
  specialMarkets present, as a live temptation the code must correctly ignore) — 0 non-match
  legs generated across all 200, leg counts ranged 2-6 (GW1's actual fixture count), 0 total
  failures to generate.
- [x] 43. **Odds Setter: bets on a gameweek now visible and actionable while setting odds.**
  New `gwBetsPanel(g)` — a collapsed `<details>` on every non-draft `oddsCard()` showing every
  bet tied to that gameweek (count, accepted count, total staked, in-negotiation count in the
  summary line) and, expanded, the full `betCard(b,'house')` for each — same accept/reject/
  counter-offer/cancel actions already available in Bet Review, now a glance away while tweaking
  a price mid-week. Stays visible for exactly as long as the gameweek itself does: `oddsCard()`
  only ever renders non-settled gameweeks, so once `settleGw()`/the new bulk settle (batch 40)
  runs and the gw drops out of `vOddSetter()` entirely, its bets stop appearing here too — no
  separate "until settled" condition needed, that's already the card's whole lifetime. Verified
  via the real-data harness with a seeded accepted bet on real GW1: panel renders, shows "1
  accepted", the seeded bet's leg label appears, zero errors.

All three verified together in one final real-data harness run (real GW1/teams/settings/
seasonMarkets/promos/stats/sim, zero live Firebase writes) — every admin tab clean, 0 JS errors.
Commit and push follow immediately per the user's "please fix this" (batch-by-batch push
already established as the approach for this app).

---

## ROUND 7 — post-Round-6 follow-up requests, 2026-08-20

Four more requests. Three were real changes to Algo/boost behaviour; the fourth turned out to
already be existing correct behaviour on inspection (documented, not changed — no code edit for
something that isn't broken). Same real-data-harness verification method as Round 6.

- [x] 44. **Algo leg prices now mirror the exact published price, edge applied once at the
  combined level.** Previously each leg's displayed `odds` already had `algoEdgePct` baked in
  per-leg (`priceFromBoard()`), so what a player saw on an Algo leg was quietly discounted from
  the real board price — not what's "presented for those bets." Now `leg.odds` is the exact
  price a player would see clicking that same button on the board (`promoPrice(...) ??
  weekBoostPrice(...) ?? m.odds[pick]` for a match leg, `m.odds` directly for a special leg) —
  including an active promo/boost's price, since that IS what's presented. The house edge
  (`algoEdgePct`) is now applied exactly once, to the raw product of leg odds, to produce the
  bet's overall `odds`/`effOdds` — same principle as `combinedOdds()`'s `accaEdgeByLegs` already
  applies once to a manually-built acca, not compounded per leg. Side benefit: this also fixes a
  latent mismatch in `settleBet()`'s partial-void proration, which computes `orig=combinedOdds
  (bet.legs.map(l=>l.odds),...)` assuming raw leg odds — previously it was combining
  already-discounted legs, an unintended double-discount on that one payout path; now correct by
  construction. Verified against real production data (GW1 has one genuinely active promo — a
  +15% flash boost on a specific draw): ran 300 `genAlgoBet()` calls, found 24 legs whose price
  differed from the match's raw `m.odds` — confirmed every single one was exactly the active
  promo's price (13.23, not the raw 11.5), i.e. 100% correctly mirroring what's actually
  presented, zero unexplained mismatches.
- [x] 45. **Algo can use special markets again.** The "match odds only" restriction from batch
  42 was a reaction to real production having 12 leftover test "BIG HAUL" markets that read as
  random — not a rule against special markets as a category. `genAlgoBet()`'s special-market leg
  maker (removed in batch 42) is back, sourcing `gw.specialMarkets[]` at its exact published
  price (same "mirror the presented price" rule as batch 44). Fold-count ceiling
  (`Math.min(fixtures.length+offeredSpecials.length, n)`) now accounts for both pools. Verified
  against real GW1 (6 fixtures + 12 real special markets): 300 spins produced leg counts of 2-10
  (the full requested range, now reachable since there are 18 distinct options to draw from) and
  confirmed special-market legs actually appear (`sawSpecial:true`).
- [x] 46. **Boost eligibility generalised to any bet, not just draws/league-leaders.** Renamed
  `m.drawBoost` (boolean) → `m.boostSide` (`null|'home'|'draw'|'away'`) so the admin can put the
  +2.0 "big boost" on ANY outcome of ANY match, not only a draw — same season-wide
  `MAX_BIG_BOOST_GWS=2` cap as before, just no longer outcome-restricted. `setFavBoost()` (the
  +0.1 "small boost") dropped its `leagueLeaderTeamId()` eligibility check entirely — any team
  playing that gameweek is now selectable, still one team per gameweek. `leagueLeaderTeamId()`
  itself removed (no longer called anywhere). `oddsCard()` now shows a 🔥 big-boost toggle on
  all three cells (home/draw/away) per match and a ⭐ small-boost toggle on the two team-win
  cells (home/away), replacing the old leader/draw-gated buttons; the info line above the table
  updated to describe the generalised rules instead of naming a specific team. Verified: toggled
  a big boost onto a non-draw outcome and a small boost onto a non-leader team against real GW1
  data — both applied cleanly, Odds Setter re-rendered with no errors.
- [x] 47. **Odds-editing-after-publish "keep latest as base" — verified already correct,
  no change made.** Read through the full path: `oddsCard()`'s input `value=` attributes always
  read live off `m.odds.home/draw/away` (whatever was last saved, whether originally
  recommended or already manually tweaked) for both draft AND already-published (`open`)
  gameweeks; `setOdds(gwId,mId,k,val)` mutates only the single field that changed and calls
  `save()` — no other field is touched or reset; `releaseOdds()` (the "re-announce after
  tweaking" action) only stamps `oddsReleasedAt` and sends notifications, it never touches
  `m.odds` at all. So editing one or two fields on an already-published gameweek already starts
  from, and only changes, exactly what's currently live — there was no bulk-only or
  reset-to-recommended behavior blocking this. The only things that DO reset every field at once
  are the explicitly-separate, clearly-labelled "↺ Reset all to recommended"
  (`rerecommend()`) and per-match "↺" (`rerecommendMatch()`) buttons, which are a different,
  intentional feature (not what was described) and were left untouched. Flagged here rather than
  silently doing nothing — if something specific was actually observed not working this way in
  practice, worth describing exactly what was clicked/seen so it can be reproduced and fixed
  properly rather than guessed at.

- [ ] 0. Codebase structure map (research only, feeds all other batches)
- [x] 1. Odds decimal formatting + remove number-input spinners everywhere — `fmtOdds` now `.toFixed(1)`; global CSS hides number-input spinners; odds input `step`/`min` bumped to 0.1/1.1 (Odds Setter fields, counter-offer field, `setOdds` clamp). Commit b6734bc.
- [x] 2. Cutoff / in-play-close time fields → calendar+clock picker widget — extracted `calGrid`+time-chip UI from the Loader into a shared, key-based `dtPicker`/`dtPickerPanelInner` widget (state in `dtPickState`, backed by `parseDTLocal`/`ukWallToTs`); Loader kickoff picker refactored to use it inline, GW deadline and in-play cutoff fields in Odds Setter now use it as a popover (raw `datetime-local` inputs removed). Commit 615a020.
- [x] 3. Anti-match-fixing bet restriction (own team to win only, top scorer allowed) — added pure `slipViolatesIntegrity(legs, myTeamId)` (checked in `submitBet` for manual slips, algo bundles and algo direct-place — all funnel through it); `vGwBoard` greys out/locks the draw and opponent-win buttons on a match involving the viewer's own team (own-win button stays live) with a lock icon + tooltip; `genAlgoBet` now takes a `myTeamId` param and skips any candidate leg that fails the integrity check during generation. Confirmed `addSpecialLeg` has no manual UI caller yet (Algo-only), so no other surface needed patching. Commit ec98b5a.
- [x] 4. In-play sections greyed out as "coming soon" — `vGwBoard` odds buttons show a locked/greyed "🚧 Coming soon" state (reused `.oddbtn.locked` styling) with a `::after` overlay ribbon on each in-play match card and updated copy in the board/head; `vBuilder` shows a coming-soon banner when `builderSec==='inplay'`; defense-in-depth added in `submitBet()` (blocks any `mode==='inplay'` submission with a toast — covers manual slip, Algo direct-place and Algo bundles since batch 3 confirmed all funnel through it), `genAlgoBet()` now only draws candidate gameweeks from `bettableNow(g)==='pre'` so Algo never generates an in-play leg, and the slip/bundle UI (`vSlip`) disables the place buttons and shows "coming soon" messaging when the resolved mode is `inplay`. Left `bettableNow()`, live score display (`m.result`/`liveScore` chip), and the historical `b.inplay` bet-list flag untouched. Commit cd7a2b7.
- [x] 5. Notification center: delete + select-all — `loadNotifications` now returns each notif with its Firebase push key (`key`); added per-item `.notif-del` ✕ button in `renderNotifications` calling `deleteNotif(key)` (removes just that push key), and a "Clear all" button next to "Mark all read" calling `clearAllNotifs()` (removes the whole `lennon-lounge-notifs/{teamId}` node). Existing mark-all-read left untouched. Commit 3adf010.
- [x] 6. Bet Review admin fixes (accept/reject disappearance bug, house cancel-before-deadline, clickable filter cards) — deleted dead first `houseAccept`/`houseReject` definitions (the `pushHist()`-based pair), keeping only the canonical `S.bets.find`+`audit()` versions; `saveNow()` now clears `_saveTimer` before writing (was previously just an un-debounced write, but a still-pending debounced `save()` could fire later with stale `S` and clobber it) and is now called from `houseAccept`, `houseReject`, the new `houseCancel`, `settleGw`, `reopenGw` — player-side low-stakes actions (chat, counters, cancelBet) stay on debounced `save()`; added `houseCancel(betId)` (status→`cancelled`, history entry, player notif, blocked once `gwDeadlinePassed`) with a danger-style "Cancel" button on pending/accepted cards in `betCard()`'s house perspective; `vReview()` KPI cards (`needs`/`waiting`/`live`+`staked`/`exposure`) are now clickable, setting a `reviewFilter` state var that narrows the rendered sections (click again or "clear filter" link resets to `all`). Commit a0cb78e.
- [x] 7. Bet Results clarity (Paid £0 emphasis, prominent score/cause of result) — `betCard()`'s `.nums` row now shows an explicit `Paid £0.00` line in `--danger` red for `status==='lost'` bets (matches visual weight of the existing won `Paid` line); `legLiveInfo()`'s per-leg score/cause moved from a tiny inline `(H–A)`/`(N pts)` parenthetical span into its own block-level `.legresult` chip under each leg (new CSS class, colored won/lost/void to match the `.lr` chip semantics). Removed the now-unused `.legscore` CSS rule. Commit 7835aa0.
- [x] 8. Filtering on all bets/performance list pages (by placer, value, etc.) — added shared `betFilters={teamId,minStake,maxStake,status}` state, `applyBetFilters(list)` pure filter fn, and a reusable `filterBar()` (placer dropdown of `S.teams`, status dropdown of all status values, min/max stake number inputs, "clear filters" link shown only when active) wired into `vMyBets()` (filters within the active section tab), `vBetFeed()` (filters the graded/settled list), and `vReview()`'s closed-bets `<details>` (filters within that panel; added `closedBetsOpen` state + `ontoggle` handler so the panel doesn't collapse on every filter change since `render()` fully replaces the DOM). Existing section tabs/reviewFilter untouched — filters narrow within, don't replace them. Commit b4c8036.
- [x] 9. Max exposure smart calc (correlated worst/best net impact, not naive sum) — added pure `computeMaxExposure(bets)`: collects the distinct matches referenced by any `type==='match'` leg across the accepted (`live`) bets, enumerates all home/draw/away combinations across just those matches (capped at 12 matches/3^12, falls back to the old fully-correlated bound above the cap), and for each combination sums net house P&L (stake minus `stake*effOdds` payout) — special-market legs assumed to all win (worst-case pass) or all lose (best-case pass) since exact FPL-point correlation is out of scope. `vReview()`'s single "Max exposure" KPI replaced with two: "Worst case (house)" and "Best case (house)", plus a small muted caption labelling it a model/estimate and noting match count / capped fallback. `betLimitFlags()` untouched. Commit 6955c9e.
- [x] 10. PWA manifest + home-screen icon (Lennon Lounge branded) — no node/python/ImageMagick/rsvg-convert available in-environment (`convert` on PATH is Windows' unrelated system32 disk-conversion tool), so shipped the accepted SVG-only fallback per spec: `public/icon.svg` (rounded-square "LL" monogram, teal→cyan gradient text on `--bg0`/`--bg1` dark gradient bg with violet/pink glow accents, gold underline bar) and `public/icon-maskable.svg` (full-bleed variant, content kept inside the ~80% safe-zone circle per W3C maskable spec); `public/manifest.json` (name/short_name "Lennon Lounge", `theme_color`/`background_color` `#0b0014`, `display:"standalone"`, both icons with `sizes:"any"`, purposes `any`/`maskable`); linked `<link rel="manifest">`, `<link rel="icon" type="image/svg+xml">`, `<link rel="apple-touch-icon">` in `<head>`. Human follow-up recommended: generate real PNG rasters (192/512/maskable) since iOS Safari's home-screen icon support for SVG `apple-touch-icon` is inconsistent — swap in PNGs if an iOS install looks wrong. Commit a02cbae.
- [x] 11. Home page: personal P&L card for non-admins (replace House P&L on home for players) — added pure `personalStats(state, teamId)` (total P&L, win/loss record, stake wagered on bets tied to a currently-open gameweek, and potential winnings summing `stake*effOdds` over `pending`/`accepted` bets); `vHome()` now renders a new "🧮 My P&L breakdown" card (first card in `.homegrid`, using a new small `.pnlgrid`/`.pnlstat` CSS grid) for every viewer, and the House P&L KPI tile in the top row is now gated to `me.admin` only — non-admins no longer see it there, admins see both it and the new personal card since they're players too. Commit eef115b.
- [x] 12. Home page: pending/needs-review section with live countdown, front and centre — added pure `urgentActions()` (admin bets needing accept/reject via `pending`/`counter_user`, viewer's own `counter_house` counter-offers, and the soonest open-gw deadline either referenced by those bets or within 3 days) and `urgentHero()` (renders a `.hero-urgent` card, hot pink→gold gradient with a small pulsing `.hero-dot` reusing the existing `pulse` keyframe) inserted at the very top of `vHome()`'s markup, above the KPI row; only renders when something's actually urgent. `render()` now starts/clears a 1s `setInterval` (`window._homeHeroTimer`) that updates just the `#heroCountdown` text node via `fmtCountdown()` (new helper near `fmtDT`, mm:ss under an hour else "Xh YYm") — no full re-render per tick, cleared whenever Home isn't the active tab. Commit 14ffed5.
- [x] 13. Home page: live betting update table (replace latest-actions feed), wider/cleaner layout — added `liveBetTable(feed,totalCount)` (renders a `.livebet-card` full-width section, sits OUTSIDE `.homegrid` between `.quickrow` and the grid so it isn't squeezed into a 330px card column) and a small local `timeAgo()` helper for a compact relative-time "When" column; table uses `table-layout:fixed` with a `<colgroup>` (Who/Bet/Stake/Odds/When/Status) and `text-overflow:ellipsis`+`title` tooltip on the Who and Bet cells to fix the old unconstrained-table overlap issue, wrapped in a `.livebet-scroll{overflow-x:auto}` div; row limit raised 8→15 (`LIVEBET_LIMIT`) with a "View all →" button (jumps to Results › Bet Results) shown only when `S.bets.length>feed.length`; each `<tr>` carries `data-bet-id="${b.id}"` (no click handler yet — intentionally left for batch 14 to wire up). Deleted the old cramped in-`.homegrid` "Latest action" card entirely. Commit baa1327.
- [x] 14. Home page: click-into-bet detail modal with contextual actions (admin respond / player duplicate+stake) — added `openBetModal`/`closeBetModal`/`renderBetModal` targeting new fixed `#betModal`/`#betModalOverlay` elements (outside `#view`, same pattern as `#notifPanel`; `render()` now calls `renderBetModal()` whenever open so in-modal actions don't go stale); wired the batch-13 live table's `<tr data-bet-id>` with `onclick="openBetModal(...)"`. Modal reuses `betCard(b, me.admin?'house':'player')` for detail + all existing accept/reject/counter/cancel/message actions (zero duplicated logic), adds an admin-only "Open in Bet Review →" shortcut and a non-admin "📋 Place duplicate bet" button. New `duplicateBet(id)` copies the bet's legs into `slip` (blocked with a toast if that gameweek isn't pre-match bettable) and jumps to Builder for the viewer to set their own stake — placement still funnels through `submitBet()`'s existing `slipViolatesIntegrity` check. Added `slipDuplicateOf` state (cleared on any manual slip edit) threaded through `placeBet()`→`submitBet({duplicateOf})`→stored as `bet.duplicateOf`, for batch 15 to key its alternate celebration off without needing to change this batch. Commit 3d5b9f4.
- [x] 15. "It's a cufflink!" duplicate-bet placed animation (replaces "Bosh" for copied bets) + handcuffs graphic — the bet-placed celebration is the `#bosh` full-screen overlay (`bosh()`, "BOSH!" text + kicked ⚽ + confetti), not a `toast()` call; `bosh()` now takes `bosh(isDuplicate)` and, when truthy, toggles a new `.cufflink` class (smaller `clamp()` font since the phrase is longer, hot-pink/orange gradient text instead of green) and swaps `#boshText` to "IT'S A CUFFLINK!" and `#boshBall`'s content to a new inline `CUFFLINK_SVG` constant — an original two-linked-handcuffs illustration (two brand-colored ring strokes joined by a gold chain bar, violet/pink lock tabs) — instead of the ⚽ emoji; confetti/flash/animation timing untouched. Only call site changed: `submitBet()`'s `save(); bosh();` → `save(); bosh(!!bet.duplicateOf);`, keyed off batch 14's `duplicateOf` plumbing. The other `bosh()` call (house accepting a counter-offer) still calls it with no arg, so it's unaffected and keeps normal "BOSH!". Commit 364e425.
- [x] 16. Home page: make all boxes/cards clickable (navigate or expand) — audited `vHome()`: the urgent hero, live bet table rows, and the KPI/P&L breakdown card content from batches 12-14 already had their own controls, leaving the top `.kpis` row and the "Your form"/"League pulse"/"Standings"/chat cards inert. Added `.kpi.clickable` (reused batch 6's existing CSS class) to all 5 top KPI tiles, each navigating to My Bets / Bet Results / Bet Review as appropriate; made "Your form" and "League pulse" whole-card click targets (`.card.clickable`, new CSS) navigating to My Bets and Bet Results respectively; made "Standings" whole-card clickable to the same target as its existing "Full standings →" button (button now `event.stopPropagation()`s to avoid double-navigating). "My P&L breakdown" and "The Lounge chat" cards get expand-in-place toggles instead (`.hg-toggle` on the `<h3>`, new `homePnlExpanded`/`homeChatExpanded` state vars): P&L breakdown reveals a new pure `pnlSparklineSvg(teamId)` — hand-built inline SVG polyline of cumulative P&L across settled bet history, no charting library — and chat expands from 30 to 150 shown messages. Commit 0a64447.
- [x] 17. Promotions/rewards system: admin builder + bet-builder integration (remove old ad-hoc booster picker) — new distinct data model on `S` (NOT `S.promos`, which stays the older house-wide flash-boost mechanic): `S.rewardRules[]` (admin-authored `{id,name,active,trigger,reward,createdAt,createdBy}` — trigger is one of `{kind:'stake_rolling',thresholdGBP,windowDays}` / `{kind:'fold_size',minLegs}` / `{kind:'odds_threshold',minOdds}`, reward is `{kind:'boost',pct}` or `{kind:'freebet',amount}`), `S.rewards[teamId][]` (per-team ledger of granted tokens, both rule-triggered and manual — boost tokens keep the original `{id,pct,used}` shape plus `grantedAt`/`ruleId`/`ruleName`), `S.rewardGrants[]` (idempotency log of `{ruleId,teamId,eventKey,rewardId,at}` so the same rule+team+qualifying-event can never double-grant — `eventKey` is `bet:<id>` for fold_size/odds_threshold, `lvl:<N>` per full threshold crossed for stake_rolling, `manual:<id>` for ad-hoc grants). New `rollingStake()`, `grantReward()`, `evaluatePromoRules(teamId,{bet})` (called from `submitBet()` after every placement and from `settleGw()` for every team), `manualGrantReward()`. New admin-only "🎁 Promotions" nav tab (`vPromos()`) — create/edit/pause/delete rules, manual ad-hoc grant form, reward ledger + grant-log tables. Removed the old manual "pick a booster" chip UI (`boosterSel`/`selectedBooster()`) and `maybeGrantBooster()`'s every-2nd-bet auto-grant entirely; bet-builder integration is now silent auto-apply — `autoBoostToken()`/`autoFreeBetToken()` pick the best eligible unused token at `placeBet()` time (boost: highest %, never stacks; free bet: largest token that fully fits the stake), with a preview line in the slip instead of a picker. New `bet.stakeCredit` field (amount of a bet's stake covered by an auto-applied free bet); `computePnl()` updated by one line to only count the player's own un-covered stake against their P&L (additive change, defaults to 0 for every pre-existing bet — verified by re-running my ad-hoc balance-checker against `git show HEAD:index.html` and confirming the same 2 pre-existing false-positive mismatches at the same shifted offsets, i.e. no new imbalance introduced). `migrate()` converts any legacy `S.boosters[tid]` tokens into `S.rewards[tid]` once, then drops `S.boosters`. Commit e593adf.
- [x] 18. Home page: rewards/promotions tracker widget — added pure `rewardsTrackerData(teamId)` (unused `S.rewards[teamId]` tokens sorted newest-first, plus per-active-`stake_rolling`-rule progress computed via the existing `rollingStake()`, expressing "how far past the last fully-crossed threshold level" as a 0-100% bar so a team that's already unlocked a level or two still shows sane progress toward the next one rather than a number >100%) and `rewardsTrackerWidget(teamId)` (renders a new "🎁 My rewards" card — token chips with rule name/manual-grant label, and a progress bar + "£X more unlocks £Y free bet" caption per active rolling-stake rule; graceful empty state when neither applies) inserted into `vHome()`'s `.homegrid` right after the "My P&L breakdown" card. New CSS (`.rwd-tokens`/`.rwd-token`/`.rwd-progress`/`.rwd-bar`/`.rwd-bar-fill`) added near the existing `.pnlgrid` rules, reusing `--grad`/`--gold` brand tokens. Read-only — no grants happen here (that stays `evaluatePromoRules()`). Commit 1b80788.
- [x] 19. Insights/analytics page (new nav tab) — new `insights:'📊 Insights'` tab added to `tabs` array (visible to all players, not admin-gated) and `views` dispatch map in `render()`, both wired to the new `vInsights()`. Reuses `aiPerfSummary()`/`aiLeagueSummary()` (previously built but never called) as narrative cards at the top. New pure computed stats: `mostLeastBackedTeams()` (leg count by backed team — match legs credit the picked side, `draw` picks and `match_total` specials back no single team so are excluded; team_pts/haul/top_score specials credit their explicit `teamId`), `biggestSingleWin()` (highest-profit `won` bet, profit computed the same way as `computePnl` — stake minus any `stakeCredit` free-bet coverage), `marketTypeMix()` (leg count by market/kind), and `teamOutcomeCorrelation()` (per-team tally of graded won/lost legs across the league — match-winner and match_total legs credit both sides of the fixture since the result is a joint event, team specials credit only the named team — surfaced as "whose matches produce the most bet wins/losses league-wide"). Entirely read-only, no state mutation. Commit fdf0041.
- [x] 20. Gameweek loader: FPL auto-pull + fallback manual single-bet market creator + 10-15 standard market templates + suggested-odds engine — FPL one-click import card kept as the primary path; the "Name & fixtures"/"Bulk load" manual cards moved inside a `<details>` labelled "✏️ Manual entry (fallback)" (collapsed whenever FPL fixtures are available, auto-open otherwise). New `SPECIAL_MARKET_TEMPLATES[]` (12 templates: top/bottom scorer, 4 haul tiers 35/45/55/65, generic points over/under, form-spike/off-day presets, and shoot-out/stalemate match-total presets) — every template is a parameterised instance of the 4 kinds `evalLeg()` can already settle (`team_pts`/`haul`/`match_total`/`top_score`) plus one new symmetric kind `bottom_score` (added to `evalLeg`, `legLiveInfo`, `MARKET_LABELS`, and — critically — `slipViolatesIntegrity`, which does NOT exempt it like `top_score`, so backing your own team to finish bottom is still blocked per batch 3's rule). New `suggestSpecialOdds()`/`specialMarketDefaultLine()` reuse `teamAvg`/`pOver`/`phi`/`edgedOdds` — the exact same form model `recOdds()`/`genAlgoBet()` use, generalised to an explicit target instead of a random one. New admin "🎲 Special markets" card in `vLoader()` (`specialMarketBuilderCard()`): pick a draft/open gameweek + template + target team/fixture, see/edit the suggested odds, "Add to gameweek" pushes onto new `gw.specialMarkets[]` (stable `nid('mkt')` id, kind, target, line/dir, odds); remove button per offered market. `migrate()` backfills `specialMarkets:[]` on every existing gameweek. Player-facing side also wired (not left stubbed): `vGwBoard`/new `specialMarketsBoard()` renders each gw's offered specials as odd-buttons on the board (locked+tooltip when in-play, or when `slipViolatesIntegrity` blocks it for the viewer's own team — only `top_score` is exempt); new `addMarketLeg()` (first manual caller of the previously-orphaned `addSpecialLeg()`) adds/toggles it into the slip, re-checking integrity as a backstop. Commit 6bb72b8.
- [x] 21. Odds setter: per-match reset-to-recommended + "release odds" flow + homepage new-odds notice — confirmed `publishGw()` was already the draft→open "odds go live" transition (notifies all non-admin players via `pushNotif`); it now also stamps `g.oddsReleasedAt`. Added per-match `rerecommendMatch(gwId,mId)` (small ↺ icon button per match row in `oddsCard`'s table, new trailing column) alongside the existing whole-gameweek `rerecommend()`. Extended per batch-20 follow-up: `oddsCard` now also renders offered `gw.specialMarkets[]` (batch 20) as an editable table — odds input (`setMarketOdds`) + per-market ↺ reset-to-suggested button (`rerecommendMarket`, uses `suggestSpecialOdds()`) — and `rerecommend()`'s whole-gw reset now also resets every special market back to its suggested odds, not just matches. New explicit `releaseOdds(gwId)` action (📣 button, shown on already-open/LIVE gw cards) re-stamps `oddsReleasedAt` + re-notifies players, for admins who tweak odds after the initial publish. New `oddsReleaseBanner()` on `vHome()` (dismissible via `sessionStorage`, keyed by gwId+timestamp so a later re-release re-surfaces it) shows "New odds released — review before they lock" with a link into the Builder. Commit eebf864.
- [x] 22. Bet settler: auto-pull completed GW scores from FPL, admin-editable before settling, propagates on settle — verified `settleGw()` needs no special-market awareness: `evalLeg()` grades every kind (`team_pts`/`haul`/`match_total`/`top_score`/`bottom_score`, batch 20) purely from `g.matches[].result`, the same field `fillScoresFromFpl` populates, so pulling match scores is already sufficient — no changes needed there. Added pure `fplScoresReady(gwId)` (mirrors `fillScoresFromFpl`'s own `S.history`/`S.sim.events` team-pair matching to report have/total FPL results for the gw's real matches, independent of whether they've been pulled locally yet) and wired it into `vSettler()`: when FPL has full results for a gw but its local `g.matches[].result` isn't fully filled yet, a prominent pulsing `.fpl-ready-banner` (reuses batch 12's hero-urgent gradient/pulse pattern, scaled to fit inside the existing gw card) appears above the scores table with a "Sync scores from FPL now" button; the existing plain pull button also gets a live "(have/total on FPL)" suffix. Purely surfacing — `fillScoresFromFpl` unchanged, `settleGw`'s admin-edit-before-settle safety gate (missing-score check + confirm dialog) untouched, nothing auto-settles. Commit 94e906a.
- [x] 23. Full responsive/mobile pass across all pages (final polish, do last) — static CSS audit (no node/python/browser available). Fixes: `.homegrid` minmax(330px,1fr)→minmax(min(330px,100%),1fr) to stop forced overflow on sub-330px viewports; `#promoPop` gained `max-width:calc(100vw - 36px)`; wrapped the 6 remaining bare `<table>`s (Money/FPL League tables, Match Results, Insights' two breakdown tables, home-page mini standings) in `overflow-x:auto` divs to match the pattern batches 8/17/19/20/21/22 already used everywhere else; bumped undersized icon-only touch targets to ~36-40px (`.notif-del` 20→32px + widened `.notif-item` padding-right, `.betmodal-close` 32→40px, `.notif-bell` given a 40×40 min box, shared `.x` remove/reset icon class — used by slip legs, algo bundle removal, special-market removal, odds-setter per-match/per-market reset icons — given a 36×36 min hit area, `.daychip`/`.timechip` in the shared date+time picker bumped to ~38px min-height). Biggest functional fix: discovered Insights (batch 19) and every admin House Office tab (Review/Loader/Odds Setter/Settler/Promotions batch 17/Back Office) had **no mobile navigation route at all** — `#topbar nav` is hidden below the existing 699px `#bottomNav` breakpoint and the 5-icon mobile dock only covers Home/Builder/My Bets/Results, with "More" landing on Settings which had no links onward. Added a "📱 More pages" card at the top of `vUserSettings()` with plain nav buttons to every tab not on the dock (Insights for everyone, the 6 house tabs for admins) — reuses `go()`, no new nav pattern invented. Verified via brace/paren/bracket/backtick balance count on the extracted script (all balanced) plus manual review of every edited region. Commit afa74d7.

---

## Batch details

**IMPORTANT for every executing agent:** line numbers below are from the ORIGINAL file
before any batches ran. Every prior batch shifts line numbers. Always locate code by
grepping for the function/variable name given, never trust the line number alone —
treat it as a rough locator only. After finishing: run a basic sanity check (the file
must still be well-formed HTML with one `<script>` block; no unbalanced braces —
extract the script content and check it parses, e.g. via `node --check` on the
extracted JS if node is available), copy `index.html` → `../lennon-lounge-v2.html`,
`git add -A && git commit`, then edit THIS file to check the batch's box and add a
one-line note of what changed + the commit hash. Keep your final report to the
orchestrator under 150 words: commit hash, one-line summary, any issues found.

Known existing quirks worth knowing about (from initial structural audit, not to fix
unless the batch below says so): `submitBet()` does a redundant dual-write (pushes to
local `S.bets` AND separately `db.ref(ROOT+'/bets').push(bet)`) — leave as-is unless
a batch explicitly touches it. `S.bets[].flags` field is dead/unused. `aiPerfSummary()`
and `aiLeagueSummary()` exist but are currently uncalled anywhere — reuse them, don't
duplicate.

Global constants for reference: `TEAMS` array (12 teams, admin teams are `selig` and
`rowez`), `GBP(n)` = currency formatter (2dp, keep as-is), `fmtOdds(n)` = odds
formatter (currently 2dp — batch 1 changes this).

---

### Batch 1 — Odds decimal formatting + remove number-input spinners
Change `fmtOdds` (`n=>Number(n).toFixed(2)`) to 1 decimal place (`.toFixed(1)`).
Grep for any other place odds are formatted directly with `.toFixed(2)` instead of
via `fmtOdds` (e.g. inline on `match.odds.home/.draw/.away`, counter-offer odds
display, algo bet odds) and switch those to 1dp too — ONLY odds values, not `GBP`
currency amounts (those stay 2dp). Add one global CSS rule removing the up/down
spinner arrows from every number input in the app: hide `::-webkit-inner-spin-button`
/`::-webkit-outer-spin-button` and set `-moz-appearance:textfield` on all
`input[type=number]`. Also bump `step` on odds-editing inputs from `0.01` to `0.1`
where present (Odds Setter odds fields, counter-offer odds field) so up/down
behavior — if a user does still use keyboard arrows — matches 1dp, and `min` values
like `1.01` → `1.1`.

### Batch 2 — Cutoff / in-play-close fields → calendar+clock picker
Two admin fields (`setGwDeadline`, `setInplayCutoff` in Odds Setter) currently use
raw `<input type="datetime-local">`. The Gameweek Loader already has a nicer custom
`calGrid()` day-picker + time-chip component for picking kickoff day/time. Extract
that into a small reusable date+time picker widget (a popover/panel styled to match
the app's dark glass aesthetic) that can be dropped in anywhere a UTC timestamp needs
to be picked, and use it for: (a) the Loader's existing kickoff picker (refactor to
use the shared component instead of ad hoc), (b) gw deadline edit, (c) in-play cutoff
edit. Goal: no field should require the user to type digits into a raw text/native
datetime box — always click-to-select day + click-to-select time. Keep using
`parseDTLocal()` for the UK-wall-clock → UTC conversion under the hood.

### Batch 3 — Anti-match-fixing bet restriction (ENTIRE SLIP blocked)
Decision (confirmed with user): if a bet slip/bundle contains ANY leg referencing the
player's own team, the WHOLE bet is blocked at submission unless every one of those
own-team legs is either (a) a match-winner pick on their own team to WIN (not draw,
not the opponent), or (b) a special leg of kind `top_score` for their own team. Any
other own-team leg (draw, opponent-win in a match involving them, `team_pts`/`haul`/
`match_total` specials on their own team) makes the entire slip unsubmittable.
Applies to every player including admins (selig/rowez) for their own team.
Implementation:
1. Add a pure function `slipViolatesIntegrity(legs, myTeamId)` that returns true if
   any leg is disallowed per the rule above.
2. Call it in `submitBet()`/`placeBet()`/wherever a manual slip or algo bundle is
   finally submitted — block with a clear toast ("Can't place this bet — it includes
   a pick against/on your own match that isn't a straight win or top-scorer bet.")
   and do not submit.
3. Defense in depth: also prevent building the invalid leg in the first place —
   in `vGwBoard`, for the match involving the viewer's own team, disable/grey out
   the draw and opponent-win buttons (only their own-team-win button stays active),
   with a small lock icon + tooltip explaining why.
4. Patch `genAlgoBet()` so it never generates a leg on the acting player's own team
   other than a win or `top_score` pick (exclude disallowed legs/teams from its
   random selection pool for that player).
5. Any UI that lets a player place specials manually (may not exist yet outside the
   Algo per the audit — check current state) must apply the same exclusion.

### Batch 4 — In-play sections greyed out as "coming soon"
Grey out and disable interaction in the `builderSec==='inplay'` tab and any in-play
betting controls (the 🔴 IN-PLAY badge/board in `vGwBoard` when a match is live) —
overlay a "Coming soon" label, reduced opacity, `pointer-events:none` on the actual
betting controls. Do NOT remove or break: live score display elsewhere (Results,
Settler), `bettableNow()` logic, or FPL live-score fetching — those keep working,
only the ability to place NEW in-play bets is disabled.

### Batch 5 — Notification center: delete + select-all
In the notification panel (`renderNotifications`/`toggleNotifPanel` area, Firebase
path `lennon-lounge-notifs/{teamId}`): add a per-notification delete (✕/trash) button
that removes just that one push key from Firebase, and a "Clear all" button next to
the existing "mark all read" that removes every notification for that team. Keep
existing mark-all-read behavior intact.

### Batch 6 — Bet Review admin fixes
1. **Dead code**: `houseAccept`/`houseReject` are defined TWICE (once ~L1322 using
   `pushHist()`, once ~L1720 which wins/shadows it, using inline history push +
   `acceptedAt` + `audit()`). Delete the first (dead) definitions entirely, keep only
   one canonical version — grep for both to find current locations since line numbers
   have shifted from prior batches.
2. **Disappearance bug fix**: root cause is a race between `save()` (300ms debounced
   write) and the live `db.ref(ROOT).on('value',...)` listener in `startListener()`,
   which reassigns `S` and re-renders on every remote snapshot — if a snapshot from
   before the debounced write lands (or a concurrent write from elsewhere), the
   optimistic local mutation can get overwritten and the bet reappears in the pending
   list. Fix by adding a `saveNow()` that clears any pending debounce timer and writes
   immediately, and calling `saveNow()` (not the debounced `save()`) from all
   admin state-mutating actions: `houseAccept`, `houseReject`, the new `houseCancel`
   (below), `settleGw`, `reopenGw`. Leave low-stakes actions (chat, notif reads) on
   the debounced path.
3. **House cancel before deadline**: add `houseCancel(betId)` — sets `status:'cancelled'`,
   pushes a history entry + notif to the affected player, only actionable while
   `Date.now() < gw.deadline` for that bet's gameweek. Add a "Cancel" button (danger
   style) next to Accept/Reject on pending/accepted bet cards in Review, gated by that
   deadline check.
4. **Clickable KPI filter cards**: the summary cards atop `vReview()` (needs your call
   count, counter-offers count, live book count, exposure) become click targets that
   set a `reviewFilter` state var to scroll/filter the list to that section; add an
   "all" reset.

### Batch 7 — Bet Results clarity
In the shared `betCard()` renderer: add an explicit "Paid £0.00" line (styled in
`--danger` red, same visual weight as the winning "Paid £X" line) for
`status==='lost'` bets — currently lost bets show no Paid row at all. Also make the
match score / special-result that caused the win/loss more prominent: currently
`legLiveInfo()` appends a small bracketed `(H–A)` or `(N pts)` inline next to each
leg. Restyle as its own clearly-legible line/chip under each leg (still sourced from
`gameweek.matches[].result`), not tiny parenthetical text.

### Batch 8 — Filtering on bet/performance list pages
Add a lightweight filter bar to: `vMyBets()`, `vBetFeed()` (under Results), and the
closed-bets section of `vReview()`. Filters: by team/placer (dropdown of `TEAMS`),
by stake/value range (min/max), and status (reuse existing status values). Pure
client-side array filtering before render using shared filter-state vars (e.g.
`betFilters = {teamId, minStake, maxStake, status}`), with a visible "clear filters"
control. Keep existing section tabs (active/won/lost/etc.) working alongside the new
filters (filters narrow within a section, don't replace the tabs).

### Batch 9 — Max exposure: correlated worst/best net impact
Current `vReview()` exposure figure is a naive gross sum:
`live.reduce((s,b)=>s+b.stake*b.effOdds,0)` over all `accepted` bets — ignores that
legs on the same match are correlated (e.g. two players backing opposite teams in one
match can't both win). Replace with a scenario-based calc, SCOPED to accepted bets
only, matches actually referenced by their legs (this set is small, not the whole
league):
1. Collect the distinct set of matches referenced by any match-winner leg across all
   accepted bets for that gameweek.
2. Enumerate all outcome combinations across just those matches (home/draw/away each
   — this set is typically small, cap at a sane limit e.g. 12 matches/3^12 and warn
   in a code comment if exceeded, don't need to handle unbounded GWs).
3. For each combination, compute total house net (stakes collected minus payouts owed)
   summing across all accepted bets whose match legs all resolve as winners in that
   combination AND whose special legs are — for this approximation — assumed to also
   win (worst-case net) or also lose (best-case net) independently, since exact
   special-market correlation (FPL point distributions) is out of scope.
4. Report both the worst-case net (max house liability) and best-case net (max house
   profit) instead of one flat number — label clearly as an estimate/model, not exact.
Keep the existing simple `betLimitFlags()` per-bet limit check untouched — this batch
only changes the aggregate exposure figure shown in Review.

### Batch 10 — PWA manifest + branded icon
No manifest/icons exist at all currently (verified — no favicon, no apple-touch-icon,
no manifest.json). Build:
1. A simple, bold icon in brand colors (dark `--bg0`/`--bg1` background, teal/violet/
   gold accents, Archivo Black-style wordmark or a simple lounge/football motif) as
   an SVG first.
2. Try to produce real PNG assets (192x192, 512x512, and a maskable variant) using
   whatever's available in this environment (check for `node`+`sharp`, ImageMagick
   `magick`/`convert`, `rsvg-convert`, or use the claude-in-chrome browser tool to
   render the SVG and screenshot/crop it to exact pixel sizes). If no reliable PNG
   path is available, ship the SVG as the icon source (`type="image/svg+xml"`,
   `sizes="any"`) — note the limitation clearly in your final report so a human can
   swap in real PNGs later if an iOS install looks wrong.
3. Add `manifest.json` (name "Lennon Lounge", short_name "Lennon Lounge",
   theme_color/background_color matching `--bg0`, display "standalone", icons array)
   in the `public/` folder, link it via `<link rel="manifest">`, add
   `<link rel="apple-touch-icon">` and a favicon link, all in `<head>`.

### Batch 11 — Home page: personal P&L card (replace House P&L for non-admins)
In `vHome()`, the KPI row currently always shows House P&L (via `computePnl()`).
Change so non-admin viewers see a richer personal card instead: total personal P&L,
amount wagered this week (bets with `teamId===me.id` and `placedAt` within the
current open gameweek's window), win/loss record (settled bet count by outcome), and
potential winnings if every currently open/pending bet of theirs lands (sum
`stake*effOdds` over their `pending`/`accepted` bets). Make it visually a small
breakdown grid, not just one number. Admins keep seeing House P&L (in addition to,
not instead of, their own personal stats — admins are also players with their own
teams).

### Batch 12 — Home page: pending/needs-review urgent section with live countdown
Add a hero "Action needed" section at the very top of `vHome()` (above the KPI row),
shown only when relevant, covering: for admins, bets awaiting their accept/reject
decision; for players, counter-offers awaiting their response; for anyone, an open
gameweek approaching its deadline. Show a live ticking countdown (mm:ss or hh:mm) to
the relevant deadline — use a lightweight `setInterval` that updates only the
countdown text node(s), not a full app re-render, so it ticks smoothly without
disrupting the rest of the page. Style prominently (hot pink/gold gradient, subtle
pulse animation, matches existing `.badge`/`pulse` keyframe pattern already in the
CSS).

### Batch 13 — Home page: live betting table (replace "Latest action" feed)
Rebuild the "Latest action — all players" section as a proper table: fix current
overlap/rendering issues (likely long team/label text colliding — use CSS
grid/table-layout with fixed column widths, `text-overflow:ellipsis` + `title`
tooltip for long content, wrap only where safe). Make it full content width (break
out of any narrow card wrapper) and place it as its own full-width section below the
KPI/action row rather than a cramped card. Show more rows than the current 8 if space
allows, with a "view all" link to a fuller feed if truncated.

### Batch 14 — Home page: click-into-bet detail modal
Each row in the new live betting table (batch 13), and other bet-summary cards where
sensible, becomes clickable, opening a modal with full bet detail. Contextual actions
inside the modal: for admins — "Respond" (accept/reject/counter inline, or jump to
Review with that bet pre-selected); for non-admins — "Place duplicate bet" which
pre-fills the slip/builder with the same legs and lets them choose their OWN stake
before submitting (subject to batch 3's integrity rule if it includes a leg on their
own team).

### Batch 15 — "It's a cufflink!" duplicate-bet animation
Find the existing bet-placed confirmation toast/animation (likely "Bosh" text in the
`toast()` call inside `placeBet`/`submitBet`). For bets placed via the new "duplicate
bet" flow from batch 14 specifically, show a different celebratory message —
"It's a cufflink!" — with a small inline cartoon graphic of two linked handcuffs
(simple original SVG illustration in brand colors, not a stock/copyrighted image).
Normal (non-duplicate) bet placement keeps its existing "Bosh" behavior unchanged.

### Batch 16 — Home page: make all boxes/cards clickable
Audit every remaining card in `vHome()` (form summary, league pulse, standings
preview, chat box, any KPI tiles not already covered by batches 11-14) and wire click
handlers: either navigate to the relevant full page/tab, or expand in place with more
detail (e.g. a small inline sparkline of P&L over time using settled bet history,
built as plain inline SVG — no charting library, no build step available).

### Batch 17 — Promotions/rewards system
Remove the current ad-hoc per-bet booster picker from the slip UI (`selectedBooster`
in `vSlip`) — players no longer choose to "apply a booster" manually. Keep the
underlying booster data model (`{id, pct, used}` tokens) as the reward TYPE a
promotion can grant. Replace the auto-grant-every-2nd-bet logic (`maybeGrantBooster`)
with rule-based grants from admin-defined promotions. Build:
1. A new admin-only "Promotions" section (new nav tab or House Office sub-section):
   create/edit promotion rules with a trigger condition (e.g. stake threshold within
   a rolling week, fold-size threshold like "any 4-fold+", odds threshold) and a
   reward (odds-boost % token, fixed free-bet amount, etc.), plus the ability to
   manually grant an ad-hoc reward to a specific team outside any rule.
2. Evaluation logic run after each bet placement / gameweek settle: check active
   promotion rules against each team's recent activity, grant matching rewards
   idempotently (never double-grant for the same qualifying event — track which
   rule+event combinations have already paid out).

### Batch 18 — Home page: rewards/promotions tracker widget
On `vHome()`, show the player's currently held unused rewards (boosters/free bets)
and progress toward any in-flight promotion threshold (e.g. "£65 / £100 wagered
toward your £10 free bet") sourced from batch 17's promotions data.

### Batch 19 — Insights/analytics page
New "Insights" nav tab (add to the `tabs` array and `views` dispatch map in
`render()`), visible to all players (general league analysis, not admin-sensitive).
New `vInsights()` view. Reuse `aiPerfSummary()`/`aiLeagueSummary()` (currently built
but never called anywhere — use them here) as narrative building blocks, plus new
computed stats: which team's match outcomes correlate with the most settled bet wins
/ losses across the league, most and least backed team (leg count by `teamId` across
all bets), biggest single win, most common market type, and any other genuinely
interesting pattern the data supports. Keep it read-only/no side effects.

### Batch 20 — Gameweek Loader: FPL automation + standard markets + suggested odds
1. Promote the FPL one-click import (`importFplEvent`, backed by `S.fplFixtures`) to
   the primary/default path in `vLoader()`; demote the manual dropdown/bulk-paste
   entry to a clearly-labeled fallback ("Add a custom market" / "Manual entry (fallback)").
2. Build a library of 10-15 standard special-market templates (e.g. highest scorer in
   GW, team X to score 5+ points/goals, over/under X total GW points, team X clean
   sheet, most bench points, etc.) as a data structure (name, description, params like
   target team/threshold).
3. Add a "suggested odds" heuristic per template, extending the existing `recOdds`/
   `teamAvg` form-based model (not real ML — a reasonable heuristic is fine), which
   the admin can then edit before saving.
4. Add UI (in Loader or a new "Markets" sub-section) to pick a template, set its
   target team/threshold, see the suggested odds, edit them, and add it as an offered
   market for that gameweek. These become pickable specials — remember batch 3's
   integrity rule (a player can only take `top_score` specials on their own team, any
   team's markets are fine otherwise).

### Batch 21 — Odds Setter: per-match reset + release-odds flow
1. `rerecommend(gwId)` currently resets ALL matches in a gameweek to recommended odds
   at once. Add a per-match variant (small "reset" icon button on each match's odds
   row) that only resets that one match/market.
2. Add an explicit "Release odds" action: flips the gameweek from `draft`→`open`
   (confirm this is/isn't already how odds go live — check `saveLoader`/status flow),
   notifies all players, and shows a homepage banner "New odds released — review
   before they lock" (can reuse/extend batch 12's urgent-section pattern, or be a
   simple dismissible banner).

### Batch 22 — Bet Settler: FPL automation
`fillScoresFromFpl(gwId)` already exists as a manual-click pull. Make "scores ready"
a surfaced state — e.g. auto-check on Settler tab load whether FPL data for that
gameweek's event is complete and highlight a prominent "Sync scores from FPL" call-
to-action (rather than a plain button the admin has to think to click), while keeping
the existing admin-edit-before-settle safety gate exactly as it is (do not auto-settle).

### Batch 23 — Full responsive/mobile pass (DO LAST)
Final polish across all pages, old and newly-built: no horizontal page overflow
(wide tables get their own `overflow-x:auto` wrapper), modals fit small screens,
nav wraps sensibly, touch targets are large enough, consistent with the existing
bottom mobile nav pattern. Test by resizing / using the claude-in-chrome browser tool
at common phone widths (375px, 390px) and desktop (1440px) if available; otherwise do
a careful CSS audit (media queries, flex-wrap, min-width usage) for every section
touched by batches 1-22.

---

## Notes / decisions log

- 2026-08-17: Repo had no git history; ran `git init` + baseline commit before starting.
- 2026-08-17: Batches are sequential (not parallel) because they all touch the same
  single index.html file — parallel agents editing the same monolith would conflict.
  Each batch = one agent, one commit, then next batch dispatched.
- 2026-08-18: User manually uploaded the finished build to their real GitHub repo via
  the web UI before any remote was connected — unrelated git histories. Reconciled by
  branching `main-push` off `origin/main` and adding only the files it was missing
  (see Branch note above). All work from here on happens on `main-push`.

---

## Round 2 — post-deploy feedback (2026-08-18)

User walked through the live deployed app and reported 7 items. Two were investigated
and fixed directly (not delegated — needed careful root-cause tracing across several
functions rather than a scoped batch brief), three more were small enough to fix
directly once located, and two remain as new batches below (24-25).

**Fixed directly, commits on `main-push`:**
1. **Bet Review accept/reject not clearing the bet** (recurring — batch 6's fix
   addressed a real but different race condition; this was still happening).
   Root cause: `submitBet()` had a second, redundant Firebase write
   (`db.ref(ROOT+'/bets').push(bet)`) alongside the normal full-state `save()`. Under
   concurrent use this could bake a duplicate copy of a just-placed bet (same `id`,
   separate object identity) into `S.bets`; `houseAccept`/`houseReject` only mutated
   whichever copy `.find()` returned first, so the other stayed `status:'pending'`
   forever and never cleared from Review. Fixed: removed the redundant write;
   `migrate()` now de-dupes any bets sharing an id on every load (self-heals whatever
   duplicates are already sitting in the live Firebase data); `houseAccept`/
   `houseReject`/`houseCancel` now defensively act on every matching bet by id as a
   second line of defense. Commit `2664602`.
2. **Max bet payout → £2000.** `DEFAULT_SETTINGS.maxPayout` was 10000; changed to
   2000 with a migration bump for existing installs. Verified exposure figures
   (`computeMaxExposure`, batch 9) already only ever counted `status==='accepted'`
   bets — unchanged. Verified `betLimitFlags()` only flags an over-limit bet, never
   blocks submission — a breaching bet still goes through as a pending request,
   unchanged. Commit `2664602` (same commit as #1).
3. **Login screen showing the mobile bottom nav.** `#bottomNav`'s CSS media query
   defaults it to visible under 700px; `logout()`/`switchUser()` toggle it explicitly
   once a session exists, but `initApp()`'s "no saved session, show login" path never
   did, so it fell through to the CSS default. Added the same explicit hide there.
   Commit `f62a118`.
4. **Odds unrealistically wide (too high on one side of most matches).**
   `recOdds()`'s win-probability curve used a divisor of 20 against TEAMS' base-
   strength spread (~45-56, an 11pt range before real history accumulates), which
   swung a typical matchup's odds much wider than intended (e.g. ~1.3 vs ~4.6 on an
   11pt gap). Widened the divisor to 34 — typical week-to-week gaps (3-6pts) now
   land ~1.5-2.5 on both sides per the user's ask, only widening for a genuinely
   large mismatch. Draw odds (~11.6, from `pD=0.08`) were already within the
   requested 10-20 range, untouched. **Caveat flagged to user**: this doesn't
   retroactively fix odds already baked into existing test gameweeks/bets in the
   live Firebase data — those were generated under the old curve. Commit `7c55909`.
5. **Sync/refresh reliability.** No code bug here, but added a real connection-status
   indicator: a small dot in the header driven by Firebase's own `.info/connected`
   ref (reflects actual websocket state, unlike `navigator.onLine`), with a forced
   fresh read on reconnect and on the tab/PWA becoming visible again as a
   belt-and-braces nudge alongside the SDK's own auto-resync. Commit `cbdb76f`. See
   chat for the full explanation given to the user of how save/sync/offline-queueing
   actually works.

**Remaining, written up as new batches below:**
- Batch 24 — Mobile nav restructure (hamburger/side-drawer nav)
- Batch 25 — Deeper horizontal-scroll / single-column-fit audit (batch 23 was a
  first static-only pass with no browser available to verify against; user still hit
  real issues, so this one should use the claude-in-chrome browser tool if available
  in the executing session to actually verify at phone widths, not just read CSS)

---

### Batch 24 — Mobile nav restructure: hamburger / side-drawer
Currently on mobile (<700px) navigation is: a 5-icon bottom dock (`#bottomNav`:
Home/Bets/My Bets/Results/More) plus, since batch 23, a "More pages" card inside
User Settings linking every tab the dock doesn't cover (Insights, and for admins:
Review/Loader/Odds Setter/Settler/Promotions/Back Office). User feedback: burying
things like Insights two taps deep behind "More → scroll → find the link" is too
slow for a "significant" page. Replace with a proper slide-out nav drawer: a
hamburger icon in the header (`<header>`, alongside the existing notif bell / logout
button — grep `id="notifBell"` to find it) that opens a full-height side panel
(slide in from left or right, dark glass style matching `#notifPanel`'s existing
overlay pattern — grep `notifPanel`/`toggleNotifPanel` for the pattern to follow)
listing every nav destination as a single flat tappable list (reuse the same `tabs`
array `render()` already builds, admin-gated entries included), each closing the
drawer and calling `go(tab)` on tap. Keep the existing 5-icon bottom dock as-is for
the most-used destinations (don't remove it — this is additive, not a replacement) —
just make the hamburger drawer the fast path to everything else instead of the
current "More" detour. Desktop nav (`#topbar nav`, ≥700px) is unaffected, already
shows every tab as a normal row of buttons. Remove or keep the batch-23 "More pages"
card in User Settings — your call, but if you keep it, deduplicate rather than
maintaining the tab list in two places (e.g. have both read from the same `tabs`
source).

### Batch 25 — Deeper horizontal-scroll / clean single-column mobile audit
Batch 23 already did a pass but was static-only (grepping CSS/class names, no
browser available in that session to actually verify). The user still hit pages that
don't render cleanly on their phone — real horizontal scrolling and cramped
overlapping text. **If the claude-in-chrome browser tool is available in your
session, use it**: resize/open at common phone widths (375px, 390px, 414px) and
actually click through every tab (Home, Builder incl. In-Play tab, My Bets, Results
incl. all its sub-tabs, User Settings incl. the More-pages links, and every admin
tab if you can log in as one) taking screenshots, looking for: any element causing
the page to scroll sideways, text/numbers overlapping or getting clipped, anything
not obviously grouped with the bet/match it belongs to. Apply the user's stated
layout principle directly: **it's fine and expected for related info to stack onto
multiple lines as long as the grouping is visually obvious** — e.g. fixture name and
live score on one line, bet status/result directly underneath it, clearly still
inside the same card/row — the goal is no *sideways* scrolling ever, not fewer
lines. If no browser tool is available, fall back to a rigorous static audit like
batch 23's but go further: check every `<table>`, every flex row with multiple
inline stats, every card built by batches 11-22 specifically (these are the newest,
least battle-tested UI) for fixed widths without `max-width`, missing `flex-wrap`,
padding/gap totals that don't account for narrow viewports, and long unbreakable
strings (team names, odds+currency combos) without `overflow-wrap`/`text-overflow`
handling. Fix what you find; where you're not sure a fix actually rendered clean visually
(no browser available), say so plainly in your report rather than claiming success.

---

## ROUND 8 — deep mathematical odds model, 2026-09-10

User request: replace the current heuristic `recOdds()`/`suggestSpecialOdds()` (flat
team-average + fixed juice) with a proper model using team form, squad-level player
form/injuries, real-world PL fixture difficulty (FDR, from batch 29's `S.fpl` data),
and opponent context — outputting fair probabilities, then a tunable house-competitiveness
control, then final odds. Plus: auto-population of Odds Setter 21h before each gameweek's
cutoff (as a DRAFT suggestion only — **confirmed with user: does NOT auto-publish**, admin
still clicks Publish, same as today), an expanded special-markets library (~15 templates),
and a Bet Review flag for any bet whose price didn't come from officially published odds
(so nothing about house pricing integrity is ever taken on trust). Model assigned per the
user's explicit instruction: the math model itself gets Opus 5 at high effort (batch 48);
the two supporting changes get Sonnet 5 (batches 49/50). Real-money system — same verification
bar as every prior batch (balance checks + headless harness + real-data spot checks), no
`gh repo`/`gh api .../pages`/`gh secret` commands, work on `main-push`, push via
`git push origin main-push:main`, copy `index.html` → `../lennon-lounge-v2.html` after,
commit with a descriptive message, update this file's checkbox + a one-line note with the
commit hash when done.

- [x] 48. (Opus 5, high effort) **Deep mathematical odds model — DONE, commit `8191068`.**
  Replaced `recOdds()`'s flat-`teamAvg()`/`pD=0.08`/`juice=1.08` heuristic and
  `suggestSpecialOdds()`'s pricing with a per-gameweek model, all of it in one new commented block
  in the PRICING & SETTLEMENT ENGINE section (right after `pOver()`), with every tunable collected
  in a single `MODEL` const so a future batch re-calibrates in one place instead of hunting through
  the maths. Four layers, each degrading gracefully if its data is missing:
  **(a) recency-weighted form.** New `teamResults(state,tid,beforeEvent)` does the same
  `S.history` + local-`gw.matches[].result` merge `teamAvg()`/`vStandings()`/`teamForm()` already
  do, but keeps the FPL event number attached and sorts most-recent-first — which is what makes
  weighting possible at all — and honours a before-event cutoff so pricing GW9 never sees GW9's own
  result. New `teamFormProj()` weights each result `0.82^i` by how many results ago it was (~3.5
  game half-life; the last five weeks carry ~62% of the weight), keeping `S.stats[].base` as a
  Bayesian prior worth 1.5 results. Its `weight` return (caps at ~5.6) is the evidence measure the
  shrink below uses. Proven in the harness: two teams with an IDENTICAL lifetime average but
  reversed trajectories are tied at 47.75 by `teamAvg()` and separated 51.2 vs 44.5 by this.
  **(b) squad-level player form/injury/rotation.** New `squadExpected()` prices the XI that will
  actually play — the published lineup if `lineupIds()` has one, otherwise the best 11 by expected
  points, which is what a rational manager does with this information. Per player:
  `0.65*form + 0.35*ppg`, times `playerAvailability()`, times `playerStartShare()`.
  `ingestFplSquads()` now also captures `cp` (`chance_of_playing_this_round`, falling back to
  `_next_round`, which is what FPL populates between gameweeks) and `mn` (season-total minutes) —
  **mirrored field-for-field into `.github/workflows/fpl-sync.yml`** per that function's own
  standing comment. `playerAvailability()` prefers the 0/25/50/75/100 chance figure over the coarse
  `st` letter (a 75% doubt and a 25% doubt both just read as `d`), but a hard status
  (`i`/`s`/`u`/`n`) zeroes the player regardless. `playerStartShare()` is the rotation proxy and
  needed **no extra API calls at all**: the largest season-minutes figure in the ingested set is a
  near-ever-present, so `maxMinutes/90` reads how many league games have been played and each
  player's share of that is their rotation profile — floored at 0.35 so a fringe player is
  discounted, never erased, and switched off entirely (`games:0`) pre-season rather than guessed.
  **(c) real-world fixture difficulty.** New `playerFixtureMult()` reuses batch 29's
  `clubFixture()`/`plFixturesFor()` rather than reinventing them: 3 is neutral, each FDR point
  either way is ±7.5%, a **blank gameweek scores zero** (the player literally cannot score) and a
  double is 1.8x, not 2x. Purely numeric — no real-world club is named in any of it.
  **(d) the projection.** `projectTeams(state,ev)` returns every team at once (so callers can do
  league-relative maths in one pass): form sets the level, and the squad signal moves a team by 55%
  of however far its expected XI sits from the league mean XI, that ratio clamped to [0.75,1.30].
  Used **relatively, not absolutely, on purpose** — summing eleven players' FPL form is a
  similar-but-not-identical scale to a Draft H2H score (no captain, different bonus/autosub
  behaviour), so the ratio is trustworthy where the raw total isn't. Net effect: a team's price can
  move ~−14%/+17% off its form level on squad news, no more. One deliberate correction found by the
  harness and fixed before commit: a squad with data but a projected ~0 (a full blank gameweek) was
  initially being filtered out as "no data" and silently given rel=1 — `withSq` now keys on the
  squad object existing, not on it being non-zero, and a full blank correctly drops a projection
  52.5 → 43.1.
  **Match probabilities.** `fairMatchProbs()` reuses the existing `phi()`/`SD` machinery (new
  `SD_DIFF = SD*√2`) rather than inventing a stats primitive: `phi(D/SD_DIFF)` is just
  P(home outscores away) under two normal scores. `D` is first shrunk by how much evidence backs it
  — 0.55 with nothing but hand-set baselines, rising toward ~0.85 with a full season — which is the
  principled version of what the old model's hand-tuned "divisor 34" was doing by feel, and is what
  stops week 1 producing 1.3/4.5 off a baseline guess (harness: a 56-vs-46 baseline gap with zero
  results prices 1.43/2.23, not 1.3/4.5). Draw probability is no longer the hardcoded 8%: new
  `leagueDrawRate()` reads this league's own tie rate blended against a 7% prior worth 20 games,
  then tapers with the projection gap (gaussian, which is the shape an exact-tie probability
  actually has) and is clamped to [2%,20%].
  **House competitiveness.** New `S.settings.oddsCompetitiveness` (integer 1-20, default 10,
  `DEFAULT_SETTINGS` + `migrate()`-backfilled AND clamped there, so a hand-edited Firebase value
  can't break it) → `houseEdgePct()`, a three-anchor linear curve: **20 → 10.0%** (the user's hard
  floor, clamped as well as anchored), **10 → 16.3%**, **1 → 28.0%**. The 16.3% is not a guess — it
  is exactly the margin implied by the user's own close-game example (1.8/1.8/12 is a book of
  1.194). The 28% ceiling is reasoned and documented inline: at 28% an even match pays 1.54 and a
  7% draw pays 10.2 — visibly poor value but still a bet; past ~30% an evens shot drops under 1.4,
  the numbers stop reading as odds, and lost turnover costs the house more than the margin earns.
  **One shared function feeds both `recOdds()` and `suggestSpecialOdds()`** — the latter was
  previously (wrongly) borrowing `algoEdgePct` to set a *published* price. `algoEdgePct` and
  `accaEdgeByLegs` are untouched and stay exactly what batches 31/35/44/45 made them: the Algo's
  discount on top of already-published prices. New slider + live worked-price preview
  (`compPreviewText()`/`updCompPreview()`, patching only its own three nodes — batch 37's targeted
  -update pattern, so dragging never triggers a `render()`) in Back Office → "📏 Limits & edge",
  read back by `saveSettings()` and named in its `audit()` line.
  **`edgedOdds()` hardened (real-money detail, found by the harness).** It now floors to 2dp rather
  than rounding (rounding UP hands the punter back a sliver of edge) and caps the probability at
  `(1-edge)/1.05`. Without that cap the 1.05 minimum price silently ate the edge: a 90% shot is
  fair at 1.11, `1.11 × 0.837 = 0.93` is an impossible price, so the old code just returned 1.05 —
  a realised margin of ~6%, not the 16.3% the setting asked for. **Flagged explicitly rather than
  papered over:** a one-sided market whose true probability exceeds `(1 − edge)` cannot be offered
  with that edge at *any* price ≥ 1.00 (a 95% shot would need odds of 0.947 to leave the house
  10%). So the guarantee is stated precisely — for every probability the house is willing to price
  (≤79.7% at setting 10) the realised margin is ≥10% at every slider position, verified
  exhaustively across 12 probabilities × 20 settings; above that the model returns exactly the 1.05
  floor and new `nearCertaintyWarning()` tells the admin in the market builder to raise the line
  rather than publish a market that loses money. The pre-existing 0.03 low clamp is untouched and
  can't breach the floor — it shortens an extreme longshot, which moves the price the house's way.
  **Special markets 12 → 16** (the spec said "currently 11"; it was actually 12), all reusing the
  five existing settleable kinds so `evalLeg`/`legLiveInfo`/`MARKET_LABELS`/`slipViolatesIntegrity`
  needed no changes: `banker` (short-price acca filler), `beat_par` (near-evens), `disaster`
  (under 30, long), `blowout` (huge combined total). `banker`'s line is **derived** (projection − 9,
  ~0.6 SD) rather than a fixed "25+" for exactly the edge reason above — a fixed low line is a ~97%
  shot for a healthy squad and unpriceable; projection − 9 sits at ~75% and prices 1.11 with the
  full edge intact. `specialMarketDefaultLine()` gained `lineOffset` support for `haul` and fixed
  absolute `line` support for `team_pts` to make those work, and now sets every line off the
  projection instead of `teamAvg()`. `top_score`/`bottom_score` are now priced by proper numeric
  integration (`extremeScoreProbs()` — density of team i against P(everyone else came in below),
  one trapezium sweep prices the whole 12-team field, `sign=-1` flips it for bottom score) instead
  of the old `exp(±0.12*avg)` softmax, which had no probabilistic meaning and ignored how spread
  out the field was. `recOdds()` gained an `ev` parameter (all five call sites updated:
  `saveLoader`, `syncAndStage`'s staging loop, `oddsCard`, `rerecommend`, `rerecommendMatch`) plus
  an optional pre-computed projection map so `oddsCard()`/`rerecommend()` do one 12-team pass
  instead of one per fixture. `rerecommend()`/`rerecommendMatch()`/`rerecommendMarket()` all still
  work and now reset to the new model. Odds Setter's "📊 Team form data" panel became "Team form
  data & model projections": per-team **proj** (teal) alongside the old lifetime **avg** for
  comparison, the squad signal as a ±%, out/doubtful counts, the current house edge, and a plain
  warning when no squad data has been pulled.
  **Calibration check (the user's own two examples, run and reported as asked).** Back-calculating
  their books: 1.8/1.8/12 = 1.194 (16.3% margin, fair 46.5/7.0/46.5); 1.6/2.0/12 = 1.208 (17.2%,
  fair 51.8/6.9/41.4). At setting 10 the model reproduces **both to within a penny**: close game
  → 1.79/11.95/1.79, uneven game → 1.61/12.13/2.02. **One honest divergence flagged rather than
  fudged:** the 12.0 draw price implies a ~7% tie rate, and `leagueDrawRate()` now uses the
  league's REAL tie rate once enough results exist. On a realistic seed (~4.3% ties) a level
  fixture correctly prices 1.74/**19.69**/1.74 — the two match sides land on the user's ~1.8 shape,
  but the draw lengthens. That is the model being right: pricing draws at 12 when ties really run
  3-4% is a ~60% house edge on that one outcome. It stays near 12 early on (7% prior, weight 20
  games) and moves to the truth as evidence accumulates. **Worth a decision from Dan** if he'd
  rather the draw stay pinned near 12 for feel — that's a one-line change to `MODEL.DRAW_PRIOR_N`.
  **Verified**: brace/paren/bracket/backtick balance on the full file (baseline HEAD `{`2738/2738
  `(`5853/5853 `[`552/552 918 backticks checked first to confirm a clean baseline, since no
  node/python exists in this environment — `python` is only the Microsoft Store alias stub; after
  this batch `{`2830/2830 `(`6232/6232 `[`606/606 956 backticks, all balanced) plus the workflow's
  own JS (`{`160/160 `(`318/318 `[`46/46). Then an **83-assertion headless-Edge (`--dump-dom`)
  harness** with both Firebase CDN `<script src>` tags stripped and replaced by a stub and
  `initApp()` never called (zero network, zero live-DB contact — the harness builder throws rather
  than proceeding if the tag isn't found), plus `save`/`saveNow`/`saveFields`/`startListener`
  stubbed: **83/83 passed, `TESTOK:true`, zero `window.onerror` catches.** Coverage: the
  competitiveness curve (all 20 positions, monotonicity, clamping, junk input); the calibration
  above; recency weighting vs `teamAvg()` on identical-lifetime-average trajectories; a 12-team
  fixture set seeded with an IDENTICAL flat history so ONLY squad data can differentiate, with
  deliberate manipulations (one squad all on FDR-1 fixtures, one all on FDR-5, one with 6 injured,
  one with 6 at 25% chance-of-playing, one entirely rotation-risk, one full blank) — every one
  moved the projection the right way, and the matched pairing priced dead even at 2.09/2.09; the
  ≥10% margin sweep; graceful degradation with no squad data / no fixtures / no event; the draw
  taper and the 20% clamp on an absurd all-draws history; all 16 templates pricing to finite sane
  numbers with their lines; `algoEdgePct` proven to no longer move a special's price; all three
  rerecommend paths; and a real Back Office DOM round-trip (render → drag slider → live readout →
  `saveSettings()` → persisted, with `algoEdgePct`/`accaEdgeByLegs` asserted untouched). Copied to
  the sibling sync file and diffed identical. **NOT pushed** — committed locally only, per the
  orchestrator's instruction; `git push origin main-push:main` still to run.
  **Two caveats worth knowing.** (1) Season/bespoke markets (`suggestSeasonOdds()`, batch 27) still
  price off `algoEdgePct` and were left alone — out of this batch's stated scope (which named
  `recOdds` and `suggestSpecialOdds`), but they're published prices too and arguably belong on
  `houseEdgePct()`; a small, contained follow-up. (2) The model will produce genuinely short
  favourites (~1.1-1.3) where it projects a large gap, which is more aggressive than the old
  compressed model — mathematically right (a 19-point projected edge really is ~75%), but the
  admin should expect it and can override any price. Pre-existing template `haul_35` also lands on
  the 1.05 floor for a strong squad; that's unchanged behaviour from before this batch, and
  `nearCertaintyWarning()` now says so out loud.
  **Concurrency incident, flagged plainly:** partway through, a concurrently-running agent
  (batch 50, sharing the same working tree) wrote `index.html` from its own stale copy and wiped
  ~300 lines of this batch's already-applied edits. Caught by a `git diff --stat` sanity check
  (44 insertions where ~300 were expected), fully re-applied, and re-verified from scratch.
  The commit body warns that `8191068` might also carry that agent's in-flight work; **it does
  not** — verified after the fact (`git show 8191068` contains zero of its lines). The other agent
  landed its own commit `bff86d7` moments before this one, so `8191068` is clean batch-48-only
  work on top of it; disregard that paragraph of the commit message. **Future rounds should not
  run batches against the same working tree in parallel** — one worktree per agent, or sequence
  them.

  Original spec follows.
  Replace `recOdds()` (currently:
  flat lifetime `teamAvg()` for each manager-team, fixed `pD=0.08` draw prob, logistic curve
  divisor 34, flat `juice=1.08`) and `suggestSpecialOdds()`'s pricing with a model that actually
  uses what the app already ingests: (a) **recent H2H form** — weight recent gameweeks more than
  old ones (current `teamAvg()` is a flat lifetime average with only a soft Bayesian prior via
  `base`; add real recency weighting, e.g. exponential decay over `S.history`+`g.matches` results,
  last ~5-8 GWs matter most); (b) **squad-level player form/injuries** — `S.fpl.players[pid]` (see
  `ingestFplSquads()`, ~line 5574) already carries `f` (FPL form), `tp`/`ep`/`ppg` (points), `st`
  (status code: `a`=available/`d`=doubtful/`i`=injured/`s`=suspended/`u`=unavailable — grep FPL's
  own status-code meaning if unsure) per player, and `S.fpl.squads[teamId]` gives each manager's
  15-man roster; there's no per-GW recent-minutes-trend available cheaply (bootstrap-static only
  has season-total `minutes`, not a redone per-GW breakdown — pulling that per-player would mean
  ~180 extra API calls, both in-browser and in the Action — so don't attempt that; `chance_of_playing_this_round`/
  `chance_of_playing_next_round` (0/25/50/75/100/null on FPL's real `elements[]`, not currently
  captured — worth adding to `ingestFplSquads()`'s mapping, mirrored into `.github/workflows/
  fpl-sync.yml`'s matching block per that function's own "mirrors field for field" comment) is a much
  better injury-doubt signal than the coarse status code alone, and season-total `minutes` is still
  a usable rotation-risk proxy (high form + low minutes = bench risk). Use `st`/chance-of-playing to
  discount or zero out a doubtful/injured/suspended player's contribution to their squad's projected
  score. (c) **fixture-adjusted projection** — `S.fpl.plFixtures[event]` (home/away club id +
  `team_h_difficulty`/`team_a_difficulty` 1-5, from batch 29) lets you look up each squad's players'
  real-world clubs' FDR for the gameweek being priced (`plFixturesFor`/`clubFixture`/`fdrClass`
  already exist as helpers, ~line 3200s — reuse rather than reinvent) — a squad full of players
  facing tough fixtures should project lower, easy fixtures higher. (d) Combine (a)+(b)+(c) into a
  per-manager-team expected-points figure for the specific gameweek being priced (not just a lifetime
  average), then derive home/draw/away fair probabilities from the *difference* between the two
  teams' projections (reuse the existing `pOver`/`phi`/`SD=15` normal-distribution machinery already
  used elsewhere — `pOver(line,avg)` at ~line 1331 — rather than inventing a new stats primitive).
  Document your model's own reasoning inline as normal (like `recOdds()`'s existing divisor-choice
  comment) so a future batch can follow the logic without re-deriving it.
  **House competitiveness control**: new `S.settings.oddsCompetitiveness` (integer 1-20, default
  10, migrate()-backfilled like every other setting), a new Back Office input near the existing
  "📏 Limits & edge" card (do NOT touch `algoEdgePct` or `accaEdgeByLegs` — those are the Algo's
  own acca-combination discount on top of already-published prices, per batches 31/35/44/45, a
  completely separate concept from this). Map slider→house-edge-%: 20 = house edge floors at
  **10% and never goes lower** (user's hard rule — "the house should always maintain a healthy 10%+
  edge", never violate this regardless of slider position), 1 = worst for punters but capped at
  something sane, not silly (pick a reasoned ceiling, e.g. ~25-30%, and say why), 10 = roughly
  today's/a normal bookmaker feel. Calibrate against the user's own worked examples (not hard specs,
  just a sanity check to run and report): "a close game" ≈ 1.8/1.8 for either team + 12 for the
  draw; "a very uneven game" ≈ 1.6/2.0 + 12 for the draw — back-calculate what overround that
  implies and land your slider curve in the same neighborhood at whatever setting represents
  "normal". Wire this edge into both `recOdds()`'s match pricing AND `suggestSpecialOdds()`'s
  special-market pricing (both should route through one shared edge-from-slider function, not
  duplicate the mapping). **Special markets**: grow `SPECIAL_MARKET_TEMPLATES` (currently 11,
  ~line 3938) toward ~15, reusing the existing 5 settleable `kind`s (`team_pts`/`haul`/`match_total`/
  `top_score`/`bottom_score` — `evalLeg()` ~line 1356 is what actually grades these, don't invent a
  6th kind unless truly justified, since it'd need matching `evalLeg`/`legLiveInfo`/`MARKET_LABELS`/
  `slipViolatesIntegrity` additions) — price every one of them off the new deeper model's per-team
  projections instead of the current flat heuristic. `suggestSpecialOdds`/`specialMarketDefaultLine`
  are the two functions that currently do this. Keep `rerecommend()`/`rerecommendMatch()`/
  `rerecommendMarket()` (the "↺ reset to recommended" buttons) working — they should now reset to
  the NEW model's output. Verify: brace/paren/bracket/backtick balance check (the established method
  every batch uses — `grep -o '{' | wc -l` etc.), a headless-Edge or real-data harness run (Firebase
  stubbed, zero live writes) spot-checking the new odds against a few real GW1 fixtures with visibly
  different team/squad strength to confirm the model actually differentiates (not just noise around
  the old flat numbers), and the competitiveness-slider calibration check described above. This is
  the biggest/most novel batch — do it justice, this is real money.

- [x] 49. (Sonnet 5, medium-high effort) **Bet Review flag: bet priced off non-official odds.**
  Built directly on top of existing published-odds infra, independent of batch 48's new model — new
  pure `officialOddsCheck(bet, state)` (~line 4438, right after `isSeasonBet`/`isBespokeBet`). Per-leg
  it recomputes what a bet's price SHOULD currently be, purely from published data: `match` legs via
  `promoPrice(...) ?? weekBoostPrice(...) ?? m.odds[pick]` (the exact same composition rule
  `addMatchLeg()`/`genAlgoBet()` already use — a promo/boost price IS the presented price, not a
  discount off it), `special` legs via `gw.specialMarkets[].odds`, `season` legs via
  `S.seasonMarkets[].odds`. `isBespokeBet(b)` bets (batch 39) are always flagged unconditionally —
  there's no board price for a free-text leg to check against at all, so it's a guaranteed flag by
  construction, never a "verify". Every other bet's recomputed per-leg odds are combined the way
  that SPECIFIC bet was actually priced, not one blanket formula: `bet.algo` bets combine via
  `Math.max(1.05, round(rawProduct*(1-algoEdgePct/100)*100)/100)`, mirroring `genAlgoBet()`'s own
  formula exactly (batches 44/45 — Algo already only mirrors published prices, so it IS re-derivable,
  just via a different edge mechanism than manual accas); everything else (manual single/multi-leg,
  season bets) combines via the existing `combinedOdds()`/`accaEdgeByLegs`. **Important correctness
  catch found while building this**: `placeBet()`/`placeSeasonBet()` apply an auto-granted reward
  odds-boost (`bet.boostPct`, batch 17) on top of `combinedOdds()`'s output before storing
  `bet.effOdds` — without accounting for that, EVERY legitimately reward-boosted bet would have
  false-positive flagged as "not house-priced". Fixed by applying the identical boost formula
  (`round(official*(1+boostPct/100)*100)/100`, matching `slipOddsFinal()`/`seasonSlipOddsFinal()`
  exactly) to the recomputed official price before comparing. Tolerance: `ODDS_CHECK_TOLERANCE=0.01`
  (1 cent of decimal odds — absorbs float rounding from the chained multiplication, not real drift),
  documented inline. **Point-in-time caveat, documented per the spec's explicit ask** (both in a code
  comment on `officialOddsCheck()` and here): batch 47 established `setOdds()` only ever mutates a
  price going forward, no snapshot of what a price was AT PLACEMENT TIME is kept anywhere in this
  app — this check can only compare against the CURRENTLY live published price. A flag on a
  non-bespoke bet (including an accepted counter-offer, which deliberately renegotiates the price
  away from the board on purpose — admin-approved, still worth a glance) can therefore be a false
  positive from a perfectly legitimate later odds edit, with no way for this check alone to
  distinguish the two cases; a bespoke flag is never a false positive, since there was never a board
  price to begin with. The in-app badge text spells this asymmetry out explicitly for non-bespoke
  flags. UI: `betCard(b, perspective, showPricingFlag)` gained a third, default-`false` param — only
  `vReview()`'s 4 call sites (needs-review, awaiting-player, live book, closed-bets-filtered) pass
  `true`, so every other view (My Bets, Bet Feed, Home's click-into-bet modal, Odds Setter's
  `gwBetsPanel`) is untouched, per the spec's explicit "vReview() specifically" ask — extending
  further was left as the noted optional bonus, not done, to stay tightly scoped. New `.flag.pricecheck`
  CSS: a solid `--danger`-red pill with a glow, deliberately distinct from the plain colored-text
  "overridden ×N" marker near the Back Office override tool (batch 32) — that's a different, milder
  signal (an admin manually corrected a settled outcome) from "this bet's price can't be confirmed
  as ever having come from the board". A red detail line under the leg list also renders the specific
  reason (e.g. "Current board implies 5.42, this bet is priced at 9.99.") plus the false-positive
  caveat sentence on non-bespoke flags. Verified: brace/paren/bracket/backtick balance check on the
  extracted `<script>` content via `grep -o | tr -cd | wc -l` (no node/python available in this
  worktree, same established method) — all balanced (`{` 2327/2327, `(` 5327/5327, `[` 554/554, 924
  backticks). Built a headless-Edge (`--headless=new --dump-dom`) harness with Firebase fully stubbed
  (zero live network/DB contact), seeding via the app's own `freshState()` plus one hand-built open
  gameweek (2 real matches + 1 special market) and one season market, then 7 bets covering every
  case: a correctly-priced normal 2-leg manual acca (not flagged), a bespoke request (flagged,
  unconditional), an accepted counter-offer whose renegotiated price diverges from the board
  (flagged), a correctly-priced Algo bet (not flagged — proves the algoEdgePct-vs-accaEdgeByLegs
  branch works and doesn't false-positive every Algo bet), a manual bet with a legitimate reward
  boost applied (not flagged — proves the boostPct fix above actually works), a correctly-priced
  season-market bet (not flagged), and a genuinely mispriced manual bet (flagged). 14/14 assertions
  passed, `TESTOK:true`, zero `window.onerror` catches, including direct `officialOddsCheck()` calls,
  `betCard()` HTML-output checks confirming the badge appears only when `showPricingFlag=true` and
  is absent from a plain `betCard(b,'house')` call, and a full `vReview()` render confirming exactly
  3 `flag pricecheck` badges appear (matching the 3 flagged bets among the 7 seeded) and none
  spuriously elsewhere. Harness scratch files deleted after the run, not committed.
  **Sync-file note**: this batch ran in an isolated git worktree
  (`.claude/worktrees/agent-ae20308e6ace87265`) — the project's usual "copy index.html to the sibling
  `../lennon-lounge-v2.html`" step was skipped here since that path is ambiguous from a nested
  worktree (the canonical repo's actual sync copy lives at `C:\Users\DanSeligman\Downloads\
  lennon-lounge-v2.html`, well outside this worktree, and is also stale relative to Rounds 6-8 —
  flagged for the orchestrator to sync once this branch is merged, rather than risk a racy write to
  a shared file from a worktree that doesn't have batch 48's concurrent changes). Commit `4339178`.

- [x] 50. (Sonnet 5, medium-high effort) **Auto-populate Odds Setter 21h before cutoff — DONE,
  commit `74edfa5`.** Ran in an isolated worktree; discovered on start that batches 48/49 hadn't
  reached this worktree's branch yet (they landed on `main-push` at `5376cc6`, ahead of this
  worktree's `bff86d7` base) — fast-forward merged (`git merge 5376cc6 --ff-only`, clean, no
  conflicts, nothing of this worktree's own lost) before starting, per the orchestrator's
  instruction to read what 48/49 actually shipped rather than guess.
  **Schedule decision.** No new `schedule:` trigger added — a different session had already added
  an hourly self-throttled one (`bff86d7`, "Add FPL status pill to Settler tab, auto-sync +
  self-throttled schedule") before this batch started. Its throttle only does a full sync within
  2h-before/1h-after a deadline or on a matchday — both narrower windows than "21h before", which
  sits entirely outside them — so a plain reuse would mean this feature could never fire. Widened
  the SAME `if ((TRIGGER_EVENT||'schedule')==='schedule')` gate with a third OR condition,
  `oddsDue`, computed from one extra lightweight `readFirebase('lennon-lounge/gameweeks', token)`
  call (same cost class as the existing matchday fixtures check right above it) feeding
  `oddsWindowDue(nearestDraftGw(gws), now)`. **Window chosen: 20-22h before cutoff** (a 2h band,
  not a single instant) — "~21h" at hourly-cron granularity needs some slack, and a band means the
  existing hourly tick reliably lands inside it at least once (typically twice) even if a run is
  late or skipped; `oddsAutoSuggestedAt` makes a second hit a no-op, so the wider band costs
  nothing extra in effect, only in how often the *check* runs.
  **Cost flagged plainly, as asked:** this widening means 1-2 extra full-sync runs per gameweek
  (squad/lineup fetches — a fetch per manager — plus the extra Firebase reads/writes below) that
  the existing throttle would otherwise have skipped outright, on top of whatever it already runs
  for deadline/matchday. Modest (a handful of GitHub Actions minutes per gameweek, once a week),
  but real and recurring — worth Dan's awareness, not something to wave through silently.
  **The model port.** `.github/workflows/fpl-sync.yml` gained a ~300-line hand-maintained Node port
  of batch 48's PURE scoring/pricing functions (`MODEL`, `ODDS_EDGE`, `phi`/`pOver`/`SD`/`SD_DIFF`,
  `edgedOdds`, `houseEdgePct`, `teamResults`/`teamFormProj`, `playerAvailability`/
  `squadMinutesContext`/`playerStartShare`/`playerFixtureMult`/`squadExpected`, `projectTeams`,
  `leagueDrawRate`/`fairMatchProbs`, `recOdds`, `extremeScoreProbs`, `suggestSpecialOdds`) — copied
  field-for-field from index.html with ONE structural change throughout: `squadIds`/`lineupIds`/
  `plFixturesFor`/`clubFixture` take an explicit `state` param instead of reading the browser's
  global `S` (index.html's own versions quietly rely on `state===S`, which only holds in the
  browser). Deliberately NOT ported: `specialMarketDefaultLine()` (only used when the admin first
  *creates* a market — this Action, like `rerecommend()`/`rerecommendMarket()` in-app, only ever
  resets an *existing* market's `.odds`, never its `.line`) and `teamAvg()` (display-only). A
  16-entry `SPECIAL_MARKET_KIND` map mirrors `SPECIAL_MARKET_TEMPLATES`' ids→`{kind,dir}` only —
  `suggestSpecialOdds()` never reads `tpl.line`/`tpl.lineOffset`, so nothing else was needed.
  New `recomputeGwOdds(state,g)` is the Node equivalent of clicking "↺ Reset all to recommended" —
  maps `g.matches`/`g.specialMarkets` through `recOdds`/`suggestSpecialOdds`, replacing only
  `.odds` on each element, everything else (ids, results, lines, labels) passed through untouched.
  **Orchestration.** New `maybeAutoSuggestOdds(token)` runs at the end of every full sync
  (whichever condition triggered it): reads the whole `lennon-lounge` state fresh, finds
  `nearestDraftGw()` (same selection as `vOddSetter()`'s `nextDraft` — lowest `event`, `status==
  'draft'`, has a `deadline`), and self-gates independently of why the run happened — a manual
  `workflow_dispatch` outside the window is a safe no-op, not a forced fire. On a genuine hit:
  `recomputeGwOdds()`, then a **targeted PATCH** to `lennon-lounge/gameweeks/{key}` with exactly
  `{matches, specialMarkets, oddsAutoSuggestedAt}` — no `status` key in the payload at all, so this
  path is structurally incapable of publishing a gameweek, not just conventionally careful about
  it. New `gwFirebaseKey()` resolves that key by matching `g.id`, handling both a true JSON array
  and RTDB's sparse-object-with-string-keys shape (getting this wrong would silently PATCH the
  wrong gameweek) — array position is NOT trusted. Notification: new `pushNotif(teamId,type,msg,
  token)` + `pushToFirebase()` (a POST, Firebase's actual push-key semantics, vs. every other write
  in this file which is a PATCH merge) mirror index.html's own `pushNotif()` object shape
  ({id,type,msg,ts,read}) field-for-field, sent to `lennon-lounge-notifs/{teamId}` for
  `ADMIN_TEAM_IDS=['selig','rowez']` — hardcoded to mirror `TEAMS[].admin===true` in index.html
  (there being only two admins and no `admin` flag carried in the workflow's own slimmed `TEAMS`
  array); flagged inline to keep in sync by hand if that ever changes.
  **index.html**: `oddsCard()`'s draft card now shows a line — "🤖 Auto-suggested {timeAgo(...)} by
  the FPL Sync Action ... — not yet reviewed" — when `g.oddsAutoSuggestedAt` is set, reusing the
  existing `timeAgo()` helper rather than inventing a new formatter. Deliberately left un-cleared
  by manual edits/`rerecommend()` — it's a factual "this was auto-populated at time X" record, not
  a review-status flag, so there's nothing to invalidate when the admin tweaks a price afterward.
  **Verified.** Brace/paren/bracket/backtick balance on the full `index.html` (`{`2853/2853
  `(`6299/6299 `[`611/611, 964 backticks) and on the workflow's extracted embedded script
  (`{`284/284 `(`712/712 `[`88/88, 78 backticks) — both balanced (no node/python in this
  environment, same established grep method). Built a **42-assertion headless-Edge
  (`--headless=new --dump-dom`) harness**, Firebase and the FPL network layer both mocked (in-
  memory `readFirebase`/`writeToFirebase`/`pushNotif` stand-ins recording every call; zero live
  network or DB contact), pasting the ported code **verbatim** from the workflow file rather than
  retyping it. Coverage: pricing-math sanity (a hand-derived 56-vs-46 zero-history case matches
  `fairMatchProbs()` to within 1%; `houseEdgePct` anchors at 20/10/1 exactly reproduce 10.0/16.3/
  28.0 and the curve is monotonic; `edgedOdds` floors a near-certainty at exactly 1.05;
  `playerFixtureMult` differentiates easy/hard/blank/double fixtures correctly; an injured 6-of-11
  squad projects below an identical-form healthy squad; all 16 special-market templates price to
  finite numbers ≥1.05) plus the **window/idempotency suite the spec specifically asked for**:
  fires exactly once on a draft gameweek squarely in the 20-22h window; never touches a draft
  40h out or 2h out (outside the band either direction); never touches an open gameweek even when
  it sits inside the window (only `status==='draft'` is eligible at all); the write payload is
  exactly `{matches,specialMarkets,oddsAutoSuggestedAt}` with **no `status` key present** on every
  fire; re-running against the just-stamped gameweek (simulating the next hourly tick) fires zero
  additional writes/notifications; the nearest-by-event draft governs even when a later, in-window
  draft exists and the nearest one doesn't qualify (matches `vOddSetter()`'s `nextDraft` semantics
  exactly); `gwFirebaseKey()` resolves the correct child key on both array- and sparse-object-
  shaped `gameweeks` nodes; exactly 2 admin notifications (selig+rowez, no one else) fire on a real
  hit; recomputed match odds actually differentiate two different-baseline teams (not flat noise).
  **42/42 passed, `TESTOK:true`.** Harness file (`batch50_harness.html`, a temp-dir scratch file)
  deleted after the run, not committed.
  **Caveats for the orchestrator to double-check before merging.** (1) The port's fidelity to
  batch 48's actual `index.html` functions rests on a careful line-by-line transcription plus the
  hand-derived-math cross-check above (which matched to within 1%) — it was NOT verified by
  actually loading `index.html` and diffing outputs side-by-side (no shared-module path exists
  between a browser file and this Node Action), so a byte-level parity check is still worth doing
  if there's time. (2) `ADMIN_TEAM_IDS` is a hardcoded mirror of `selig`/`rowez` — if the admin
  roster ever changes in index.html's `TEAMS`, this file needs a matching hand-edit; nothing
  enforces the two staying in sync. (3) The 20-22h window is a deliberate 2h band, not a literal
  "21h" point-in-time — see the schedule-decision note above for why. (4) Recurring GitHub Actions
  cost genuinely increases (flagged above and in the commit message) — not large, but not zero,
  and worth Dan knowing it's there. (5) Skipped the `index.html` → `../lennon-lounge-v2.html` sync
  copy step, same as batch 49's finding (ambiguous/risky from a nested worktree) — outstanding for
  the orchestrator after merge. Not pushed — committed locally only.

  Original spec follows.
  **Do this AFTER batch 48 lands** (needs its actual function names/shape — read what 48 shipped,
  don't guess). `.github/workflows/fpl-sync.yml` currently has NO schedule trigger at all
  (`workflow_dispatch` only, manual button) — add a `schedule:` cron (hourly is a reasonable
  cadence given the ±30min tolerance "21 hours before" implies at that granularity; document
  whatever cadence you pick and why, and flag the added recurring GitHub Actions cost to the user
  in your report, don't just silently add it). At the end of a sync run, for the nearest DRAFT
  gameweek (`S.gameweeks.filter(g=>g.status==='draft')`, sorted by event, first one — mirrors
  `vOddSetter()`'s own `nextDraft` selection ~line 4735) with a known `g.deadline`: if `Date.now()`
  is within the ~21-hour-before window AND this hasn't already fired for this gameweek (new
  idempotency stamp, e.g. `g.oddsAutoSuggestedAt`, checked before running), mirror batch 48's model
  (same "mirrors field for field" pattern `ingestFplSquads()`'s own comment already establishes
  for this Action — the Action is Node, not browser, so port the pure scoring/pricing functions,
  don't try to load the whole `index.html` script into Node) to recompute `g.matches[].odds` and
  `g.specialMarkets[].odds` for that one draft gameweek exactly like clicking "↺ Reset all to
  recommended" would, stamp `g.oddsAutoSuggestedAt=Date.now()`, and send an admin-only notification
  (existing `pushNotif`/Firebase notif pattern — grep how the Action already writes anything
  player-facing, e.g. how fixtures/deadlines land) saying odds are ready for review. **Must NOT**
  change `g.status` — stays `draft`, nothing goes live, nothing is bettable, matches the user's
  explicit "draft for admin review" decision. Also update `vOddSetter()`'s draft card (or add a
  small line) to show "Auto-suggested {relative time}" when `g.oddsAutoSuggestedAt` is set, so the
  admin can tell the difference between a fresh manual load and an auto-run. Verify: mirror batch
  29/33/34's verification style (a harness with Firebase AND the FPL network layer both mocked,
  confirming the window/idempotency logic fires exactly once per gameweek and never touches an
  already-open or already-auto-suggested gameweek) plus a manual trace of the new cron addition.

---

## ROUND 9 — Usage & Engagement analytics, 2026-09-11

User request: see how much each player actually uses the app — logins, bets clicked, bets built
but not placed, general usage metrics/graphs, and time-of-day usage — as a new section in the
Back Office, to know who to nudge.

- [x] 51. **Usage & Engagement tracking + Back Office card.** New `S.usage` node: `events[]`
  (rolling capped raw log, same 500-cap pattern as `S.audit`, but capped at 4000 — a recent-
  activity detail feed, NOT what the card's numbers are computed from), `daily[date][teamId]`
  (permanent per-day counters — logins/views/legClicks/betsBuilt/betsPlaced — small enough
  across a whole season × 12 teams to never need trimming, so trend numbers stay correct even
  once raw events roll off), `hourly[teamId][hour 0-23]` (permanent, all-time hour-of-day
  histogram), `lastSeen[teamId]` (single timestamp, the "who's gone quiet" signal). Added to
  `freshState()` and backfilled in `migrate()` (empty `usage` object for any state saved before
  this feature — a valid resting position, not an error). New `ukDateKey()`/`ukHour()` (UK-local
  day/hour via `Intl.DateTimeFormat`, matching the app's existing UK-time convention) and
  `logUsage(type, tab)` — writes an event + increments the daily/hourly/lastSeen buckets, rides
  the existing DEBOUNCED `save()` (same "low-stakes action" convention batch 6 set for chat/
  counters — this fires on every nav click and odds tap, so it must not force a write per call).
  Hooked at: `switchUser()` → `login`; `go(tab)` → `view` (+tab name); `addMatchLeg`/
  `addSpecialLeg`'s add branches → `leg_click`; `submitBet()` → `bet_attempt` at entry (covers
  every caller — manual builder, Algo bundles, season, bespoke — in one place) and `bet_placed`
  right after `S.bets.push(bet)` (i.e. once it's actually cleared every validation gate). "Built
  but not placed" in the Back Office UI is simply `bet_attempt` count minus `bet_placed` count —
  no separate abandoned-slip heuristic needed since every submit path already funnels through
  `submitBet()`.
  New reusable `usageBarChartSvg(labels, values, opts)` — hand-built inline SVG bar chart (fixed
  per-bar pixel width wrapped in `overflow-x:auto`, same batch-23/25 convention as any content
  that can run wider than a phone screen, rather than squashing bars via `preserveAspectRatio`),
  following the existing no-charting-library precedent `pnlSparklineSvg()` set.
  New `usageSummary(days)` (pure computation over `S.usage.daily`/`lastSeen`, returns per-team
  rows sorted **least-recently-active first** — that ordering IS the nudge list) and
  `usageOfficeCard()`, wired into `vOffice()` right after the existing top KPI row. Card shows:
  a mini KPI row (active today, logins today, bets placed today, 14-day build→place %), a per-
  team table (last seen + 14d logins/legs-clicked/built/placed/conversion, with a gold "⚠ quiet"
  pill for anyone with no login in 7+ days), a 14-day daily-activity bar chart (logins+views+
  clicks+placements, all teams combined), and an all-time hour-of-day bar chart (UK local time,
  for timing nudges/announcements to when people are actually online).
  Verified: brace/paren/bracket/backtick balance check (all balanced — 2938/2938 `{}`, 6455/6455
  `()`, 645/645 `[]`, 1006 backticks even), plus a from-scratch headless-Edge harness (Firebase
  fully stubbed via an in-memory `window.__store` — zero live network/DB contact, no
  `seedTestData()` existed in this repo to reuse so one was hand-built for this batch) that logs
  in as admin, seeds 20 days of synthetic per-team usage (one team, HUXLEY, deliberately never
  logged in), opens Back Office, and asserts on the rendered `#view` HTML: zero `window.onerror`
  catches, the Usage card and both charts render, HUXLEY sorts first with a "never"/"⚠ quiet" row
  while a team seeded with a login "today" (Selig's Shakers) sorts last with no quiet flag and
  exactly the seeded logins/built/placed/conversion numbers — confirming the sort order, the
  quiet-flag threshold, and the per-team aggregation math are all correct, not just crash-free.
  Commit pending.

---

## ROUND 9 — odds model recalibration + explainability, 2026-09-11

Real GW4 production draft data (screenshot from Dan, Odds Setter) showed batch 48's model
running far too hot: match odds swinging as wide as 1.07/4.29 and draws pricing at 23-28
across every single fixture, when the user's own worked examples (used to calibrate batch 48
in the first place) describe a typical match sitting close to ~1.75-1.8 either side with a
12-16 draw, only rarely moving wider for a genuinely lopsided matchup. Batch 48's per-example
calibration checks passed in isolation but the model still runs far too hot across a real
6-fixture gameweek — needs a harder variance ceiling, not just anchor-point tuning. Also:
batch 48 weighted recent player-level FPL `form` fairly heavily in `squadExpected()`, which
the user has now explicitly said is backwards — squad composition/quality ("the players they
have") should dominate, recent hot/cold streaks (both team-level H2H recency and player-level
`form`) should be a secondary nudge, not a primary driver. Same model owner as batch 48 (Opus
5, high effort) for the recalibration + new explainability work; a small, unrelated Settings
fix goes to Sonnet 5 (batch 53) since it's real "other changes", not model work. Both batches
run in isolated worktrees this round — batch 48 already proved a shared working tree collides
with the other Claude Code session Dan confirmed is legitimately active on this repo.

- [ ] 52. (Opus 5, high effort) **Recalibrate the odds model's variance + reweight squad-over-
  form + add per-match "why these odds" explainability + a general Back Office explainer.**
  Four things, all genuinely "the model" per the user's own framing — do them together, in the
  same batch, since the explainability work needs to read the exact internal factors your
  recalibration produces.
  **(1) Variance recalibration — the main fix.** Real numbers from GW4 (screenshot, quote it
  back in your retrospective so there's a before/after): Dunney Monsters v Fride FC 1.17/25.96/3.3,
  Huxley v KapilaMockingbirds 2.04/22.97/1.51, Inter Rowe-Z v The Adders FC 2.03/22.97/1.51,
  Henry's Heroes v The Murovers 1.23/24.89/2.9, Blanks Bruisers v Disco Dave's Dodgers
  1.7/22.72/1.77, Selig's Shakers v Roundabout Rangers 4.29/27.9/1.07 — at `oddsCompetitiveness`
  whatever it's currently set to in production (check it, state it in your report). Target
  behaviour, stated as hard bounds to verify against, not vibes: for a normal/typical matchup,
  home and away odds should sit close to **~1.75-1.8** (the user explicitly said anchor nearer
  1.75 than the old 1.8), moving modestly either side on real strength differences; dropping
  below **~1.5** or rising above **~2.0-2.1** should be rare, reserved for a genuine, real
  mismatch (e.g. one squad missing several key players against a full-strength opponent) — not
  the default outcome for an ordinary form/squad gap the way GW4 shows. Draws should typically
  sit **12-16**, essentially never in the 20s+ the screenshot shows, and only push toward the
  wider end of a sane range (~16-18ish, use your judgement, but keep a hard sane ceiling) for a
  genuinely lopsided match — never spiral toward 25-28 as the default. Find the actual mechanism
  producing today's excess variance rather than just re-tuning constants blind — worth checking,
  in order: (a) whether `projectTeams()`'s squad-relative multiplier and `teamFormProj()`'s
  recency-weighted form are compounding (two independently-swinging signals multiplying against
  each other) rather than blending, producing more combined swing than either alone justifies;
  (b) whether `SD`/`SD_DIFF`'s scale is well-matched to the actual spread of real per-team
  projections this league produces, since `phi(D/SD_DIFF)` amplifies a modest real point gap
  into a large probability skew if the scale is off; (c) whether the evidence-based shrink on
  `D` is compressing enough at GW4's low sample size (early season = low evidence = should shrink
  HARD toward a near-even prior, not let squad/form swings through mostly unshrunk); (d) whether
  `leagueDrawRate()`'s gaussian taper crushes `pD` toward its 2% floor too easily whenever there's
  any real projection gap at all — that's very likely the direct cause of every draw in the
  screenshot pricing 23-28 despite `houseEdgePct()` being independently verified correct in batch
  48. Fix the actual mechanism, then re-verify against all 6 real GW4 fixtures above (pull them
  from the actual current Firebase draft data if you have a way to read it read-only, or
  reconstruct equivalent squad/form/fixture inputs in your harness closely matching what
  produced those 6 numbers) and report clean before/after pairs for each. **(2) Reweight squad
  composition over recent form/streaks.** Explicit user instruction, quoted: "make sure you
  don't weight player form (game-week player form, like [recency]) too highly over the actual
  players they currently have... it doesn't necessarily mean that just because you've won the
  last two games and someone's lost the last two games, you would actually beat them. It all
  comes down primarily to the players they have." This touches two places: `squadExpected()`
  currently does `0.65*form + 0.35*ppg` per player — flip the balance so the more stable
  season-quality signal (`ppg`/`tp`) dominates and the volatile recent-form figure is the minor
  modifier, not the other way round (exact split is your call — reason about it and document
  why, this isn't asking for a specific number, just the right ordering of dominance). Separately,
  reconsider `projectTeams()`'s framing generally — batch 48 built it as "form sets the level,
  squad nudges it ±13-17%"; the user's ask suggests squad composition should be closer to the
  PRIMARY signal for what a team is actually capable of this gameweek, with recency-weighted H2H
  form as the smaller adjustment on top (not necessarily a full inversion — use judgement, a
  team's H2H record still carries real information, e.g. captaincy/bench-boost decisions and
  variance the raw squad numbers can't see — but the user has been explicit that squad quality
  should not be secondary to a two-game streak). Explain your final weighting choice plainly in
  the retrospective. **(3) Per-match "why these odds" explainability in Bet Builder.** New pure
  function, e.g. `matchPricingRationale(state, gwId, matchId)`, returning 2-3 short plain-English
  bullet points (plus optionally a one-line headline) built from the SAME factors that actually
  drove that match's projection — fixture ease/difficulty for each squad, key
  injuries/doubts (name the specific unavailable/doubtful player if there is a standout one,
  not just a count), a top-scoring player facing a notably hard fixture, and/or a real
  recent-form trend — matching the user's own example almost exactly: *"Selig has much better
  fixtures, with four home games against easy teams, whereas Huxley has three injuries and his
  highest-scoring player has a difficult fixture."* Wire this into `vGwBoard`/wherever a fixture
  row is clickable in Bet Builder: clicking a match/fixture opens a small popup or expandable
  panel (reuse an existing modal pattern in this app — `#betModal`/`#squadModal` are the two
  precedents, grep and follow one) headed something like "Why these odds?" showing those bullets.
  Keep it honest — if there isn't a genuinely notable factor for a bullet slot (e.g. no injuries,
  fixtures roughly even), say so plainly or omit the bullet rather than inventing padding.
  **(4) General model explainer in Back Office.** Near the `oddsCompetitiveness` slider (batch
  48's "📏 Limits & edge" addition), add real explanatory copy in plain language — what the model
  actually weighs and roughly how much each factor matters (squad quality primary, recent
  form/results secondary, fixture difficulty adjustment, house-edge slider explained in one line)
  — accurate to what THIS batch actually ships, not batch 48's original design, since you're
  changing the weighting. A collapsed `<details>`/expandable "How are these odds calculated?"
  is a reasonable pattern already used elsewhere in this app (grep `<details>` for the house
  style) — reuse it rather than inventing new UI chrome. **Do not touch**: `houseEdgePct()`'s
  10%-floor/28%-ceiling logic itself (batch 48 already calibrated and verified that against the
  user's own examples — the problem is the FAIR PROBABILITY going into it, not the edge applied
  on top), `officialOddsCheck()`/batch 49's flag, or batch 50's scheduler logic (though if your
  recalibration changes `MODEL` constants or function shapes batch 50's Node port references,
  flag exactly what changed so a follow-up can re-port it — don't try to edit the workflow
  yourself unless it's trivial). Verify: the usual brace/paren/bracket/backtick balance check,
  the 6-fixture real-GW4 before/after comparison described above, a harness sweep across a wider
  range of synthetic team/squad strength gaps (not just the 6 real ones) confirming the new
  bounds hold generally and not just on this one lucky gameweek, and a manual trace confirming
  the Bet Builder explainer renders sensible, honest bullets (not hallucinated padding) for at
  least 2-3 different real fixture shapes (a close one, a lopsided one, one with a real
  injury/doubt in the seed data).

- [x] 53. (Sonnet 5, medium-high effort) **Remove league-code editing from player Settings.**
  Small, contained, independent of batch 52. `vUserSettings()` (grep it — note there are
  currently TWO functions with this exact name in index.html; only the second/later one, ~line
  4104, is live since JS keeps the last declaration and the first is dead code, worth deleting
  too if it's a clean one-line removal but not required) has a "🔗 FPL League ID" card
  (~line 4136-4143) gated behind `me.admin` that lets an admin directly overwrite `S.fpl.leagueId`
  with a raw `onclick` — no `confirm()`, no `audit()` log entry, no re-sync trigger — a quiet
  duplicate of the proper, safeguarded League ID field already in Back Office's FPL Sync card
  (~line 6067, part of the real sync flow). User's explicit ask: "remove the functionality where
  they can edit the league code... it obviously can mess up the entire sync." Remove this card
  from `vUserSettings()` entirely — the canonical, safe place to change the league ID stays Back
  Office, untouched. Don't add a read-only display of it either unless that's trivial and clearly
  harmless — the ask is removal, not a reduced version. Verify: balance check, and a quick grep
  confirming no other code path reads `fplLeagueIdSet` (the input id you're deleting) so nothing
  else silently breaks.
  **Retrospective:** Removed the whole "🔗 FPL League ID" card (was ~line 4136-4143, gated on
  `me.admin` but living inside the shared player Settings page everyone reaches the same way) from
  the live `vUserSettings()`, including its raw `onclick="S.fpl.leagueId=...;save();..."` — no
  read-only replacement added, per the "ask is removal" instruction. Grep confirmed `fplLeagueIdSet`
  was referenced nowhere else in index.html, so nothing else breaks. Back Office's real, safeguarded
  League ID field (`fplLeagueId`, part of the FPL Sync card, ~line 6029 after this edit) is fully
  untouched — confirmed by grepping every remaining `leagueId` occurrence in the file. Bonus cleanup:
  also deleted the dead, never-called first `vUserSettings()` (the earlier declaration JS was
  discarding anyway, since it keeps only the last) plus its only caller, `doChangePin()`, which
  became orphaned once that block was gone — a clean, self-contained removal, no other references
  to `curPin`/`newPin`(input)/`doChangePin` remained afterward (`changePin(newPin)` at line 1117 is
  an unrelated function with its own local parameter name). Verification: brace/paren/bracket count
  balanced before and after ({ 2926/2926, ( 6426/6426, [ 643/643), backtick count even (1000); manual
  trace of the remaining `vUserSettings()` markup confirms correct div/card nesting straight through
  to the closing template literal. Skipped the headless-Edge smoke check — the app boots against a
  real Firebase project and requires a PIN login before any Settings view renders, so a meaningful
  stub would be more than the "quick, don't over-invest" bar this batch called for; the manual trace
  + balance check the task explicitly allows for a change this size covered it instead. Net: 38 lines
  deleted, 0 added. Commit 48e6479 in worktree `agent-a853f73432268c408`
  (branch `worktree-agent-a853f73432268c408`). Outstanding for the orchestrator: the
  "copy index.html to ../lennon-lounge-v2.html" step, skipped as ambiguous from a nested worktree.
