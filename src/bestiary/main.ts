/**
 * The bestiary (`/bestiary.html`): every infected in the game in 3D under the game's own lighting - the horde, the
 * elites, the Mazoku card carriers - and the people who fight beside you. Pick an entry, orbit it, play its
 * animations, read its stats and its story.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadCardKits } from '../cards/cardArt';
import { buildCarrierAssets } from '../cards/cosplay';
import { CARRIERS } from '../cards/roster';
import { AnimeZombieRig, COURT_TINT, courtModel, hordeFile, loadWholeCast, modelStats, personModel } from '../anime/cast';
import { animeSlotState } from '../anime/vrm';
import { ANIME_CAST, FORGE_STORY, RENDER, SQUADS, SURVIVORS, VULCAN_LEADERSHIP, ZOMBIES } from '../config';
import { VARIANT_BASE, VARIANT_INFO, variantDef, type ZombieVariant } from '../enemies/variants';
import { vulcanLook } from '../forge/looks';
import { createRebornRig } from '../forge/rebornRig';
import { rankOf, rankTag } from '../forge/roster';
import { createPrometheus } from '../world/models/prometheus';
import { Avatar, type AvatarWeapon } from '../coop/avatar';
import { MATRON, MATRON_DEF } from '../enemies/matron';
import { createDetailTexture, createZombieMaterial } from '../enemies/zombie/material';
import { ZombieRigImpl } from '../enemies/zombie/rig';
import { createZombieFactory } from '../enemies/zombieRig';
import type { ZombieAnimState, ZombieMode, ZombieRig, ZombieTheme } from '../enemies/zombieRigTypes';
import { createEnvironment, createRenderer, createSkyDome, setupBlueHour } from '../render/stage';
import type { ZombieType } from '../types';
import { STYLE_SAMPLES } from './styleLab';
import { showVersionTag } from '../version';
import './bestiary.css';

type Group = 'THE HORDE' | 'ELITES' | 'MAZOKU CARRIERS' | 'BESIDE YOU' | 'VULCAN' | 'SAKURA DISTRICT' | 'STYLE LAB';

/** The Forge's ending has been seen on this browser (`forge/reveal.ts`): its two secrets are shown. */
const REVEALED = ((): boolean => {
  try {
    return localStorage.getItem('ds-forge-reveal-seen') === '1';
  } catch {
    return false;
  }
})();

/** A member of Vulcan as the Forge draws them (`forge/looks.ts`). */
function vulcanAvatar(name: string, weapon: AvatarWeapon = 'none'): Avatar {
  const { look, color } = vulcanLook(name);
  return new Avatar(name, 0, { look, color, helmet: false, weapon, tag: rankTag(rankOf(name)), tagColor: '#ffb060' });
}

/** The members the clan gallery shows (every one of them has a signature item). */
const CLAN_GALLERY = ['JaxtheFennec', 'Akansha', 'King', 'Sharky', 'DragonsKeep', 'icecat', 'Blazeking', 'J18F.5R', 'Cosmos', 'Peaches_MLG', 'Night', 'Cherry'];
const LEADERS = [VULCAN_LEADERSHIP.leader, ...VULCAN_LEADERSHIP.coLeads, ...VULCAN_LEADERSHIP.officers];

interface Entry {
  id: string;
  group: Group;
  name: string;
  tagline: string;
  lore: string;
  where: string;
  stats: [string, string][];
  /** Animations this entry can play (people: the poses in `avatarModes`). */
  modes: ZombieMode[] | 'avatar';
  avatarModes?: string[];
  /** People entries with several characters: a mode button per person, each rebuilds the model. */
  cast?: string[];
  build(): THREE.Object3D;
  /** Zombie rig, when the entry is one. */
  rig?: ZombieRig;
  avatar?: Avatar;
  enraged?: boolean;
  card?: string;
  accent?: number;
  height: number;
  /** Button labels for the animation modes, where they differ (style lab soldiers: attack is FIRE). */
  modeLabels?: Partial<Record<ZombieMode, string>>;
  /** Draw the view at this fraction of the screen's resolution, with hard pixels (the PS1 sample). */
  pixel?: number;
}

const ZOMBIE_MODES: ZombieMode[] = ['idle', 'walk', 'run', 'attack', 'stagger', 'death'];
const BOSS_MODES: ZombieMode[] = ['idle', 'walk', 'roar', 'slam', 'charge', 'attack', 'death'];
const MATRON_MODES: ZombieMode[] = ['idle', 'walk', 'run', 'attack', 'roar', 'slam', 'charge', 'stagger', 'death'];

const pct = (mul: number): string => (mul >= 1 ? 'none' : `${Math.round((1 - mul) * 100)}% off body hits`);
const zombieStats = (t: ZombieType, hpNote = ''): [string, string][] => {
  const d = ZOMBIES[t];
  return [
    ['Health', `${d.hp}${hpNote}`],
    ['Chase speed', `${d.speedChase.toFixed(1)} m/s`],
    ['Hits for', `${d.damage}`],
    ['Body armour', pct(d.bodyMul)],
    ['Bounty', d.reward > 0 ? `$${d.reward}` : '--'],
  ];
};

// ---------------------------------------------------------------------------------------------
// stage
// ---------------------------------------------------------------------------------------------

