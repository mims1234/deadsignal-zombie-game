// HIRASAKA reborn, Phase 0: the look book. Reference views to build the island and the deep from (Node 22+, ffmpeg on
// PATH):
//
//   OPENROUTER_ENV=path/to/.env node scripts/hirasaka-refs.mjs [ids...]      (FORCE=1 redoes the ids given)
//
// Two style boards come first (`style` for the island, `deep` for the mine); every later view is sent them as
// references so all the views are the same place. Then, for each of the eighteen places, a labelled top-down plan and
// one or two 3D views from different sides, all from one description of the place; and three views of the whole: the
// island plan, a bird's-eye view, and a cross-section of island, shaft and deep. They are for reading (where things
// stand, what they are made of), never game assets. They land in research_notes/hirasaka/refs as 1280 px WebP, with
// refs.json listing each prompt and what it cost. The run stops before a call that would take the look book (refs,
// portraits and icons together) past $5.
//
// The key: OPENROUTER_API_KEY, or OPENROUTER_API_KEY_BOT from the file named by OPENROUTER_ENV (it is never printed).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const API = 'https://openrouter.ai/api/v1';
const MODEL = process.env.HIRASAKA_ART_MODEL || 'openai/gpt-image-2.6-flare';
const QUALITY = process.env.QUALITY || 'medium';
const BUDGET = Number(process.env.BUDGET || 5);
function key() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  const file = process.env.OPENROUTER_ENV;
  if (file && existsSync(file)) {
    const m = readFileSync(file, 'utf8').match(/^OPENROUTER_API_KEY(?:_BOT)?\s*=\s*"?([^"\r\n]+)"?/m);
    if (m) return m[1].trim();
  }
  throw new Error('No OpenRouter key: set OPENROUTER_API_KEY or OPENROUTER_ENV');
}
const H = { Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json' };
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT = join(ROOT, 'research_notes/hirasaka/refs');
const TMP = join(tmpdir(), 'hirasaka-refs');
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

/** What the whole look book has cost so far, from the three manifests the Phase 0 scripts write. */
function spentSoFar() {
  let s = 0;
  for (const f of ['refs.json', 'people.json', 'icons.json']) {
    const p = join(OUT, f);
    if (existsSync(p)) for (const r of JSON.parse(readFileSync(p, 'utf8'))) s += Number(r.spent ?? r.cost) || 0;
  }
  return s;
}

// ---- the words every view shares ----
const NIGHT =
  'Hirasaka-jima, a small fictional concrete coal-mining island off Nagasaki in Japan, abandoned since April 1974, on a typhoon night in autumn: driving slanting rain, waves bursting white over the seawall, a storm-teal sky with low racing clouds, a few sodium-orange lamps still burning on poles and in stairwells, a lighthouse beam sweeping. Reinforced-concrete apartment blocks five to nine storeys, wet grey-green stained concrete, dark rust streaks running down under every window, wooden balconies, railings and window frames in warm brown, bamboo laundry poles, broken glass, moss and weeds on the roofs. No cars anywhere: concrete stairs, alleys and corridors are the streets.';
const ART =
  'Stylised low-poly 3D video game environment art: flat-shaded chunky geometry, simple bold readable shapes, almost no fine texture, colour and silhouette carry the look, like a polished indie game. Palette: wet concrete grey-green, rust brown, warm wood brown, moss green, dark teal sea, storm-teal sky, small warm sodium-orange lamp light. No people, no watermark, no logos.';
const DEEP_ART =
  'Stylised low-poly 3D video game environment art: flat-shaded chunky geometry, simple bold readable shapes, almost no fine texture, colour and silhouette carry the look, like a polished indie game. No people, no watermark, no logos.';
const PLAN =
  "Drawn as a level designer's top-down plan: strictly orthographic, straight down, north at the top, every object drawn in its place to scale, a scale bar in metres, a compass arrow, short clear English labels on the main features, walkable routes visible, and the wide loop the players lead the dead round drawn as a dashed line. Flat muted colours on a dark background, thin outlines.";
const NOTEXT = 'No text, no lettering, no writing on signs.';

const ISLAND =
  'The whole island is about 320 metres east to west and 150 metres north to south, ringed by a tall sloping concrete seawall, the warship silhouette of an island fortress. SOUTH: the open sea and Dolphin Pier, a concrete landing stage jutting 40 metres south from the middle of the south shore, with the seawall promenade along the whole south edge. A ridge of natural dark rock runs east to west through the middle and north and rises to the summit near the north edge; the buildings are stacked up its slopes in tiers joined by concrete stairs, bridges and corridors. SOUTH-EAST, on flat reclaimed land: the pithead (a red-brick winding-engine house, a tall steel headframe over the shaft, a fan house, the lamp room and the miners\' bath), reached from the town by a long straight covered stair, the Stairs of Life. SOUTH-CENTRE, behind the pier: Market Lane, a narrow lane of small shops with a pachinko parlour and the brick Showa-kan cinema. CENTRE-EAST, one tier above the pithead: Block 30, a small square seven-storey block round a light well, and beside it Block 31, a long six-storey block with a post office, a barber and a basement public bath. WEST shore: Shio-furi Street, a narrow alley between the west seawall and Nikkyu Row (Blocks 16 to 20), a nine-storey wall of housing climbing the west slope, joined by one long corridor. NORTH-WEST, on the top tier: Block 65, the biggest, nine storeys, U-shaped and open to the south round a courtyard, a kindergarten on its roof. NORTH, just east of it: the school, Block 70, seven storeys with very big windows and a gym, linked to Block 65 by a footbridge from its top floor. NORTH-EAST: the hospital, Blocks 68 and 69. CENTRE: the Hell Stairs climb straight up the rock from Market Lane to the summit. NORTH-CENTRE, the summit, highest point: a small shrine with a torii, the manager\'s wooden house and a white lighthouse on the north cliff, and at the head of the Hell Stairs a huge round boulder in a stone cutting.';
const DEEP =
  'The deep: a coal mine 636 metres under the island and under the seabed, which in its deepest part becomes the underworld. About 260 metres east to west and 140 metres north to south. WEST end: the cage landing at the foot of the shaft, with the lamp room. From it the flooded galleries run east, low timbered tunnels with rails and knee-deep water. SOUTH-EAST of the galleries: the coal face and the powder magazine. MIDDLE-EAST: the Old Village, wooden houses swallowed into a huge cavern. FAR EAST: the Root Hall, a vast cavern round a dead forked tree. From the Root Hall the kofun passage, a stacked-stone tunnel, climbs steeply west and up toward the surface, coming out at an old adit beside the Stairs of Life.';

// ---- one description of each place, given to every view of it ----
const P = {
  pier: 'Dolphin Pier and the south seawall of Hirasaka-jima. A concrete landing stage 40 metres long and 8 wide juts south into a heaving dark sea from the middle of the south shore, with iron bollards, a rusted gangway and a small concrete waiting shelter with a wooden bench and a ferry timetable board at its root. The island ferry, a small white-and-blue passenger boat, has been torn off its moorings and lies wrecked on its side against the seawall to the east of the pier, mooring ropes snapped. The seawall: a tall sloping concrete wall about 6 metres high with a flat promenade along its top, 4 metres wide, iron railings, steps down at intervals, running east and west along the whole south edge. On the promenade west of the pier a big steel cable winch on a concrete plinth with a harpoon-like hook on its cable. A tiny Ebisu shrine (a wooden box shrine with a little red torii) at the pier root. Behind, the apartment blocks rise up the rock in tiers. Far out in the black sea, a gigantic smooth black bald head with two pale eyes rising out of the waves (the umibozu).',
  shiofuri: 'Shio-furi Street, "salt-spray street", on the west shore of Hirasaka-jima: a narrow straight alley 4 metres wide and about 110 metres long running north to south between the tall west seawall on its west side and the nine-storey wall of Nikkyu Row on its east side. In the storm the sea pours over the wall top in white sheets and runs down the alley ankle-deep. Halfway along, a heavy steel sea gate in the seawall on rails, rusted, with a big hand wheel: opened, it lets a wave wash the whole alley clear. Doorways and ground-floor shop shutters along the Nikkyu side, drainpipes, a few sodium lamps on brackets, fallen laundry poles, crates, a bicycle, steps up into the blocks every 20 metres. The alley is a loop: at both ends it turns east into the town.',
  nikkyu: 'Nikkyu Row, Blocks 16 to 20 of Hirasaka-jima, the old daily-wage miners\' housing: five tall reinforced-concrete blocks in a line north to south along the west slope, about 120 metres long together, nine storeys on the sea side and three on the rock side because they are built against the slope. The five blocks are joined on every floor by one long straight open corridor with concrete railings running the whole length, and by stairs between them. Under the row, half below ground, a covered shopping corridor of small shops (a rice shop, a tobacconist, a greengrocer with empty crates, a tiny bar) with shutters half down. Small rooms off the corridor: six-tatami rooms with sliding doors, a twin-tub washer, a CRT television, a calendar on the wall, a sewing machine. Rooftop vegetable gardens in wooden boxes, overgrown.',
  b30: "Block 30 of Hirasaka-jima, the oldest concrete apartment block, 1916: a small square seven-storey block about 30 by 30 metres round a narrow central light well open to the sky. Galleries with crumbling concrete railings run round the light well on every floor; a steep wooden-and-concrete stair zigzags up one corner of it. The building is near collapse: part of the light well's east side has fallen in, a slope of rubble, rebar and broken floor slabs fills the bottom of the well and leans across two floors. Rooms open off the galleries, doors gone, showing tatami and broken furniture. Rain falls straight down the well; water pours off the gallery edges.",
  b31: 'Block 31 of Hirasaka-jima, 1957: a long six-storey reinforced-concrete block about 60 metres east to west and 15 deep, set into the slope one tier above the pithead. Its ground floor faces a small square: a post office with a red post box and a wooden counter, and a barber shop with two old barber chairs, a mirror wall and scissors left on the counter. In the basement, reached by a wide stair: the public bath, a big tiled room with two large sunken tiled baths, rows of wooden buckets and wooden ladles on a shelf, washing taps along the walls, a changing room with wooden lockers and baskets, and behind a door a boiler room with a big riveted coal-fired boiler, its fire door, a pressure gauge, pipes, a coal bunker and an empty burner mount.',
  market: 'Market Lane on Hirasaka-jima, the town\'s shopping street behind the pier: a narrow lane about 6 metres wide and 90 metres long running east to west, lined with two- and three-storey concrete shop buildings with wooden shop fronts and pull-down shutters: a fishmonger, a sweet shop, a diner with a noren curtain, a hardware store, a company store with a wooden price board on the wall. A pachinko parlour with a wide doorway and stairs down to its basement hall of rows of upright pachinko machines. At the east end the Showa-kan, a two-storey brick-and-steel cinema with a canopy over its doors, poster frames (blank), a ticket window, and inside a small hall of wooden seats facing a torn screen and a projection booth above the back. Paper lanterns and wires sag across the lane; puddles reflect the lamps.',
  b65: 'Block 65 of Hirasaka-jima, the biggest block, nine storeys, U-shaped and open to the south, about 70 metres east to west and 50 north to south, wrapped round a courtyard with a small playground (a rusted climbing frame, a sandpit). Open-air corridors with concrete railings on every floor face the courtyard; stair towers at the corners. A small pachinko parlour between stairs on the ground floor and a hair salon below. On the flat roof of the north wing: the kindergarten, a fenced rooftop playground with a blue-painted steel slide, a small round fish pool full of rainwater, a little sandpit and a rooftop garden. From the roof of the east wing a covered concrete footbridge reaches east across a gap to the top floor of the school next door. The apartments inside show 1974: tatami rooms, a National fridge, a wall clock, a twin-tub washer, a doll on a shelf, a calendar stuck at April 1974.',
  hospital: 'The hospital of Hirasaka-jima, Blocks 68 and 69: a four-storey reinforced-concrete main hospital about 40 by 18 metres and beside it a two-storey isolation ward about 20 by 12 metres, joined by a covered walkway, on the north-east tier of the island. Inside: a waiting room with wooden benches and a reception window, a long corridor of wards with iron beds and folding screens, an operating room with a round lamp and a tiled table, a pharmacy with glass bottle shelves, a dental chair. Paint peeling in sheets, broken windows, rain blowing in, collapsed ceilings in places.',
  school: 'The school of Hirasaka-jima, Block 70: a seven-storey reinforced-concrete elementary and junior-high school about 50 by 16 metres with very large windows in rows (the top floor added later in steel), a schoolyard in front and beside it a gymnasium with a curved roof and a stage at one end where the closure of the island was announced, folding chairs still in rows. Classrooms with small wooden desks and chairs, a blackboard, a teacher\'s desk, an organ, a science room with jars; a stairwell and a lift shaft. From its top floor a covered concrete footbridge reaches west to the roof of the big U-shaped Block 65.',
  summit: 'The summit of Hirasaka-jima, the highest point of the rock, about 50 by 35 metres: bare dark rock and wind-bent pines. A small Shinto shrine: a weathered stone torii, a stone path, a little concrete honden on a rock outcrop, the wooden worship hall in front of it collapsed into a heap of beams and roof tiles, an offering box. The manager\'s house: the only private wooden house on the island, a two-storey Japanese house with a tiled roof, an engawa veranda and a small garden, shutters banging. At the north cliff edge a short white lighthouse with a lit lamp room whose beam sweeps the storm. At the south-west corner, the head of a long stair coming up the rock.',
  hell: 'The Hell Stairs of Hirasaka-jima: a long steep straight concrete stair, 3 metres wide and about 70 metres long, climbing from Market Lane in the town straight up the rock to the summit, with three small landings, worn iron hand rails, walls of rough rock and the backs of concrete blocks close on both sides, a few sodium lamps on poles. At the very top, in a stone cutting at the head of the stair, a gigantic round boulder about 5 metres across sits on a stone sill beside the opening, with rusted iron chains fixed round it and running to two hand-cranked chain winches bolted to the rock, ready to be hauled across to seal the stair.',
  pithead: 'The pithead of Hirasaka-jima, on flat reclaimed land at the south-east corner of the island, about 80 by 50 metres. A tall riveted steel headframe over the shaft with two big wheels on top and cables running to the winding-engine house, a red-brick building with tall arched windows and a big drum winder inside. The cage at the shaft top: an iron mesh cage with a folding gate and a signal bell. A fan house with a huge ventilation fan behind a rusted steel shutter at the top of the Stairs of Life. The lamp room: a long low concrete building with racks of cap lamps on chargers and a board of numbered brass tags. The miners\' bath: a plain concrete bath house with a big tiled pool of black water. Coal tubs on rails, a slag heap, a timber yard. The Stairs of Life: a long straight covered concrete stair with a corrugated roof coming down the slope from the town to the shaft.',
  // the deep
  cage: 'The cage landing, 636 metres down a coal mine shaft under the sea: a tall arched chamber about 30 by 20 metres lined with concrete and steel arches at the foot of the shaft, the iron mesh cage standing in the shaft opening with its folding gate, signal bells and a telephone box on the wall, rails running off east into the dark. Beside it the underground lamp room: racks of dead cap lamps and a tall wooden tag board covered with rows of small numbered brass lamp tags on hooks, many tags still hanging (men who never came up), a single bare bulb and a few candles and a small offering of a cup of sake beneath the board, quiet and respectful. A miner\'s pick leaning by the board. Palette: coal black, grey concrete, warm yellow lamp light, brass.',
  galleries: 'The flooded galleries of a coal mine under the sea: a network of low tunnels about 3 metres wide and 2.5 high, timbered with square wooden props and cross beams, mine rails along the floor, all under knee-deep still black water that reflects the lamps. Water drips from the roof, seeps teal-green from cracks; abandoned coal tubs stand in the water; a ventilation door of planks; a gallery telephone on a timber post; side niches. The tunnels make a loop about 70 metres east to west and 40 north to south round a block of rock, with two cross-cuts through it. Pale drowned figures in miners\' clothes stand in the water holding out empty hands. Palette: coal black, wet timber brown, teal seepage water, warm yellow cap-lamp light.',
  coalface: 'The coal face and the powder magazine in a coal mine under the sea: a long low wide chamber about 50 metres long and 12 wide where the seam is worked, the black glittering coal wall on one side with drill holes and pick marks, rows of hydraulic or timber props holding the roof, a steel chain conveyor along the face, a rock drill on a stand, shovels and picks. Off it, behind a heavy steel door in a thick concrete wall, the powder magazine, a room about 10 by 8 metres: wooden shelves of explosive cartridge boxes and coiled fuse, a red warning lamp, detonator boxes on a bench. Coal dust hangs in the lamp beams. Palette: coal black, steel grey, timber brown, warm lamp yellow, one red lamp.',
  village: 'The Old Village deep under the island: a huge natural cavern about 90 by 60 metres with a high black rock roof, in which an old Japanese fishing-and-mining village of the early twentieth century stands half swallowed by the rock: one-storey and two-storey wooden houses with dark tiled roofs, sliding doors and paper screens, a well, a small shrine, narrow lanes of packed earth and stone steps, the edges of the houses sinking into the cave walls. Paper Bon lanterns float in the air above the lanes and hang from eaves, glowing warm orange; shimenawa straw ropes with white paper zigzags strung everywhere. In one house a warm hearth with a steaming iron rice pot over the fire, the only warm room. Low ground mist. Palette: Bon-lantern orange against deep indigo, ash grey wood, paper cream, a little spirit blue.',
  kofun: 'The kofun passage: a long steep tunnel of stacked dry stones like the passage into an ancient Japanese kofun tomb, about 3 metres wide and 3 high, its walls made of huge rough fitted stone blocks leaning inward and roofed with great flat stone slabs, climbing a steady slope for about 120 metres, with a few rough stone steps. From the deep end it rises from darkness toward a growing pale white light at the top where it meets an old timbered mine adit. Old offerings in niches: a broken clay figure, a rusted lamp. Palette: cold grey stone, black shadow behind, white light ahead.',
  roothall: 'The Root Hall, the deepest cavern under the island: a vast cathedral-like cave about 70 metres across with a tall domed roof of black rock, in the centre a gigantic dead forked tree, its two great trunks splitting in a Y shape, bone-pale bark, its roots spreading across the whole floor and up into the roof like ribs, some roots forming arches. Around the edge, the remains of mine machinery that broke through: a hoist frame with ore skips hanging on chains from a high ledge, a big ventilation fan in a wall opening, a pump with pipes over a pit in the floor. A single hairpin lies among the roots. Just beginning to show on one branch, a few pink peach blossoms, the only saturated colour. Palette: bone, dark root brown, black, thunder violet glints, one pink.',
};

const V = (id, of, refs, prompt) => ({ id, of, refs, prompt });
const ISL = ['style'];
const DP = ['deep', 'style'];
const VIEWS = [
  // the boards
  V('style', 'Island style board', [], `A style board for a stylised low-poly 3D video game set on ${NIGHT} Show in one wide composition: on the left a hero view of the tiered concrete apartment blocks climbing a dark rock behind the seawall with waves breaking over it; on the right a column of four smaller panels: a close detail of a block facade (rust-streaked concrete, wooden balconies, broken windows, laundry poles), a covered concrete stair with sodium lamps, a red-brick winding house with a steel headframe, a small shrine torii on the rock with a white lighthouse; along the bottom a strip of flat colour swatches. ${ART} ${NOTEXT}`),
  V('deep', 'Deep style board', ['style'], `A style board for the underground half of the same stylised low-poly 3D video game: a coal mine under the sea that becomes the Japanese underworld. One wide composition of five panels in the same rendering style as the reference: a timbered mine gallery under knee-deep teal-black water lit by warm cap-lamp light; a lamp room with a tall board of brass tags; a swallowed wooden village in a black cavern lit by floating orange paper Bon lanterns against indigo; a tunnel of huge stacked stones climbing toward white light; a vast cave of bone-pale roots around a dead forked tree with a few pink peach blossoms. Along the bottom a strip of flat colour swatches: coal black, timber brown, lamp yellow, seepage teal, lantern orange, indigo, bone, root brown, thunder violet, blossom pink. ${DEEP_ART} ${NOTEXT}`),
  // the whole
  V('island-plan', 'The whole island', ISL, `${NIGHT} ${ISLAND} Show the whole island and the sea round it. ${PLAN}`),
  V('island-bird', 'The whole island', ISL, `${NIGHT} ${ISLAND} A bird's-eye 3D view of the whole island from high above the sea to the south-west, looking north-east, the pier in front, the blocks stacked up the rock behind, the summit and the lighthouse at the top, like an isometric game map. ${ART} ${NOTEXT}`),
  V('section', 'Island, shaft and deep', ['deep', 'style'], `A cross-section diagram of a fictional coal-mining island off Japan cut through from south (left) to north (right): above, the island with its seawall, the tiered concrete blocks on the rock and the summit with a lighthouse, the storm sea on both sides; from the pithead on the south-east a single vertical mine shaft drops 636 metres through the rock and under the seabed, with the cage in it; at its foot the cage landing and the flooded galleries; deeper and to the right, a big cavern with a swallowed wooden village lit by orange lanterns, and deepest of all a vast cave round a dead forked tree; from that cave a stone tunnel slants steeply back up through the rock and comes out on the island beside a long covered stair. Labels on the main parts, a depth scale in metres. Flat muted colours on a dark background, thin outlines, a clear technical illustration.`),
  // island places
  V('pier-plan', 'Dolphin Pier and the seawall', ISL, `${P.pier} The plan covers about 140 metres of the south shore. ${PLAN}`),
  V('pier-sea', 'Dolphin Pier and the seawall', ISL, `${NIGHT} ${P.pier} Seen from out at sea south of the pier at wave height, looking north at the pier, the wrecked ferry against the seawall and the town stacked up the rock behind. ${ART} ${NOTEXT}`),
  V('pier-wall', 'Dolphin Pier and the seawall', ISL, `${NIGHT} ${P.pier} Seen at eye level from the seawall promenade west of the pier looking east along it: the cable winch on its plinth in front, the pier and waiting shelter below, waves bursting over the railing, and far out to sea on the right the giant black head rising from the waves. ${ART} ${NOTEXT}`),
  V('shiofuri-plan', 'Shio-furi Street', ISL, `${P.shiofuri} ${PLAN}`),
  V('shiofuri-view', 'Shio-furi Street', ISL, `${NIGHT} ${P.shiofuri} Seen at eye level from the south end of the alley looking north along it: the seawall on the left with the sea pouring over its top, the sea gate halfway along, the wall of Nikkyu Row on the right with its doorways and lamps. ${ART} ${NOTEXT}`),
  V('nikkyu-plan', 'Nikkyu Row', ISL, `${P.nikkyu} Show the row from above with the long corridor, and beside it a small inset plan of the shopping corridor underneath. ${PLAN}`),
  V('nikkyu-out', 'Nikkyu Row', ISL, `${NIGHT} ${P.nikkyu} Seen from the seawall to the south-west, looking north-east along the sea face of the row: nine storeys of rusted concrete and wooden balconies, the long corridor level visible, the slope of the rock behind. ${ART} ${NOTEXT}`),
  V('nikkyu-in', 'Nikkyu Row', ISL, `${P.nikkyu} Seen at eye level inside the long open corridor on an upper floor, looking north down its whole length: railings on the left open to the storm, room doors on the right, one room's sliding door open showing a tatami room with a twin-tub washer and a CRT television, a sodium lamp. ${ART} ${NOTEXT}`),
  V('b30-plan', 'Block 30', ISL, `${P.b30} Draw it as a floor plan of one typical floor, with an inset small section through the light well showing the collapse. ${PLAN}`),
  V('b30-well', 'Block 30', ISL, `${NIGHT} ${P.b30} Seen from the bottom of the light well looking up: the galleries on every floor framing the storm sky, the rubble slope and broken slabs leaning in from the right, the zigzag stair in the corner, rain falling. ${ART} ${NOTEXT}`),
  V('b31-plan', 'Block 31', ISL, `${P.b31} Draw two plans side by side: the ground floor (post office, barber, the small square in front) and the basement (the bath, changing room and boiler room). ${PLAN}`),
  V('b31-out', 'Block 31', ISL, `${NIGHT} ${P.b31} Seen at eye level from the small square in front of the block, looking north at the post office and the barber shop fronts, the six storeys above, the stair down to the bath. ${ART} ${NOTEXT}`),
  V('b31-bath', 'Block 31', ISL, `${P.b31} Seen at eye level inside the basement public bath: the two tiled sunken baths, the wooden buckets and ladles on the shelf, washing taps, steam, and through an open door at the back the boiler room with the big riveted boiler and its fire door. Lit by one warm bulb. ${ART} ${NOTEXT}`),
  V('market-plan', 'Market Lane', ISL, `${P.market} ${PLAN}`),
  V('market-lane', 'Market Lane', ISL, `${NIGHT} ${P.market} Seen at eye level from the west end of the lane looking east along it: shop fronts and half-down shutters on both sides, the company price board, the pachinko doorway, the cinema canopy at the far end, lanterns and wires sagging overhead. ${ART} ${NOTEXT}`),
  V('market-cinema', 'Market Lane', ISL, `${P.market} Seen at eye level inside the Showa-kan cinema from the back under the projection booth, looking at the rows of wooden seats and the torn screen; a projector in the booth window above; rain coming through a hole in the roof. ${ART} ${NOTEXT}`),
  V('b65-plan', 'Block 65', ISL, `${P.b65} Show the U from above with the courtyard and playground, the corner stair towers, the rooftop kindergarten and the footbridge to the school. ${PLAN}`),
  V('b65-bird', 'Block 65', ISL, `${NIGHT} ${P.b65} A bird's-eye 3D view from high above the south, looking north into the U: the courtyard and playground, the open corridors on every floor, the rooftop kindergarten on the north wing, the footbridge on the right. ${ART} ${NOTEXT}`),
  V('b65-roof', 'Block 65', ISL, `${NIGHT} ${P.b65} Seen at eye level on the roof of the north wing in the kindergarten playground: the blue steel slide, the round fish pool brimming with rain, the fence, the sandpit, the footbridge to the school beyond, the storm sea past the roof edge. ${ART} ${NOTEXT}`),
  V('hospital-plan', 'Hospital, Blocks 68 and 69', ISL, `${P.hospital} Draw the ground floor of both buildings and the walkway. ${PLAN}`),
  V('hospital-view', 'Hospital, Blocks 68 and 69', ISL, `${P.hospital} Seen at eye level from the waiting room looking down the long ward corridor: benches, the reception window, iron beds and folding screens through doorways, peeling paint, rain blowing in through broken windows, one sodium lamp outside. ${ART} ${NOTEXT}`),
  V('school-plan', 'School, Block 70', ISL, `${P.school} Draw the ground floor with the schoolyard and the gym, and a small inset of the top floor with the footbridge. ${PLAN}`),
  V('school-out', 'School, Block 70', ISL, `${NIGHT} ${P.school} Seen from the schoolyard at eye level looking north-west at the school's facade of big windows, the gym to the right, the footbridge at the top reaching across to Block 65. ${ART} ${NOTEXT}`),
  V('school-gym', 'School, Block 70', ISL, `${P.school} Seen at eye level inside the gymnasium from the back, looking at the stage: folding chairs still in rows, a lectern on the stage, a wooden floor with lines, tall windows streaming rain, a fallen basketball hoop. ${ART} ${NOTEXT}`),
  V('summit-plan', 'The summit', ISL, `${P.summit} ${PLAN}`),
  V('summit-view', 'The summit', ISL, `${NIGHT} ${P.summit} Seen at eye level from the head of the stair at the south-west corner, looking north-east across the summit: the stone torii and the collapsed shrine hall in front, the manager's wooden house to the left, the white lighthouse on the cliff at the back with its beam cutting the rain. ${ART} ${NOTEXT}`),
  V('hell-plan', 'The Hell Stairs', ISL, `${P.hell} Draw it as a plan with a long section beside it showing the climb from the lane to the summit and the boulder at the top. ${PLAN}`),
  V('hell-view', 'The Hell Stairs', ISL, `${NIGHT} ${P.hell} Seen at eye level from the bottom of the stair looking straight up it: the steep flights and landings narrowing between rock and concrete, the lamps, and at the top against the storm sky the huge round boulder in its cutting with its chains and winches. ${ART} ${NOTEXT}`),
  V('pithead-plan', 'Stairs of Life and the pithead', ISL, `${P.pithead} ${PLAN}`),
  V('pithead-view', 'Stairs of Life and the pithead', ISL, `${NIGHT} ${P.pithead} Seen from the top of the Stairs of Life looking south-east down over the pithead: the covered stair running down, the steel headframe with its wheels, the red-brick winding house, the fan house with its shutter, the lamp room and bath house, the sea beyond the seawall. ${ART} ${NOTEXT}`),
  V('pithead-lamp', 'Stairs of Life and the pithead', ISL, `${P.pithead} Seen at eye level inside the lamp room: long racks of cap lamps on chargers, the board of numbered brass tags, a wooden counter, and through the far doorway the cage at the shaft top under the headframe in the rain. ${ART} ${NOTEXT}`),
  // the deep
  V('cage-plan', 'Cage landing and lamp room', DP, `${P.cage} ${PLAN}`),
  V('cage-view', 'Cage landing and lamp room', DP, `${P.cage} Seen at eye level from the rails looking back west at the cage in the shaft opening, the lamp room to its right with the tall tag board, the bulb and candles, the pick leaning against the board. ${DEEP_ART} ${NOTEXT}`),
  V('galleries-plan', 'The flooded galleries', DP, `${P.galleries} ${PLAN}`),
  V('galleries-view', 'The flooded galleries', DP, `${P.galleries} Seen at eye level standing in the water looking along a gallery: props and beams receding, rails under the water, a coal tub, drips, teal seepage, two drowned figures ahead holding out their hands. ${DEEP_ART} ${NOTEXT}`),
  V('galleries-cross', 'The flooded galleries', DP, `${P.galleries} Seen at eye level at a junction where a cross-cut meets the main gallery: the plank ventilation door half open, the gallery telephone on its post, water to the knee, lamp light on the water. ${DEEP_ART} ${NOTEXT}`),
  V('coalface-plan', 'Coal face and powder magazine', DP, `${P.coalface} ${PLAN}`),
  V('coalface-view', 'Coal face and powder magazine', DP, `${P.coalface} Seen at eye level along the coal face: the glittering black seam on the left, the rows of props on the right, the conveyor, the rock drill, and at the end the heavy steel door of the magazine under its red lamp. ${DEEP_ART} ${NOTEXT}`),
  V('village-plan', 'The Old Village', DP, `${P.village} ${PLAN}`),
  V('village-lane', 'The Old Village', DP, `${P.village} Seen at eye level in the main lane: wooden houses on both sides sinking into the rock, lanterns floating overhead, shimenawa ropes, the well, mist on the ground, the cavern roof lost in darkness. ${DEEP_ART} ${NOTEXT}`),
  V('village-hearth', 'The Old Village', DP, `${P.village} Seen at eye level inside the one warm house: a sunken irori hearth with the iron rice pot steaming over the fire, tatami, a low table set with bowls, paper screens glowing orange, the dark lane outside the open door. ${DEEP_ART} ${NOTEXT}`),
  V('kofun-plan', 'The kofun passage', DP, `${P.kofun} Draw it as a plan with a long section underneath showing the climb from the Root Hall to the adit. ${PLAN}`),
  V('kofun-view', 'The kofun passage', DP, `${P.kofun} Seen at eye level from low in the passage looking up the slope: the leaning stacked stones and roof slabs, the steps, the white light at the top. ${DEEP_ART} ${NOTEXT}`),
  V('roothall-plan', 'The Root Hall', DP, `${P.roothall} ${PLAN}`),
  V('roothall-view', 'The Root Hall', DP, `${P.roothall} Seen at eye level from the entrance looking across the hall at the forked tree: roots across the floor and up into the roof, the hoist with ore skips on the ledge to the left, the fan in the wall to the right, the pump pit in front of the tree. ${DEEP_ART} ${NOTEXT}`),
  V('roothall-high', 'The Root Hall', DP, `${P.roothall} A high 3D view from up under the roof looking down on the whole hall: the Y of the tree in the centre, the roots spreading like ribs, the pit, the hoist ledge, the fan, the entrance tunnel. ${DEEP_ART} ${NOTEXT}`),
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function retry(fn, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await sleep(2500 * (i + 1));
    }
  }
  throw last;
}

