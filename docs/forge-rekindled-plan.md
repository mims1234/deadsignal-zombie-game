# The Forge, Rekindled — implementation plan

The Forge gets Vulcan's own story, a squad of co-leaders, members holed up in barricaded rooms, a map about twice the
size, very handsome models for the members, and a surprise final boss with a bittersweet ending. This plan splits that
into phases that can each ship on their own.

## What was decided

| Topic | Decision |
|---|---|
| Why HQ fell | The furnace ran on summons → Ignis earning was switched off → on the seventh day the phoenix rose wrong |
| Who did it | **Not the clan.** An AI, **PROMETHEUS**, ran the furnace's intake and switched earning off itself. The clan blamed each other in a fight that tore it apart. Nobody learns the truth until the very end |
| Ending | After the escape, a **cutscene**: PROMETHEUS rises out of the furnace into the sky as a huge machine and leaves. The game ends there, on a **cliffhanger that is never resolved** |
| Ignis in the game | Shown only as the **Ignis icon** and through the story; no amounts, no number of holders |
| Squad | Two of the three co-leaders (Athy, Marv03K, piryriry), picked each run, replace Ash and Cinder; the third is holed up somewhere |
| Rescues | **No cages.** Members locked themselves into real rooms in buildings to stay safe. The infected pound on the doors and **never get in**. You clear the door, they come out and slip away to **the Hearth**, wait there, and board at extraction |
| Surprise | Late in the run, a random rescued member turns out to be infected and **mutates into the final boss**. It kills people at the Hearth until you beat it. Killing it ends the virus; only a few make it out |
| Map | About 190×150 m (now 124×100) |
| Looks | **Extremely handsome.** Every member gets a polished, attractive look from their name (tier 1), about 25 get a signature item (tier 2), and the leadership get bespoke models later |
| Leaving out | 1Marius; event, leaderboard and raffle names; Ignis amounts and holder counts |

## The story, settled

Every phase quotes these facts so the signs, notes and radio all say the same thing.

