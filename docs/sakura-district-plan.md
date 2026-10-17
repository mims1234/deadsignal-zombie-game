# Sakura District, Bloomed — expansion plan

The Sakura District stops being "the District with an anime cast" and becomes its own map: bigger, laid out like the
reference schematic (station, school, shotengai, canal and shrine, the Crimson Theatre, the freight yard), years after
the fall and overgrown with wild cherry trees. Every character is a VRoid model. It has its own infected (inspired by
Japanese zombie manga and folklore), a hostile human faction, lore in every corner, a city that visibly tried and
failed to survive, buildings with floors above and below ground, and an Easter egg that transforms the map, hands out
two wonder weapons and opens a story that is only played once it has been found.

The plan splits it into phases that can each ship on their own.

## Status (v0.1.119)

All seven phases are built:

- **Floors** (`src/world/floors.ts`, `layout/storeys.ts`): storeys, stairs and stairwells; the infected and the squad route across them.
- **The map** (`src/world/layout/sakura/`): every zone, the metro and the lab underground, Kisaragi Station; no rescues, co-op players take the squad's places.
- **Lore** (`src/sakura/lore.ts`, `hud.ts`): 35 notes (before / the fall / now) and the pause-menu JOURNAL, kept between runs.
- **Enemies** (`src/enemies/variants.ts`, `src/sakura/director.ts`, `courtRig.ts`): the eight new kinds, the Kurenai Court's riflemen and the Empress's calls.
- **The Thousand Lanterns** (`src/sakura/quest.ts`, `runtime.ts`): charms, tree, lanterns, bell, the bloom, the ghost train, Hanafubuki, Raijin's Drum and the Blossom Altar.
- **Story missions** (`src/sakura/missions.ts`): The Crimson Curtain, Last Train and Hanami, as session kinds (solo and co-op).

Still to come: the cast's own VRoid models (most slots wear the stand-in), and the block editor.


## What is decided

| Topic | Decision |
|---|---|
| Layout | The reference schematic (`SAKURA DISTRICT 桜地区`): six zones in the same places, with the fixes in Phase 2 |
| Size | **256 × 132 m** (the District is 176 × 104, the Forge 190 × 150) |
| When | **Seven springs after the fall.** The hordes swept through long ago; nature has taken the district back and the cherry trees dominate |
| Rescues | **None.** No cages, no survivors to free on this map |
| Your side | You plus **two Hanabi girls (Hana, Yuzu)**. In co-op, players take their places: 2 players + 1 girl, 3 players + no girls. **Three people at most, always** |
| Story, solo vs co-op | **The same story either way**; the girls stand in for missing players, and story lines are written for "the squad" so either works |
| Everyone else | Hostile: the infected, or **living humans** who shoot back |
| Characters | **Every character on this map is a VRoid model**: squad, co-op teammates, every infected kind, the human faction, the boss. No stock figures on this map |
| Lore | Every place has a story: what it **was**, what happened **during** the fall, what it **is** now. You see the "now"; notes tell the rest |
| Floors | **Usable upper floors and underground levels**: station concourse and metro tunnels, school storeys and roof, arcade upper floors and rooftop bridges, the theatre's under-stage lab, the container stacks |
| Easter egg | A hidden ritual that **transforms the map**, opens a **hidden area (Kisaragi Station)**, and gives **two wonder weapons** and upgrades; it unlocks the **story missions** |
| Wonder weapons | **Hanafubuki** (huge ammo, very fast, very slow reload) and **Raijin's Drum** (a thunder gun) |
| Look | **Stylized-realistic**: realistic materials and light, slightly simplified shapes, warm colours, with overgrowth everywhere |

## The story, settled

Every sign, note and radio line quotes these facts so they agree.

1. **Before.** Sakuragi was a quiet commuter district famous for its canal of cherry trees and the **Kawabata Hanami
   festival**. The old **Crimson Theatre** (kabuki, 1890s) had been bought by **Kurenai Biotech**, which turned the
   building behind it into a "wellness clinic". The theatre's last star, **Kurenai Sayo** - *the Crimson Empress* -
   was the clinic's star patient. The treatment was built from a graft cut from the shrine's **thousand-year sacred
   cherry**, which the shrine's legend says holds a sleeping spirit.
