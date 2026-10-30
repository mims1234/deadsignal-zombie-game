# The Unmanned Station (working name KISARAGI) — build plan

A small, dense map where the night keeps repeating. The squad wakes on the last train at a rural station that is on
no map. Every wave ends with the station *resetting*, and something about it has changed. Fight the infected, find
what is wrong, put it right, and five correct loops in a row bring the dawn train. Miss one and the station gets worse
and smaller. It's a zombie map where paying attention is a second weapon.

It is a standalone story: nothing in it continues KAIKA, AURELIA, the Forge or the Asylum.

## Status

**Redesigned in v0.4.323 as "The Last Service"**: the change-spotting loop and the echo passengers are gone. Five jobs (wind the clock with the key from the tunnel, power the crossing, return five lost tickets, retie the shrine rope, make the announcement), each lighting a lamp on the board by the bell; the night takes an area whenever its 7-minute clock runs out with no job done (mist that hurts); Ren is an escort after the fifth call. See `src/mujin/jobs.ts`. The sections below describe the first design.

**Built (2026-10-30) as MUJIN**, map id `mujin`, admin only (`GATED_MAPS`). All phases are in:

- **The map** (`src/world/layout/mujin.ts`, `src/mujin/places.ts`): the station, two platforms, the footbridge, the level
  crossing, the tunnel, the field, the shopping street, the shrine and the pocket room.
- **The loop** (`src/mujin/loop.ts`, `anomalies.ts`, `director.ts`): 28 changes in 5 tiers, the All Clear, the lamps,
  the night sealing areas, 20 loops at most; the clock is 55 minutes.
- **The infected** (`enemies/variants.ts`, `zombie.ts`, `anime/looks.ts`): the Tall Lady, the Rail Crawler, the White
  Shape, the Bench Sitter, the Stationmaster (with the commuters from the Sakura District).
- **The ending**: no helicopter. The dawn train (`src/mujin/train.ts`) comes after the Stationmaster, a through express
  first; the doors close on whoever is not aboard.
- **Story and the egg** (`journal.ts`, `runtime.ts`): Ren's 15-post thread in the pause menu's JOURNAL, the payphone,
  The Passenger ending.
- **Voice and sound** (`lines.ts`, `sound.ts`, `scripts/mujin-audio.mjs`): 98 generated lines, 7 Lyria cues,
  synthesised effects.
- **Co-op**: the simulation runs the loop (`sim/serverHost.ts`, `mj` on the wire).
- **Tests**: `tests/mujin.test.ts`.

Not done: Ren and the Stationmaster wear stand-in VRoid models from the cast (`src/mujin/cast.ts`, `ANIME_CAST.kinds`).

---

## First: the name clash

The Sakura District already uses **Kisaragi**: its hidden area after the Thousand Lanterns is *Kisaragi Station*
(`src/world/layout/sakura/kisaragi.ts`, `src/sakura/runtime.ts`), its shrine keeper is *Aoi Kisaragi*, it has a
story mission called *Last Train*, and it has a ghost train. A new map called KISARAGI would collide with all of that.

| Option | What it means |
|---|---|
| **A. Rename (recommended)** | Map **MUJIN** (無人駅, "unmanned station"), map id `mujin`. The station's sign is a name nobody can read. Fully standalone, no lore tie. |
| B. Keep KISARAGI as a Sakura spin-off | The new map *is* the Sakura's Kisaragi Station, opened up into a full map with Aoi's story behind it. Breaks the "every new map stands alone" rule set for AURELIA. |
| C. Another name | e.g. **YŪGURE** (dusk), **SHŪTEN** (the last stop). |

The rest of this plan uses **MUJIN** and `mujin`. Swapping the name is a find-and-replace.

---

## What is decided (defaults, all open to change)