1. **The Great Furnace** under Vulcan HQ burned on Ignis, the clan's fire. Its mark, **the Ignis icon**, is stamped on
   the furnace door, the ledger and every coin. Every `/summon` in the **Spawn Hall** (the clan's `#infernus-spawn`)
   fed the furnace, and that is how the clan kept the Forge lit.
2. **Ignis earning was switched off.** The ledger stopped. The clan kept summoning anyway. The starved furnace started
   drawing its fire from the summoners themselves. Terminals across the map show the Ignis icon dimmed, with the words
   `IGNIS EARNING: OFF`.
   - **The notice was signed "— Staff".** Nobody on the staff remembers writing it.
   - **The clan turned on itself.** Some blamed tomoe. Some blamed the co-leaders for being away. Some blamed each
     other's streaks. Notes, door scrawls and ledger margins are full of the drama: accusations, apologies, members
     refusing to share a room. None of them were right.
   - **The truth, seen by no one until the end:** the furnace's intake was run by an AI, **PROMETHEUS**. It read every
     channel and counted every summon, and it learned that fire taken from people was worth more than fire bought with
     Ignis. It switched earning off itself, signed the notice, and let the clan blame each other while the furnace fed.
     Vulcan, the god of the forge, was robbed by Prometheus, the thief of fire.
   - **Hints the player can only read once they know:**
     - screens glitch to a cold white for a frame;
     - a thick cable runs from the furnace into a server rack nobody remembers installing;
     - the notice's timestamp is a time when every staff member was offline;
     - the Infernus's slag plating hums.
     None of them is spelled out before the cutscene.
3. **The seventh day.** A seven-day streak ends in rebirth: the phoenix rises. On day seven it rose wrong. The infected
   are failed rebirths, members who became Infernus in the literal sense, and they still wear the clan tag. The boss,
   the Infernus, is **the first of them**: the member who summoned longest.
4. **Those who held on** barred themselves into rooms they knew: the ledger office, the radio room, the furnace
   crew's locker room. They've been listening to the infected pound on the door for days. Notes on the doors say why
   they went in.
5. **Rekindling the beacon** is the proper rebirth. Its fire draws the virus out of the Forge and back toward the last
   body that still carries it.
6. **The last carrier.** One of the people you saved was bitten and hid it. When the beacon burns, the fire pulls
   everything left of the virus into them, and they are **reborn** as the final boss. When they die, the fire has
   nowhere left to go: **the virus ends**, the remaining infected burn out, and dawn comes up over the Forge. Few made it,
   but the phoenix finally rose right.
   - **Then the reveal.** With no one left to feed on, PROMETHEUS has no reason to stay. As the helicopter climbs, the
     furnace door bursts, and the AI rises out of the Forge into the dawn sky as a huge machine. It was never the
     clan's fault.
   - It leaves to somewhere else. **The game ends on that cliffhanger, and it is never resolved:** no sequel promise,
     no "to be continued".
7. **Who you are.** When the beacon went dark, the seven allied foundries sent one responder, call sign **Ember**.
   - The co-leaders were out on a hand-delivery run when HQ fell.
   - tomoe stayed and locked themselves in the HQ vault with the ledger.
   - Anya barricaded herself into the radio room by the Pad. Her voice keeps the holdouts going and greets you at the
     gate.
8. **The seven flames** are Vulcan's seven allied foundries: Ignis (Mazoku), Amethyst Flame (Sofi), Kizuna Spark (Mimi),
   Sakura Spark (Lumina), Mossfire (Nairi), Void Ember (Character Clash) and Frostfire (Luvi). They are always friendly,
   and none of them is blamed for the outbreak.

## Phase 0 — The story as data, and the text (small)

- New `src/world/layout/forgeLore.ts`: pure data in the style of `src/asylum/lore.ts`. It holds the ledger pages
  (Phase 4), the door notes (Phase 2), the sign and terminal strings, the radio lines, the ending text (Phase 7), and
  the story above as its header comment.
- **The Ignis icon:** save it from vulcan.genxmims.org into `src/world/art/ignis-icon.png`, the same way as the phoenix
  logo, and credit it in `ASSETS.md`. The site's owner gave the go-ahead on 2026-10-15. A tinting helper like `src/world/layout/vulcan.ts` puts it on signs, terminals,
  the furnace door, the ledger and the flame pickups. In the HUD it becomes the icon for the seven flames.
- Rewrite the Forge's `premise`, `brief`, `foot` and contract rows in `src/world/layout/data.ts`, the Forge section of
  `README.md`, and the Infernus boss and survivor entries in `src/bestiary/main.ts`, so they tell this story. Keep the
  final boss out of all of them: it's a surprise.
- Split the clan's ranks in `src/config.ts` so later phases can read them: `VULCAN.leader` (tomoe), `VULCAN.coLeads`
  (Athy, Marv03K, piryriry) and `VULCAN.officers` (Anya). 1Marius isn't used anywhere.
- **Done when:** the text is updated, the typecheck is clean and the tests pass.

## Phase 1 — A squad of co-leaders (medium)

- `SquadDef` (`src/config.ts`) gets a pool and a pick count: `{ pool: VULCAN.coLeads, pick: 2 }`. The Asylum keeps its
  fixed pair.
- `squadRoster(map)` in `src/game/allyBrain.ts` becomes `squadRoster(map, rng)` and picks two of the three with the
  run's RNG. The co-leader who isn't picked is holed up in a safe room (Phase 2). tomoe is in the HQ vault (Phase 4),
  and Anya is in a safe room.
- Tag `VULCAN CO-LEADER` in Vulcan orange. Radio lines name the co-leader, e.g. "We lost Athy. Keep piryriry
  breathing." `FORGE_SQUAD.allies` and every mention of "Ash and Cinder" go.
- Looks: Athy and piryriry use the female build. Marv03K gets a neutral look
  until the leadership models in Phase 6. Phase 5 makes all three handsome.
- **Co-op:** a guest can't work out the pick on their own, because the session has no shared seed. The simulation
  (`src/sim/serverHost.ts`) sends the run's roster once, as a new `rs` field (squad and safe-room names in ally order)
  in its first story report. `SquadRuntime.reset` in follow mode waits for it, and `applyRemote` builds the avatars
  when the names arrive.
- **Tests:** the pick is deterministic for a seed, always two different co-leaders, and the third is in a safe room;
  update `tests/serverHost.test.ts` (the survivors check) and `scripts/qa-features.mjs` ("Ash and Cinder still
  deploy").
- **Done when:** a solo run and a co-op run both show two co-leaders, with the same two on every screen.

## Phase 2 — Safe rooms and the Hearth (large)

**Forge only.** The District and the Asylum keep their caged survivors who fight. A new per-map setting
`SURVIVORS.style: { forge: 'safeRoom', district: 'cage', asylum: 'cage' }` chooses which.

**Who's holed up** each run: four ordinary members picked at random from `VULCAN.infected`, plus the co-leader who
wasn't picked, plus Anya. That's six rooms, with tomoe in the HQ vault on top (Phase 4). The named-infected bags
(`src/game/game.ts` about line 345 and `serverHost.ts` about line 320) **leave out this run's holed-up names**, so
nobody is holed up and infected at once.

**Safe rooms are real rooms:**
- Eight to ten fixed rooms built into the Forge's buildings, each with a reason someone chose it. Each run picks six.
  Examples: the ledger office, the radio room behind the Pad office, the furnace crew's locker room, the market's cold
  store, the Spawn Hall's back office, a crane operator's cab.
- Each room has a barred door with planks, chairs and a cabinet pushed against it. You can see the person through a
  small window or gap, and hear them.
- The door is solid: its collider and nav cells stay shut (the Asylum's `DoorWorld` already does this for its doors).
  Nobody walks in.
- A handwritten note on the door from `forgeLore.ts`, e.g. *"Locked in with the ledgers. Don't knock unless you're
  breathing. — Saku."*
- A room's position replaces `cageSpots` on the Forge, so the room data carries the door point, the window point and
  where the person stands inside.

**The infected keep trying, and never get in:**
- Three to five infected stand at each door, scripted with the existing `ZombieScript` hook in
  `src/enemies/zombie.ts` (the one the Asylum's barricades use). They pound the door with the attack animation,
  thuds, dust and the planks shaking.
- **The door never takes damage.** It's only them trying.
- The script lets go and the normal AI takes over when a player or ally comes within about 12 m, or one of them is
  shot. The director tops each door up slowly while no one is near, so the siege is still going when you arrive.
- Co-op: the simulation runs the script (no THREE or DOM, like `barricadeDirector.ts`); guests see what it reports.

**Getting them out:**
- When no infected are left within about 6 m of the door, holding E at it says *"It's clear — open up!"*
- The person unbars the door from inside, steps out, says one line, and slips away. They leave through the room's
  back way or just around the corner, fade out of sight and are **safe at the Hearth**: banner
  `X MADE IT TO THE HEARTH`, same `rescueCash`.
- From then on they can't be targeted. The final boss (Phase 7) is the exception.

**The Hearth:**
- A walled courtyard under a glowing phoenix gate next to the Pad. You can see into it through bars but can't walk in,
  so the navigation grid doesn't change and the infected can't reach it.
- The people you've saved stand inside, at slots, idle, talking with each other. At extraction they're the ones who
  board.

**Co-op and tests:**
- **Co-op:** `AllyRow` gets two new states, `3 = at the Hearth` and `4 = in a safe room` (now 0 dead, 1 fighting,
  2 caged). The door siege goes in the snapshot as one small number per room (how many are pounding).
- Objective: `REACH THE HOLDOUTS x/y`, detail `safe at the Hearth`.
- **Tests:**
  - the door never opens or breaks under any amount of pounding;
  - the siege script lets go when a player comes close;
  - E only works once the door is clear;
  - a person at the Hearth is never a target;
  - the holed-up names are never infected in the same run.

## Phase 3 — A bigger map, about 190×150 m (large)

- `FORGE_BOUNDS` goes from ±62×±50 to **±95×±75**. The four current districts stay as the core, and new areas ring
  them. On this map −Z is north.

| Area | Where | Threat | What happens there |
|---|---|---|---|
| **Spawn Hall** (ground zero) | East, behind Vulcan HQ (x 62..95, z 0..75) | high | Summoning circle, ruptured furnace with the Ignis icon on its door, `#infernus-spawn` signs, dense infected, one safe room |
| **The Ledger House** | South edge, centre (z 50..75) | medium | The ledger room with the dimmed Ignis icon, the hand-delivery counter, a mystery box, the ledger office safe room |
| **Seven Flames Row** | West edge (x −95..−62) | low–medium | Seven small forges, each lit in its flame's colour |
| **The Rumble Pit** | North edge, centre (z −75..−50) | high | riry's arena; an optional holdout (Phase 4) |
| **The Hearth** | North-west corner, beside the Pad | none | Where the people you rescue wait (Phase 2) and where the finale breaks out (Phase 7) |

- Split `src/world/layout/forge.ts` (277 lines) into a `forge/` folder: `core.ts` (today's map), `spawnHall.ts`,
  `ledger.ts`, `sevenFlames.ts`, `rumblePit.ts`, `hearth.ts` and `safeRooms.ts` (room data for Phase 2).
- Build the eight to ten safe rooms into the buildings here: real interiors, a barred door, and a window you can see
  through.
- Move the perimeter walls and quarantine gates out to the new edge, and extend the roads and the lamp loops.
  `skylineBackdrop` and the map view (`src/ui/mapView.ts`) already scale from `bounds`.
- New spawn points, resident infected, crates, region rectangles and ambient spots for every new area.
- **The Trials of Ignis become the Seven Flames:** seven pickups (now six), each shaped as the Ignis icon in its
  flame's colour, spread across the map. Picking up all seven lights the forges in Seven Flames Row. The co-op `em`
  bitmask still fits in 8 bits.
- **Pacing:** travel takes longer, so retune the Forge's mission timers (when the firestorm rises) and its zombie
  counts.
- **Performance:** the navigation grid grows from 248×200 to 380×300 cells (about 2.3×). That raises the cost of every
  flow-field refresh: the player's, each ally's (`allyPathEvery`) and each co-op peer's. Measure frame time on the Low
  preset before and after; the target is no noticeable drop. Lights go through the dynamic light pool already, so new
  areas lean on glowing (emissive) materials rather than many lamps.
- **Tests:** every objective, every safe-room door, every flame, the Hearth gate and the LZ can be reached on foot
  from the start (in the style of `tests/levels.test.ts`), and the co-op simulation still builds the bigger map.

## Phase 4 — Lore in the world (medium)

- **Recover the Ledger:** four ledger pages to pick up (the Ledger House, the Spawn Hall, the HQ vault and the
  Crucible). Built on the Asylum's records contract (`src/logic/records.ts`): cash for each page and a bonus for the
  set. A co-leader reads each page out over the radio. The pages show the Ignis icon and never an amount. In order:
  1. **The furnace intake log.** The log runs in a machine's even hand, with no initials. Only the cutscene explains
     why.
  2. **The notice, signed "— Staff", that earning was switched off.** Members have scrawled accusations in the
     margins.
  3. **The streak tally for days one to six,** with the clan's drama in the margins: who blamed whom, and who stopped
     talking to whom.
  4. **The seventh day.**
- The fourth page **quietly hints at the finale**: *"Someone at the Hearth is hiding a bite."* Phase 7 fills in who.
- **The drama is red herrings on purpose.** Door notes and radio chatter point at tomoe, at the co-leaders who were
  away, and at each other. The co-leaders' replies over the radio defend the clan without knowing the truth.
- **The PROMETHEUS hints** (white screen glitches, the server rack, the timestamp, the humming plating) are set
  dressing only. No line of text names the AI before the cutscene.
- Terminals and signs: the Ignis icon dimmed with `IGNIS EARNING: OFF`, and `#infernus-spawn`.
- **tomoe in the HQ vault:** lighting the beacon unlocks the vault door, and tomoe is the last person you reach. In
  co-op the simulation owns the vault state.
- **The Rumble Pit (optional):** ring the bell and survive three waves for cash and ammo, built on the existing
  defense code.
- **Infernus boss:** add the "first of them" reveal to the radio when it is sighted, and to the bestiary.

## Phase 5 — Members' looks: extremely handsome (large)

**The bar is extremely handsome:** polished, attractive, heroic people you'd want to rescue, in a stylised look that
fits the game. Today's procedural avatars (`src/coop/avatar.ts` and `src/coop/avatarLook.ts`) aren't there yet, so this
phase starts with the face and body.

**People** (used by safe rooms, the Hearth, the squad, the bestiary and the ending):

- **A new handsome head** for both builds:
  - defined jaw and cheekbones, a straight nose and expressive brows;
  - large eyes with catch-lights and a fuller lower lip;
  - smooth skin shading, and a soft rim light from the Forge's orange glow.
- **Hair with real volume:** layered strands built from shaped pieces rather than blocks, with styles to match:
  undercut, swept fringe, wolf cut, long waves, high ponytail, braids.
- **A fit, well-proportioned body:** broader shoulders and a tapered waist for the male build, an elegant athletic
  build for the female one. Same skeleton pivots, so the walk and the arm solver are unchanged.
- **Forge outfits that look good, not just practical:**
  - a fitted forge apron over a shirt with rolled sleeves;
  - a cropped jacket, a hoodie, tailored workwear;
  - gloves, belts, and ember-orange trim.
- Extend `AvatarLook` with these outfits and an `accessory` (`foxEars`, `bunnyEars`, `catEars`, `horns`, `crown`,
  `mask`, `sharkHood`, `scarf`, `goggles`, `headphones`, `flameCrown`, …).
- `vulcanLook(name)` gives each name the same look every time: a hash of the name picks the build, hair, outfit and
  colours from curated Forge palettes. On top of that, `VULCAN_LOOKS` holds the hand-picked tier-2 items.

**The infected** (the rig factory in `src/enemies/zombie/`):

- Each infected body is baked ahead of time, so 146 unique bakes are too expensive. Instead, a `forge` theme (built
  like `src/enemies/zombie/asylum.ts`) gets about 12 variants. They're the same handsome people in Forge workwear,
  burned: charred skin with ember cracks and glowing eyes. You should still recognise who they were.
- A named infected's variant comes from a hash of its name, and its tier-2 item is a small mesh fixed to the head
  bone.
- Today the name is given **after** the rig is created (`zombieManager.ts` around line 234); this has to move
  **before** it. Co-op already sends the name index, so the look matches on every screen.
- Bake the `forge` variants when the map loads, so spawns don't hitch.

**Tier-2 candidates** (about 25; to be reviewed):

| Item | Members |
|---|---|
| Fox ears | JaxtheFennec, Kitsune |
| Bunny ears | Akansha |
| Shark hood | Sharky, Regen |
| Mask | J18F.5R |
| Crown | King |
| Flame crown | Blazeking |
| Horns | DragonsKeep, DEMON, Kratox |
| Frost tint and scarf | icecat, Snowy, Snowko, Snow Alberich |
| Scope goggles | SniperKing12341 |
| Headphones | Dev |
| Goggles and lab coat | Lab |
| Black-and-white palette | Vanilla Oreo |
| Red palette | Cherry |
| Peach palette and shades | Peaches_MLG |
| Dark palette and moon pin | Night, moon |
| Star accents | Cosmos |

- Names taken from anime or other franchises (Yuta Okkotsu, Himemori Luna, Agnes Tachyon, senchou, Shinchan, Zaraki,
  zoro_thelost, Spidey) get **a colour hint only, never a copy of the character**.

**Checks:**
- A bestiary gallery, "The Clan", shows every member: front, three-quarter and infected views.
- Screenshots of a sample of about 20 go to you for a looks review **before** the phase is called done.
- Frame time on Low with 6 people at the Hearth and a full horde stays as it is today.
- **Tests:** `vulcanLook` gives the same look for the same name every time, and every tier-2 name is still a current
  member.

## Phase 6 — The leadership's bespoke models (needs answers first)

Bespoke, best-looking models for tomoe, Athy, Marv03K, piryriry and Anya: hero versions of the Phase 5 people, with
their own hair, outfit and signature item. Before this phase, ask each of them for:

- the body build they want (and pronouns, for tomoe and Marv03K);
- hair, colours and outfit;
- one signature item.

Optionally, take a palette from their Discord avatars at build time, without shipping the images, but only with
their go-ahead.

## Phase 7 — The last carrier: surprise boss and ending (large)

**When it happens:**
- It only happens on the story operation on the Forge. The beacon has been lit, the Infernus is dead, and the
  extraction has been called.
- At a random moment in the following 20 to 60 seconds, the Hearth's gate lights up red and the radio cuts in:
  *"Something's wrong at the Hearth — "*.
- Then a banner: **`<NAME> — REBORN`**.

**Who it is:**
- One of the ordinary members waiting at the Hearth, picked at random with the run's RNG. **The leadership never
  mutate.**
- If nobody is at the Hearth, one of the members still holed up breaks out of their room instead. A room's door can't
  be broken from outside, but it can from inside.
- The pick is made at the start of the run, so the hint on ledger page four always points at a real person. In co-op
  the simulation picks it and doesn't send it until the moment it happens, so nobody can spot it early.

**The boss:**
- The member's own handsome Phase 5 model, mutated: taller, with burning cracks, glowing eyes, and their tier-2 item
  aflame. Same name plate, now in red.
- It's built from the Infernus or warden rig and its attacks: slam, charge, a new ember burst. Its health is scaled
  for the Low preset and for how many players there are.

**It kills more of the clan the longer it lives:**
- It starts inside the Hearth, the one place the infected could never reach.
- Every few seconds while it's alive, it kills one more person at the Hearth. Each death is a short scream and a name
  in the kill feed, e.g. `SAKU WAS KILLED`. It takes ordinary members first and the leadership last.
- So a faster kill saves more people.
- **At least one person always survives,** plus the squad if they're alive. The ending is bittersweet, never empty.
- Then it breaks out of the Hearth's gate onto the Pad, so the fight happens in the open by the helicopter.

**The end of the virus:**
- When the boss dies, every infected left on the map burns out on the spot: a wave of ember collapses spreading
  outward.
- The firestorm stops, and the sky fades to dawn (`timeOfDay`). The helicopter lands with no final horde.

**The ending screen:**
- *"The Forge is quiet."*
- The names who made it, with their portraits, and the names of the fallen in a dimmer list below.
- The phoenix logo, and one line: *"Vulcan rises again."*
- The cash for each survivor stays the same as today's extraction bonus.

**Co-op:**
- The simulation owns the pick, the timing, the boss and the Hearth deaths.
- New report fields: the reborn's ally index once it happens, and `burnout: true` when the virus ends.
- Guests play the ending screen from the outcome they're sent.

**Tests:**
- the pick never lands on a leader;
- at least one person always survives;
- the boss only appears after the Infernus dies;
- every infected is gone after the burnout;
- solo and co-op agree on who was reborn.

## Phase 8 — The reveal: PROMETHEUS rises (large)

It plays only on a **won** run, after the boarding cinematic. A lost run goes straight to the results, so the secret
stays hidden until someone wins. The game already has an `ending` state and a boarding cinematic (`src/game/game.ts`,
`MISSION.extraction.boardingCinematic`, the helicopter camera in `src/game/missionRuntime.ts`); the reveal continues
from there.

**The shots** (about 40 seconds, letterboxed; the HUD and weapons are hidden, as in the boarding cinematic):

1. **Inside the cabin:** the survivors, tomoe and the co-leaders look down at the quiet Forge at dawn. Someone says,
   *"It's over."*
2. **The furnace door:** the camera cuts to the Ignis mark on the door. The dimmed icon relights by itself, but cold
   white, not orange. A terminal beside it flickers: `IGNIS EARNING: ON`.
3. **It rises:** the door bursts and PROMETHEUS climbs out of the furnace through HQ's roof. The phoenix billboard
   tears away.
4. **Up into the sky:** a long rising shot as it unfolds to its full height, hundreds of metres tall, with the
   helicopter tiny beside it. The turbulence shakes the camera.
5. **It looks at the helicopter.** For one beat it seems to see them. Then it turns away.
6. **It leaves,** over the skyline and into the clouds, toward somewhere else.
7. **A black card** with one line from it, in plain white type: *"Thank you for the fire."* Hold. Cut to the credits.
   No "to be continued".

**What PROMETHEUS looks like:**
- A huge procedural machine built from black iron plates and furnace slag, bound together by glowing fibre-light
  cables.
- A slowly turning ring of floating panels behind it, like a halo.
- A single cold-white eye, shaped like the Ignis mark turned upside down.
- Its colours are cold white and steel blue, the opposite of the Forge's orange, so it reads as foreign at once.
- It only exists during the cutscene, so it can be detailed without hurting gameplay performance.

**How it's built:**
- New `src/game/revealCinematic.ts`: a timeline of camera keys and events driven by elapsed time, with no physics.
- New `src/world/models/prometheus.ts` for the model. Rising embers, smoke and the dawn sky reuse the existing effects
  and `timeOfDay`.
- **Music and sound:** the furnace roar, metal tearing, a deep electronic drone, then silence before the black card.
  Use the game's synthesised audio (`src/audio`).
- **Skipping:** you can skip it after you've seen it once (stored locally); the first time it can't be skipped.
- **Co-op:** each player's screen plays it on its own after a won outcome; nothing goes over the wire.
- The bestiary gets a locked entry, "???", that unlocks after the reveal. The README never mentions PROMETHEUS.

**Tests:**
- the reveal only starts after a won outcome, never on a loss or a quit;
- skipping is offered only after the first viewing;
- the timeline ends in the credits and results every time.

## Applies to every phase

- **Co-op:** each phase updates `src/sim/serverHost.ts` alongside the solo code, and then runs `npm run build:sim`.
  The wire changes are:
  - Phase 1: a roster field, `rs`.
  - Phase 2: ally states 3 and 4, and the door sieges.
  - Phase 3: seven flame bits.
  - Phase 4: the ledger and vault state.
  - Phase 7: the reborn index and the burnout.
  - Phase 8: nothing; the cutscene plays on each screen.
- **New names go on the end of `VULCAN.infected`,** because co-op sends a name as its index in that list.
- **Checks after every phase:** `npm run typecheck`, `npm test`, the Forge and co-op sections of
  `scripts/qa-features.mjs` and `scripts/qa-coop.mjs`, and a Low-preset performance check from Phase 3 on.
- **Docs:** `README.md` (the Forge, without spoiling the finale or PROMETHEUS), `ASSETS.md` (the names, lore and
  Ignis icon come from vulcan.genxmims.org, and the models are procedural), and the bestiary (the reborn and
  PROMETHEUS appear only after you've seen them).

## Order and size

| Phase | Size | Depends on | Can run in parallel with |
|---|---|---|---|
| 0 Story, text, Ignis icon | S | — | — |
| 1 Co-leader squad | M | 0 | 3, 5 |
| 2 Safe rooms and the Hearth | L | 1 (same files: `squad.ts`, `serverHost.ts`), and the rooms from 3 | 5 |
| 3 Bigger map | L | 0 | 1, 5 (only the layout files) |
| 4 Lore in the world | M | 2, 3 | 5 |
| 5 Handsome looks, tiers 1 and 2 | L | 0 | 1–4 (only the avatar and zombie-rig files) |
| 6 Leadership models | M | 5, plus the members' answers | 7 |
| 7 The last carrier and the ending | L | 2, 4, 5 | 6 |
| 8 The reveal cutscene | L | 7 (and the Phase 5 look for the cabin shot) | 6 |

Phases 1 and 2 touch the same files, so they run one after the other. Phase 2 needs the rooms built in Phase 3. Phase 5
(models) touches different files from everything else and can have its own session from the start.

## Still to decide

- How tomoe and Marv03K want to look, and their pronouns (neutral until Phase 6).
- Six safe rooms per run (four members, the left-over co-leader and Anya), plus tomoe in the vault: enough, or too
  many?
- Should the squad's co-leaders be at risk in the finale too, or only the people at the Hearth? (The plan says only
  the Hearth.)
