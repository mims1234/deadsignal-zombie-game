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

## The mission

1. **Restore the relay** — activate the transmitter, then stay inside the marked circle for 55 seconds while the infected converge on it.
2. **Eliminate the Warden** — find the armored elite in the research compound. Shoot the helmet off, then go for the head.
3. **Extract** — call the helicopter from the LZ radio, survive the final horde, and board it alive.

Each contract pays out once. Tougher zombies and better loot wait in the higher-threat regions. Spend your cash at the supply
cages and the armory bench. At 7:30 a contamination surge spreads out from the compound, and the district is sealed at 12:00.
You lose if you die, if the district seals before you call extraction, or if the helicopter leaves without you.

## Modes

Pick one on the title screen before you deploy. The choice is remembered.

- **Standard** — the operation above.
- **Card recovery** — the same operation with a side contract. Five card carriers walk the district, each with its
  card floating over its head. A carrier cannot be killed: empty its health and it drops, then get close and hold `E`
  to purge the signal before it gets back up (24 seconds). The card is left on the ground; walk into it to take it.
  Each card pays $350, the full set pays a $1,500 bonus, and recovered cards stay in the archive on the title screen
  across runs. The side contract is optional: you can extract without it.
- **Free roam** — no mission, no clock and no damage. Fly anywhere, through anything, and look around.
  `W A S D` moves along the view, `Space` climbs, `C` descends, `Shift` goes fast. On touch, look where you want to
  go and push the stick.

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