| Topic | Decision |
|---|---|
| Size | **About 96 × 64 m.** Small on purpose (the District is 176 × 104): every corner is seen every loop, so changes can be spotted |
| Shape | One station and its surroundings: two platforms and a footbridge, the ticket hall, the waiting room, a level crossing, the tunnel mouth, a grass field, a shuttered shopping street, a shrine on a hill |
| Run | **Loops**, not open waves: each loop is about 90-150 s of fighting, then the *bell* |
| Win | Five correct loops in a row → the dawn train comes → board it (the extraction, with a train in place of the bird) |
| Lose | Everyone down, or the station shrinks to nothing (three wrong reads with no correct one between them), or the loop limit (12) runs out |
| Your side | The player(s) only. No AI teammates: the station is lonelier that way. Co-op up to 4 |
| Characters | **VRoid** like the Sakura District (the commuter models exist already); a Tall Lady and a Stationmaster are new |
| Look | Late summer night, a single sodium lamp over each platform, crickets, a deep blue sky that never gets lighter until the end |
| Voice | **Fully voiced**, the Excalibur way: the station PA (Japanese then English), the Stationmaster, Ren, whispered hints, the commuters and the squad's barks; its own Lyria score; synthesised effects (see *Voice and sound*) |
| Phones | Nothing new in the middle. The count of correct loops is shown **in the world** (lamps on the platform canopy); one top-edge line for the loop and the bell |
| Leaderboards | Its own board per difficulty: time to dawn, fewest loops, kills |
| Access | Admin only while it's built; later a guest-free map candidate (it's short and teaches itself) |

---

## The story, settled

Every note, phone call and line of radio quotes these facts so they agree.

1. **Before.** The *Kurose Line* was a rural branch line. Between two of its stops was a small unmanned station that
   served a village in the hills. In a typhoon long ago, the tunnel next to it fell in on the last train of the night.
   The line was rerouted, the station was taken off the maps and the timetables, and the village moved away. Its old
   stationmaster refused to leave; nobody knows when he died.
2. **The night of the outbreak.** The city falls in an evening. The last train out is full of people who got on
   before anyone knew. The squad falls asleep in the last car. The train goes into a tunnel and comes out at the
   station that is not there.
3. **The thread.** One passenger, **Ren**, a university student, posted from the waiting room on the first night
   until her battery died: *"there's a station here that isn't on any map"*, *"the man in the cap says the train comes
   at dawn"*, *"there was one more person on the bench than before"*. Her posts are the map's journal, found loop by
   loop.
4. **The truth.** The station holds the three minutes before dawn and won't let them pass. The Stationmaster still
   keeps it the way it was the night of the collapse, and he will not send the dawn train until the station is in
   order. **Every change you find is something out of place; putting it right is doing his job for him.** That's why
   five correct loops open the way out.
5. **The commuters** on the platforms are the passengers of that old last train, and of every last train since. They
   still tap their tickets at the gate, still check their phones, still queue at the yellow line. They are infected
   the way everything here is: they keep doing what they did, and they turn on whoever breaks the pattern.
6. **The secret (the Easter egg).** Ren never left. She is one of the changes: some loops she is on the platform and
   the station counts her as *out of place*. Get her onto the dawn train instead of putting her "right", and the
   station lets go of everyone.

---

## The loop (the heart of the map)

### One loop
1. **Reset.** The screen cuts to white for two frames; the level-crossing bell rings once; the station is back at
   its start state *plus or minus one change* (sometimes none).
2. **The fight.** Infected come in from the tunnel, the field and the shopping street (the director as usual, scaled
   to the loop number).
3. **The bell.** After the loop's time, the platform bell starts ringing for 20 s. Before it stops, the squad must
   do one of two things:
   - **Put it right:** find the change and shoot it or touch it (each change says which; most accept either).
   - **Ring the All Clear:** pull the handle under the platform bell, saying *there was nothing wrong*.
4. **The read.** Correct (fixed a real change, or rang All Clear when there was none) → a canopy lamp lights,
   the next loop is calmer, and a page of Ren's thread drops. Wrong (rang All Clear when there was a change, or "fixed"
   something that wasn't one, or did nothing) → all canopy lamps go out, and **the station shrinks**.

About a third of the loops have no change. That keeps the All Clear an actual choice.

### The shrink
On a wrong read, fog walls in one area for the rest of the run (the shopping street first, then the field, then the
shrine hill). Fewer places to run, the same number of infected. Three shrinks with no correct read between them and
the night swallows the station: defeat. A correct read *does not* give back a lost area; it only stops the next one.

### Counting
- **Canopy lamps:** five lamps under the platform roof, lit one per correct read in a row. That's the counter, seen
  in the world, readable on a phone.
- **Top line:** `LOOP 4  ·  BELL 0:18`, one line along the top edge.
- **Loop limit:** 12. After loop 12, the dawn train comes anyway, but the platform is full and the Stationmaster is
  there.

### Co-op
- Any player can fix a change or ring the All Clear; **the first action counts for everyone**. That's the tension:
  one confident player can sink the squad.
