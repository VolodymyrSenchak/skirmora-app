# Pocket Legions App — Implementation Plan

The web client for [pocket-legions-api](../../../pocket-legions-api/docs/implementation/pocket-legions.api.implementation-plan.md) (API contract: [pocket-legions.api-contract.md](../../../pocket-legions-api/docs/implementation/pocket-legions.api-contract.md) — endpoints, actions, socket events, event types, example views).
Game rules and data: [pocket-legions.game-design.md](../../../design/pocket-legions.game-design.md) (snapshot of https://claude.ai/artifact/YGKQ9ovR88U6e6LiBNWTBA).
Art: the prototype sprites, maps and the battle demo in [design/art](../../../design/art/index.html) (also published as https://claude.ai/artifact/PzKFF7V2te8nRJEWkvVLtX). The final-art spec is design §9 "Домовленість щодо арту".
Sprite atlases (the format the game loads): [design/art/atlas](../../../design/art/atlas/README.md) — WebP + JSON per race, generated from the prototype sprites; final art replaces these files.
Reference client: [sen-reveal-app](../../../../../sen-reveal/sen-reveal-app/docs/implementation/sen-reveal.app.implementation-plan.md). Its sections are referenced as "SA §n"; this plan only spells out what differs.

**Confirmed**
- A separate repo, `pocket-legions-app`, deployed as a static site on Vercel. It talks only to pocket-legions-api.
- Angular 22, standalone, signals, zoneless — the same stack as sen-reveal-app, so its transport, store and identity code can be copied (SA §1–§9).
- Phone first, in portrait and landscape. A battle on a 20×20 map must be playable on a 6" screen.
- Two ways to play: **online** (rooms by code, through the API) and **hot-seat** (one device passed around, no network). Both use the same screens.
- UI language: Ukrainian (the design and all names are Ukrainian).

**Prerequisites from the API** (status 2026-10-28: API Phases 0–6 are done, Phase 7 — deployment — is not)
1. API Phases 1–3 (pure engine and game module) unblock this plan's Phases 0–2. The network is not needed for those. **Done.**
2. API Phases 4–5 unblock online play (Phases 3–5 here). **Done.** Until the API is deployed, run it locally (`npm start` in pocket-legions-api) with `CORS_ORIGINS=http://localhost:4200` in its `.env.local`.
3. The Vercel WebSocket outcome (now API Phase 7) only changes the transport manager, exactly as SA §14.4.

---

## 1. Decisions

| Decision | Choice | Why |
|---|---|---|
| Framework | Angular 22, standalone, zoneless, signals | Same as sen-reveal-app; copy SA §1 including the Phase 0 findings (signal forms stable, no `httpResource`, vitest pinned) |
| State | One signal holding the latest `SessionView` (SA §4) | The server already projects the view per player, including move hints |
| Rules on the client | **None online.** Buttons and highlighted cells come from `game.hints`. In hot-seat the same rules run locally from the **synced engine** (§4) | Phones must agree with each other and with the server |
| Battlefield renderer | **PixiJS v8 from the start**, loading the race atlases (WebP + JSON, design §9) with `Assets.load` and playing them with `AnimatedSprite`. Behind a `BattleRenderer` interface | The atlases already exist (`design/art/atlas`), with the per-part animation (arms, wings, rotors) baked into frames. WebGL keeps 24 animated stacks smooth on low-end phones, and final art drops in by replacing files |
| Art assets | `npm run sync:art` copies `../design/art/atlas/*` into `public/art/atlas/`; only the atlases of the races in the session are loaded (≤ 4) | Same idea as the engine sync (§4): one source of truth, no hand-copied files |
| Realtime | `socket.io-client` ^4.8, websocket-only, polling fallback — copied from SA §5 | Same server contract |
| Hot-seat | `LocalTransport` running the synced game module in the browser | Same screens, same view shape, no network |
| Styling | SCSS + CSS custom properties from the gallery ("war table" dark theme) | Already designed and tested on phone width |
| Fonts | Alegreya SC (display), Golos Text (body), JetBrains Mono (numbers) | All three cover Cyrillic. The gallery uses them |
| Tests | Vitest + fake transports (as SA §12) | — |
| PWA | `@angular/pwa`: manifest, icons, cached static assets | "Add to home screen". Offline = hot-seat only |
| Hosting | Vercel static; add the origin to the API's `CORS_ORIGINS` | — |

---

## 2. Architecture

```
  Transport                    SessionStore                 Screens / BattleScene
  ─────────────────            ─────────────────            ─────────────────────
  socket | polling | local ──> view: Signal<SessionView> ──> components read signals
  connection: Signal           derived signals              EventAnimator plays game.events
        <───────────────────── dispatch(action) <───────────────────────
```

- **Nothing in the app derives game rules from scratch.** A stack is selectable if it is in `hints.stacks`. A cell is highlighted if it is in that stack's `moves` / `attacks[].from`. A damage tooltip shows `preview`. This is SA §2's central rule, and it matters even more here: the rules are large.
- **Hot-seat is just another transport.** `LocalTransport` keeps a `SessionState` in memory, runs the synced `pocketLegions` module's action handlers, and emits `project(state, viewerId)`, where the viewer is the seat whose turn it is. The screens can't tell local and online apart.
- **The `EventAnimator` sits between the store and the battle scene.** The store always holds the newest snapshot. The scene shows the state *as of the last animated event* until the queue drains (§9).
- One store per session, provided at the session route (SA §2).

---

## 3. Project structure

```
src/app/
  app.config.ts, app.routes.ts
  core/                         C  api.config, identity.service, token.interceptor, session-api.service, api-error   (from SA)
  session/
    session.store.ts            A  SA §4 + animatedSeq
    session.transport.ts        C
    socket.transport.ts         C
    polling.transport.ts        C
    transport.manager.ts        C
    local.transport.ts          N  hot-seat (§6)
    visibility.service.ts       C
    actions.ts                  N  typed creators for lobby.* and pocket-legions.* (§7)
  engine/                       N  GENERATED by scripts/sync-engine.mjs — do not edit (§4): engine/, game/, games/, models/ as in the API's src/
  models/
    session.model.ts            A  SessionView (no gameType)
    pocket-legions.model.ts     N  re-exports PocketLegionsView, SeatView, StackView, Hints, GameEvent from the synced engine/game and engine/state (no hand-written copies)
  battle/
    battle-renderer.ts          N  BattleRenderer interface (§8)
    pixi/                       N  PixiBattleRenderer: map layer, units layer (y-sorted), effects layer
      atlas-loader.ts              loads index.json + the session's race atlases + projectiles, typed meta
      unit-view.ts                 one stack: AnimatedSprite, seat ring, count badge, state machine idle/walk/attack/…
      map-texture.ts               port of design/art/maps-render.js; the map SVG is rasterised once into a texture
      effects.ts                   projectiles from projectiles.json, damage numbers
  ui/unit-portrait/             N  draws `<unit>/idle/0` from the atlas into a <canvas> (army shop, HUD)
    event-animator.ts           N  §9
    battle-input.ts             N  tap → select / move / attack / shoot from hints
  features/
    home/                       N  "Грати онлайн", "Один телефон", "Приєднатися"
    create/                     N  map picker (live map previews), budget, mode, turn time, nickname, password
    join/                       C/A
    local/                      N  hot-seat setup: 2–4 names, map, budget, mode
    session/
      session.page.ts           A  picks the screen by phase (§7)
      lobby/                    A
      army/                     N  race picker → unit shop → hero gear → summary/ready
      deploy/                   N  place stacks in your zone, ready
      battle/                   N  battle scene + HUD: turn bar, timer, active stack card, actions, log
      over/                     N  result, points, rematch
      handover/                 N  hot-seat "Pass the phone to …" curtain
      ended.view.ts             A
  ui/                           N  button, field, chip, budget-bar, unit-card, stat-grid, slot, timer, connection-banner (C)
styles/  _tokens.scss, _base.scss
scripts/ sync-engine.mjs
```
`C` = copied from sen-reveal-app, `A` = adapted, `N` = new.

---

## 4. Engine sync

- `npm run sync:engine` copies the set listed in `../pocket-legions-api/client-sync.json` into `src/app/engine/`, keeping the paths under the API's `src/`:
  - `engine/` and `game/`, without `*.test.ts`;
  - `games/gameModule.ts`, `models/result.ts`, `models/session.model.ts` — the types the game module uses.

  The script reads the list from that file instead of hard-coding it. It prepends `// GENERATED from pocket-legions-api@<commit> — do not edit` to every file and writes `src/app/engine/SOURCE.json` with `{ commit, dataVersion }`.
- `npm run sync:engine -- --check` (run in CI and before `build`) fails if the copy differs from the API checkout. Editing rules in the client is impossible by construction.
- The API guarantees this set imports nothing outside itself (its `src/purity.test.ts`), and it compiles alone with browser settings (`lib: dom`, no Node types, `moduleResolution: bundler`). `zod` v4 is the only dependency the client needs for it.
- **Online use:** only static data (races, units, items, maps, `DATA_VERSION`) and `army.ts` validation for instant feedback in the shop. The server still validates.
- **Hot-seat use:** the full module through `LocalTransport`.
- Version check: if `view.settings.dataVersion !== DATA_VERSION` → banner "Гру оновлено — перезавантажте сторінку", and actions are disabled.

---

## 5. Session store

Copy SA §4: `apply()` drops only *older* versions (presence arrives at an equal version), and snapshots are replaced, never merged. Additions:
```ts
readonly phase  = computed(() => this.game()?.phase ?? null);          // 'army' | 'deploy' | 'battle' | 'over'
readonly mySeat = computed(() => this.game()?.seats.find(s => s.playerId === this.me()?.playerId) ?? null);
readonly myTurn = computed(() => this.game()?.battle?.activeSeat === this.mySeat()?.seat);
readonly hints  = computed(() => this.game()?.hints ?? null);           // non-null only on my turn
```
`animatedSeq` lives in the `EventAnimator`, not the store, because it describes the screen, not the game.

---

## 6. Transports

- **Socket, polling, manager:** copy SA §5 unchanged. Same switching table, same "show nothing for the first 3 s of a reconnect", same no-manual-`If-None-Match` rule.
- **Dispatch:** as SA §5 (socket ack with a 5 s timeout, then HTTP).
- **`LocalTransport`** (hot-seat):
  - `connect()` creates a `SessionState` with N local players (ids generated) and calls the synced module's `createInitialState` (what the server's `lobby.start` does; the lobby actions themselves are not synced), then emits the first view.
  - `dispatch(action)` → validate the payload with the module's schema → `handler(ctx, state, payload)` with `ctx.now = new Date()` and `ctx.rng` backed by `crypto.getRandomValues` → `project(newState, viewer)` → emit. `version` increments as on the server.
  - **Viewer switching:**
    - army and deploy: one seat at a time, in seat order;
    - battle: the active seat.
    Before showing a different seat's private data, the `handover` curtain appears ("Передай телефон: Іван") and waits for a tap, so nobody sees another player's army.
  - The turn timer is off by default in hot-seat (a setting). `claimTimeout` is never sent automatically.
  - The state is saved to `localStorage` after every action, so a reload resumes the game. Wrap it in try/catch (private mode).

---

## 7. Routing, screens, actions

```
/              HomePage
/create        CreateSessionPage        → POST /api/sessions → /s/:code
/join          JoinSessionPage          (?code=042137 prefills)
/local         LocalSetupPage           → /local/game
/local/game    SessionPage with LocalTransport
/s/:code       SessionPage with TransportManager
```

As in SA §7, the session is one route. The screen is a `computed`:
```ts
readonly screen = computed<Screen>(() => {
  const v = this.store.view();
  if (!v) return 'loading';
  if (this.terminal()) return 'ended';
  if (v.status === 'pending') return 'lobby';
  if (this.handoverPending()) return 'handover';          // hot-seat only
  switch (this.store.phase()) {
    case 'army':   return 'army';
    case 'deploy': return 'deploy';
    case 'battle': return 'battle';
    default:       return 'over';
  }
});
```

| Screen | Key bindings |
|---|---|
| lobby | as SA, plus the settings summary (map preview, budget, mode). The host can change the settings before the start → `lobby.updateSettings` (§15.3). Host → `lobby.start` (needs ≥ 2 players; 2v2 needs exactly 4; river and pass FFA need exactly 2) |
| army | Race grid (6 races with hero and trait) → `pickRace`. Unit shop: 10 unit cards with sprite, stats and abilities (design §5), a count stepper, and a budget bar showing army / gear / remaining, with the 30% gear cap. Hero: 9 slots (2 rings), each with its item list. Live validation from the synced `army.ts`; server errors `invalid-army { reason }` appear on the bar. `submitArmy` / `unready`. Other players: race + ready chip only |
| deploy | The map with your zone highlighted. Drag (or tap stack → tap cell) to place. `submitDeploy` / `unready`. Others: ready chips |
| battle | Battle scene (§8) + HUD: round, turn order chips by seat colour, timer from `turnDeadline`, the active stack card (stats, statuses, shots left), action bar (Рух · Атака/Постріл · Здібність · Оборона · Вміння героя), the last ~5 event lines, Surrender in a menu with a confirm step |
| over | Winner(s), reason, points table at the round limit. "Реванш" (host) → `pocket-legions.rematch`: the same room goes back to `army` with everyone's race and army kept in `mine.army`, one tap resubmits it (§15.2). "Вийти" for everyone. The session stays `in_progress` in this phase |
| handover | Full-screen curtain with the next player's name and colour |

Action creators (no component types a string):
```ts
export const PocketLegions = {
  pickRace:     (raceId: RaceId) => ({ type: 'pocket-legions.pickRace', payload: { raceId } }),
  setTeam:      (playerId: string, team: 0 | 1) => ({ type: 'pocket-legions.setTeam', payload: { playerId, team } }),
  submitArmy:   (army: ArmyDraft) => ({ type: 'pocket-legions.submitArmy', payload: army }),
  unready:      () => ({ type: 'pocket-legions.unready', payload: {} }),
  submitDeploy: (placements: Placement[]) => ({ type: 'pocket-legions.submitDeploy', payload: { placements } }),
  act:          (a: ActPayload) => ({ type: 'pocket-legions.act', payload: a }),
  heroAbility:  (t: HeroTarget) => ({ type: 'pocket-legions.heroAbility', payload: t }),
  claimTimeout: () => ({ type: 'pocket-legions.claimTimeout', payload: {} }),
  surrender:    () => ({ type: 'pocket-legions.surrender', payload: {} }),
  rematch:      () => ({ type: 'pocket-legions.rematch', payload: {} }),
} as const;

export const Lobby = {
  // … as SA, plus:
  updateSettings: (changes: Partial<RoomSettings>) => ({ type: 'lobby.updateSettings', payload: changes }),
} as const;
```

---

## 8. Battle scene

```ts
interface BattleRenderer {
  mount(host: HTMLElement, map: MapDef): void;
  setStacks(stacks: StackView[]): void;                 // instant, used after a gap and on first render
  highlight(cells: Cell[], kind: 'move' | 'attack' | 'shoot' | 'zone'): void;
  play(event: GameEvent): Promise<void>;                // resolves when the animation ends
  onCellTap(cb: (cell: Cell) => void): void;
  destroy(): void;
}
```

**`PixiBattleRenderer`** (PixiJS v8, one `Application` per battle screen):
- **Map layer:** the map SVG from `map-texture.ts`, rasterised once at 64 px per cell into a texture. Deploy zones and hints are a `Graphics` overlay above it. Tall obstacles stay in the background for the MVP; per-obstacle sprites that can cover units come with the final map art (design §9).
- **Units layer:** a container sorted by `y` (`sortableChildren`, `zIndex = row`). One `UnitView` per stack:
  - an `AnimatedSprite` from `sheet.animations['<unitId>/<anim>']`, with `anchor` taken from the frame (0.5, 0.777);
  - placed on the cell's bottom centre, at `scale = cellPx × 1.4 / 128` (the atlas is drawn for a 128 px nominal frame);
  - `scale.x = −1` for stacks facing left (seats on the right half of the map face left);
  - a seat-coloured ring under the feet and a count badge, as `Graphics` + `BitmapText`. The atlases contain no shadow and no team colour (design §9), and the ring is what tells apart two players of the same race.
- **Effects layer:** projectiles from `projectiles.json`, launched at the shooter's `projectileOrigin`. The origin is converted from the 224 px canvas: `(origin − anchorPx) × scale`, mirrored with the sprite. Damage numbers are `BitmapText` that rises and fades.
- **Loading:** `atlas-loader.ts` reads `atlas/index.json` and loads only the races present in the session, about 11 MB of GPU memory each. Missing atlases or frames fail loudly in dev; a test checks every unit in `gamedata` has all its animations (§13).

**Fit, zoom and input.**
- The map fits the shorter screen side. Maps from 16×16 allow pinch-zoom and pan (`touch-action: none` on the canvas only).
- Unit size comes from the art itself: T1–T3 ≈ 60% of the 128 px nominal frame, champions ≈ 90%, so big units read bigger without leaving their cell.
- Tap a stack from `hints.stacks` → select it and highlight its `moves` and targets.
- Tap a highlighted cell → `act move`.
- Tap an enemy → show the preview tooltip ("12–18 шкоди, вб'є 2–3"), and confirm with a second tap. On phones a single tap must never commit an attack.
- Attacks with several `from` cells: the first tap on the enemy picks the closest one, and tapping another highlighted neighbour cell changes it.

**Final art (design §9).** The artist delivers the same atlas format. `npm run sync:art` picks the new files up; no code changes. Races can be replaced one at a time.

---

## 9. Event animator

- On every new view: take `game.events` with `seq > animatedSeq`.
  - **Gap** (first new `seq > animatedSeq + 1`), first load, or tab hidden → `renderer.setStacks(view stacks)` and set `animatedSeq` to the last seq, with no animation.
  - Otherwise queue the events and play them one by one with `renderer.play`.
- Timings come from the atlas meta (`meta.pocketLegions.units[id].anims`), not from constants:
  - move: 0.22 s per cell, `walk` looping;
  - attack: played at its `fps`; the target's `hit` and the damage number start on `hitFrame` (via `onFrameChange`);
  - shoot: the projectile leaves on `releaseFrame`, flies at ~12 cells/s, and the target's `hit` starts on impact;
  - hit: one pass, then back to `idle`;
  - death: one pass, stops on the last frame (`holdLast`), and the corpse fades out after 2 s.
- A speed toggle (1× / 2×) is saved per device.
- While the queue is playing, input is locked and the hints are hidden; the turn banner says whose turn it is. When the queue drains, `setStacks(view stacks)` corrects any drift (a hard sync point).
- `prefers-reduced-motion` → instant mode: no tweens, but damage numbers still show for 0.6 s.

---

## 10. Identity, presence, time

- Identity: copy SA §8. The share link is `<origin>/join?code=042137`.
- Presence dots and the connection banner: copy SA §9.
- **Turn timer.**
  - The countdown is computed from `turnDeadline` against the local clock and shown in the HUD; it turns red under 10 s.
  - When the local clock passes `turnDeadline + 1 s`, every client sends `claimTimeout` once per deadline. `too-early` (clock skew) and `conflict` (another client won) are ignored silently.
  - Never act on the timer otherwise. The server decides.

---

## 11. Styling

Tokens come from the gallery's `:root` (`design/art/index.html`):
```scss
--bg: #141922;  --cloth: #1c2230;  --panel: #222a3a;  --panel-2: #2a3446;  --line: #36425a;
--fg: #ece5d4;  --muted: #a7adbb;  --brass: #d9a64b;
--p1: #d9534a;  --p2: #3f7fd8;  --p3: #e0b43c;  --p4: #46a86a;      // seat colours (maps-render PLAYER)
--race-knights: #2f5fb3; …                                          // race colours from gamedata
--tap: 44px;  --tap-primary: 56px;
```
- Dark only (SA §10's reasoning applies: played at night).
- The board takes the full width in portrait. The HUD wraps above and below it, and in landscape it docks to the right.
- Motion: the battle is the only heavy animation; UI transitions are ≤ 150 ms.

---

## 12. Errors

As SA §11, plus:

| Code | Where | What |
|---|---|---|
| `invalid-army { reason }` | army budget bar | highlight the offending stack or slot |
| `invalid-deploy` | deploy screen | highlight unplaced or misplaced stacks |
| `not-your-turn`, `illegal-action` | toast | the next snapshot fixes the board; no retry |
| `too-early` (claimTimeout) | — | ignore |
| `outdated` / dataVersion mismatch | full screen | "Гру оновлено" + reload / new room |
| `session-started` on join | join form | "Гра вже почалась" |

---

## 13. Testing

- **Store:** version guard, phase and turn selectors.
- **Transport manager:** copy SA §12's tests.
- **LocalTransport:** a full 2-seat battle with a seeded rng through the synced module. Handover appears before every private view change. Reload resumes from `localStorage`.
- **EventAnimator:**
  - events play in `seq` order;
  - a gap → no animation and a hard sync;
  - input stays locked until the queue drains;
  - reduced-motion mode.
- **Battle input:** only hint stacks are selectable; one tap never commits an attack; the `from` cell choice works.
- **Army builder:** budget and gear cap, a champion limit message, the server error placement.
- **Atlases:** every unit in the synced `gamedata` has `idle`, `walk`, `attack`, `hit`, `death` (and `shoot` if ranged) in its race atlas, every hero has `idle` and `attack`, and every `projectile` named in the meta exists in `projectiles.json`. This catches a broken art drop before it reaches a phone.
- **Screen selection table** (status, phase, handover, terminal).
- **End to end against the local API:** 3 browser profiles, one full FFA battle, with one tab force-switched to polling. As SA says, this is the test that matters.

---

## 14. Phases

**Phase 0 — Scaffold.**
- `ng new` (zoneless, SCSS, routing), tokens and fonts, `@angular/pwa`.
- `sync-engine` + `--check` (needs API Phase 1).
- `sync:art`, PixiJS v8, `atlas-loader.ts`, `map-texture.ts`. A dev page that plays every animation from the atlases with anchor and projectile markers (like `design/art/atlas-viewer.html`) and renders all 8 maps.

*Done when:* the dev page matches the gallery, and `sync:engine --check` passes.

> **Done (2026-10-28).** `/dev` plays every animation of every race (anchor cross, projectile-origin dot, a projectiles row) and renders the 8 maps with 2/4-player zones through the battle's rasteriser; checked side by side with the gallery. `sync:engine --check` passes (29 files, pocket-legions-api@1cf8cd0, data 2026.11.0). Tests: the atlas check from §13 (every unit's animations and frames, heroes, projectiles) runs here already.
> Differences from the plan:
> - The config (angular.json, tsconfigs, .editorconfig, .prettierrc, vercel.json) is copied from sen-reveal-app instead of `ng new` — same generator output, same pinned `vitest 4.0.8`. `strict` and `strictTemplates` are on; the synced engine compiles under them.
> - PWA by hand instead of `ng add @angular/pwa`: `@angular/service-worker`, `ngsw-config.json` (art cached lazily), manifest and an SVG icon. PNG icons stay in Phase 6.
> - `sync:engine`: the header and `SOURCE.json` carry the last API commit that touched the synced set (`+dirty` with local edits), not `HEAD`, so unrelated API commits don't fail `--check`. `--check` runs as `prebuild`; with no API checkout next to the repo (a Vercel build) it warns and passes, building the committed copy.
> - `sync:art` copies `design/art/atlas/*.{json,webp}` to `public/art/atlas/` and the copy is committed (`design/` is not a repo, Vercel needs the files). It has a `--check` too.
> - Maps are rasterised once, so the gallery's water, lava and mill-blade animations are still frames. Map previews elsewhere can use `mapSvg()` directly.
> - Pixi's web-worker adapter pulls in CommonJS `@xmldom/xmldom`; it is whitelisted in `allowedCommonJsDependencies`. Pixi lives only in lazy chunks (initial bundle 252 kB raw).

**Phase 1 — Hot-seat battle (first playable).**
- `LocalTransport` with fixed test armies.
- Battle screen: `PixiBattleRenderer`, `EventAnimator`, battle input, HUD.

*Done when:* two people finish a battle on one phone, and every action available in the UI is one the engine accepts (hints only).

> **Done (2026-10-28).** `/local/game` starts a quick battle (two seats, ready-made armies, automatic deployment) through the real actions, so the engine checks the armies and placements. The battle screen has the Pixi scene with move/attack/shot/death animations, projectiles from the atlas, damage numbers and count badges, and a HUD with round, turn order, the selected stack's card, preview, action bar (Оборона · Здібність · Герой · Підтвердити · Рукопашна), the last 5 events, a menu with speed 1×/2× and surrender. The result shows over the field after the last animation, with rematch and leave. Checked in the browser: tap-to-move, select-then-shoot with a second tap, and a whole battle driven from `hints` to the result with no rejected action and no console error. Tests: a full 2-seat battle through `LocalTransport` from hints with a seeded rng, the handover order, the reload resume, the animator (order, gap, hidden tab, input lock, log lag), battle input (hint-only selection, no one-tap attack, the `from` cell, hero two-target flow), the screen table.
> Differences from the plan:
> - `BattleRenderer.highlight(groups)` takes every highlight group at once (`move`, `attack`, `shoot`, `ability`, `from`, `chosen`, `selected`, `actable`, `zone`) instead of one `(cells, kind)` call; `mount` takes the sides (seat → race) besides the map, and `setStacks` takes the walls too.
> - The screens talk to an abstract `SessionConnection` (dispatch, connection, terminal, `handover`, `local`); `LocalSession` and, later, the `TransportManager` implement it. `SessionScreens` is the phase switch shared by `/local/game` and `/s/:code`.
> - A finished battle stays on the battle screen (`pickScreen` returns `battle` in phase `over` when there is a battle), so the last events animate before the result appears over the field. The standalone `over` screen is for a game that ended before any battle.
> - Attacks resolve on `hitFrame` and shots on impact, so the following `damaged` event plays the target's `hit` and the number at the right moment without pairing events.
> - The handover curtain appears only before army and deploy screens. The battle is public (gear included), so in hot-seat the view simply follows the active seat with a "Гравець N, ваш хід" line.
> - Hot-seat acts as the host for `rematch` and `setTeam` (everyone holds the same phone).
> - Atlases load with a per-race `cachePrefix`: every race has `hero/idle/0`…, which clashed in Pixi's global texture cache.
> - In dev builds the battle component is reachable as `window.__battle`, so a console script can drive a battle from the hints (this is how the end-to-end check ran).
> - The reduced-motion (instant) mode is in the renderer (`setInstant`); there is no unit test for it yet, only the code path.

**Phase 2 — Army and deploy (hot-seat).** Race picker, unit shop, gear slots, budget bar, deploy screen, handover curtain, local setup page.
*Done when:* a 3-player hot-seat game runs from setup to result without anyone seeing another player's army.

**Phase 3 — Getting in (online).** Home, create (map picker with previews), join, identity — mostly copied from sen-reveal-app.
*Done when:* create and join return tokens, and every error has a place on screen.

**Phase 4 — Lobby and transports.** Copy the transports, manager, connection banner and lobby. Add settings display, 2v2 team setting and start.
*Done when:* SA Phase 2–3 criteria pass against pocket-legions-api.

**Phase 5 — Online game.**
- Army, deploy and battle over the network, with `claimTimeout`.
- Reconnect mid-battle: gap → hard sync. The `outdated` flow.

*Done when:* three browsers play a full FFA battle, one of them on polling, and no payload before `battle` contains another player's army (check the network tab).

**Phase 6 — Ship.**
- A11y: labels on action buttons, `aria-live` for the event log, focus order in the shop.
- Reduced motion, font loading, PWA icons, deploy to Vercel, add the origin to the API's `CORS_ORIGINS`.

*Done when:* one online game is played on three real phones, one of them on mobile data, and one hot-seat game is played on a single phone.

**Later — Final art.** Replace `design/art/atlas/<race>.webp/.json` race by race with the artist's atlases (design §9), check them in `atlas-viewer.html`, run `sync:art`. Final map art: per-obstacle sprites in the units layer so tall obstacles can cover units.

---

## 15. Open questions
1. **Renderer — decided.** PixiJS from the start on the race atlases (§1, §8). The per-part animation of the prototype sprites is baked into the atlas frames, so nothing is lost.
2. **Rematch — decided (2026-10-27): in the same room.** The API has `pocket-legions.rematch` (host, phase `over`) back to `army` with races and armies kept. The end of a battle no longer finishes the session (API plan §12.6).
3. **Lobby settings — decided (2026-10-27): yes, before the start.** Map previews use the synced map data. The host changes settings with `lobby.updateSettings` (API plan §12.7).
4. **Language.** Ukrainian only for now, with copy kept in one file so i18n can be added later.
