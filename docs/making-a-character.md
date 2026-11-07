# Making a real-asset character (brief for an agent)

Use this as the prompt when you ask an agent to add a character. Fill in the **Character** block at the bottom and hand
over the whole file.

---

## The task

Add one character to Zombies GenXmims as a real-asset 3D person, built the same way as Nurse Halloway (v0.4.356) and
the rest of the Asylum cast: a MakeHuman body made in Blender by a script, exported as a VRM, slimmed for the web, and
worn in game through the existing VRM path. **Do not model anything by hand and do not download finished characters.**
Everything is generated from a recipe in `scripts/asylum-cast.py`.

Read first: `scripts/asylum-cast.py` (the whole file, especially `CAST` and the garment builders),
`scripts/vrm-slim.py`, `src/anime/cast.ts` (`ASYLUM_CAST`, `ownModel`, `asylumInfected`, the Matron),
`src/anime/vrm.ts`, `src/config.ts` (`SQUADS`, `SURVIVORS`: their `model` fields), `public/models/asylum/LICENSE.txt`,
`ASSETS.md`.

## Hard rules

- **Licences:** only MakeHuman system assets (CC0) and pieces the script builds itself. No downloaded characters, no
  other packs, nothing from another game.
- **No likeness of a real person**, and no recreation of a character from another game, anime or film. A style or mood
  reference is fine; a copy is not. Vulcan members' looks are built from their names; never use a photo of anyone.
- **Never show Vulcan rank titles** in anything a player sees.
- **Beta only:** a real-asset model is used only when NEW 3D MODELS (BETA) is on (`modelPack !== 'classic'`) and only on
  its own map. With the setting off, the old built figure must look exactly as before.
- **Gameplay unchanged:** the model only replaces how the character looks. Same skeleton-driven animations, same
  colliders, same co-op sync. The server never loads models.
- **Shared checkout:** several sessions work in `D:\Coding\2026\MiMs-Repo\sonnet-5-5-zombies-game` (branch `coop`) and
  push to `main`, which **deploys the live game**. Run `git status` first, stage only your own files whole, never
  partially stage around another session's edits, and never commit someone else's work in progress.

## Tools (already on this PC)

- **Blender 4.2+** (4.5 is installed; find the exe with `where blender` or under `C:\Program Files\Blender Foundation`)
  with the **`mpfb`** (MakeHuman) and **`vrm`** extensions and MPFB's **MakeHuman system assets pack** installed.
- **Python** with numpy (for `vrm-slim.py`) and **ffmpeg** on the PATH (it resizes the textures).

## Step 1: write the recipe

Add an entry to `CAST` in `scripts/asylum-cast.py`, with a comment above it describing the character in one line
(age, build, hair, eyes, outfit, accent colour). Copy the closest existing entry and change it. Fields:

| Field | What it does | Notes |
|---|---|---|
| `phenotype` | `ph(gender, age, muscle, weight, proportions, height, cup, race)` | All 0..1. `gender` 0 = female, 1 = male. `race` is `(asian, caucasian, african)` weights summing to 1. Keep values moderate (0.3-0.7) for grounded people. |
| `skin` | MakeHuman skin material | e.g. `young_caucasian_female`, `middleage_african_female`, `old_caucasian_female`, male variants exist. List them in the MPFB assets folder. |
| `eyes_mat` | eye colour material | `green`, `brown`, `brownlight`, `lightblue`, `grey`, ... |
| `eyebrows` | eyebrow asset | `eyebrow001` .. `eyebrow012` |
| `hair` | hairstyle asset or `None` | `braid01`, `ponytail01`, `afro01`, `long01`, `bob02`, `short02`, ... (see the assets pack) |
| `hair_color` | RGB 0..1 | The script re-tints the strands keeping their light and dark. |
| `clothes` | MakeHuman garments | e.g. `female_elegantsuit01`, `female_casualsuit01`, `male_casualsuit06`, `shoes02`, `shoes03`. Keep it to an outfit plus shoes. |
| `dye` | recolour per garment | `{"garment": {"base": rgb, "blue": rgb}}`; `blue` is what was denim, `base` the rest. Patterns and logos are removed. |
| `garments` | pieces the script builds from the body | `kind`: `vest`, `coat`, `gown`, `habit`, `apron`, `cape`, `veil` (with `band`, `hood`). Each has a `color`. |
| `cap` | a nurse's cap | `{"color": rgb, "band": rgb}` |
| `glasses` | thin rims | an RGB frame colour |