- A **ping** (the existing ping, or a long-press on phone) marks a suspected change for the squad without committing.
- The server owns the loop: which change, the read, the shrink. Clients only show it.

### The changes (anomalies)
About 40 at launch, written as data (`src/mujin/anomalies.ts`): `{ id, tier, area, kind, fix, needsLoop }`.
Tiers unlock with the loop number so the first loops are easy.

| Tier | Examples |
|---|---|
| **1 · plain to see** | The station clock runs backwards. A vending machine is lit when it never is. The poster in the hall has a face looking at you. The timetable shows one more train. The tunnel mouth has a light inside. |
| **2 · look closer** | One more person on the waiting-room bench. The sign's letters are in a different order. The umbrella in the stand is red, not black. A shop shutter on the street is half up. The shrine's rope is tied the other way. A footprint trail in the dust leads *into* a wall. |
| **3 · sound** | The level-crossing bell rings without the barrier coming down. The vending machine hums a melody. The station's announcement says a different stop. A phone rings in the lost-property box. |
| **4 · behaviour** | The commuters at the gate tap in the wrong direction. A row on the platform is facing the tracks, not the doors. The commuters stand still when you look at them and move when you don't. An infected on the footbridge waves. |
| **5 · you** | Your own reflection in the waiting-room window is a beat late. A body on the platform wears what one of the squad wears (in co-op: a teammate's colours). The map shows the station's name. |

Rules: a change must be visible or audible from somewhere a player naturally passes; never more than one per loop;
never the same one twice in a run; tier-5 only after loop 6.

---

## The infected

All original takes on the net-age legends; VRoid models, tinted and kitted by `KIND_LOOKS`.

| Kind | What it does | Why it's here |
|---|---|---|
| **Commuters** (the horde) | Stand in rows doing their old routine: tapping tickets, queueing, looking at phones. Passive until disturbed; bump, shoot or shine a light on one and the whole row turns. | The passengers of every last train. Teaches stealth and "don't break the pattern". Reuses the Sakura commuter models and their habit idles. |
| **The Tall Lady** | Heard first: a slow *po… po… po*. Walks over walls and the footbridge roof, 2.4 m tall in a white summer dress and hat. Whoever she *hears* (shooting near her, sprinting) is **marked**: a soft ring at the screen edges and on their outline for teammates. A marked player is her target until they reach the salt line at the shrine and stand in it for 3 s. | Turns noise into a resource; forces a squad to split up for a moment. |
| **Rail Crawler** | A half-body that drags itself on its arms along the rails and platforms, very fast in straight lines, slow round corners, under the platform edge between bursts. | Teaches breaking line of sight; owns the tracks. |
| **The White Shape** | In the grass field only: a white figure wriggling far off. Look straight at it for more than 2 s and your view warps and your aim drifts (stacking); it never comes closer. Kill it without looking: shoot from the minimap ping, from a teammate's call, or with your back half turned (it's near the edge of your view). | A puzzle enemy; makes the field a place you choose to enter. |
| **The Bench Sitter** | Sits on the waiting-room bench among the commuters. Not every loop. If you sit (interact) on the bench next to it, it tells you where the change is this loop; if you shoot it, every commuter in the station turns. | A risky hint giver. |
| **The Stationmaster** (boss) | See below. | |

Live cap as on every map (24, 12 on phones); a small map needs fewer.

---

## The Stationmaster (boss)

- Appears from **loop 6**, walking the platform with a ticket punch and a lamp. He doesn't attack the infected;
  they make way for him.
- **The punch:** if he gets close he punches a player's ticket. That player is **sent one loop back**: into a pocket
  copy of the waiting room (built beside the map like the Sakura's Kisaragi area, `worldBounds`), alone with three
  commuters and the change from last loop still in place. Fix it or fight through the door to come back. Teammates
  see their body sit down on the bench, asleep, and can guard it.
- **He can't die until the station is in order.** With fewer than five lamps lit he only staggers. At five lamps
  the dawn train is called and he steps in front of the train door, and *now* he can be put down.
- Solo: the punch sends you back too; the pocket is short and the main station waits for you.

## The dawn train (extraction)

Uses the existing extraction phases (`called → inbound → landing → landed → boarding → extracted`) with a train in
place of the helicopter:
- The level-crossing barriers come down, the bells ring, the tunnel lights up, and the sky finally gets lighter.
- First a **through express** goes past at full speed without stopping: every window full of faces, the platform
  shaking, papers flying. (A set piece; reuse the Sakura ghost-train code.)
- Then the real train pulls in, doors open, and the platform fills with every commuter in the station. Fight onto it.
  The doors close after 30 s.

---

## Story without blocking the screen

- **Ren's thread** is the journal (pause menu, like the Sakura's JOURNAL): 15 posts, one per correct read plus
  some found as notes (a sticky note on the vending machine, a phone in the lost property). Kept between runs.
