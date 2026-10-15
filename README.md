# Sonnet 5.5 Zombies Game

**DEAD SIGNAL: EXCLUSION ZONE** — a single-player, first-person zombie extraction shooter that runs in your browser.

Built by Claude Sonnet 5.5 and its sub-agents in Claude Code from a single prompt, using Three.js, TypeScript and Vite.
Every model, texture and sound is generated in code: no downloaded assets, no backend, no accounts.

Drop into a quarantined industrial district at blue hour, finish two contracts, upgrade your gear, then call the
helicopter and hold out long enough to board it.

## Play

```bash
pnpm install
pnpm dev        # http://127.0.0.1:5173
```

You need Node.js 22.12 or newer, [pnpm](https://pnpm.io/), and a desktop browser with WebGL 2 and Pointer Lock
(developed and tested in Chrome). Click **DEPLOY** to capture the mouse; **Esc** pauses.

It also runs on phones and tablets held sideways, with on-screen controls (see below).

**BESTIARY** on the title screen opens `bestiary.html`: every infected, the five card carriers, the Forge squad and
the survivors as 3D models you can turn and animate, with their stats and lore.

## The mission

The district now runs east through the old Route 9 collapse into the **rail yard**, a walled freight yard of
container lanes (high threat) with its own caches and infected.


1. **Restore the relay** — activate the transmitter, then stay inside the marked circle for 55 seconds while the infected converge on it.
2. **Eliminate the Warden** — find the armored elite in the research compound. Shoot the helmet off, then go for the head.
3. **Extract** — call the helicopter from the LZ radio, survive the final horde, and board it alive.

Each contract pays out once. Tougher zombies and better loot wait in the higher-threat regions. Spend your cash at the supply
cages and the armory bench.

Along the way:

- **Mystery boxes** sit where the supply caches used to (in every mode). Hold `E` to open one: it pays a little cash and
  spins a reel that lands on ammunition, frag grenades or a gun you are not carrying. The prize floats over the box —
  press `E` to take it (a gun replaces the one in your hands) or leave it, and after 12 seconds it sinks back. Boxes in
  higher-threat regions roll guns more often.
- **The HX-7 rocket launcher** only comes out of mystery boxes: one rocket at a time, a big blast that throws bodies
  across the street, and it hurts you too if you fire it point-blank.
- **Trapped survivors** (Standard and Standard Mazoku): three civilians are caged in around the District. Hold `E` at
  a cage to break the lock; they pick up a gun, follow you and shoot, and the infected hunt them like they hunt you.
  Each one freed pays $200 and each one still alive at extraction pays $400.
- **Bodies fly.** A killing shot throws the body along the shot — a nudge from the rifle or pistol, a real shove from
  the shotgun, and grenades and rockets launch them into the air. Blasts shove you as well, and the blow that kills you
  throws your view with it. At 7:30 a contamination surge spreads out from the compound, and the district is sealed at 12:00.
You lose if you die, if the district seals before you call extraction, or if the helicopter leaves without you.

## Maps

Pick the map on the title screen (the page reloads to build it).

- **The District** — the original exclusion zone, now with the rail yard to the east. Every mode runs here.
- **The Forge** — a 190 x 150 m foundry district at ember night, after the Vulcan community (vulcan.genxmims.org):
  molten runoff in open channels, sodium-orange streets, Vulcan's phoenix burning in the crossroads. Every currency in
  the Forge ran on embers, collected by seven furnaces - and seven days ago the collection stopped. The fire with
  nowhere to go burned up the people who made it: about a third of the Forge's infected still carry the names of
  Vulcan's members, and they look like the people they were. The run starts in **the Hearth** by the Pad; around it
  are Phoenix Plaza and the Crucible, riry's Rumble Pit, the Slag Yard, the seven foundries, the Spawn Hall and the
  Ledger House. Its contracts: **Rekindle the beacon**, **Slay the Infernus** in the Crucible, then call the bird and
  **hold the Hearth**. On top of that:
  - **The Hearth** is your safe zone: walk in and out through its open gate, and its sentry gun cuts down any infected
    that come through it (it never fires on a boss).
  - **Two of Vulcan's own** (drawn each run from Athy, Marv03K, piryriry and .maidlover.) deploy with you, follow you and
    shoot. The infected hunt them like they hunt you, and they can die for good: each still alive at extraction pays
    $500.
  - **The holdouts**: the other two of them, Anya and four members of the clan barricaded themselves into rooms around
    the Forge, and the infected pound on their doors (they never get in). Clear a door and hold E: they slip out the
    back to the Hearth and board with you at the end. tomoe is in the HQ vault, which opens when the beacon burns.
  - **The seven embers**: seven foundries spread around the map, one for each of the Forge's currencies (IGNIS,
    AMETHYST FLAME, KIZUNA SPARK, SAKURA SPARK, MOSSFIRE, VOID EMBER, FROSTFIRE). Go inside, stoke the forge (hold E),
    then hold the hall for 30 seconds while a horde comes for it, wave after wave, until it catches. $150 each; all
    seven pay $700 and two armor plates.
  - **The last stand**: once the bird is called, the whole Forge comes for the Hearth in waves - more than the sentry
    can hold. Anyone they reach there dies, so the squad holds the gate.
  - **tomoe's ledger**: four pages to find, each with a piece of where the embers went.
  - **riry's Rumble Pit**: ring the bell for three waves (optional).
  - Every member has their own look (built in code from their name), and a few familiar faces have their own.
  - Something else happens during the last stand. Finish a run to find out.

  Every mode runs on both maps, co-op included.