function refUrl(id) {
  const f = join(OUT, `${id}.webp`);
  return existsSync(f) ? `data:image/webp;base64,${readFileSync(f).toString('base64')}` : null;
}

async function image(prompt, refs) {
  const body = { model: MODEL, prompt, n: 1, aspect_ratio: '16:9', quality: QUALITY, output_format: 'webp', output_compression: 85 };
  const urls = refs.map(refUrl).filter(Boolean);
  if (urls.length) body.input_references = urls.map((url) => ({ type: 'image_url', image_url: { url } }));
  const r = await fetch(`${API}/images`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  const b64 = j.data?.[0]?.b64_json;
  if (!b64) throw new Error(`no image in the reply: ${JSON.stringify(j).slice(0, 200)}`);
  return { buf: Buffer.from(b64, 'base64'), cost: j.usage?.cost ?? null };
}

let spent = 0;
const base = spentSoFar();
async function view(v) {
  const out = join(OUT, `${v.id}.webp`);
  if (existsSync(out) && !process.env.FORCE) return { ...v, kept: true, cost: null };
  if (base + spent + 0.06 > BUDGET) throw new Error(`stopped: the look book has spent $${(base + spent).toFixed(2)} of $${BUDGET}`);
  const { buf, cost } = await retry(() => image(v.prompt, v.refs));
  spent += Number(cost) || 0.05;
  const raw = join(TMP, `${v.id}.bin`);
  writeFileSync(raw, buf);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', raw, '-vf', 'scale=1280:-2', '-quality', '82', out]);
  console.log(`${v.id}: saved${cost == null ? '' : `, $${Number(cost).toFixed(4)}`}`);
  return { ...v, cost };
}

const want = process.argv.slice(2);
const list = VIEWS.filter((v) => want.length === 0 || want.includes(v.id));
const results = [];
// the boards first, one after the other, since everything after is sent them
for (const id of ['style', 'deep']) {
  const v = list.find((x) => x.id === id);
  if (v) results.push(await view(v));
}
const rest = list.filter((v) => v.id !== 'style' && v.id !== 'deep');
let i = 0;
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (i < rest.length) {
      const v = rest[i++];
      try {
        results.push(await view(v));
      } catch (e) {
        console.log(`${v.id}: FAILED ${e.message}`);
      }
    }
  }),
);
const manifest = join(OUT, 'refs.json');
const prev = existsSync(manifest) ? JSON.parse(readFileSync(manifest, 'utf8')) : [];
const rows = VIEWS.map((v) => {
  const now = results.find((r) => r.id === v.id && !r.kept);
  const old = prev.find((p) => p.id === v.id);
  if (now) return { id: v.id, of: v.of, file: `${v.id}.webp`, cost: now.cost, calls: (old?.calls ?? 0) + 1, spent: (old?.spent ?? 0) + (Number(now.cost) || 0), model: MODEL, quality: QUALITY, refs: v.refs, prompt: v.prompt };
  return old ?? null;
}).filter(Boolean);
writeFileSync(manifest, JSON.stringify(rows, null, 2));
const total = rows.reduce((s, r) => s + (Number(r.spent) || 0), 0);
console.log(`done: ${results.filter((r) => !r.kept).length} generated, $${spent.toFixed(4)} this run, $${total.toFixed(4)} for the refs over all runs (as the API reported)`);
