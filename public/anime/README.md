# Sakura District cast (VRoid models)

Every character on the Sakura District is a `.vrm` exported from **VRoid Studio** (free), in this folder. Which file
plays which role is `ANIME_CAST` in `src/config.ts`; a file can play several roles (it loads once). To recast someone,
replace the file (same name) or point the role at a new one. A missing file falls back to another loaded model of its
kind, and with none at all the game's stock figures stand in. The bestiary (`/bestiary.html`, SAKURA DISTRICT) shows
which file each character wears.

| File | Who |
| --- | --- |
| `hana.vrm` | Hana (squad, rifle) - "02 Cyberpunk", made for the game |
| `yuzu.vrm` | Yuzu (squad, shotgun) |
| `fumiriya.vrm`, `kuro.vrm`, `bibi.vrm` | co-op teammates, by seat |
| `hoodie.vrm`, `student-m.vrm`, `fumiriya.vrm` | the Kurenai Court (worn in the theatre's crimson) |
| `student-f.vrm`, `student-m.vrm`, `shino.vrm`, `fumiriya.vrm` | the plain horde (tinted by type) |
| `student-m.vrm` | Commuter (grey suit, briefcase, glasses) |
| `bibi.vrm` | Bloomed (blossom growing through) |
| `hoodie.vrm` | Rooted (mud and roots) |
| `shino.vrm` | Kuchisake (red coat, mask, shears) |
| `kuro.vrm` | Jorogumo (black dress, eight legs) |
| `student-f.vrm` | Miko (white and red, gohei, kagura bells) |
| `victoria.vrm` | Idol (stage dress, microphone) |
| `vita.vrm` | Oni (red skin, horns, iron club) |
| `empress.vrm` | The Crimson Empress (crimson coat, blossom crown, parasol) |

Each kind's colours and gear are `KIND_LOOKS` in `src/anime/looks.ts`. `ANIME_CAST.core` loads before a run starts; the
rest stream in behind it.

## Export settings (performance)

Every model costs triangles, draw calls (one per material) and texture memory, and the horde puts many on screen.

- **Reduce polygons**: on (hair especially). Aim for 15-35k triangles per model.
- **Material reduction / texture atlas**: as few materials as you can (draw calls).
- **Texture resolution**: 1024 for the squad and the boss, 512 for the horde.
- Keep the bone structure as VRoid makes it (the game drives the standard humanoid bones).

The shipped files were slimmed for the web (textures scaled down, normal maps flattened, unused face blend shapes
removed) with `scripts/vrm-slim.py` over the original exports (`python scripts/vrm-slim.py IN.vrm public/anime/OUT.vrm 512`); the blend shapes the game uses (blink, the vowels, angry, joy,
sorrow, fun) are kept. Hair and skirt physics are not simulated: they hold their shape.

## Licences

Only use models you made yourself or whose licence allows use in a game you distribute. Never use models extracted
from other games. See `LICENSE.txt` here for the shipped files.

## Stand-in

`stand-in.vrm`, when present, stands in for every missing model. `test/` is for local development only: git-ignored
and removed from builds.