## Modes

Pick one on the title screen before you deploy. The choice is remembered.

**Difficulty** is two separate picks on the title screen, also remembered:
- **Infected**: Easy, Normal, Hard or Nightmare. It sets their health, the damage they deal, their speed, how far
  they see you, and how many there are (the active cap, how often new ones arrive, the size of the hordes).
- **Squad AI**: Rookie, Regular, Veteran or Elite. It sets how capable your AI helpers are (the Forge soldiers and the
  freed survivors): their health and armour, accuracy, rate of fire, damage, range and how often they go for the
  head.

- **Standard** — the operation above.
- **Standard Mazoku** — the standard operation plus a side contract. Five card carriers walk the district, each with its
  card floating over its head. A carrier cannot be killed: empty its health and it drops, then get close and hold `E`
  to purge the signal before it gets back up (24 seconds). The card is left on the ground; walk into it to take it.
  Each card pays $350 and the full set pays a $1,500 bonus. The carriers appear only in this mode (and in Mazoku
  co-op). The side contract is optional: you can extract without it.
- **Free roam** (a switch next to the modes, on Standard or Standard Mazoku) — no mission, no clock and no damage. Fly anywhere, through anything, and look around. Switch it off to go back to the mode it was on.
  `W A S D` moves along the view, `Space` climbs, `C` descends, `Shift` goes fast. On touch, look where you want to
  go and push the stick.

- **Co-op** (needs the game server and a signed-in account) — up to three players run a map's operation together:
  Standard or Standard Mazoku (or free roam, switched on in the lobby), on any map. Create a session in the lobby and share the
  invite link, or join with a code; a player following an invite to another map is moved onto it. The session's
  owner picks the mode and both difficulties in the lobby before starting (a new session starts with the owner's
  title-screen picks). Every other player presses READY in the lobby; once they all have, the owner starts a
  five-second countdown everyone sees (the owner can cancel it), and at zero the whole squad goes in. You can join a
  session at any time: when its owner starts it, or when you join one that is
  already running, you are brought straight into the world (on a computer, one click takes the mouse). The operation
  is the squad's: the relay, the Warden, the
  extraction, the Forge's soldiers, holdouts and furnaces and the Mazoku carriers are shared, so anything one of you
  completes is done for everyone, and its reward is paid to every player once. The relay fills while at least one of
  you is in the zone. Anyone can call the helicopter from the radio, and each player boards on their own; the
  squad's bonuses go to whoever is aboard when it leaves.
  **Revives.** A player at zero health goes down and bleeds out over 30 seconds. A teammate gets close and holds `E`
  for three seconds to bring them back up with half health. The run is lost only if nobody is left standing.
  Hold `Tab` for the scoreboard: kills, downs, who is up, down or aboard, and who is watching. Up to three more people
  can watch as spectators.
  The session's owner can kick players, end the session, and switch it between "anyone with the link" and
  invite-only (a list of Discord ids). Any player can report another from the lobby.

  **Hosting.** When you create a session you choose who runs it:
  - **Server hosted** (the default): the game server runs the session - the infected, the squad, the objectives and
    who hit what - and every player is an equal client. Nobody needs a strong device, a phone plays as well as a PC,
    and the session carries on if its creator leaves (another player becomes its owner).
  - **Self host**: the creator's browser runs the session for everyone, as co-op worked before. The others play at
    the creator's ping plus their own, and the session ends if the creator leaves or puts the game in the background.

  The lobby shows your ping before you create or join anything, and every player's ping once you are in (for a
  self-hosted session, each player's ping to the host). Hold `Tab` in a run to see everyone's ping on the scoreboard.
  Your shots are still judged on your own screen, so aiming feels the same either way; the host (server or creator)
  applies the damage and pays the kill.

## Controls

| Key | Action | Key | Action |
| --- | --- | --- | --- |
| `W A S D` | Move | `E` | Interact (hold where prompted) |
| Mouse | Look | `1` / `2` or wheel | Switch weapon |
| Left / right mouse | Fire / aim down sights | `G` | Throw frag grenade |
| `R` | Reload | `Q` | Apply armor plate |
| `Shift` | Sprint | `M` | Tactical map |
| `Space` / `C` | Jump / crouch (toggle) | `Esc` | Pause (settings, restart, quit) |

