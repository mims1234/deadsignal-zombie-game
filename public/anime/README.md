# Sakura District cast (VRoid models)

Put `.vrm` files exported from **VRoid Studio** (free) in this folder with these exact names. Any missing file
falls back: a missing person wears another person's model, a missing infected another infected's, and with none
at all the game's stock figures stand in. The bestiary (`/bestiary.html`, SAKURA DISTRICT) shows which file each
character wants and whether it was found.

| File | Who |
| --- | --- |
| `squad-1.vrm` | Hana (squad, rifle) |
| `squad-2.vrm` | Yuzu (squad, shotgun) |
| `survivor-1.vrm` | Aoi Kisaragi (survivor) |
| `survivor-2.vrm` | Mei Hoshino (survivor) |
| `survivor-3.vrm` | Koharu Tachibana (survivor) |
| `infected-1.vrm` .. `infected-3.vrm` | the horde (every infected wears one, tinted grey with glowing eyes) |
| `boss.vrm` | the Crimson Empress (boss) |
| `guy-1.vrm` | Ren - a male model, **bestiary only** for now |

The list lives in `ANIME_CAST` in `src/config.ts`.

## Export settings (performance)

Every model costs triangles, draw calls (one per material) and texture memory, and the horde puts many on screen.
In VRoid Studio's **Export → VRM** screen:

- **Reduce polygons**: on (hair especially). Aim for 15-25k triangles per model.
- **Material reduction / texture atlas**: reduce to **2-4 materials** (the biggest win: draw calls).
- **Texture resolution**: **1024** (2048 only for the squad if you really want it).
- Keep the bone structure as VRoid makes it (the game drives the standard humanoid bones).

Hair and skirt physics (spring bones) are not simulated in the game: they hold their shape. Facial expressions
(blink, happy, angry, sad, "aa") are used.

## Licences

Only use models you made yourself or whose licence allows use in a game you distribute (check each VRoid Hub /
Booth model's terms). Never use models extracted from other games.

## Stand-in

`stand-in.vrm`, when present, stands in for every missing model (put any VRM there whose licence allows you to
ship it). `test/sample.vrm` is the same for local development only: git-ignored and removed from builds.
