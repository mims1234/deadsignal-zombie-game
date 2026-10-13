# Assets and attribution

**Apart from the card art listed below, DEAD SIGNAL: EXCLUSION ZONE ships with no image, model or audio files.**

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

## Software dependencies

| Package | License |
| --- | --- |
| [three](https://threejs.org/) | MIT |
| [vite](https://vitejs.dev/) | MIT |
| [typescript](https://www.typescriptlang.org/) | Apache-2.0 |
| [vitest](https://vitest.dev/) | MIT |
| [playwright-core](https://playwright.dev/) (dev-only QA scripts) | Apache-2.0 |