Match the character's existing in-game look where there is one: the `look` block in `config.ts` (hair colour, skin,
eyes, accent, glasses) is the reference, so the built and real-asset versions read as the same person.

From a reference image: describe what you see as the recipe (body, face shape via age/weight/proportions, hair to the
nearest asset, outfit to the nearest garment plus dye, accent colours). It will be close, not a copy, and that is
intended.

## Step 2: build it

```
blender -b --python scripts/asylum-cast.py -- <name> <scratch>/<name>-raw.vrm
python scripts/vrm-slim.py <scratch>/<name>-raw.vrm public/models/asylum/<name>.vrm 1024
```

Keep raw files in your scratchpad, never in the repo. Target: **about 4 MB and about 14k triangles** per character
(Halloway: 4.3 MB, 14k). If it comes out much heavier, simplify the outfit or lower the slim size before going on.

Render a preview and look at it before wiring anything in: front and side, in the game's lighting if you can. Check
the hair is cut out (not a solid sheet), clothes are opaque, nothing pokes through (hands through a coat, hair through
a cap), and the colours match the character. Re-run with adjusted values until it is right.

## Step 3: wire it into the game

- **A squad member:** add the file to that map's `SQUADS.<map>.models` in `src/config.ts`.
- **A survivor:** set `model: 'models/asylum/<name>.vrm'` on their `SURVIVORS.<map>` entry.
- **An infected look:** add a line to the infected table in `src/anime/cast.ts` (file plus glowing eye colour), as
  `inf_nurse` and the others are.
- **A boss or unique figure:** follow the Matron (`MATRON_FILE` and its tint in `src/anime/cast.ts`).

These lists feed `ASYLUM_CAST`, which loads only on the Asylum with the beta setting on. For a character on another
map, add that map's cast the same way (loaded only for that map with the beta on). Do not load it everywhere.

Credits: if you add a new folder, give it a `LICENSE.txt` like `public/models/asylum/LICENSE.txt` and mention it in
`ASSETS.md`. New characters in the existing folder are already covered.

## Step 4: check it

1. `npx tsc --noEmit` is clean.
2. `npx vitest run` passes (re-run any test that only timed out, on its own, before calling it a failure; other
   sessions load this machine).
3. In the browser (dev server `http://127.0.0.1:5183`, `window.__dead` test API from `src/dev/testApi.ts`): set
   `localStorage['deadsignal.map.v1']` to the map and `deadsignal.settings.v1` to
   `{"quality":"high","qualityAuto":false,"modelPack":"quaternius"}`, reload, start, find the character
   (`__dead.teleport(x, z, yaw, y)`, `__dead.lookAt(x, z, y)`), and take screenshots: standing, walking, shooting or
   following, up close and at a distance, at night. Confirm the animations play on the new body (no T-pose, no
   sliding feet, the gun in the hand).
4. Turn the setting off and confirm the old figure is back unchanged.
5. Frame time: compare `__dead.snapshot()` fps, draws and triangles with the character on screen, beta on vs off. Say
   the numbers.

## Step 5: ship it

Every push to `main` gets the next patch version: bump `package.json` `version` and add a new entry at the top of
`server/changelog.json` (version, date, a short title, a few plain notes a player would understand). Commit only your
files, then:

```
git push origin coop
git push origin coop:main
```

Watch the CI run (`gh run list --repo mims1234/deadsignal-zombie-game`) and confirm
`https://zombies.genxmims.org/api/version` reports your version. If another session pushed first, fetch, rebase onto
`origin/coop`, take the next free version number, and push again.

Report back: the character's file and size, triangles, screenshots, the fps/draws numbers, the version, and anything
not verified (for example, not tried on a phone).

---

## Character (fill in)

- **Name and role:** (e.g. "Orderly Briggs, an Asylum survivor who carries a shotgun")
- **Map:** (Asylum, or another map)
- **Squad member, survivor, infected look, or boss:**
- **Look:** age, build, height, skin, eyes, hair (style and colour), outfit and colours, accessories, accent colour
- **Reference image (optional):** attach it; a style reference, not a real person or another game's character
- **Must keep:** anything from their current in-game look or story that has to stay