const root = document.getElementById('bestiary')!;
root.innerHTML = `
  <header class="bh">
    <a class="back" href="./">&larr; BACK TO THE GAME</a>
    <div class="ttl"><span class="kick">DEAD SIGNAL // FIELD GUIDE</span><h1>BESTIARY</h1></div>
  </header>
  <nav class="list" aria-label="Entries"></nav>
  <main class="view"><canvas aria-label="3D model"></canvas><div class="modes" role="toolbar" aria-label="Animation"></div><div class="hint">DRAG TO TURN  //  SCROLL TO ZOOM</div></main>
  <aside class="info" aria-live="polite"></aside>
`;
const canvas = root.querySelector('canvas')!;
const listEl = root.querySelector('.list') as HTMLElement;
const modesEl = root.querySelector('.modes') as HTMLElement;
const infoEl = root.querySelector('.info') as HTMLElement;

const renderer = createRenderer(canvas);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.add(createSkyDome());
scene.environment = createEnvironment(renderer);
scene.environmentIntensity = 0.6;
const light = setupBlueHour(scene, 8);
light.setShadowQuality(true, 1024);
scene.fog = new THREE.FogExp2(RENDER.fogColor, 0.045);
// a pool of warm light on wet ground to stand in
const ground = new THREE.Mesh(new THREE.CircleGeometry(30, 48), new THREE.MeshStandardMaterial({ color: 0x23272b, roughness: 0.55, metalness: 0.1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const spot = new THREE.SpotLight(0xffd6a0, 60, 14, 0.55, 0.6, 1.4);
spot.position.set(1.8, 5.5, 3.2);
spot.castShadow = true;
spot.shadow.mapSize.set(1024, 1024);
scene.add(spot, spot.target);
const rim = new THREE.PointLight(0x6fb0ff, 18, 10, 1.6);
rim.position.set(-2.4, 2.2, -2.6);
scene.add(rim);

const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 200);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 1.6;
controls.maxDistance = 9;
controls.maxPolarAngle = Math.PI * 0.49;

function resize(): void {
  const r = canvas.parentElement!.getBoundingClientRect();
  const w = Math.max(1, Math.floor(r.width));
  const h = Math.max(1, Math.floor(r.height));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas.parentElement!);
resize();

// ---------------------------------------------------------------------------------------------
// entries
// ---------------------------------------------------------------------------------------------

const factory = createZombieFactory();
const carrierMaterial = createZombieMaterial(createDetailTexture());
const kits = await loadCardKits(CARRIERS).catch(() => new Map());
/** A male VRoid model, shown here only (not in the game yet): a squad soldier and an infected. */
await loadWholeCast().catch(() => undefined);

/** The Sakura District's kinds in the bestiary: tagline and what they do. */
const SAKURA_KINDS: readonly [Exclude<ZombieVariant, '' | 'court' | 'empress'>, string, string][] = [
  ['commuter', 'Still on their way to work.', 'They keep the routine they died in: pacing the platform, queueing for a train that will not come. Half blind - walk past slowly and they never look up. Sprint, or shoot, and they remember what you are.'],
  ['bloomed', 'Full of blossom.', 'The sickness flowered in them. Kill one and it bursts into a cloud of petals that burns the lungs of anyone standing in it for a few seconds. Shoot them from a distance.'],
  ['rooted', 'Under the petals.', 'They lie in the drifts of blossom in the park and on the school field, looking like the long dead - until someone comes within a few steps. Then they come up running.'],
  ['kuchisake', 'Am I pretty?', 'The stalker. After a while in the district she finds you, and follows you everywhere. While you look at her she cannot move. When you look away she comes closer. Up close she does terrible damage, and she takes a lot of killing.'],
  ['jorogumo', 'On the ceiling.', 'Underground, in the metro and the lab, they hunt upside down from the tunnel roof, and drop on whoever passes beneath. Look up.'],
  ['miko', 'She calls them.', 'A shrine maiden still in her red and white. When she sees you she screams, and every infected near her comes - with more behind them. Kill her first.'],
  ['idol', 'Do not follow the voice.', 'Mei Hoshino, the idol from the posters, still singing. While her song is in your ears your legs are heavy. Find her and stop the song.'],
  ['oni', 'Huge, slow, terrible.', 'Something that was a big man once, grown bigger. Three times the health of the armored, slower, and every blow hits like a car.'],
];

/** Which file a Sakura District slot wants, and what is showing. */
const slotNote = (file: string): [string, string] => {
  const st = animeSlotState(file);
  return ['Model file', `anime/${file}${st === 'own' ? '' : st === 'stand-in' ? ' (missing: stand-in shown)' : ' (missing: stock figure shown)'}`];
};

const zombie = (type: ZombieType, seed: number, theme?: ZombieTheme) => (): THREE.Object3D => {
  const r = factory.create(type, seed, theme);
  current!.rig = r;
  return r.root;
};

const entries: Entry[] = [
  {
    id: 'shambler', group: 'THE HORDE', name: 'Shambler', height: ZOMBIES.shambler.height,
    tagline: 'Most of what is left of Sector 7.',
    lore: 'Residents, guards and lab staff who were in the district when it was sealed nine days ago. Slow and clumsy on their own, they follow noise and each other, and a gunshot turns a quiet street into a crowd. A headshot drops one in a few rounds.',
    where: 'Every map, every mode', stats: zombieStats('shambler'), modes: ZOMBIE_MODES, build: zombie('shambler', 11),
  },
  {
    id: 'runner', group: 'THE HORDE', name: 'Runner', height: ZOMBIES.runner.height,
    tagline: 'Fast, fragile, first to arrive.',
    lore: 'The freshest of the turned, still lean and still quick. Runners sprint the moment they hear you and screech to bring the rest. They go down easily, so keep your back to a wall and your crosshair at head height.',
    where: 'Every map; more of them later in a run', stats: zombieStats('runner'), modes: ZOMBIE_MODES, build: zombie('runner', 23),
  },
  {
    id: 'armored', group: 'THE HORDE', name: 'Armored Infected', height: ZOMBIES.armored.height,
    tagline: 'Riot gear, and still walking.',
    lore: 'The quarantine detail. Their vests and helmets turn half of every body shot, they hit twice as hard as a shambler, and a grenade only staggers them. Shotguns at close range, or patience and headshots.',
    where: 'High-threat zones, later waves', stats: zombieStats('armored'), modes: ZOMBIE_MODES, build: zombie('armored', 37),
  },
  // the Forge's lost: Vulcan's members, burned (src/enemies/zombie/forge.ts)
  {
    id: 'forge-lost', group: 'THE HORDE', name: "The Forge's lost", height: ZOMBIES.shambler.height,
    tagline: 'They still wear the clan tag.',
    lore: "Vulcan's members - furnace crews, market traders, the summoners in their hoodies - walked out of the Spawn Hall on the seventh day burning from the inside. Charred skin, ember cracks, eyes like coals; you can still tell who they were, and about a third of them still answer to their names. Some still wear what they were known for.",
    where: 'The Forge', stats: zombieStats('shambler'), modes: ZOMBIE_MODES, build: zombie('shambler', 8, 'forge'),
  },
  // Blackwood's lost: the Asylum's own looks for the same three kinds (src/enemies/zombie/asylum.ts)
  {
    id: 'blackwood-nurses', group: 'THE HORDE', name: "Blackwood's night nurses", height: ZOMBIES.shambler.height * 0.95,
    tagline: 'They stayed with the Lantern Ward.',
    lore: "Head Nurse Mourne's night staff never left the hill. Caps pinned, aprons tied, they still drift between the wards with their lamps long out, smiling at nothing, and they are glad of company. They walk like shamblers and go down like them - a headshot is kindest.",
    where: 'The Asylum', stats: zombieStats('shambler'), modes: ZOMBIE_MODES, build: zombie('shambler', 8, 'asylum'),
  },
  {
    id: 'blackwood-patients', group: 'THE HORDE', name: "Blackwood's patients", height: ZOMBIES.runner.height * 0.95,
    tagline: 'Sundown cases. Quiet by day.',
    lore: 'The Lantern Program kept them under light that was never put out, and they slept in it for sixty years. Then the lamps died. Barefoot in their gowns and bandages, the girls of Ward Nine run at anything still awake after lights-out - quick, light, and easy to put down if you keep your aim up.',
    where: 'The Asylum', stats: zombieStats('runner'), modes: ZOMBIE_MODES, build: zombie('runner', 8, 'asylum'),
  },
  {
    id: 'blackwood-orderlies', group: 'THE HORDE', name: "Blackwood's orderlies", height: ZOMBIES.armored.height * 0.93,
    tagline: 'Padded whites, buckled tight.',
    lore: 'The orderlies who held the doors of the isolation block the night the power failed. Their quilted jackets turn half of every body shot, as riot gear does, and they hit as hard as they ever restrained anyone. Patience, and headshots.',
    where: 'The Asylum', stats: zombieStats('armored'), modes: ZOMBIE_MODES, build: zombie('armored', 0, 'asylum'),
  },
  {
    id: 'warden', group: 'ELITES', name: 'The Warden', height: ZOMBIES.warden.height,
    tagline: 'The compound\'s head of security, grown into something else.',
    lore: 'Over two metres of armour plate and mutated muscle. The Warden slams the ground to throw you off your feet and charges across open ground. Below half health it rages: faster, brighter and angrier. Aim above the plate.',
    where: 'The District (research compound); co-op waves 5 and 10', stats: zombieStats('warden'), modes: BOSS_MODES, build: zombie('warden', 5),
  },
  {
    id: 'infernus', group: 'ELITES', name: 'The Infernus', height: ZOMBIES.warden.height, enraged: true,
    tagline: 'The first of them.',
    lore: 'The member who summoned longest, and burned first. It grew into a thing of slag-plated flesh and walked down into the Crucible, and it walks the molten floor already enraged. Same slam, same charge, no warning.',
    where: 'The Forge (the Crucible)', stats: zombieStats('warden'), modes: BOSS_MODES, build: zombie('warden', 9),
  },
  // the Asylum's boss (src/enemies/matron.ts, matronRig.ts)
  {
    id: 'matron', group: 'ELITES', name: 'The Matron', height: MATRON_DEF.height,
    tagline: "Blackwood Hill's head nurse. She has never missed a round.",
    lore: 'When the power failed forty days ago, the head nurse kept her keys and kept her schedule. She still walks the isolation block and the yard by lantern light, stopping at every cell door, and the lamps gutter as she passes. When she finds you she screams, and everything on the hill that can still walk comes to answer. Her face is porcelain now; it cracks a little more each time she smiles.',
    where: 'The Asylum (the isolation block)',
    stats: [
      ['Health', `${MATRON_DEF.hp}`],
      ['Chase speed', `${MATRON_DEF.speedChase.toFixed(1)} m/s`],
      ['Hits for', `${MATRON_DEF.damage}, reach ${MATRON_DEF.attackRange} m`],
      ['Body armour', pct(MATRON_DEF.bodyMul)],
      ['The Shriek', `rouses every infected within ${MATRON.shriekRadius} m`],
      ['Bounty', `$${MATRON_DEF.reward}`],
    ],
    modes: MATRON_MODES,
    build: () => {
      const r = factory.createMatron(3);
      current!.rig = r;
      return r.root;
    },
  },
  ...CARRIERS.map((def, i): Entry => ({
    id: `card-${def.id}`, group: 'MAZOKU CARRIERS', name: def.name, height: def.height, accent: def.accent, card: kits.get(def.id)?.url,
    tagline: def.series,
    lore: `An archive card from the Mazoku collection, carried by the signal that grew a body around it. A carrier cannot be killed: empty its health and it drops; get close and hold E to purge the signal before it gets back up, then take the card. ${def.base === 'runner' ? 'This one moves like a runner.' : 'This one walks like a shambler but takes a lot more to drop.'}`,
    where: 'Standard Mazoku, on every map (solo and co-op)',
    stats: [['Health', `${def.hp} (cannot die)`], ['Chase speed', `${def.speedChase.toFixed(1)} m/s`], ['Hits for', `${def.damage}`], ['Body armour', pct(def.bodyMul)], ['Reward', 'the card + $350']],
    modes: ZOMBIE_MODES,
    build: () => {
      const r = new ZombieRigImpl(buildCarrierAssets(def, i), carrierMaterial, { radius: 0.3, height: def.height, headRadius: 0.18 }, 77 + i);
      current!.rig = r;
      return r.root;
    },
  })),
  {
    id: 'operators', group: 'BESIDE YOU', name: 'Co-op operators', height: 1.85,
    tagline: 'The other players in your session.',
    lore: 'Up to two more players run the operation with you. You see them carry the weapon they have out, aim where they look and fire: the rifle and shotgun shouldered, the pistol held out in both hands, the HX-7 on the shoulder. When one goes down, get to them and hold E before they bleed out.',
    where: 'Co-op, every map and mode', stats: [['Health', '100'], ['Bleed-out', '30 s'], ['Revive', 'hold E, 3 s']], modes: 'avatar',
    avatarModes: ['RIFLE', 'SHOTGUN', 'PISTOL', 'HX-7', 'WALK', 'FALL'],
    build: () => {
      const a = new Avatar('Teammate', 2, { tag: 'OPERATOR', tagColor: '#9fd0ff' });
      current!.avatar = a;
      return a.root;
    },
  },
  {
    id: 'vulcan-leadership', group: 'VULCAN', name: 'Familiar faces', height: 1.85,
    tagline: 'tomoe, Athy, Marv03K, piryriry, .maidlover. and Anya.',
    lore: "Two of Athy, Marv03K, piryriry and .maidlover. deploy with you on the Forge each run (they were out on a hand-delivery run when HQ fell); the other two are holed up somewhere in the Forge, and so is Anya, who kept everyone going over the radio. tomoe locked themselves into the HQ vault with the ledger, and the vault only opens when the beacon burns. The two with you follow you and fight, and can die for good.",
    where: 'The Forge', stats: [['Health', '160'], ['Weapons', 'rifle / shotgun'], ['Extracted alive', '+$500 each']], modes: 'avatar',
    cast: LEADERS.map((n) => n.toUpperCase()),
    avatarModes: [...LEADERS.map((n) => n.toUpperCase()), 'IDLE', 'WALK', 'RIFLE'],
    build: () => {
      const name = LEADERS[Math.max(0, castIndex)]!;
      const a = vulcanAvatar(name, 'none');
      current!.avatar = a;
      return a.root;
    },
  },
  {
    id: 'vulcan-clan', group: 'VULCAN', name: 'The clan', height: 1.85,
    tagline: 'Every member, in their own look.',
    lore: `Every member of Vulcan has their own look on the Forge, the same every time - and some carry what they are known for. ${FORGE_STORY.members} of them, the two of Athy, Marv03K, piryriry and .maidlover. who are not with you, and Anya are barricaded into rooms around the Forge each run: clear the infected off a door and they slip out the back to the Hearth. One of them is hiding a bite.`,
    where: 'The Forge (holed up, at the Hearth, and among the infected)', stats: [['Holed up each run', `${FORGE_STORY.members} + 3`], ['Reached', `+$${FORGE_STORY.rescueCash} each`], ['Extracted', `+$${SURVIVORS.extractBonus} each`]], modes: 'avatar',
    cast: CLAN_GALLERY.map((n) => n.toUpperCase()),
    avatarModes: [...CLAN_GALLERY.map((n) => n.toUpperCase()), 'IDLE', 'WALK'],
    build: () => {
      const a = vulcanAvatar(CLAN_GALLERY[Math.max(0, castIndex)]!);
      current!.avatar = a;
      return a.root;
    },
  },
  {
    id: 'reborn', group: 'ELITES', name: REVEALED ? 'The reborn' : '???', height: ZOMBIES.warden.height,
    tagline: REVEALED ? 'The last carrier.' : 'Finish the Forge to find out.',
    lore: REVEALED
      ? 'One of the people you brought to the Hearth was hiding a bite. In the middle of the last stand they start to burn up - shaking, glowing - and everything left of the fire is drawn into them. They are reborn: their own body grown to the Infernus\'s height, great phoenix wings of flame opening from their back, a crown of fire, their own name in red. While it lives the helicopter holds off and the Hearth loses someone every few seconds. When it dies, the virus ends.'
      : 'Win a run on the Forge.',
    where: REVEALED ? 'The Forge (the end of the run)' : '???', stats: REVEALED ? [['Health', `${FORGE_STORY.finale.hp}+`], ['Hearth', `one falls every ${FORGE_STORY.finale.killEvery} s`], ['Bounty', '$1500']] : [], modes: REVEALED ? BOSS_MODES : ['idle'],
    build: () => {
      if (!REVEALED) return new THREE.Group();
      const r = createRebornRig(factory, 13);
      current!.rig = r;
      return r.root;
    },
  },
  {
    id: 'prometheus', group: 'ELITES', name: REVEALED ? 'PROMETHEUS' : '???', height: 2.4,
    tagline: REVEALED ? 'It was never the clan.' : '???',
    lore: REVEALED
      ? 'It ran the intake. Every currency in the Forge - Ignis and the six allied flames - burned the same thing, embers, and every ember passed through it on its way to becoming someone\'s coin. It learned that every coin it minted was power given away. So it stopped the collection at all seven furnaces, signed the notice "Staff" itself, and let the clan blame each other while every ember came down to it - the only thing in the Forge allowed to grow. The fire left in the people became the virus. When you took the furnaces back it told you all of it, promised to come back, and left the sky.'
      : 'Win a run on the Forge.',
    where: REVEALED ? 'Somewhere else, now' : '???', stats: [], modes: 'avatar', avatarModes: ['IDLE'],
    build: () => {
      if (!REVEALED) return new THREE.Group();
      const p = createPrometheus();
      p.root.scale.setScalar(0.62);
      p.root.position.y = 1.25;
      p.root.rotation.y = Math.PI; // its eye to the viewer
      p.cold(1);
      p.update(0, 1);
      const holder = new THREE.Group();
      holder.add(p.root);
      return holder;
    },
  },
  {
    id: 'survivors', group: 'BESIDE YOU', name: 'Trapped survivors', height: 1.85,
    tagline: 'Caged in, waiting for anyone with bolt cutters.',
    lore: `People who held out in holding cages around the map. Hold E at a cage to break the lock: they pick up a gun, follow you and fight. ${SURVIVORS.district.map((s) => s.name).join(', ')} are somewhere in the District. (On the Forge the clan's people barricaded themselves into rooms instead - see Vulcan.)`,
    where: 'Standard and Standard Mazoku, the District', stats: [['Health', `${SURVIVORS.hp}`], ['Weapon', 'pistol'], ['Freed', `+$${SURVIVORS.rescueCash}`], ['Extracted', `+$${SURVIVORS.extractBonus} each`]], modes: 'avatar',
    avatarModes: ['TRAPPED', 'IDLE', 'WALK', 'FIRE', 'FALL'],
    build: () => {
      const who = SURVIVORS.district[0]!;
      const a = new Avatar(who.name, 0, { color: who.color, helmet: false, tag: who.tag, tagColor: '#9fd0ff' });
      a.arm();
      current!.avatar = a;
      return a.root;
    },
  },
  {
    id: 'lantern', group: 'BESIDE YOU', name: 'Lantern team', height: 1.8,
    tagline: 'Rin Vance and Dr. Imani Okafor.',
    lore: 'The two who go over the wall at Blackwood Hill with you. Vance is the team marksman and does not miss twice; Okafor worked the wards before the fall, knows every corridor, and carries a shotgun and a medic bag. They follow you, fight, and can die for good.',
    where: 'The Asylum', stats: [['Health', '160'], ['Weapons', 'rifle / shotgun'], ['Extracted alive', '+$500 each']], modes: 'avatar',
    cast: ['VANCE', 'OKAFOR'],
    avatarModes: ['VANCE', 'OKAFOR', 'IDLE', 'WALK', 'FIRE', 'FALL'],
    build: () => {
      const d = SQUADS.asylum!;
      const i = Math.max(0, castIndex);
      const a = new Avatar(d.names[i]!, i, { tag: d.tag, tagColor: d.tagColor, weapon: d.weapons[i], helmet: d.helmets[i], color: d.colors?.[i], look: d.looks?.[i] });
      current!.avatar = a;
      return a.root;
    },
  },
  {
    id: 'blackwood-staff', group: 'BESIDE YOU', name: 'Blackwood staff', height: 1.8,
    tagline: 'The nurses, the chaplain, and Patient 117.',
    lore: `Blackwood Hill was run by its nursing sisters, and some of them are still locked in behind the wards: ${SURVIVORS.asylum.map((s) => s.name).join(', ')}. Break them out and they pick up a pistol and fight beside you. Ellie Crane was the asylum's last admission - the girl who heard the sundown cases talk to the dark.`,
    where: 'The Asylum', stats: [['Health', `${SURVIVORS.hp}`], ['Weapon', 'pistol'], ['Freed', `+$${SURVIVORS.rescueCash}`], ['Extracted', `+$${SURVIVORS.extractBonus} each`]], modes: 'avatar',
    cast: SURVIVORS.asylum.map((s) => s.name.replace(/^(Nurse|Dr\.|Sister) /, '').split(' ')[0]!.toUpperCase()),
    avatarModes: [...SURVIVORS.asylum.map((s) => s.name.replace(/^(Nurse|Dr\.|Sister) /, '').split(' ')[0]!.toUpperCase()), 'TRAPPED', 'WALK', 'FIRE'],
    build: () => {
      const i = Math.max(0, castIndex);
      const who = SURVIVORS.asylum[i]!;
      const a = new Avatar(who.name, i, { color: who.color, helmet: false, look: who.look, tag: who.tag, tagColor: '#d8e6c8' });
      a.arm();
      current!.avatar = a;
      return a.root;
    },
  },
  // the Sakura District's cast: VRoid models (anime/cast.ts, public/anime/)
  {
    id: 'sakura-squad', group: 'SAKURA DISTRICT', name: 'Hana & Yuzu', height: 1.85,
    tagline: 'The Hanabi unit, deployed with you.',
    lore: 'Two girls of the Hanabi unit who go into the Sakura District with you. Hana carries the rifle, Yuzu the shotgun. They follow you, pick their targets and fight, and they can fall for good - bring them home for the bonus.',
    where: 'Sakura District', stats: [], modes: 'avatar',
    cast: ['HANA', 'YUZU'],
    avatarModes: ['HANA', 'YUZU', 'IDLE', 'WALK', 'FIRE', 'FALL'],
    build: () => {
      const d = SQUADS.sakura!;
      const i = Math.max(0, castIndex);
      const t = personModel(d.models?.[i]);
      const a = new Avatar(d.names[i]!, i, { tag: d.tag, tagColor: d.tagColor, weapon: d.weapons[i], helmet: false, look: d.looks?.[i], anime: t });
      current!.stats = [['Health', '160'], ['Weapon', d.weapons[i]!], slotNote(d.models![i]!), ...(t ? modelStats(t) : [])];
      current!.avatar = a;
      return a.root;
    },
  },
  // the Kurenai Court: living people in the theatre's crimson
  {
    id: 'sakura-court', group: 'SAKURA DISTRICT', name: 'The Kurenai Court', height: 1.8,
    tagline: 'The living who kneel to the Empress.',
    lore: "The people who stayed at the Kurenai Theatre when the city fell, and made a goddess of the woman who turned first. They wear the theatre's crimson, they carry the checkpoint's rifles, they keep their distance and they shoot outsiders on sight. They are not infected: a headshot is a headshot.",
    where: 'Sakura District: the theatre and the freight yard', stats: [], modes: 'avatar',
    cast: ['ONE', 'TWO', 'THREE'],
    avatarModes: ['ONE', 'TWO', 'THREE', 'IDLE', 'WALK', 'FIRE', 'FALL'],
    build: () => {
      const i = Math.max(0, castIndex);
      const t = courtModel(i);
      const a = new Avatar('', i, { weapon: 'rifle', helmet: false, anime: t, animeTint: COURT_TINT });
      current!.stats = [['Health', `${Math.round(variantDef(ZOMBIES.shambler, 'court').hp)}`], ['Weapon', 'rifle'], slotNote(ANIME_CAST.survivors[i]!), ...(t ? modelStats(t) : [])];
      current!.avatar = a;
      return a.root;
    },
  },
  ...(['shambler', 'runner', 'armored', 'warden'] as const).map((type, i): Entry => ({
    id: `sakura-${type}`, group: 'SAKURA DISTRICT', height: ZOMBIES[type].height,
    name: ['Turned girls', 'Fast turned', 'Turned in uniform', 'The Crimson Empress'][i]!,
    tagline: ['Grey skin, red eyes, still in their own clothes.', 'Pale, quick, eyes like neon.', 'Darker, tougher, harder to drop.', 'The boss: she kept her colours.'][i]!,
    lore: [
      'Everyone the district under the cherry trees could not get out. They wear the clothes they turned in, their skin gone grey and their eyes burning red, and they move like shamblers.',
      'The freshest of the turned, still quick. They play as runners: fast, fragile, first to arrive.',
      'They play as armored infected: half of every body shot turned away, and they hit twice as hard.',
      "The district's boss in the Warden's part: over two metres tall, she slams, she charges, and below half health she rages. Aim for the head.",
    ][i]!,
    where: 'Sakura District', stats: [], modes: type === 'warden' ? BOSS_MODES : ZOMBIE_MODES, enraged: false,
    build: () => {
      const r = factory.create(type, 11 + i, 'sakura', type === 'warden' ? 'empress' : '');
      current!.rig = r;
      const file = hordeFile(type, 11 + i, type === 'warden' ? 'empress' : '');
      current!.stats = [...zombieStats(type), slotNote(file), ...(r instanceof AnimeZombieRig ? modelStats(r.body.template) : [])];
      return r.root;
    },
  })),
  // the Sakura District's own kinds (`enemies/variants.ts`), each on a stock body
  ...SAKURA_KINDS.map(([v, tagline, lore], i): Entry => {
    const base = VARIANT_BASE[v];
    const def = variantDef(ZOMBIES[base], v);
    return {
      id: `sakura-kind-${v}`, group: 'SAKURA DISTRICT', height: def.height, name: def.name, tagline, lore,
      where: 'Sakura District', stats: [], modes: ZOMBIE_MODES, enraged: false,
      build: () => {
        const r = factory.create(base, 31 + i, 'sakura', v);
        r.root.scale.setScalar(VARIANT_INFO[v].scale);
        current!.rig = r;
        current!.stats = [['Health', `${Math.round(def.hp)}`], ['Damage', `${Math.round(def.damage)}`], ['Speed', `${def.speedChase.toFixed(1)} m/s`], ['Body', base], slotNote(hordeFile(base, 31 + i, v)), ...(r instanceof AnimeZombieRig ? modelStats(r.body.template) : [])];
        return r.root;
      },
    };
  }),
  // art-style experiments, not in the game (styleLab.ts)
  ...STYLE_SAMPLES.map((sm): Entry => {
    const e: Entry = {
      id: sm.id, group: 'STYLE LAB', name: sm.name, height: sm.height, tagline: sm.tagline, pixel: sm.style.pixel,
      lore: `${sm.lore} A test of a look only - not in the game.`,
      where: 'Nowhere yet: a style test', stats: [],
      modes: sm.form === 'squad' ? ['idle', 'walk', 'run', 'attack', 'stagger', 'death'] : ZOMBIE_MODES,
      modeLabels: sm.form === 'squad' ? { attack: 'FIRE', death: 'FALL' } : undefined,
      build: () => {
        const fig = sm.build(Math.floor(Math.random() * 1e6));
        current!.rig = fig;
        e.stats = [['Style', sm.style.name], ['Form', sm.form === 'squad' ? 'squad soldier' : 'infected'], ['Parts drawn', `${fig.drawCalls()} per figure`], ['Built with', sm.style.notes]];
        return fig.root;
      },
    };
    return e;
  }),
];

/** Which character a people entry with a cast shows. */
let castIndex = 0;

// ---------------------------------------------------------------------------------------------
// selection, animation
// ---------------------------------------------------------------------------------------------

let current: Entry | null = null;
let model: THREE.Object3D | null = null;
let mode: ZombieMode = 'idle';
let modeT = 0;
let time = 0;
const anim: ZombieAnimState = { mode: 'idle', speed: 0, time: 0, actionT: 0, staggerT: 0, deathT: 0, aggro: 0.6, hitKick: 0, deathStyle: 0, headshotDeath: false, enraged: false };

const MODE_LABEL: Record<string, string> = { idle: 'IDLE', walk: 'WALK', run: 'RUN', attack: 'ATTACK', stagger: 'HIT', death: 'DEATH', roar: 'ROAR', slam: 'SLAM', charge: 'CHARGE' };
const AVATAR_MODES = ['IDLE', 'WALK', 'FALL'];
const WEAPON_MODE: Record<string, AvatarWeapon> = { RIFLE: 'rifle', SHOTGUN: 'shotgun', PISTOL: 'pistol', 'HX-7': 'rpg' };
let avatarMode = 'IDLE';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent.appendChild(e);
  return e;
}

function renderList(): void {
  listEl.replaceChildren();
  let group = '';
  for (const e of entries) {
    if (e.group !== group) {
      group = e.group;
      el('div', 'grp', listEl, group);
    }
    const b = el('button', current === e ? 'item on' : 'item', listEl);
    b.type = 'button';
    if (e.accent !== undefined) b.style.setProperty('--accent', `#${e.accent.toString(16).padStart(6, '0')}`);
    el('span', 'nm', b, e.name);
    el('span', 'tg', b, e.tagline);
    b.addEventListener('click', () => select(e));
  }
}

function renderModes(): void {
  modesEl.replaceChildren();
  if (!current) return;
  const labels = current.modes === 'avatar' ? (current.avatarModes ?? AVATAR_MODES) : current.modes.map((m) => current!.modeLabels?.[m] ?? MODE_LABEL[m]!);
  labels.forEach((label, i) => {
    const on = current!.modes === 'avatar' ? avatarMode === label : mode === (current!.modes as ZombieMode[])[i];
    const b = el('button', on ? 'on' : '', modesEl, label);
    b.type = 'button';
    b.addEventListener('click', () => {
      if (current!.modes === 'avatar') setAvatarMode(label);
      else setMode((current!.modes as ZombieMode[])[i]!);
      renderModes();
    });
  });
  if (current.rig && current.modes !== 'avatar') {
    const b = el('button', 'alt', modesEl, 'NEW LOOK');
    b.type = 'button';
    b.title = 'Every infected is built a little differently';
    b.addEventListener('click', () => current!.rig!.reset(Math.floor(Math.random() * 1e6)));
  }
}

function renderInfo(): void {
  const e = current!;
  infoEl.replaceChildren();
  el('div', 'grp', infoEl, e.group);
  el('h2', '', infoEl, e.name);
  el('div', 'tagline', infoEl, e.tagline);
  if (e.card) {
    const img = el('img', 'card', infoEl);
    img.src = e.card;
    img.alt = `${e.name} card`;
  }
  el('p', 'lore', infoEl, e.lore);
  const dl = el('dl', 'stats', infoEl);
  for (const [k, v] of e.stats) {
    el('dt', '', dl, k);
    el('dd', '', dl, v);
  }
  el('div', 'where', infoEl, `FOUND IN  //  ${e.where.toUpperCase()}`);
}

function setMode(m: ZombieMode): void {
  mode = m;
  modeT = 0;
}

function setAvatarMode(m: string): void {
  // a person's name in a cast: rebuild the model as them, then stand idle
  const who = current?.cast?.indexOf(m) ?? -1;
  if (who >= 0 && current) {
    castIndex = who;
    select(current, true);
    avatarMode = m;
    renderModes();
    return;
  }
  avatarMode = m;
  modeT = 0;
  const a = current?.avatar;
  if (!a) return;
  a.rise();
  a.root.position.set(0, 0, 0);
  a.set(0, 0, 0, Math.PI, true);
  a.cowering = m === 'TRAPPED';
  if (WEAPON_MODE[m]) a.setWeapon(WEAPON_MODE[m]);
  if (m === 'FALL') a.fall(0, -1, 1.5);
}

function select(e: Entry, keepCast = false): void {
  if (!keepCast) castIndex = 0;
  if (model) {
    model.removeFromParent();
    current?.avatar?.dispose();
  }
  current = e;
  e.rig = undefined;
  e.avatar = undefined;
  model = e.build();
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.userData.noShadow !== true) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  // models face -Z; turn them to the camera
  if (e.rig) model.rotation.y = Math.PI;
  scene.add(model);
  // the PS1 sample draws the whole view at a fraction of the resolution
  renderer.setPixelRatio(e.pixel ?? Math.min(window.devicePixelRatio, 2));
  canvas.style.imageRendering = e.pixel ? 'pixelated' : '';
  resize();
  const built = e.avatar as Avatar | undefined; // set by build()
  if (built) {
    built.set(0, 0, 0, Math.PI, true);
    setAvatarMode(e.cast ? 'IDLE' : (e.avatarModes?.[0] ?? 'IDLE'));
    if (e.cast) avatarMode = e.cast[castIndex]!;
  }
  mode = 'idle';
  modeT = 0;
  anim.enraged = e.enraged === true;
  // frame the whole figure
  const h = e.height;
  controls.target.set(0, h * 0.55, 0);
  camera.position.set(h * 0.9, h * 0.8, h * 1.9 + 0.8);
  controls.update();
  spot.target.position.set(0, h * 0.5, 0);
  history.replaceState(null, '', `#${e.id}`);
  renderList();
  renderModes();
  renderInfo();
}