At a supply cage or the armory bench, press `E` to open it and `1`–`6` to buy.

### Phones and tablets

On a touch device the game switches to on-screen controls and a compact HUD, and starts on the Low graphics preset.
Hold the device sideways; **DEPLOY** goes fullscreen where the browser allows it.

| Control | Action |
| --- | --- |
| Left thumb, anywhere on the left | Move. Push the stick all the way forward to sprint |
| Slide up onto `RUN`, then let go | Lock the sprint on and keep running hands-free. Touch the stick to stop |
| Drag on the right | Look. Slow drags are fine, fast flicks turn further |
| `FIRE` (right) | Hold to shoot. Keep dragging on it to aim while shooting |
| `FIRE` (left) | Shoot with the left thumb so the right one can stay on the aim |
| `AIM` | Sights on / off |
| `RELOAD`, `JUMP`, `CROUCH` | As labelled |
| `USE` | Interact. Hold it when the prompt shows a ring. At a station it becomes `CLOSE` |
| `SWAP`, `NADE`, `PLATE` | Switch weapon (or tap the weapon readout), throw a grenade, apply an armor plate |
| `MAP`, `II` | Tactical map, pause |

At a supply cage or the armory bench, tap `USE`, then tap the item you want.

Two aiming helpers live in Settings on touch devices. **Aim assist** (on by default) slows the view as the crosshair
crosses an infected and steadies it toward them while you are aiming or firing; it never works through walls and
never moves the view while you are idle. **Auto fire** (off by default) shoots for you while the crosshair is on an
infected in plain view.

Add `?touch=1` to the URL to try the touch layout on a desktop, or `?touch=0` to force keyboard and mouse.

## Server: accounts, analytics and the admin dashboard

The game can be hosted two ways.

- **Static** (any file host, or `pnpm dev` on its own): no accounts. Everyone plays signed out and nothing is recorded.
- **With the game server** (`pnpm server`): players sign in with Discord before they can deploy, runs and visits are
  recorded, recovered cards are kept on the account, and the admins get a dashboard at `/admin`.

```bash
cp .env.example .env     # fill in PUBLIC_URL, the Discord application id and secret, and ADMIN_IDS
pnpm build
pnpm server              # serves dist/ and the API on PORT (3061)
```

In the Discord developer portal, add `<PUBLIC_URL>/auth/discord/callback` as an OAuth2 redirect. Only the `identify`
scope is requested. The database is one SQLite file in `DATA_DIR`; back that folder up.

The dashboard shows visits, players, runs per mode with outcomes and lengths, why runs fail, cards recovered, the
most active players and recent runs, plus a player list with ban / unban and the report queue. `/admin` answers 404
to anyone who is not in `ADMIN_IDS`. A banned account is signed out and cannot start a run.

Run statistics come from the player's browser, so treat them as analytics, not as proof: nothing is granted from them.

For local work, `DEV_LOGIN=1 pnpm server` adds `/auth/dev?id=<discord id>&name=<name>`, a sign-in that skips Discord,
and `pnpm dev` proxies `/api`, `/auth` and `/admin` to it. `scripts/qa-server.mjs` checks the API end to end.

### Server-hosted co-op

`pnpm build` also builds `server/sim/worker.mjs`, the co-op host for Node (`src/sim/`). Each server-hosted session
runs it in its own worker thread: about 130 MB of memory and a few milliseconds of CPU per tick (30 ticks a second).
`SIM_MAX_ROOMS` (default 8) caps how many run at once; when the cap is reached, creating a server-hosted session asks
the player to self-host instead. The admin dashboard's live sessions show each one's hosting, CPU per tick and the
players' pings.

### Deploying

`bash scripts/deploy.sh` on the server updates the checkout to `origin/main`, installs, builds, restarts the pm2
process and checks that the server answers. `.github/workflows/ci.yml` runs typecheck, tests and the build on every
push, and after a passing push to `main` runs that script over SSH when these repository secrets are set:
`DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` (a private key whose public half is in the server's
`authorized_keys`), `DEPLOY_PATH` (the checkout folder) and optionally `DEPLOY_PORT`.

## Development

```bash
pnpm build       # type-check and build to dist/
pnpm preview     # serve the production build
pnpm typecheck
pnpm test        # unit tests for the game rules (vitest)
```

Game balance lives in `src/config.ts`. `scripts/` has optional headless-Chrome QA helpers (they use your installed Chrome,
override the path with `CHROME_PATH`) and `dev/` has per-module preview pages served by `pnpm dev`.
See [ASSETS.md](./ASSETS.md) for asset and dependency notes.

## License

[MIT](./LICENSE)
