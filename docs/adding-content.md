# Adding content to Dead Signal

Since 0.2 most new content is a file and a line, not new code. This is what to hand over (or do) for each kind.

## A 3D model (prop, vehicle, infected)

1. Put the `.glb` (or `.gltf`) in `public/models/<pack>/` with its licence next to it (`LICENSE.txt`).
2. Add a line to `MODELS` in `src/models/library.ts`: its file, the size it should be (`height`, or `length` for long
   things), and a turn (`yaw`) if it faces the wrong way. The library scales it, stands it on the ground and centres
   it, whatever units it was made in.
3. Add it to a pack in `PACKS`, and use it where a prop is placed: `modelProp(b, 'id', x, y, z, rot)` puts every copy
   in one instanced draw. The procedural prop stays as the fallback when the model is not loaded.

An animated infected needs the clips `Idle`, `Walk`, `Run`, `Punch`, `HitReact` and `Death` (Mixamo or the asset
pack's own) and bones named `Head`, `Torso` and `LowerArm.R` for hit tests (`src/models/zombieRig.ts`).

Budgets for phones: about 2-8k triangles and 1-2 materials per prop or character, textures at 1024 px or less.

Good free sources: Quaternius (CC0, also mirrored model by model on poly.pizza), Kenney (CC0), Mixamo (animations).
Paid, one consistent style across many packs: Synty POLYGON. Sketchfab: check every model's licence.

## A character for the Sakura District (VRoid)

Export from VRoid Studio as `.vrm` into `public/anime/` with the slot's file name (`public/anime/README.md` lists
them: the squad, co-op teammates, the Kurenai Court, the horde, the boss). An image of the character is enough to
build one in VRoid Studio. Keep to 2-4 materials and 15-25k triangles (export settings in that README).

## Lore, notes and story

- Notes: `src/sakura/lore.ts`. Each note is a place (`area`, `x`, `z`), a title, a source, and three short paragraphs:
  what it was, how it fell, what is left. `clue` stamps it as an Easter egg hint. `tests/sakuraLore.test.ts` checks
  every note can be walked to.
- Story missions: `src/sakura/missions.ts` (where you start, which contract is settled, who is out there, the
  briefing).
- Map text (the title screen, the objectives, the radio): `MAP_TEXT` in `src/world/layout/data.ts`.

## Maps

The Sakura Block Editor (artifact) exports a JSON layout; `docs/sakura-block-editor.md` explains how it maps onto
the map's constants. Every map is checked by the tests: `tests/levels.test.ts` (nothing sealed off),
`tests/sakura.test.ts` (floors and stairs).