2. **The night of the Hanami festival.** Sayo gave one last performance. The audience turned before the curtain fell.
   The festival crowd on the canal was next. The infection carries the tree in it: the infected bleed petals.
3. **The first days: they tried.** Police parked a commuter train sideways across the station as a wall. The school
   became the official shelter; desks went over the windows. Shopkeepers welded the arcade shutters and fought from
   the pachinko parlour. The shrine priest took in families and tied **omamori** (charms) to every fence. The army
   turned the freight yard into an evacuation checkpoint.
4. **It broke.** The evacuation trains never came. The checkpoint was overrun. The shelter's last broadcast was a song
   from the school PA, played on a loop until the power died. Those who lived split into those who hid and those who
   took.
5. **Seven springs later (now).** The hordes moved on long ago; what stayed behind has changed. The infected that were
   left became part of the place: some still walk their old routines, some have grown into the trees. The cherry trees,
   fed by the same infection, spread wild: through roads, into buildings, over the train. The living who remain are the
   **Kurenai Court**, the gang that held the freight yard, who now live in the theatre and worship Sayo as a goddess who
   "chose" them. **Hanabi unit** is sent in to restore the old relay and to end Sayo.
6. **The secret (through the Easter egg).** The sacred tree is dying - the graft was never returned - and the district
   dies with it. In a station that is on no map, **Kisaragi**, the tree's spirit has been waiting for someone to bring
   it back.

## Every character is a VRoid model

Nothing on this map uses the stock jointed figures or procedural zombies. Every slot has a `.vrm` file; while a slot's
own file is missing, it wears the shipped stand-in (`stand-in.vrm`), never a stock figure.

| Who | Model files (in `public/anime/`) | Notes |
|---|---|---|
| Hana, Yuzu (squad) | `squad-1.vrm`, `squad-2.vrm` | the most-seen faces |
| **Co-op teammates** | `operator-1.vrm` .. `operator-3.vrm` | each player wears one (picked in the lobby); today they are stock figures - this changes |
| Commuters | `commuter-m-1..2.vrm`, `commuter-f-1..2.vrm` | salarymen and office workers: male and female |
| Bloomed, Rooted | `bloomed-1..2.vrm` | the same people, years on: branches and blossoms grow through them (extra meshes added by the game) |
| Kuchisake | `kuchisake.vrm` | a tall woman in a long coat and a surgical mask |
| Jorōgumo | `jorogumo.vrm` | a woman in a torn kimono; the game adds the spider legs |
| Miko, Idol | `miko.vrm`, `idol.vrm` | later wave |
| Oni | `oni.vrm` | **male**, firefighter gear; later wave |
| Kurenai Court (humans) | `court-m-1..2.vrm`, `court-f-1..2.vrm` | **not** tinted like the infected: living people, with guns and red sashes |
| The Crimson Empress | `boss.vrm` (or `02cyberpunk.vrm` if you choose her) | |
| Story characters (Phase 7) | added per mission | |

- **Voices follow the model:** each model is marked male or female, and infected use the matching voice set (the
  female set exists; a male set comes from the current horde voices).
- **Weapons:** human enemies and teammates hold real guns in VRoid hands, like the squad already does.
- **Variety without many files:** one model per kind plus tints, hair swaps and props (masks, helmets, bags, branches)
  gives a crowd variety; more models can be added any time.
- **Performance:** the live cap stays (24 at once, 12 on phones), humans count toward it, every copy of a model shares
  its textures, and models are exported with the README's settings.

## Phase 0 - the block editor (planning tool)

A web page (artifact) that shows the map at real scale on a 4 m grid, seeded with the schematic traced into blocks.
You (and your sisters, with the link) drag, resize and rotate blocks, pick types from a palette, move mission markers,
**switch between floors** (B2, B1, ground, 2F, 3F, roof), and leave notes on any block. It warns when a rule breaks (no
second route, a blocked defense circle, a spawn near the start, a floor with no stairs). I read the saved layout and
build from it.