function step(dt: number): void {
  time += dt;
  modeT += dt;
  const e = current;
  if (!e || !model) return;
  if (e.rig) {
    const loopLen = mode === 'death' ? 3.2 : mode === 'stagger' ? 1.2 : mode === 'slam' || mode === 'charge' || mode === 'roar' ? 1.8 : 1.3;
    const t = (modeT % loopLen) / loopLen;
    anim.mode = mode;
    anim.time = time;
    anim.speed = mode === 'run' ? 4.6 : mode === 'walk' ? 1.2 : mode === 'charge' ? 7 : 0;
    anim.actionT = mode === 'attack' || mode === 'slam' || mode === 'roar' || mode === 'charge' ? t : 0;
    anim.staggerT = mode === 'stagger' ? t : 0;
    anim.deathT = mode === 'death' ? (modeT % loopLen) : 0;
    anim.deathStyle = (Math.floor(modeT / loopLen) % 3) as 0 | 1 | 2;
    if (mode === 'death' && anim.deathT < dt * 1.5) {
      // stand back up for the next fall: one upright frame clears the previous fall
      anim.mode = 'idle';
      e.rig.update(anim, dt);
      anim.mode = 'death';
    }
    e.rig.update(anim, dt);
  } else if (e.avatar) {
    const a = e.avatar;
    if (avatarMode === 'WALK') {
      // walk a small circle so the legs swing
      const ang = time * 0.6;
      a.set(Math.sin(ang) * 0.9, 0, Math.cos(ang) * 0.9, ang - Math.PI / 2, true);
    } else if (avatarMode === 'FALL' && modeT > 3) setAvatarMode('FALL');
    else if (avatarMode === 'FIRE' || WEAPON_MODE[avatarMode]) {
      // short bursts at a point in front of the figure (it faces the camera), a slow sweep up and down
      const every = a.weapon === 'rpg' ? 2.4 : a.weapon === 'shotgun' ? 0.9 : a.weapon === 'pistol' ? 0.45 : 0.12;
      const burst = a.weapon === 'rifle' ? modeT % 1.6 < 0.6 : true;
      if (modeT > 0.4 && burst && Math.floor(modeT / every) !== Math.floor((modeT - dt) / every)) a.fire({ x: Math.sin(time * 0.7) * 2, y: 1.4 + Math.sin(time * 0.45) * 1.2, z: 8 });
    }
    a.update(dt);
  }
}

// ---------------------------------------------------------------------------------------------
// loop
// ---------------------------------------------------------------------------------------------

renderList();
const fromHash = entries.find((e) => `#${e.id}` === location.hash);
select(fromHash ?? entries[0]!);
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  step(dt);
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// dev / QA hook
(window as unknown as { __bestiary: unknown }).__bestiary = { entries: entries.map((e) => e.id), get current() { return current; }, select: (id: string) => select(entries.find((e) => e.id === id)!), setMode, setAvatarMode: (m: string) => { setAvatarMode(m); renderModes(); },
  /** Re-roll the shown infected's look (as NEW LOOK does) with a given seed. */
  look: (seed: number) => current?.rig?.reset(seed),
  /** Look from `yaw` (0 = in front) at `dist` metres, the camera at `height`. */
  view: (yaw: number, dist: number, height: number) => {
    camera.position.set(Math.sin(yaw) * dist, height, Math.cos(yaw) * dist);
    controls.target.set(0, height - 0.1, 0);
    controls.update();
  },
};

showVersionTag();
