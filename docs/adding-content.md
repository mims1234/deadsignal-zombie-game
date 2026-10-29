# Adding content to Zombies GenXmims

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

Export from VRoid Studio as `.vrm` into `public/anime/` and point a role at it in `ANIME_CAST` (`src/config.ts`):
the squad, the co-op teammates, the Court, the horde, or one kind of infected (`kinds`). `public/anime/README.md` lists
who wears what now. An image of the character is enough to build one in VRoid Studio. A kind's colours and gear (the
Oni's club, the miko's hakama) are `KIND_LOOKS` in `src/anime/looks.ts`.

## Story, lore and the infected

The Sakura District's story is told aloud and kept in the field file (pause menu). All of it is data in
`src/sakura/campaign.ts`:

- `OUTBREAK`: how it began (the field file's first pages).
- `FIELD`: each kind of infected - its look, what it does, why it is where it is, and what the squad says the first
  time they see one (a card pops up the first time each kind is met).
- `PLACE_RADIO`: what Aoi, Hana and Yuzu say the first time you walk into each part of the district.
- `CHAPTERS`: KAIKA, the campaign - each chapter's title, objective, marker, the radio when it begins, the kinds it
  introduces, and when it is done (from state every co-op player shares). `campaignSetPiece` stages its infected.
- Story missions: `src/sakura/missions.ts`. Map text (the title screen, the objectives): `MAP_TEXT` in
  `src/world/layout/data.ts`.

## Maps

The Sakura Block Editor (artifact) exports a JSON layout; `docs/sakura-block-editor.md` explains how it maps onto
the map's constants. Every map is checked by the tests: `tests/levels.test.ts` (nothing sealed off),
`tests/sakura.test.ts` (floors and stairs).
