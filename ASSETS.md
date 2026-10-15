# Assets and attribution

**Apart from the card art, the Vulcan logo and the Ignis icon listed below, DEAD SIGNAL: EXCLUSION ZONE ships with no image, model or audio files.**

- **Geometry and models** (district, buildings, props, vehicles, weapons, hands, zombies, helicopter, stations) are built from
  Three.js primitives and procedural geometry in code.
- **Textures and decals** are painted at runtime with Canvas 2D and procedural noise (`src/world/textures/`, `src/fx/textures.ts`,
  `src/weapons/viewmodel/materials.ts`, `src/enemies/zombie/material.ts`).
- **Audio** is synthesised at runtime with the Web Audio API (`src/audio/synth/`). No audio files are included.
- **Fonts** are system font stacks (no web fonts are loaded).
- All names, brands, insignia and freight markings in the game are fictional.

## Card art (card recovery mode)

`src/cards/art/` holds the five card images and the card-back emblem used by the card recovery mode. The cards were
made by the repository owner. The characters on them belong to their respective owners (Blue Archive, the Nikki
series, Otonari no Tenshi-sama, Hyperdimension Neptunia, Gotoubun no Hanayome), so keep this folder out of any public
release. The mode still runs without the files: a carrier with no image gets a plain generated card. The carriers'
3D models are built in code (`src/cards/cosplay.ts`) and read nothing from the images.

## Vulcan logo (the Forge)

`src/world/art/vulcan-logo.png` is the Vulcan community's phoenix logo, taken from vulcan.genxmims.org (the repository
owner's site) with their go-ahead. The Forge tints it on canvases for the Vulcan HQ billboard, the crossroads sigil
and the clan banners (`src/world/layout/vulcan.ts`). The names and ranks of Vulcan's members used on the Forge (the
leadership, the holdouts and the named infected: `VULCAN_LEADERSHIP`, `SURVIVORS` and `VULCAN` in `src/config.ts`)
come from the same site's member list, and the Forge's story borrows the site's Ignis currency, its seven partner
foundries' currencies and its spotlights (never any amounts). Every member's look is built in code from their name
(`src/forge/looks.ts`, `src/coop/heroLook.ts`); no avatar or picture of anyone is used.

## Ignis icon (the Forge)

`src/world/art/ignis-icon.png` is the Ignis currency icon from vulcan.genxmims.org (cropped and scaled to 256 px), used
with the site owner's go-ahead (2026-10-15). The Forge puts it on the Great Furnace's door, over the Ledger House, on
the terminals, the ledger pages, the HUD's note card and the ending (`src/world/layout/ignis.ts`).

## Software dependencies

| Package | License |
| --- | --- |
| [three](https://threejs.org/) | MIT |
| [vite](https://vitejs.dev/) | MIT |
| [typescript](https://www.typescriptlang.org/) | Apache-2.0 |
| [vitest](https://vitest.dev/) | MIT |
| [playwright-core](https://playwright.dev/) (dev-only QA scripts) | Apache-2.0 |