- **The payphone** in the ticket hall rings once per loop. Answer it (interact) and you hear 5-10 s of a voice:
  a station announcement from the night of the collapse, Ren, or the Stationmaster. Generated voices
  (ElevenLabs, see the generated audio pipeline).
- **The squad's lines** are a few short barks only (the change found, the bell, marked), written for "the squad" so
  solo and co-op both work.
- **Title-screen text** in `MAP_TEXT.mujin`: the brief, the premise and the rows (`LOOP`, `THE STATIONMASTER`, `DAWN`).

## The Easter egg: "The Passenger"

1. Answer the payphone on five different loops in one run. The fifth call is Ren, live: *"I'm on the platform. You
   keep walking past me."*
2. From then on, one loop in three, she stands on the far platform as **the change**. Put her right (shoot her or touch
   her), and the read counts as correct, and she is gone for good.
3. **Instead,** walk her across the footbridge to the waiting room (she follows you) and leave the change "unfixed".
   The read counts as wrong, the station shrinks, but the Stationmaster stops on the platform and takes off his cap.
4. At dawn, get Ren onto the train. The ending changes: the train comes out of the tunnel into a real morning, the
   commuters are gone from the platform, and the station sign finally reads a name. Ren's last post is in the journal.
   A one-time reward (a calling card or skin: *the ticket*), and an achievement for the leaderboard profile.

---

## Engine work

| Need | How | Reuse |
|---|---|---|
| **The map** | `src/world/layout/mujin.ts`: the station, the footbridge and the shrine steps on the floors engine | `floors.ts`, `storeys.ts`, the Sakura station pieces, the Aurelia stair pieces |
| **States** | Every change is built at load and hidden; a loop shows or hides it. Swaps of materials (sign, poster, clock) are texture swaps | `jpSignMaterial`, the instanced props |
| **The shrink** | A fog wall + a blocker per area, switched on for the rest of the run; nav marks the area closed | the Asylum's buyable doors (dynamic blockers), the AURELIA black bloom's fog |
| **The loop director** | `src/mujin/loop.ts`: pure logic (picks the change, judges the read, the shrink, the lamps), shared by the solo game and the server sim | the Forge's pure brains, `serverHost.ts` |
| **Mission text and phases** | The loop count and the Stationmaster map onto the mission's defense / hunt / extract (`MapText`), so the HUD, results and leaderboards keep working | `missionRuntime.ts` |
| **Gaze** (the White Shape, the "looking" commuters) | Angle between the player's view and the target; co-op sends pitch with yaw if it doesn't already | the camera, the co-op input |
| **Marked** | A flag on a player, edge tint on their screen, an outline for teammates | the existing outline / tint |
| **Pocket room** | The waiting-room copy beside the map, a teleport in and out | the Sakura Kisaragi area, `worldBounds` |
| **The train** | The extraction with a train model and its own arrival | the ghost train, the extraction phases |

## Voice and sound (made the Excalibur way)

This is the first map that is **fully voiced**. It's built the way Excalibur was (`src/freeroam/audio.ts`): its own
score and voices generated for it, every effect synthesised in Web Audio, everything loaded before the first loop,
and every line timed to the game's clock.

### Who speaks

