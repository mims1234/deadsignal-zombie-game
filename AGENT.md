# Zombies GenXmims — project notes

Single-player extraction-survival FPS (Three.js) that also runs co-op; deploys to https://zombies.genxmims.org
on every push to `main`. This checkout is on branch `coop`. Several sessions share it: run `git status`
first, stage only your own files whole, never commit another session's work in progress.

## Running it
- `node server/index.mjs` — game server (reads PORT from env; .env is loaded automatically).
- `npx vite --port 5399 --strictPort` — dev client. Open `http://127.0.0.1:5399/?nolock&map=asylum&find=rae&dbg`.
- Useful URL flags (dev): `nolock` skips sign-in, `map=` zone, `find=<name>` teleports you 3 m from a
  squad member, `dbg` writes a debug line into `document.title` (slot / pack / fps / draws / tris),
  `pack=classic|quaternius` picks the model set, `at=x,z` parks the player.

## Real-asset cast (the Asylum)
The Asylum's people are MakeHuman bodies built by `scripts/asylum-cast.py` in Blender (MPFB add-on,
CC0 system assets), exported as VRM, slimmed by `scripts/vrm-slim.py`, and worn through the normal VRM path
in beta only (`modelPack !== 'classic'`, Asylum map only). Vulcan members get their looks from names.
Never show Vulcan rank titles. Never copy a real person or another game's character.

Blender is **not** on PATH: `D:\Softwares\Blender\blender.exe`. The MPFB and VRM extensions plus the
MakeHuman asset pack live in `%APPDATA%\Blender Foundation\Blender\4.5\extensions\blender_org`
(copied there from another profile). Extensions must be pre-enabled in `-b` with
`.quorx\scratch\pre_enable.py`; `BLENDER_USER_EXTENSIONS` alone does not work.

Build one: `blender -b --python .quorx\scratch\pre_enable.py --python scripts\asylum-cast.py -- NAME OUT-raw.vrm`
then `python scripts\vrm-slim.py OUT-raw.vrm public/models/asylum/NAME.vrm 1024`.
`.quorx\scratch\rae_shots.py <vrm> <outdir>` renders front/threeq/back/chest/hem for review.

## File map (main parts)
- `scripts/asylum-cast.py` — the whole cast recipe (CAST table + garment builders: vest, coat, gown, habit,
  apron, cape, veil, pinafore, cap, glasses). `pinafore` takes `v` (neckline depth) and `hem` (skirt length).
- `src/config.ts` — `SQUADS` / `SURVIVORS`; a survivor's `model:` field names its VRM.
- `src/anime/cast.ts`, `src/anime/vrm.ts` — the VRM path and the Matron.
- `src/asylum/lines.ts` — barks.
- `src/storage.ts` — settings keys (`deadsignal.settings.v1`), `modelPack`.
- `server/changelog.json` + `package.json` — one patch version per push to main.
- `ASSETS.md`, `public/models/asylum/LICENSE.txt` — licence records.

## The Forge's look (v0.4.382)
- `src/world/layout/forgeDress.ts` — the foundry dressing (stacks, pipe bridges, catwalk, ladle, ingots, slag, wet
  patches) and the molten shader (`createMolten`). Plain colours go through `matte()` / `metal()` and are baked with
  `MATTE_BAKE` / `METAL_BAKE`: those finishes and shadow flags already exist in every chunk of the Forge, so the
  dressing joins batches that are drawn anyway (550 static batches before the rework, 556 with it; a first cut with
  its own finishes had 586). A new material, finish or flag pair is a draw call per 78 m chunk. Glowing bits wear
  `emAmber` for the same reason.
- `FORGE_NIGHT` in `src/forge/runtime.ts` — sky, haze, light levels and bloom; dawn blends back to the defaults.
- Smoke / steam / embers are ambient emitters (`ForgeHandles.emitters` -> `fx.emitter`), scaled by the tier.
- `src/forge/ladle.ts` — the ladle trap. Solo only: the co-op simulation (`src/sim/serverHost.ts`) does not know it.
- The Infernus and the kit on the infected: `src/enemies/zombie/forge.ts` (`buildInfernus`, `KIT`).
- `node scripts/qa-forge-look.mjs <outdir> [tier] [port] [w] [h]` — screenshots, draw calls, the ladle, level check.
- `node scripts/qa-forge-perf.mjs [tier] [port] [w] [h]` with `QA_CPU=4` (Chrome's CPU throttle) and / or
  `QA_GL=swiftshader` — load time, heap and frame numbers at ten spots and in a 24-infected fight. Run it against two
  dev servers to compare builds. Measured 2026-11-10, Low, 844x390, CPU x4: 14.4 fps before the rework and 14.4 after,
  274 -> 263 draw calls. The frame is CPU-bound in three.js (about 350 draw calls and 3,000 matrix updates a frame),
  not in the look: see "To do".
- An alphaMap is read from the texture's GREEN channel (the puddle mask was in alpha at first and did nothing).
- Molten surfaces must sit above the building floor slab (y 0.03): the pools were invisible until they were raised.

## Decisions
- Rae Mercer (prisoner 023) is a **survivor**, flirty nurse doing her sentence: short orange pinafore cut
  deep over her old white uniform vest. Built by the `pinafore` garment builder, which the script owns.
- She is beta-only; with NEW 3D MODELS off the Asylum is unchanged.

## To do / not verified
- Weak devices are CPU-bound on every tier (see the Forge's perf numbers above). Found but not done, all maps:
  the skyline backdrop is ~130 static batches of its own (it is chunked like the rest; one batch per material would
  do); 133 of the Forge's static batches differ from a neighbour only in shadow flags, which mean nothing on tiers
  without shadows; hidden figures (pooled infected, people not yet shown: ~900 nodes) still recompute their matrices
  every frame; the minimap redraws every frame.
- Never tested on a phone.
- The live Asylum is sign-in gated, so production play was not exercised (the model is served fine, and the
  local build was tested end to end).
- `.quorx/scratch/logs` holds ~156 GB of tool logs; `git status` shows `.quorx/` as untracked.