## Phase 1 - floors above and below (engine work)

The engine today has raised decks and stairs (the Forge's foundry decks), but only **one walkable floor per spot**.
Stacked floors need:

- **Layered collision:** for every spot, the floor you stand on is the nearest one **below your feet**, not the highest
  one; ceilings stop jumps; stairs, ramps, ladders and lifts link floors.
- **A navigation grid per floor**, linked at stairs, so the infected follow you up and down (and the Kurenai Court
  takes the high ground).
- **Underground levels** built as real spaces below the street, entered by stairwells and escalators; the street has
  openings where they go down.
- Lighting per level (dark tunnels lit by torches, emergency lights and petals that glow).

## Phase 2 - the bigger, overgrown map

- Build the six zones at 256 × 132 m from the editor's layout.
- **Fixes to the schematic:** spawn D moves away from the start; the defense courtyard becomes a clear ~28 m circle;
  six mystery boxes; open lanes through the canal park; the main avenue also feeds the freight yard; the theatre gets
  a second gate.
- **Overgrowth, seven springs on:** wild cherry trees through cracked roads and inside buildings; ivy and moss on
  walls; grass and weeds over the tracks and pavements; roots lifting the paving; petals drifting everywhere; puddles
  and collapsed roofs letting light in. Sakura dominates the colour, but it is still a ruin.
- **Floors** (from Phase 1): the station's underground concourse and metro platforms (the tunnel runs under
  Sakura-dori to the shotengai's basement shops), the school's three storeys and roof, arcade upper floors linked by
  plank bridges across the roof, apartment rooftops, the theatre's under-stage lab, the freight yard's container stacks
  and catwalks, a cave in the roots of the sacred tree.
- **Squad rules:** no survivors; two girls by default; co-op players replace them (3 people max).
- **Performance:** buildings merged per zone; trees and grass **instanced** with distance fading; far zones and other
  floors culled; on Low quality, less grass and fewer petals.

## Phase 3 - the city that tried (environmental storytelling)

Each zone shows its failed defence, years on, under the overgrowth:

| Zone | What you see now |
|---|---|
| **Sakuragi Station** | The commuter train still sideways across the tracks, doors chained, a cherry tree growing out through its roof; turnstiles welded shut; an "EVACUATION POINT 3" banner, faded, over heaps of luggage and strollers grown over with moss; the departure board frozen at the last train |
| **Hilltop School** | Desks and lockers stacked against every window; chalkboards full of names and "WE ARE HERE"; a giant SOS on the sports field, now in tall grass; a rooftop camp of rotted tarps and futons; the PA horn still hanging |
| **Shotengai** | Shutters welded and spray-painted with warnings; a car rammed into the arcade mouth; the pachinko parlour as a last-stand fort, its spilled balls as caltrops; the konbini looted bare; vending machines smashed open for water; the arcade roof half fallen, a tree through it |
| **Canal & Shrine** | Thousands of faded omamori on every fence; collapsed tents and bedrolls under the trees; boats sunk in the canal; the sacred tree grey and dead among the pink ones |
| **Crimson Theatre** | The Kurenai Court's home: red cloth hung everywhere, an altar to Sayo built from festival posters, bonfires, sentries; behind it the clinic's quarantine tents, torn open from the inside |
| **Freight Yard** | The army's container fort, retaken by the Court and then abandoned: their red graffiti, sniper nests on the stacks, barbed-wire gates, and the checkpoint's last list of names |

Everywhere: barricades that failed (sandbags, cars, furniture), hand-painted signs, rusted weapons and casings, old
fires, and the remains of the people who tried.

## Phase 4 - lore notes ("sub notes")

- **Notes you pick up** (handwritten pages, phone messages, police reports, school diary pages, clinic files, Court
  sermons): each tells what the place **was** and what happened there. About 5 per zone, 30 in all.
- **Signs and plaques** you read by looking at them: the station history board, the shrine's legend of the blossom
  spirit, the theatre's poster for Sayo's last show.
- A **journal** (pause menu and bestiary) keeps what you have found, per zone, with a line on what the place was.
  Found notes stay found between runs.
- Some notes are **Easter egg clues**, marked only by a small sakura stamp in the corner.

## Phase 5 - the new infected and the human enemies

Inspired by Japanese zombie manga (*I Am a Hero*'s infected who keep repeating their old routines), by *The Last of
Us*'s overgrown infected, and by Japanese folklore (the yōkai *kuchisake-onna* and *jorōgumo*). I picked these; the
first four ship first.

| | Kind | Who they were | What they do |
|---|---|---|---|
| **1** | **Commuters** | salarymen, office workers, the station attendant, shopkeepers | **Still living their routine**: bowing to no one, walking to an office that is gone, pushing a crowd onto a missing train, calling "irasshaimase!" behind a counter. They ignore you until you make noise or come too close - then they hunt. **You can sneak past them.** The common horde |
| **2** | **Bloomed** | the oldest infected | Branches and blossoms grow through their bodies. Slow and tough; shooting them bursts **clouds of petals** that blind you for a moment and hide them. Kill them with headshots or fire |
| **3** | **Rooted** | the ones who stopped moving | **Grown into walls, trees and the train**, they look like part of the scenery and tear themselves free as you pass. Ambushes in tight spaces; their spots are hinted by twitching branches |
| **4** | **Kuchisake** | a woman in a surgical mask and a long coat (the slit-mouthed woman) | **A stalker.** One per run. She follows you at a distance through the alleys and only moves when you aren't looking; when she is close you hear her ask *"Am I pretty?"* Turn and shoot her before she reaches you |
| 5 | **Jorōgumo** | a woman in a torn kimono | Lives **underground**: crawls on ceilings and walls, spins petal-silk that slows you, drags people into the dark. The tunnels' terror |
| 6 | **Miko** | the shrine maidens | **Rings her bell to call the horde** and makes nearby infected faster for a while |
| 7 | **Idol** | a festival performer | **Sings**: you and your squad get pulled toward her and your aim sways while she sings - kill her first |
| 8 | **Oni** | firefighters and riot police | An armoured brute that charges through barricades |
| H | **Kurenai Court** (human) | the gang, now a cult | **Shoot back**, take cover, throw molotovs, hold high ground; they fight the infected too. Some carry the good guns |
| B | **The Crimson Empress** (boss) | Kurenai Sayo | Reworked: war-fan strikes, a spinning dance that throws petals like blades, calls her Miko; the Court defends her |

## Phase 6 - the Easter egg: "The Thousand Lanterns"

Never explained in the game; hinted by the stamped notes.

1. **Five omamori.** Five special charms hidden in five zones, in lore spots: the station's lost-and-found (B1), the
   school's music room (3F), the karaoke's VIP booth (2F), a sunken boat in the canal, the clinic's specimen fridge
   (under the stage).
2. **The haiku.** A note on the theatre stage is a haiku naming five stone lanterns at the shrine in an order. Light
   them in that order with the charms placed.
3. **The bell.** Ring the shrine bell during the relay defense. The horde surges - survive it.
4. **The bloom.** The sacred tree wakes and the map transforms for the rest of the run:
   - the sky turns to a **blood-red moon**; every cherry tree on the map **flares crimson and gold**;
   - petals pour through the air; the canal **glows**; lanterns light along it by themselves;
   - the infected stop for a breath and **bow** to the tree, then come on harder;
   - the **ghost train** pulls into Sakuragi Station's lowest platform, a platform that was never there.
5. **Kisaragi Station.** Ride it to **Kisaragi**, the station from the 2004 internet legend that is on no map: an empty,
   silent country platform under a red sky, endless fields of cherry trees, a single lit waiting room. The tree's
   spirit speaks here. Inside:
   - **Hanafubuki** ("blossom blizzard"): a rotary petal cannon fed from a 300-round belt; the fastest-firing gun in
     the game; every round leaves a petal trail. Reloading means venting the overheated barrels: **about 6 seconds**,
     with a long hiss of steam and petals. Hold the line, then pray.
   - **Raijin's Drum**: a thunder gun built like a taiko drum. Each shot is a **booming shockwave** that flings every
     infected in a wide cone off their feet and arcs **chain lightning** to the ones behind. Two shots per drum, a slow
     re-tuning reload, and a short charge-up you can hear.
   - **The Blossom Altar**: upgrades for any gun (the Asylum's Pack-a-Punch rules, in sakura gold) and two blessings
     (perks): faster squad revives, and petals that heal you a little on every kill.
   - The ghost train brings you back to Sakuragi.

## Phase 7 - the story, unlocked by the Easter egg

Once you have done the Easter egg once, new missions appear on the title screen for this map (hidden before; your
account remembers). **The same story solo or in co-op**: the girls fill missing players.

1. **"The Crimson Curtain"** - down through the theatre's under-stage lab: what Kurenai Biotech did to the tree, the
   graft in its sealed case, and a fight with Sayo's understudy. The Court tries to stop you.
2. **"Last Train"** - the escape by rail instead of helicopter: clear the line from the freight yard through the metro
   tunnels to the station while the Court hunts you through the tunnels.
3. **"Hanami"** - the finale at night: carry the graft back through the whole district to the sacred tree. Sayo's last
   appearance; restoring the tree ends the outbreak in Sakuragi. Cutscene: the trees shed their blossoms all at once,
   the infected lie down under them, and dawn comes up over a quiet district.

## Realistic assets: how

- **Realistic materials** (photo-based PBR textures: concrete, asphalt, tile, wood, rusted metal, moss, bark - free CC0
  sets exist, e.g. Poly Haven and ambientCG) on the buildings we build. The biggest visual win for the smallest cost.
- **Realistic props** (vending machines, bikes, cars, signs) as model files where they matter most, instanced.
- **Overgrowth** as instanced vegetation (grass cards, ivy decals, moss tint on walls, roots) with distance fading.
- **Style:** stylized-realistic so the VRoid characters fit: realistic surfaces and light, slightly simplified shapes,
  warm sakura colour grading.
- **Phones:** textures at half size on Low; less grass and fewer petals.

## Suggested order

| Phase | Ships | Why here |
|---|---|---|
| 0 Block editor | the planning page, with floors | everything else is placed on it |
| 1 Floors above and below | the engine work | needed before the map's floors exist |
| 2 Bigger overgrown map + squad rules | the new map, playable | the base for the rest |
| 3 The city that tried | the look and feel | the biggest visible change |
| 5 New enemies (first four) | Commuters, Bloomed, Rooted, Kuchisake | variety, early |
| 4 Lore notes + journal | the story in place | needed by the Easter egg's clues |
| 5 New enemies (the rest) + the Court | Jorōgumo, Miko, Idol, Oni, the humans | the human AI is its own work |
| 6 Easter egg | the bloom, Kisaragi, the two wonder weapons | the big moment |
| 7 Story missions | new content | unlocked by 6 |

Realistic materials can land alongside any phase.

## What you can make in VRoid meanwhile

The models in "Every character is a VRoid model". The first four enemies need **commuters (male and female)**,
**bloomed** and **kuchisake**; the squad and the Empress are the most-seen faces. Each file goes in `public/anime/`.

## Inspiration (sources)

- *I Am a Hero* (Kengo Hanazawa): infected who repeat their former routines -
  https://en.wikipedia.org/wiki/I_Am_a_Hero, https://horrordelite.art/en/i-am-a-hero/
- Kisaragi Station, the 2004 2channel urban legend - https://en.wikipedia.org/wiki/Kisaragi_Station,
  https://nippon.com/en/japan-topics/g00789/japanese-urban-legends-from-the-slit-mouthed-woman-to-kisaragi-station.html
- Yōkai: kuchisake-onna and jorōgumo - https://www.thecollector.com/terrifying-japanese-yokai-supernatural-creatures/
- Overgrown ruined cities: *Girls' Last Tour*, *The Last of Us* - https://en.wikipedia.org/wiki/Girls%27_Last_Tour