| Voice | Where you hear it | Lines | Direction |
|---|---|---|---|
| **The station PA** | Ceiling speakers on both platforms and in the hall: arrivals that never come, the stop's name (garbled), "please stand behind the yellow line", the bell, and the dawn train. **Japanese first, English after**, like a real station, captioned. | ~25 | A calm woman's recorded voice, a little too slow. Some loops she says something she shouldn't (an anomaly). |
| **The Stationmaster** | His own announcements on the PA, close up when he walks the platform, and as the boss. | ~20 | An old man, formal and kind at first ("tickets, please"); at five lamps, cold and very close. |
| **Ren** | The payphone calls, the five Easter-egg calls, her last post in the ending. | ~20 | A tired, frightened university student whispering into a phone, keeping her battery alive; on the last call she is right there on the platform. |
| **The Bench Sitter** | Whispered hints if you sit beside it ("the clock", "count the umbrellas"). | ~12 | Barely voiced; the hint is in the words, not the subtitle. |
| **The Tall Lady** | *po… po… po*, from far off, then close. | 4 takes | A woman's low hum, processed (see below). Never words. |
| **The commuters** | Murmurs, half phone calls ("yes… I'm on the train…"), a sigh, and the scream of a whole row turning. | ~20 fragments | Reused in many mixes so a crowd sounds like people. |
| **The squad** | Short barks: a change spotted, All Clear, marked, punched, a wrong read, the train. Male and female sets, matched to the avatar each player wears. | ~25 per set | Written for "the squad" so solo and co-op both work. |

About **150 lines** in all.

### How they're made
- **ElevenLabs v4** with `[direction]` tags for the PA, the Stationmaster, Ren and the squad; **Fish Audio Drama 3**
  for the whispers and the screams. Japanese lines in ElevenLabs' Japanese voices.
- **Three takes of every line**, each judged automatically (transcript matches, no tags read aloud, a 1-10 fit
  score, as for Excalibur). The best goes in. The key lines (Ren's calls, the Stationmaster's last lines, the
  ending) are auditioned by you before they ship.
- **One take, many sounds:** the processing happens at play time, not baked into the file, so the same take
  works in several places.
  - *PA:* telephone band (300-3,400 Hz), a little distortion, a long platform reverb, and a slap-back echo
    from the far platform's speaker a beat later.
  - *Payphone:* a narrower band, crackle, and short dropouts when the battery is low.
  - *The Tall Lady:* pitched down, slowed, and heard through a wide reverb when far; dry and close when she's
    over the wall above you. The giant's chain from Excalibur (pitch down, saturate, darken) is the starting point.
  - *"Behind you":* the hint whispers and the Stationmaster's last lines placed right at the listener's ear.
- **Where it comes from:** the PA, the Tall Lady, the crawler and the Stationmaster are positioned in 3D, so you
  can hear where they are and track them.
- **Mix:** a voice bus above the music; the music and the crowd dip for half a second under every line that
  matters, then come back. Never two story lines at once (a queue, as in Excalibur).
- **Captions:** one line along the top edge (phones too), the speaker's name in their colour; the full
  transcript in the journal. Captions can be turned off.

### The score (Lyria, cut to the loop)
Written as second-by-second prompts and picked from several takes by their loudness curve, then trimmed, faded and
levelled, as for Excalibur.

| Cue | Length | What it is |
|---|---|---|
| **The loop theme** | 90 s | A music box, a slightly detuned upright piano and the hum of the platform lamps. Calm, wrong. |
| **The bell** | 20 s | The theme stripped to a ticking pulse that rises until the bell stops. |
| **The Stationmaster** | 60 s | A slow, heavy waltz on low strings, from loop 6. |
| **The dawn train** | 60 s | Everything at once: drums, strings, the theme played full, building to the doors closing. |
| **Two endings** | 30 s each | Morning (soft piano); and The Passenger's (the theme in a major key, with Ren's voice over it). |
| **The loading screen** | 30 s | The theme heard as if through a train window. |

**The music is part of the puzzle.** The loop theme comes back every loop, but the game changes it in Web Audio:
each loop is detuned a few cents, a phrase is played backwards, a bar is skipped, or a note is held too long. As the
lamps go out it gets more broken. Once per run, *the music itself* can be the change ("the loop theme is
playing backwards"), to be put right at the platform's speaker.

### Effects (synthesised, no files)
The level crossing's two alternating bells; the platform bell; the reset (a reverse cymbal into one second of
silence, under the 2-frame white flash); ticket-gate beeps; the vending machine's hum; crickets and cicadas; the
sodium lamps' buzz; the express passing (rising and falling noise with a sub rumble, Doppler-shifted); the train's
door chime and air hiss; the ticket punch (a click with a metal ring); the fog walls rising (a low drone); the White
Shape's ringing tone, rising while you look at it.

**Silence is used on purpose:** one full second of nothing before every reset, and before the Tall Lady's first
*po*.

### Loading and the first minute
- **Its own loading screen** like Excalibur's: a station departure board, the bar as the next train's countdown,
  and lines like `CHECKING TICKETS 38 / 150` while the voices load. Everything is in before the first loop, so no
  line is ever missing or late.
- **Size:** voices at 64 kbps mono (about 3-4 MB for 150 lines), the score at 128 kbps. The story lines
  (Ren, the ending) can load after the first loop starts.
- **The opening (skippable, 30 s):** the squad wakes in the last car; the PA says the next stop, but the name
  breaks up; the train comes out of the tunnel at a station lit by one lamp. Then it's the first loop.
- **Volumes** in the pause menu: master, music, effects, voices (Excalibur's starting levels).

---

## Phases (each ships on its own)

| # | Phase | What ships | Test |
|---|---|---|---|
| 0 | **Layout** | The station traced on the 4 m grid (the block editor or a sketch), checked: two routes into every area, spawns away from the start | `tests/levels.test.ts` |
| 1 | **The map, playable** | `mujin` in `MAP_IDS` and `GATED_MAPS`, the static station, normal mission flow (defense at the platform bell, hunt, extract), solo and co-op | the map tests |
| 2 | **The loop** | The loop director, the bell and All Clear, the lamps, the shrink, 15 tier 1-2 changes | a pure-logic test of the read and the shrink; every shrink state still has a route from every spawn to the platform |
| 3 | **The infected** | Commuters with habits, the Rail Crawler, the Tall Lady and marking, the White Shape and gaze, the Bench Sitter | in-browser checks with the dev tools |
| 4 | **The Stationmaster and the dawn train** | the boss, the punch and the pocket room, the express pass, the train extraction | co-op check (scripts/qa-*.mjs style) |
| 5 | **Story and the Easter egg** | Ren's thread, the payphone, the barks, the title-screen text, the full set of ~40 changes, The Passenger and its ending | the journal saves; the egg works in solo and co-op |
| 6 | **Polish** | the loading screen, the opening, the reset flash, the leaderboard, phone pass | performance report on a phone |

Voice and sound aren't left to the end. Each phase brings its own:

| Phase | Sound that ships with it |
|---|---|
| 1 | the ambience, the level crossing, the platform bell, the PA's basic announcements, the loop theme (first take) |
| 2 | the reset, the bell cue, the broken-theme changes, the PA's anomaly lines, the squad's barks |
| 3 | the commuters' murmurs and turn scream, the *po… po…*, the crawler, the White Shape's tone, the Bench Sitter's whispers |
| 4 | the Stationmaster's voice and theme, the express, the dawn-train cue and doors |
| 5 | Ren's calls, the journal readings, both endings |
| 6 | the loading-screen cue, the final mix and captions pass |

Every phase is one push with a patch version and a changelog line.

---

## What I need from you

1. **The name:** MUJIN (recommended), keep KISARAGI as a Sakura spin-off, or another.
2. **The cast:** VRoid like the Sakura District (recommended), or Vulcan people on the train (as passengers or
   as the squad's voices).
3. **How hard a wrong read is:** all lamps out and a shrink (recommended), or only lose one lamp.
4. **Ren and the Stationmaster's looks:** VRoid builds from a reference image, or I make stand-ins first.
5. **The PA's language:** Japanese then English (recommended), English only, or Japanese only with captions.
6. **Auditions:** do you want to pick the takes for Ren and the Stationmaster yourself, or let the judge pick
   everything?

## Inspiration (sources)

- Kisaragi Station, the net legend: [Wikipedia](https://en.wikipedia.org/wiki/Kisaragi_Station), [yokai.jp](https://yokai.jp/en/yokai/kisaragi-eki)
- Net-age legends (the tall lady, the half-body on the tracks, the white shape): [Nippon.com](https://nippon.com/en/japan-topics/g00789/japanese-urban-legends-from-the-slit-mouthed-woman-to-kisaragi-station.html), [Kunekune](https://en.wikipedia.org/wiki/Kunekune_(urban_legend))
- Summer loops that shrink: [Summer Time Rendering](https://en.wikipedia.org/wiki/List_of_Summer_Time_Rendering_episodes), Higurashi
- Infected that keep their habits: [I Am a Hero](https://en.wikipedia.org/wiki/I_Am_a_Hero)
- Pacing that reads the squad: [the L4D AI Director](https://giantbomb.com/wiki/Concepts/A_I_Director)
- The full brainstorm: `research_notes/anime-map-brainstorm.md`
