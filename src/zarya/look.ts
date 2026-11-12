/**
 * ZARYA on screen: everything the story moves, drawn from the story's state (`story.ts`), never from who changed it.
 *
 *   Act I      the town's people and their breath (`crowd.ts`), the falling snow, the shelter's blast door and the red
 *              lamp over it, the pistols on Nina's rack, the jammed shutter, the Signalka's red star over the square,
 *              the town tree's lights, the red sack, a prize on the slide's hook
 *   the town   what glints until it is taken (parts, finds, the repairman's tools, the tree's glass ornaments) and the
 *              small marks at things worth a look; the gates between zones; the three matryoshkas and their opened
 *              shells; a blanket on every sleeper who has been covered
 *   the zones  the Rynok's cold store door, its bar and Borya's keys; Baba Yaga's hut on its chicken legs and the
 *              stage's lever; the canteen's three plugs; the plant's three valve wheels; the Berloga's key door, the
 *              keys in it, the purge console's four switches; the museum guard's cabinet
 *   the named  the costumes of the five who have names (`dress`), and the one who watches (`Watcher`)
 *
 * Weak devices are bound by how many separate things are drawn. So: everything that is repeated is an instanced mesh
 * (what glints: one; what is a lit ball: one; keys: one; the dolls: three); everything else is a handful of pieces
 * merged into one mesh with its colours in its vertices (`Paint`), all sharing one material; and every place is hidden
 * while the camera is far from it (`Site`).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Zombie } from '../enemies/zombie';
import { Z as KIT } from '../world/layout/zaryaKit';
import { Crowd, Snowfall } from './crowd';
import { FrostRings } from './photos';
import { BANYA, BERLOGA, CANTEEN, DEPOT, DK, DVOR, GARAGES, GATES, INSTITUTE, LAMPS, RYNOK, SHELTER, STOPS, STORE, TETS, ZARYA, ZARYA_ZONES, inInterior, inRect, people, type Rect, type Spot } from './places';
import { CH, CLUES, COVERS, DOLLS, F, G, MOD_PARTS, ORNAMENTS, SHUTTERS, STORY, TOOLS, ZaryaStory, type StoryView } from './story';
import { yawTo } from './types';
import { PART, TOWN, Unlock } from './unlock';
// ---- Baba Yaga's stage (`stage.ts`, `stageLook.ts`): the walking hut and the machines are drawn there ----
import { ZOMBIES } from '../config';
import { HUT_DEF_PATCH } from './stage';
import { StageLook, showBody } from './stageLook';
// (items, round 3: every collectable as a small model of itself, all in one draw call)
import { ItemMarks, townItems } from './items';
// ---- side stories (round 3, note 10) ----
import { SIDE_PLACES, sideShown } from './sidestories';
import { sideMarks } from './sideModels';

export type Named = 'mishka' | 'borya' | 'yaga' | 'tamada' | 'morozko';

const AMBER = 0xffb84a;
// (items, round 3: how high each part lies is `ITEM_Y` in items.ts now, the surface under it)
const CLUE_Y: Record<string, number> = { tv: 1.45, ledger: 1.1, crates: 1.25, sheet: 1.5, plaque: 1.6, photo: 1.6, faces: 1.55, pipe: 1.2, clock: 1.65, office: 1, dens: 1.35, danya: 1.25, den: 0.55 };
/** The glass ornaments' colours, and the four keys' (cosmonaut, sun, wheat, dove). */
const GLASS = [0xd8262e, 0x2f6fd8, 0xe0a820, 0x2fa860, 0x9a4ad0, 0xc8d4e8];
const KEY_TINT = [0x3a66c8, 0xf07820, 0x30a89c, 0x6ab4f0];
/** How high the zone builders' plinth stands under each matryoshka (the square's stands on the paving). */
const PLINTH = [0, 0.62, 0.5];
/** How tall each nested doll is: the outermost two metres, each inside it a size smaller. */
const DOLL_H = [2, 1.62, 1.3, 1.04, 0.84, 0.68];
/** Where a doll opens: the two halves part at its belly. */
const DOLL_SPLIT = 0.45;
/** How far a gate's leaves swing. */
const SWING = 1.45;
/** How far east of where a player stands each of the purge console's switches is (`zaryaBerloga.ts`: the desk's barrels). */
const CONSOLE = 1.53;
/** The boss's head is this much bigger than the head the costumes' hats were cut for (he wears a helmet under them). */
const HEAD = 1.32;
const Y = new THREE.Vector3(0, 1, 0);

/**
 * Pieces of plain colour gathered into one mesh: every box, tube and ball keeps its colour in its vertices, so a
 * thing of forty pieces is one draw call and shares its material with everything else made this way.
 */
export class Paint {
  private readonly parts: THREE.BufferGeometry[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly c = new THREE.Color();

  /** `color`: one colour, or a colour for each height of the piece as it was made. */
  private push(g: THREE.BufferGeometry, color: number | ((y: number) => number), m: THREE.Matrix4): this {
    const q = g.index ? g.toNonIndexed() : g;
    if (q !== g) g.dispose();
    for (const name of Object.keys(q.attributes)) if (name !== 'position' && name !== 'normal') q.deleteAttribute(name);
    const pos = q.attributes.position!;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      this.c.setHex(typeof color === 'number' ? color : color(pos.getY(i)));
      col[i * 3] = this.c.r;
      col[i * 3 + 1] = this.c.g;
      col[i * 3 + 2] = this.c.b;
    }
    q.setAttribute('color', new THREE.BufferAttribute(col, 3));
    q.applyMatrix4(m);
    this.parts.push(q);
    return this;
  }

  put(g: THREE.BufferGeometry, color: number | ((y: number) => number), x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): this {
    this.e.set(rx, ry, rz, 'YXZ');
    return this.push(g, color, this.m.compose(this.p.set(x, y, z), this.q.setFromEuler(this.e), this.s.set(sx, sy, sz)));
  }

  box(c: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0, rx = 0, rz = 0): this {
    return this.put(new THREE.BoxGeometry(sx, sy, sz), c, x, y, z, rx, ry, rz);
  }

  /** A tube standing on its middle at `y` (a cone with `rt` = 0). */
  cyl(c: number, x: number, y: number, z: number, rt: number, rb: number, h: number, seg = 8, rx = 0, ry = 0, rz = 0, open = false): this {
    return this.put(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), c, x, y, z, rx, ry, rz);
  }

  ball(c: number, x: number, y: number, z: number, r: number, sx = 1, sy = 1, sz = 1, seg = 8): this {
    return this.put(new THREE.SphereGeometry(r, seg, Math.max(4, seg - 2)), c, x, y, z, 0, 0, 0, sx, sy, sz);
  }

  /** A tube from a to b, `r0` thick at a and `r1` at b. */
  rod(c: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r0: number, r1 = r0, seg = 6): this {
    this.s.set(bx - ax, by - ay, bz - az);
    const len = this.s.length();
    this.q.setFromUnitVectors(Y, this.s.divideScalar(len || 1));
    return this.push(new THREE.CylinderGeometry(r1, r0, len, seg), c, this.m.compose(this.p.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), this.q, this.s.set(1, 1, 1)));
  }

  torus(c: number, x: number, y: number, z: number, R: number, r: number, rx = 0, ry = 0, rz = 0, arc = Math.PI * 2): this {
    return this.put(new THREE.TorusGeometry(R, r, 5, 10, arc), c, x, y, z, rx, ry, rz);
  }

  octa(c: number, x: number, y: number, z: number, r: number, sx = 1, sy = 1, sz = 1, ry = 0): this {
    return this.put(new THREE.OctahedronGeometry(r), c, x, y, z, 0, ry, 0, sx, sy, sz);
  }

  /** A profile of [radius, height] points turned round the upright. */
  lathe(pts: readonly (readonly [number, number])[], seg: number, color: (y: number) => number, y = 0): this {
    return this.put(new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), seg), color, 0, y, 0);
  }

  build(): THREE.BufferGeometry {
    const g = mergeGeometries(this.parts, false)!;
    for (const p of this.parts) p.dispose();
    this.parts.length = 0;
    return g;
  }
}

/** Somewhere things are: drawn only while the camera is within `r` of it. */
interface Site {
  x: number;
  z: number;
  r: number;
  g: THREE.Group;
}

/** Something that glints or glows, one of many in one draw call. */
interface Spark {
  x: number;
  y: number;
  z: number;
  /** Its colour (already as bright as it burns), its size, and how it is squashed. */
  c: THREE.Color;
  s: number;
  sx: number;
  sy: number;
  sz: number;
  /** How fast it turns and how far it bobs. */
  spin: number;
  bob: number;
  /** Facing one way instead of turning. */
  yaw?: number;
  on: boolean;
}

interface GateLook {
  def: (typeof GATES)[number];
  site: Site;
  /** How far open, 0..1. */
  k: number;
  leaves: { m: THREE.Mesh; shut: number; way: number }[];
  arm: THREE.Mesh | null;
  chain: THREE.Mesh | null;
  cut: THREE.Mesh | null;
  drift: THREE.Mesh | null;
}

/** What a named one wears: the body's colours, and what rides the head, the hips and the striking hand. */
interface Costume {
  body: THREE.Material;
  head: THREE.Object3D | null;
  /** The head piece is made in metres (the bear's own head is a ball of one, scaled to the body). */
  metres: boolean;
  hips: THREE.Object3D | null;
  hand: THREE.Object3D | null;
}

/** The squares of solid building nobody stands in (the watcher keeps out of them). */
const BUILDINGS: readonly Rect[] = [STORE, ZARYA.palace, DK.building, INSTITUTE.block, BANYA.house, RYNOK.hall, RYNOK.coldStore, TETS.hall, GARAGES.timur];

const hex = (c: number, k = 1): THREE.Color => new THREE.Color(c).multiplyScalar(k);
const approach = (cur: number, to: number, step: number): number => cur + Math.sign(to - cur) * Math.min(Math.abs(to - cur), step);

export class TownLook {
  readonly root = new THREE.Group();
  readonly crowd: Crowd;
  private readonly snow = new Snowfall();
  /** The Zenit's marked spots: a faint ring of frost on the ground at each not yet photographed (`photos.ts`). */
  private readonly rings = new FrostRings();
  private readonly geos: THREE.BufferGeometry[] = [];
  private readonly mats: THREE.Material[] = [];
  private readonly sites: Site[] = [];
  /** Plain colours in the vertices; the same, as cloth and plush; what glows by its own colour. */
  private readonly paint: THREE.MeshStandardMaterial;
  private readonly felt: THREE.MeshStandardMaterial;
  private readonly glow: THREE.MeshStandardMaterial;

  // ---- Act I ----
  private readonly door: THREE.Mesh;
  private readonly lamp: THREE.Mesh;
  private readonly lampMat: THREE.MeshStandardMaterial;
  private readonly lever: THREE.Mesh;
  private readonly pistols: THREE.Mesh;
  private readonly shutter: THREE.Mesh;
  private readonly flare = new THREE.Group();
  private readonly flareMat: THREE.MeshBasicMaterial;
  private readonly prize: THREE.Mesh;
  /** Ded Moroz's sack, which moves (`placeSack`), and the site it is drawn from. */
  private readonly sack: THREE.Mesh;
  private readonly sackSite: Site;
  private readonly guardIdx: number;
  private readonly morozIdx: number;

  // ---- what glints, what glows, the keys ----
  private readonly gems: THREE.InstancedMesh;
  private readonly balls: THREE.InstancedMesh;
  private readonly keys: THREE.InstancedMesh;
  private readonly sparks: Spark[] = [];
  private readonly orbs: Spark[] = [];
  private readonly partAt: number;
  private readonly findAt: number;
  private readonly toolAt: number;
  /** Kiosks and mods: the mod parts lying about (in `sparks`), each kiosk rolled open, the sleeping repairman's tools back on his bench. */
  private readonly modPartAt: number;
  private readonly kiosks: { site: Site; open: THREE.Mesh }[] = [];
  private readonly booth: { site: Site; tools: THREE.Mesh[] };
  private readonly clueAt: number;
  /** Items (round 3): every part, find, tool, mod part and rolled ornament as a model of itself (`items.ts`), one mesh. */
  private readonly items: ItemMarks;
  private readonly itemAt: ReturnType<typeof townItems>['at'];
  /** Side stories: the things in their places (`sideModels.ts`), and where their specks start in `sparks`. */
  private readonly side: ReturnType<typeof sideMarks>;
  private readonly sideAt: number;

  // ---- the town ----
  private readonly gates: GateLook[] = [];
  private readonly dollWhole: THREE.InstancedMesh;
  private readonly dollTop: THREE.InstancedMesh;
  private readonly dollFoot: THREE.InstancedMesh;
  private dollKey = -1;
  private readonly coverOf: number[];
  private covered = -1;

  // ---- the zones ----
  private readonly cold: { site: Site; leaf: THREE.Mesh; bar: THREE.Mesh; a: number };
  /** Baba Yaga's stage (`stageLook.ts`): the hut, the machines, the pools; her body and pots as last handed over (`yaga`). */
  private readonly hut: { site: Site; stage: StageLook };
  private yagaBody: Zombie | null = null;
  private yagaPots: readonly { x0: number; z0: number; x1: number; z1: number; k: number }[] = [];
  /** Frost pools that came down this frame (the runtime plays their splash). */
  freshPools: { x: number; z: number }[] = [];
  private readonly cabinet: { site: Site; leaf: THREE.Mesh; a: number };
  private readonly plugs: { site: Site; in: THREE.Mesh[]; out: THREE.Mesh[] };
  private readonly valves: { site: Site; wheel: THREE.Mesh[]; a: number[] };
  private readonly hall: { site: Site; slab: THREE.Mesh; y: number };
  private readonly shelter: Site;
  private readonly front: Site;
  /** The store hall's escalator (polish, square/store session): the rope and padlock at its foot, the shutter at its head (`G.escalator`). */
  private readonly escal: { rope: THREE.Mesh; slack: THREE.Mesh; curtain: THREE.Mesh; k: number };
  private readonly fair: Site;

  // ---- the named, and the one who watches ----
  private readonly costumes: Record<Named, Costume>;
  private readonly dressed = new WeakMap<object, Named>();
  private readonly watcher: THREE.Mesh;
  private watchT = 0;
  private watchWait = 30;
  private readonly spots: Spot[] = [];

  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private t = 0;
  private asleep = 0;
  private doorA = 1.9;
  private flareT = -1;
  private snowOn = 1;
  private fall = 1;
  /** The first frame of a run: everything stands as the story says, nothing is caught half way. */
  private snap = true;

  constructor() {
    this.root.name = 'ZaryaTown';
    const list = people();
    this.crowd = new Crowd(list);
    this.guardIdx = this.crowd.indexOf('guard');
    this.morozIdx = this.crowd.indexOf('moroz');
    this.root.add(this.crowd.root, this.snow.points, this.rings.root);
    this.coverOf = COVERS.map((c) => this.crowd.nearest(c.x, c.z, 2.2));

    this.paint = this.mat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.05 }));
    this.felt = this.mat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    // lit by its own colour: an instance's colour is how brightly it burns
    this.glow = this.mat(new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.3, metalness: 0.1 }));
    this.glow.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_COLOR\n  totalEmissiveRadiance += vColor.rgb;\n#endif');
    };

    // =====================================================================================================
    // Act I: the shelter, the store's front, the fair
    // =====================================================================================================
    const H = SHELTER;
    this.shelter = this.site((H.x0 + H.x1) / 2, 0, 60);
    this.front = this.site(STORE.x0, ZARYA.shutter.z, 80);
    this.fair = this.site(-2, 38, 110);
    const GREEN = 0x3f5f45;
    const STEEL = 0x4a525c;
    const DARK = 0x16181c;
    const RED = 0xb3261e;
    const GOLD = 0xd6aa3c;

    // the blast door: hinged on its north edge, swinging back into the vestibule; a wheel, bolts
    {
      const p = new Paint().box(GREEN, 0, 1.15, H.doorHalf, 0.26, 2.3, H.doorHalf * 2 + 0.2);
      for (const y of [0.5, 1.8]) p.box(STEEL, 0.16, y, H.doorHalf, 0.08, 0.12, H.doorHalf * 2);
      p.torus(STEEL, 0.2, 1.2, H.doorHalf, 0.3, 0.035, 0, Math.PI / 2, 0);
      for (const a of [0, Math.PI / 3, (2 * Math.PI) / 3]) p.box(STEEL, 0.2, 1.2, H.doorHalf, 0.03, 0.56, 0.04, 0, a);
      this.door = this.mesh(p, this.shelter.g);
      this.door.position.set(H.doorX, 0, -H.doorHalf);
    }
    // the red lamp over it, on the main room's side
    this.lampMat = this.mat(new THREE.MeshStandardMaterial({ color: 0x300806, emissive: 0xff2a18, emissiveIntensity: 0, roughness: 0.4 }));
    this.lamp = new THREE.Mesh(this.geo(new THREE.SphereGeometry(0.13, 10, 8)), this.lampMat);
    this.lamp.position.set(H.doorX + 0.5, 2.6, 0);
    this.shelter.g.add(this.lamp);
    // the manual release's lever
    this.lever = this.mesh(new Paint().box(RED, 0, 0, 0, 0.08, 0.5, 0.08), this.shelter.g);
    this.lever.position.set(ZARYA.release.x, 1.3, SHELTER.z1 - 0.38);
    // three pistols on the watch room's rack, until they are taken
    {
      const p = new Paint();
      for (let i = 0; i < 3; i++) {
        p.box(DARK, SHELTER.x1 - 0.5, 1.26 + i * 0.3, ZARYA.rack.z, 0.06, 0.12, 0.34);
        p.box(DARK, SHELTER.x1 - 0.5, 1.18 + i * 0.3, ZARYA.rack.z + 0.1, 0.05, 0.14, 0.08);
      }
      p.box(STEEL, H.doorX + 0.42, 2.6, 0, 0.1, 0.1, 0.1);
      this.pistols = this.mesh(p, this.shelter.g);
    }
    // the jammed shutter: a steel curtain half down over the southern doors, its motor still trying
    this.shutter = this.mesh(new Paint().box(STEEL, 0, 0, 0, 0.07, 3.3, 3.3), this.front.g);
    this.shutter.position.set(STORE.x0 + 0.5, 3.35, ZARYA.shutter.z);
    // ---- the store hall's escalator (polish, square/store session): roped and padlocked at its foot, shuttered at its
    // head; once the padlock is broken the rope hangs from one post and the shutter rolls up into its drum. The brass
    // posts are the layout's (`world/layout/zaryaStore.ts`).
    {
      const E = ZARYA.escalator;
      const ex = (E.x0 + E.x1) / 2;
      const rz = E.z1 + 0.6;
      const rope = new Paint().box(0x7a1c18, 0, 0, 0, 2.6, 0.06, 0.06).box(0xc79a3c, 0, -0.14, 0.03, 0.18, 0.2, 0.08).box(0x9aa0aa, 0, 0.0, 0.03, 0.12, 0.1, 0.03);
      const slack = new Paint().box(0x7a1c18, 0, -0.42, 0, 0.06, 0.84, 0.06).box(0x7a1c18, 0.55, -0.83, 0.1, 1.1, 0.04, 0.06, 0.2);
      const curtain = this.mesh(new Paint().box(STEEL, 0, 0, 0, 2.9, 1.9, 0.1), this.front.g);
      curtain.position.set(ex, 4.3, E.z0 + 3.4);
      this.escal = { rope: this.mesh(rope, this.front.g), slack: this.mesh(slack, this.front.g), curtain, k: 0 };
      this.escal.rope.position.set(ex, 0.86, rz);
      this.escal.slack.position.set(ex - 1.3, 0.86, rz);
    }

    // the Signalka's red star
    this.flareMat = this.mat(new THREE.MeshBasicMaterial({ color: 0xff3a22, transparent: true, opacity: 1, fog: false }));
    const star = new THREE.Mesh(this.geo(new THREE.SphereGeometry(0.9, 12, 10)), this.flareMat);
    const halo = new THREE.Mesh(this.geo(new THREE.SphereGeometry(4.5, 12, 10)), this.mat(new THREE.MeshBasicMaterial({ color: 0xff2a14, transparent: true, opacity: 0.16, fog: false, depthWrite: false })));
    this.flare.add(star, halo);
    this.flare.visible = false;
    this.root.add(this.flare);

    // the red sack under the little fir (it sits over the box the game keeps there; when the box moves, it goes with
    // it: `placeSack`), a prize for the hook
    {
      const S = ZARYA.sack;
      const p = new Paint().ball(0xa8201a, 0, 0.6, 0, 0.72, 1.15, 0.95, 1, 12).cyl(0xa8201a, 0, 1.38, 0, 0.2, 0.34, 0.4, 10).torus(GOLD, 0, 1.24, 0, 0.24, 0.035, Math.PI / 2);
      this.sackSite = this.site(S.x, S.z, 110);
      this.sack = this.mesh(p, this.sackSite.g);
      this.sack.position.set(S.x, 0, S.z);
      this.sack.visible = false; // (round 3: the sack is the box's own model now, `world/models/giftSack.ts`)
      this.prize =this.mesh(new Paint().box(RED, 0, 0, 0, 0.34, 0.3, 0.34).box(GOLD, 0, 0, 0, 0.36, 0.06, 0.36).box(GOLD, 0, 0, 0, 0.06, 0.32, 0.36), this.fair.g);
      this.prize.position.set(ZARYA.hook.x, 2.1, ZARYA.hook.z + 1.25);
    }

    // =====================================================================================================
    // what glints (one draw call), what glows (one more)
    // =====================================================================================================
    const spark = (list: Spark[], x: number, y: number, z: number, c: THREE.Color, s: number, o: Partial<Spark> = {}): number => list.push({ x, y, z, c, s, sx: 1, sy: 1, sz: 1, spin: 0, bob: 0, on: false, ...o }) - 1;
    // ---- items (round 3): each collectable is a small model of itself lying where it lies (`items.ts`, one draw call
    // for all of them, a soft rim of light round each); over each, a small twinkle so it is found from across a room
    const town = townItems();
    this.itemAt = town.at;
    this.items = new ItemMarks(town.spots);
    this.root.add(this.items.mesh);
    const twinkle = (i: number, c: THREE.Color): number => {
      const s = town.spots[i]!;
      return spark(this.sparks, s.x, s.y + (s.kind === 'find' ? 0.3 : 0.42), s.z, c, 0.38, { spin: 1.4, bob: 0.04 });
    };
    const amber = hex(AMBER, 1.5);
    this.partAt = this.sparks.length;
    TOWN.parts.forEach((_, i) => twinkle(town.at.part + i, amber));
    this.findAt = this.sparks.length;
    TOWN.finds.forEach((_, i) => twinkle(town.at.find + i, amber));
    this.toolAt = this.sparks.length;
    TOOLS.forEach((_, i) => twinkle(town.at.tool + i, hex(0x8fd8ff, 1.6)));
    this.modPartAt = this.sparks.length;
    MOD_PARTS.forEach((_, i) => twinkle(town.at.mod + i, hex(0xffd27a, 1.5)));
    // things worth a look: a speck that catches the eye from close by, nothing more
    this.clueAt = this.sparks.length;
    for (const c of CLUES) spark(this.sparks, c.at.x, CLUE_Y[c.id] ?? 1.3, c.at.z, hex(0xfff0c8, 0.9), 0.3, { spin: 0.6 });
    // ---- side stories (`sidestories.ts`, `sideModels.ts`): their things, one more mesh; a speck like a clue's over each place ----
    this.side = sideMarks();
    this.root.add(this.side.marks.mesh);
    this.sideAt = this.sparks.length;
    for (const q of SIDE_PLACES) spark(this.sparks, q.p.at.x, q.p.y + 0.5, q.p.at.z, hex(0xffe6b0, 0.9), 0.28, { spin: 0.8 });
    this.gems = this.instanced(new THREE.OctahedronGeometry(0.15), this.glow, this.sparks.length);

    // the tree's glass ornaments where they rolled, and back on its lower branches
    for (let i = 0; i < ORNAMENTS.length; i++) spark(this.orbs, ORNAMENTS[i]!.x, 0.17, ORNAMENTS[i]!.z, hex(GLASS[i % GLASS.length]!, 1.1), 0.15, { bob: 0.02 });
    for (let i = 0; i < ORNAMENTS.length; i++) {
      const a = (i / ORNAMENTS.length) * Math.PI * 2 + 0.5;
      spark(this.orbs, ZARYA.tree.x + Math.cos(a) * 4.5, 2.75 + (i % 2) * 0.5, ZARYA.tree.z + Math.sin(a) * 4.5, hex(GLASS[i % GLASS.length]!, 1.5), 0.26);
    }
    // a lamp over each of the plant's valves, over each of the purge console's switches, and the hut's little window
    for (const v of TETS.valves) spark(this.orbs, v.x, 1.47, v.z, hex(0xff3020, 0.5), 0.065);
    for (const k of BERLOGA.keys) spark(this.orbs, k.x + CONSOLE, 1.53, k.z + 0.34, hex(0xff3020, 0.3), 0.05);
    spark(this.orbs, 0, 0, 0, hex(0xffb866, 1.6), 0.22, { sx: 1, sy: 1, sz: 0.2 });
    // the star on the watcher's staff
    spark(this.orbs, 0, 0, 0, hex(0x9fd0ff, 1.4), 0.09);
    this.balls = this.instanced(new THREE.SphereGeometry(1, 10, 8), this.glow, this.orbs.length);

    // keys: a bow and a blade, the blade along +x (four in the Berloga's door, four in the console, Borya's on its hook)
    {
      const p = new Paint().torus(0xffffff, -0.05, 0, 0, 0.04, 0.014, 0, 0, 0).box(0xffffff, 0.035, 0, 0, 0.11, 0.022, 0.012).box(0xffffff, 0.07, -0.02, 0, 0.022, 0.03, 0.012);
      this.keys = this.instanced(p.build(), this.glow, 9);
    }

    // =====================================================================================================
    // the gates between zones
    // =====================================================================================================
    const leafGeo = new Map<number, THREE.BufferGeometry>();
    const IRON = 0x353c46;
    const leaf = (len: number): THREE.BufferGeometry => {
      let g = leafGeo.get(len);
      if (g) return g;
      const top = 2.75;
      const p = new Paint();
      for (const y of [0.22, 1.45, top]) p.box(IRON, len / 2, y, 0, len, 0.07, 0.07);
      for (const x of [0.045, len - 0.045]) p.box(IRON, x, top / 2 + 0.08, 0, 0.09, top + 0.1, 0.09);
      const n = Math.max(3, Math.round(len / 0.3));
      for (let i = 1; i < n; i++) {
        const x = (i * len) / n;
        p.box(IRON, x, (top + 0.3) / 2, 0, 0.04, top - 0.1, 0.04);
        p.cyl(IRON, x, top + 0.22, 0, 0, 0.045, 0.16, 4);
      }
      g = this.geo(p.build());
      leafGeo.set(len, g);
      return g;
    };
    // the Palace's doors: tall, panelled, a brass bar to push
    const palaceLeaf = (len: number): THREE.BufferGeometry => {
      const WOOD = 0x4a3221;
      const PANEL = 0x6b4a30;
      const p = new Paint().box(WOOD, len / 2, 1.7, 0, len, 3.4, 0.1);
      for (const y of [0.75, 2.35]) for (const s of [-1, 1]) p.box(PANEL, len / 2, y, s * 0.055, len - 0.4, y < 1 ? 1.0 : 1.7, 0.02);
      for (const s of [-1, 1]) p.box(0xb08a3a, len - 0.22, 1.25, s * 0.1, 0.05, 0.7, 0.05);
      p.box(0xb08a3a, len / 2, 0.08, 0, len, 0.16, 0.12);
      return this.geo(p.build());
    };
    for (const def of GATES) {
      const alongX = def.along === 'x';
      const site = this.site(def.x, def.z, 78);
      const far = ZARYA_ZONES.find((q) => q.id === def.zones[1])!;
      // the way its leaves swing: into the zone on the far side from the square
      const s = Math.sign(alongX ? (far.z0 + far.z1) / 2 - def.z : (far.x0 + far.x1) / 2 - def.x) || 1;
      const gate: GateLook = { def, site, k: 0, leaves: [], arm: null, chain: null, cut: null, drift: null };
      const turn = alongX ? 0 : -Math.PI / 2;
      if (def.opens === 'code') {
        // the checkpoint: a striped arm across the road, a weight on its short end
        const len = def.half * 2 - 0.15;
        const p = new Paint();
        for (let i = 0; i * 0.6 < len; i++) p.box(i % 2 ? 0xe9e6de : 0xb3261e, Math.min(len, i * 0.6 + 0.3), 0, 0, Math.min(0.6, len - i * 0.6), 0.11, 0.09);
        p.box(0x2b2f36, -0.45, 0, 0, 0.6, 0.3, 0.2).cyl(0x2b2f36, 0, 0, 0, 0.1, 0.1, 0.34, 8, Math.PI / 2);
        p.box(0xb3261e, len * 0.5, -0.3, 0, 0.5, 0.36, 0.03).box(0xe9e6de, len * 0.5, -0.3, 0, 0.34, 0.08, 0.04);
        gate.arm = this.mesh(p, site.g);
        gate.arm.position.set(alongX ? def.x - def.half + 0.05 : def.x, 1.1, alongX ? def.z : def.z - def.half + 0.05);
        gate.arm.rotation.y = turn;
      } else {
        const g = def.opens === 'tickets' ? palaceLeaf(def.half - 0.02) : leaf(def.half - 0.03);
        for (const end of [-1, 1]) {
          const m = new THREE.Mesh(g, this.paint);
          m.position.set(alongX ? def.x + end * def.half : def.x, 0, alongX ? def.z : def.z + end * def.half);
          site.g.add(m);
          gate.leaves.push({ m, shut: alongX ? (end < 0 ? 0 : Math.PI) : end < 0 ? -Math.PI / 2 : Math.PI / 2, way: alongX ? end * s : -end * s });
        }
      }
      if (def.opens === 'cutDepot' || def.opens === 'cutNorth' || def.opens === 'cutWest') {
        // a chain through the two leaves and a padlock on it; cut, it lies in the snow
        const p = new Paint();
        for (const f of [-1, 1]) {
          for (let i = 0; i < 9; i++) {
            const x = (i - 4) * 0.115;
            p.torus(0x9aa0aa, x, 1.34 - Math.cos((x / 0.46) * 1.45) * 0.22, f * 0.085, 0.07, 0.022, i % 2 ? Math.PI / 2 : 0.2, 0, 0);
          }
          p.box(0xc79a3c, 0, 0.93, f * 0.1, 0.22, 0.24, 0.08).torus(0x9aa0aa, 0, 1.07, f * 0.1, 0.07, 0.022, 0, 0, 0, Math.PI);
        }
        gate.chain = this.mesh(p, site.g);
        gate.chain.position.set(def.x, 0, def.z);
        gate.chain.rotation.y = turn;
        const c = new Paint();
        for (let i = 0; i < 5; i++) c.torus(0x9aa0aa, -0.7 + i * 0.115, 0.035, 0.5 + (i % 2) * 0.04, 0.07, 0.022, Math.PI / 2, 0, 0);
        for (let i = 0; i < 4; i++) c.torus(0x9aa0aa, 0.25 + i * 0.11, 0.035, 0.8 - i * 0.07, 0.07, 0.022, Math.PI / 2, 0, 0);
        c.box(0xc79a3c, 0.72, 0.05, 0.6, 0.22, 0.08, 0.24, 0.5);
        gate.cut = this.mesh(c, site.g);
        gate.cut.position.set(def.x, 0, def.z);
        gate.cut.rotation.y = turn + (s < 0 ? 0 : Math.PI);
      }
      if (def.opens === 'pond') {
        // frozen shut: a drift blown against its foot, ice over the lower bars, icicles under the top rail
        const SNOW = 0xa9b6cc;
        const ICE = 0x9fc8e8;
        const p = new Paint();
        const L = def.half;
        for (let i = 0; i < 7; i++) {
          const x = -L + ((i + 0.5) * 2 * L) / 7;
          const r = 0.75 + ((i * 37) % 5) * 0.09;
          p.ball(SNOW, x, 0, (i % 2 ? 0.45 : -0.4) + ((i * 13) % 3) * 0.1, r, 1.1, 0.5 + ((i * 7) % 3) * 0.08, 1, 7);
        }
        p.box(ICE, 0, 0.85, 0, L * 2 - 0.1, 1.0, 0.07).box(ICE, 0, 2.72, 0, L * 2 - 0.1, 0.14, 0.12);
        for (let i = 0; i < L * 4; i++) {
          const x = -L + 0.2 + ((i + 0.3) * (2 * L - 0.4)) / (L * 4);
          const h = 0.25 + ((i * 29) % 7) * 0.07;
          p.cyl(ICE, x, 2.66 - h / 2, 0, 0.045, 0, h, 4);
        }
        gate.drift = this.mesh(p, site.g);
        gate.drift.position.set(def.x, 0, def.z);
        gate.drift.rotation.y = turn;
      }
      this.gates.push(gate);
    }

    // =====================================================================================================
    // the three matryoshkas (the whole doll, its top half, its foot: three draw calls for all of them)
    // =====================================================================================================
    {
      const SHAWL = 0xb3261e;
      const BASE = 0x1c1410;
      const TRIM = 0xe0b030;
      const FACE = 0xf2dcc2;
      const prof: [number, number][] = [[0, 0], [0.26, 0], [0.3, 0.04], [0.34, 0.2], [0.345, 0.32], [0.32, DOLL_SPLIT], [0.265, 0.58], [0.222, 0.66], [0.226, 0.72], [0.24, 0.8], [0.224, 0.89], [0.16, 0.96], [0, 1]];
      const tone = (y: number): number => (y < 0.045 ? BASE : y < 0.1 ? TRIM : y > 0.63 && y < 0.69 ? TRIM : SHAWL);
      const foot = (p: Paint): Paint => {
        p.lathe(prof.filter(([, y]) => y <= DOLL_SPLIT), 14, tone);
        // gold flowers on the belly: a big one, two small, a row of dots at the hem
        const flower = (x: number, y: number, r: number): void => {
          const a0 = Math.asin(Math.min(1, Math.abs(x) / 0.34)) * Math.sign(x);
          const z = -Math.cos(a0) * (0.33 - (0.32 - y) * (0.32 - y) * 0.5);
          for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2;
            p.ball(TRIM, x + Math.cos(a) * r * Math.cos(a0), y + Math.sin(a) * r, z - 0.012 + Math.abs(Math.cos(a) * r * Math.sin(a0)), r * 0.62, 1, 1, 0.35, 6);
          }
          p.ball(0x7a1c18, x, y, z - 0.03, r * 0.42, 1, 1, 0.4, 6);
        };
        flower(0, 0.3, 0.062);
        flower(-0.17, 0.2, 0.036);
        flower(0.17, 0.2, 0.036);
        return p;
      };
      const top = (p: Paint): Paint => {
        p.lathe(prof.filter(([, y]) => y >= DOLL_SPLIT), 14, tone);
        // her face in the shawl: pale and round, dark hair parted, two eyes, red cheeks, a small mouth
        p.ball(FACE, 0, 0.79, -0.175, 0.125, 1, 1, 0.55, 10);
        p.ball(0x2a1a10, -0.05, 0.86, -0.19, 0.075, 1, 0.6, 0.45, 6).ball(0x2a1a10, 0.05, 0.86, -0.19, 0.075, 1, 0.6, 0.45, 6);
        for (const s of [-1, 1]) p.ball(0x16181c, s * 0.045, 0.8, -0.238, 0.017, 1, 1, 0.5, 5).ball(0xe07a6a, s * 0.075, 0.755, -0.228, 0.026, 1, 1, 0.4, 5);
        p.ball(0xb3261e, 0, 0.735, -0.238, 0.02, 1.3, 0.7, 0.4, 5);
        // the shawl's knot under her chin, and its gold border
        p.ball(TRIM, 0, 0.66, -0.235, 0.04, 1.4, 1, 0.6, 6);
        return p;
      };
      this.dollWhole = this.instanced(top(foot(new Paint())).box(BASE, 0, DOLL_SPLIT, 0, 0.001, 0.001, 0.001).build(), this.paint, DOLLS.length);
      const t = top(new Paint()).build();
      t.translate(0, -DOLL_SPLIT, 0);
      this.dollTop = this.instanced(t, this.paint, DOLLS.length * STORY.dollShells);
      // an opened foot is hollow: dark inside
      const f = foot(new Paint()).put(new THREE.CircleGeometry(0.31, 14), 0x2a1a10, 0, DOLL_SPLIT - 0.03, 0, -Math.PI / 2);
      this.dollFoot = this.instanced(f.build(), this.paint, DOLLS.length * STORY.dollShells);
    }

    // =====================================================================================================
    // the Rynok: the cold store's door, the bar for it
    // =====================================================================================================
    {
      // the layout (`zaryaRynok.ts`) draws the doorway, its brackets and the board of key hooks; the door's leaf and
      // its bar are drawn only here (open against the wall, or shut and barred)
      const C = RYNOK.coldDoor;
      const site = this.site(C.x, C.z, 70);
      const W = 2.4;
      const ENAMEL = 0xe9e6de;
      const p = new Paint().box(ENAMEL, W / 2, 1.3, 0, W + 0.02, 2.62, 0.23);
      for (const y of [0.1, 1.3, 2.5]) p.box(0x59626e, W / 2, y, 0, W + 0.06, 0.13, 0.27);
      for (const u of [0.04, 2.36]) p.box(0x59626e, u, 1.3, 0, 0.09, 2.62, 0.27);
      // the long latch handle, and a small round window frosted over
      p.box(0x2b2f36, 1.95, 1.2, -0.17, 0.52, 0.08, 0.12);
      for (const f of [-1, 1]) p.cyl(0x59626e, W / 2, 1.85, f * 0.125, 0.2, 0.2, 0.03, 12, Math.PI / 2).cyl(0xa8c4dc, W / 2, 1.85, f * 0.135, 0.15, 0.15, 0.03, 12, Math.PI / 2);
      const leafM = this.mesh(p, site.g);
      // hinged on its north edge, on the hall's side of the wall
      leafM.position.set(RYNOK.coldStore.x0 - 0.32, 0, C.z - 1.2);
      // the bar: a length of iron that drops into a bracket either side of the doorway
      const bar = this.mesh(new Paint().box(0x2b2f36, 0, 0, 0, 0.12, 2.84, 0.1), site.g);
      this.cold = { site, leaf: leafM, bar, a: 1 };
    }

    // =====================================================================================================
    // the Dom Kultury: Baba Yaga's hut on the stage's revolve, the lever, the museum guard's cabinet
    // =====================================================================================================
    {
      const site = this.site(DK.hut.x, DK.hut.z, 80);
      // ---- Baba Yaga's stage: the hut that walks, the machines that move (`stageLook.ts`) ----
      const stage = new StageLook({ mesh: (p, parent, mat) => this.mesh(p, parent, mat), mat: (m) => this.mat(m), geo: (g) => this.geo(g) });
      site.g.add(stage.root);
      this.hut = { site, stage };

      // the cabinet's grille (the layout draws only the frame, the sabre and the velvet: the grille is this one),
      // hinged on its west edge, opening into the room
      const C = DK.cabinet;
      const cs = this.site(C.x, C.z, 45);
      const g = new Paint();
      for (let i = 0; i < 9; i++) g.box(0x2b2f36, 0.06 + i * 0.14, 1.55, 0, 0.03, 2.1, 0.03);
      for (const y of [0.56, 1.55, 2.54]) g.box(0x2b2f36, 0.62, y, 0, 1.24, 0.05, 0.04);
      g.box(0xb08a3a, 1.22, 1.5, 0.05, 0.1, 0.16, 0.06);
      const leafM = this.mesh(g, cs.g);
      leafM.position.set(C.x - 0.62, 0, DK.museum.z0 + 1.02);
      this.cabinet = { site: cs, leaf: leafM, a: 0 };
    }

    // =====================================================================================================
    // the canteen's three plugs; the plant's three valve wheels
    // =====================================================================================================
    {
      const R = CANTEEN.rect;
      const site = this.site((R.x0 + R.x1) / 2, (R.z0 + R.z1) / 2, 60);
      this.plugs = { site, in: [], out: [] };
      for (const s of CANTEEN.plugs) {
        const north = s.z < 0;
        // made facing +z (out of the wall, into the room)
        const pin = new Paint().box(0x8a1c14, 0, 0.45, 0.075, 0.15, 0.15, 0.13).box(0x16181c, 0, 0.3, 0.1, 0.045, 0.2, 0.045);
        const out = new Paint().box(0xe9e6de, 0, 0.45, 0.065, 0.2, 0.2, 0.13).box(0xe9e6de, 0, 0.23, 0.065, 0.075, 0.44, 0.13);
        for (const x of [-0.04, 0.04]) out.cyl(0x16181c, x, 0.45, 0.132, 0.016, 0.016, 0.01, 6, Math.PI / 2);
        // pulled: the plug on the floor at the end of its lead, a pace from the wall
        out.box(0x8a1c14, 0.3, 0.07, 0.62, 0.15, 0.13, 0.15, 0.5).box(0x8a8f98, 0.36, 0.07, 0.72, 0.02, 0.03, 0.09, 0.5).box(0x8a8f98, 0.3, 0.07, 0.75, 0.02, 0.03, 0.09, 0.5);
        out.box(0x16181c, 0.2, 0.03, 0.42, 0.045, 0.04, 0.42, -0.5);
        for (const [list, p] of [[this.plugs.in, pin], [this.plugs.out, out]] as const) {
          const m = this.mesh(p, site.g);
          m.position.set(s.x, 0, north ? R.z0 + 0.2 : R.z1 - 0.245);
          m.rotation.y = north ? 0 : Math.PI;
          list.push(m);
        }
      }
    }
    {
      // the layout (`zaryaTets.ts`) draws each valve's body and its big red rim with twelve short spokes; this is what
      // turns inside it: the stem, the hub and its three spokes (one painted white, with a grip), a lamp on top
      const T = TETS.hall;
      const site = this.site((T.x0 + T.x1) / 2, (T.z0 + T.z1) / 2, 85);
      this.valves = { site, wheel: [], a: [] };
      for (const v of TETS.valves) {
        const p = new Paint().cyl(0x59626e, 0, 1.2, 0, 0.045, 0.045, 0.4, 8).cyl(0xb3261e, 0, 1.1, 0, 0.11, 0.11, 0.09, 10).cyl(0x2b2f36, 0, 1.4, 0, 0.07, 0.07, 0.04, 8);
        for (let i = 0; i < 3; i++) {
          const a = (i * 2 * Math.PI) / 3;
          p.box(i ? 0xb3261e : 0xe9e6de, Math.cos(a) * 0.17, 1.1, Math.sin(a) * 0.17, 0.34, 0.05, 0.05, -a);
        }
        p.cyl(0xe9e6de, 0.3, 1.2, 0, 0.032, 0.032, 0.18, 6);
        const m = this.mesh(p, site.g);
        m.position.set(v.x, 0, v.z);
        this.valves.wheel.push(m);
        this.valves.a.push(0);
      }
    }

    // =====================================================================================================
    // the Berloga: the door with four key slots (a slab that runs along the wall)
    // =====================================================================================================
    {
      // the door's only leaf (the layout, `zaryaBerloga.ts`, draws the opening and its frame): run across the opening
      // while the story has it shut, and slid north along the wall when the four keys are in
      const B = BERLOGA;
      const site = this.site((B.rect.x0 + B.rect.x1) / 2, 0, 70);
      const STEEL = 0x59626e;
      const IRON = 0x2b2f36;
      const p = new Paint().box(STEEL, 0, 1.65, 0, 0.46, 3.24, 3.44).box(IRON, -0.235, 1.65, 0, 0.03, 2.8, 3);
      p.torus(STEEL, -0.36, 1.6, 0, 0.52, 0.05, 0, Math.PI / 2, 0).box(IRON, -0.3, 1.6, 0, 0.16, 0.2, 0.2);
      for (let k = 0; k < 3; k++) p.box(STEEL, -0.35, 1.6, 0, 0.04, 1.04, 0.06, 0, (k * Math.PI) / 3);
      for (const y of [0.7, 2.6]) p.box(STEEL, -0.27, y, 0, 0.07, 0.12, 3.3);
      for (let k = 0; k < 8; k++) for (const y of [0.25, 3.05]) p.box(IRON, -0.25, y, -1.5 + k * 0.43, 0.05, 0.1, 0.1);
      const slab = this.mesh(p, site.g);
      slab.position.set(B.doorX - 0.58, 0, 0);
      this.hall = { site, slab, y: 0 };
    }

    // =====================================================================================================
    // kiosks and mods (`mods.ts`): the kiosks rolled open, the repairman asleep at his bench and his tools
    // =====================================================================================================
    this.booth = this.buildKiosksAndBooth();

    // =====================================================================================================
    // the named ones' costumes, and the one who watches
    // =====================================================================================================
    this.costumes = this.tailor();
    this.watcher = this.mesh(this.figure(), this.root);
    this.watcher.visible = false;
    this.watcher.frustumCulled = false;
    // where he can stand: by a lamp post, at a tram's doors, at a gate, where the edges of a zone are out of sight
    for (const l of LAMPS) this.spots.push({ x: l.x + 0.9, z: l.z + 0.4 });
    for (const s of STOPS) this.spots.push({ x: s.door.x - 9, z: s.door.z + 2.5 }, { x: s.door.x + 11, z: s.door.z + 3 });
    for (const g of GATES) for (const s of [-1, 1]) this.spots.push(g.along === 'x' ? { x: g.x, z: g.z + s * 2.6 } : { x: g.x + s * 2.6, z: g.z });
    for (const zone of [RYNOK, DVOR, GARAGES, DEPOT, BANYA, TETS, INSTITUTE]) for (const [x, z] of zone.spawns) this.spots.push({ x, z });
    for (const d of DOLLS) this.spots.push({ x: d.x + 3.4, z: d.z - 2.8 });
  }

  // ---------------------------------------------------------------------------------------------
  // making things
  // ---------------------------------------------------------------------------------------------

  private mat<T extends THREE.Material>(m: T): T {
    this.mats.push(m);
    return m;
  }

  private geo<T extends THREE.BufferGeometry>(g: T): T {
    this.geos.push(g);
    return g;
  }

  /** A place: its group is in the scene only while the camera is near. */
  /** Ded Moroz's sack stands over the box wherever the box is now (it moves: `zarya/sack.ts`). */
  placeSack(x: number, z: number): void {
    if (this.sack.position.x === x && this.sack.position.z === z) return;
    this.sack.position.set(x, 0, z);
    this.sackSite.x = x;
    this.sackSite.z = z;
  }

  private site(x: number, z: number, r: number): Site {
    const s: Site = { x, z, r, g: new THREE.Group() };
    this.sites.push(s);
    this.root.add(s.g);
    return s;
  }

  private mesh(p: Paint | THREE.BufferGeometry, parent: THREE.Object3D, mat: THREE.Material = this.paint): THREE.Mesh {
    const m = new THREE.Mesh(this.geo(p instanceof Paint ? p.build() : p), mat);
    parent.add(m);
    return m;
  }

  private instanced(g: THREE.BufferGeometry, mat: THREE.Material, n: number): THREE.InstancedMesh {
    const m = new THREE.InstancedMesh(this.geo(g), mat, n);
    m.frustumCulled = false;
    m.count = 0;
    this.root.add(m);
    return m;
  }

  /**
   * Kiosks and mods: each kiosk's open face (drawn over its shut shutter once it is paid for: the dark inside, two
   * shelves of cartridges, tins and boxes, the shutter rolled into its drum at the top, the padlock lying open), and at
   * the Rynok's repair booth the repairman asleep on a stool at the end of his bench, his head on his arms, with a place
   * on the bench for each of his three tools. One mesh a kiosk, one for him, one a tool: each hidden while far off.
   */
  private buildKiosksAndBooth(): { site: Site; tools: THREE.Mesh[] } {
    const DARK = 0x17130f;
    const BOARD = 0x7b5a3a;
    const STEEL = 0x8a8f98;
    const GOODS = [0x5d6b3a, 0xb3261e, 0x3c6f8a, 0xd6aa3c, 0x4f6f52, 0xd8cfb8];
    for (const s of SHUTTERS) {
      const fx = -Math.sin(s.yaw);
      const fz = -Math.cos(s.yaw);
      const site = this.site(s.at.x, s.at.z, 60);
      // in the kiosk's own frame: +x out through the shutter (its foot is 1.62 m out), +z along it
      const p = new Paint().box(DARK, 1.7, 1.79, 0, 0.03, 1.46, 3.52);
      for (const y of [1.42, 1.92]) {
        p.box(BOARD, 1.74, y, 0, 0.1, 0.03, 3.4);
        let z = -1.58;
        for (let k = 0; z < 1.5; k++) {
          const w = 0.18 + ((k * 7 + Math.round(y * 10)) % 3) * 0.08;
          const h = 0.12 + ((k * 5) % 4) * 0.05;
          p.box(GOODS[(k + Math.round(y * 3)) % GOODS.length]!, 1.76, y + 0.015 + h / 2, z + w / 2, 0.12, h, w);
          z += w + 0.05;
        }
      }
      // cartridge boxes and a tin on the counter shelf, the padlock lying open beside them
      for (const [z, c] of [[-1.2, GOODS[0]!], [-0.85, GOODS[1]!], [0.9, GOODS[3]!]] as const) p.box(c, 1.82, 1.13, z, 0.22, 0.12, 0.28);
      p.cyl(0x8c939b, 1.82, 1.14, 0.3, 0.07, 0.07, 0.14, 8);
      p.box(0xb08a3a, 1.86, 1.08, 1.35, 0.08, 0.05, 0.1).torus(0x9aa1a7, 1.86, 1.1, 1.35, 0.035, 0.008, Math.PI / 2, 0.4, 0);
      // the shutter, rolled into its drum under the colour strip
      p.cyl(STEEL, 1.72, 2.6, 0, 0.1, 0.1, 3.56, 10, Math.PI / 2);
      const open = this.mesh(p, site.g);
      open.position.set(s.at.x - fx * 1.62, 0, s.at.z - fz * 1.62);
      open.rotation.y = Math.atan2(-fz, fx);
      open.visible = false;
      this.kiosks.push({ site, open });
    }

    // the repairman, asleep at the north end of his bench (the game's upgrade bench, its top a metre up)
    const B = RYNOK.booth;
    const site = this.site(B.x, B.z, 50);
    // a quilted work jacket in faded blue, so he reads against the dark bench
    const COAT = 0x6f7f96;
    const TROUSER = 0x3a3d46;
    const SKIN = 0xd2b49a;
    const x = B.x + 0.05;
    const z0 = B.z - 1.78;
    const man = new Paint();
    // his stool
    man.cyl(0x4d3725, x, 0.6, z0, 0.19, 0.19, 0.05, 10);
    for (const a of [0.4, 2.5, 4.6]) man.rod(0x2b2f36, x + Math.cos(a) * 0.14, 0, z0 + Math.sin(a) * 0.14, x + Math.cos(a) * 0.08, 0.58, z0 + Math.sin(a) * 0.08, 0.018);
    for (const sx of [-0.11, 0.11]) {
      // thighs forward, shins down, boots
      man.rod(TROUSER, x + sx, 0.68, z0 + 0.02, x + sx, 0.64, z0 + 0.42, 0.075, 0.065);
      man.rod(TROUSER, x + sx, 0.64, z0 + 0.42, x + sx, 0.1, z0 + 0.46, 0.06, 0.055);
      man.box(0x1a1a1c, x + sx, 0.05, z0 + 0.52, 0.11, 0.1, 0.26);
    }
    // slumped forward over the bench: his back, his shoulders, his arms folded on the top, his head on them
    man.rod(COAT, x, 0.66, z0, x, 1.08, z0 + 0.48, 0.17, 0.19);
    man.ball(COAT, x, 1.08, z0 + 0.5, 0.2, 1.2, 0.65, 0.85);
    for (const sx of [-1, 1]) man.rod(COAT, x + sx * 0.2, 1.08, z0 + 0.55, x + sx * 0.16, 1.04, z0 + 0.86, 0.065, 0.06);
    man.box(COAT, x, 1.035, z0 + 0.94, 0.46, 0.09, 0.16);
    for (const sx of [-1, 1]) man.ball(SKIN, x + sx * 0.2, 1.04, z0 + 1.02, 0.045);
    man.ball(SKIN, x + 0.02, 1.15, z0 + 0.86, 0.11, 1, 0.9, 1);
    // his flat cap, and a pencil behind his ear
    man.cyl(0x4a4640, x + 0.02, 1.23, z0 + 0.84, 0.12, 0.125, 0.06, 10, 0.5).box(0x4a4640, x + 0.02, 1.2, z0 + 0.98, 0.16, 0.02, 0.1, 0, 0.5);
    man.rod(0xd6aa3c, x + 0.12, 1.2, z0 + 0.8, x + 0.12, 1.16, z0 + 0.92, 0.008);
    this.mesh(man, site.g);
    // his three tools, each on the bench's front edge once it is back: the soldering iron, the screwdrivers in their
    // roll, the multimeter
    const tx = B.x + 0.32;
    const ty = 1.0;
    const tools: THREE.Mesh[] = [];
    const iron = new Paint().rod(0x8c939b, tx, ty + 0.03, z0 + 1.42, tx, ty + 0.03, z0 + 1.62, 0.006).rod(0x7a1c18, tx, ty + 0.03, z0 + 1.62, tx, ty + 0.03, z0 + 1.8, 0.018).box(0x2b2f36, tx - 0.06, ty + 0.02, z0 + 1.62, 0.08, 0.04, 0.06);
    const roll = new Paint().box(0x6b5a3a, tx - 0.02, ty + 0.012, z0 + 2.02, 0.22, 0.02, 0.26);
    for (let k = 0; k < 5; k++) roll.rod([0xb3261e, 0xd6aa3c, 0x2f4f8f, 0xb3261e, 0x4f6f52][k]!, tx - 0.11 + k * 0.045, ty + 0.035, z0 + 1.92, tx - 0.11 + k * 0.045, ty + 0.035, z0 + 2.14, 0.012);
    const meter = new Paint().box(0xe08a1e, tx - 0.03, ty + 0.035, z0 + 2.42, 0.14, 0.07, 0.2).box(0xe6dcc2, tx + 0.04, ty + 0.05, z0 + 2.4, 0.01, 0.04, 0.08).cyl(0x101216, tx + 0.045, ty + 0.035, z0 + 2.48, 0.025, 0.025, 0.01, 8, 0, 0, Math.PI / 2);
    meter.rod(0xb3261e, tx - 0.03, ty + 0.01, z0 + 2.52, tx - 0.1, ty + 0.01, z0 + 2.7, 0.006).rod(0x101216, tx - 0.01, ty + 0.01, z0 + 2.52, tx + 0.04, ty + 0.01, z0 + 2.72, 0.006);
    for (const t of [iron, roll, meter]) {
      const m = this.mesh(t, site.g);
      m.visible = false;
      tools.push(m);
    }
    return { site, tools };
  }

  /** The watcher: Morozko's blue coat and tall hat, a white beard to the belt, a staff. Not one of the infected, not solid. */
  private figure(): Paint {
    const BLUE = 0x2456a8;
    const FUR = 0xe4e9f0;
    const SKIN = 0xa9b4c4;
    const p = new Paint();
    p.cyl(BLUE, 0, 1.0, 0, 0.27, 0.5, 1.72, 10).cyl(FUR, 0, 0.16, 0, 0.5, 0.53, 0.2, 10).box(FUR, 0, 1.0, -0.39, 0.12, 1.6, 0.05, 0, 0.135);
    p.ball(BLUE, 0, 1.82, 0, 0.36, 1, 0.5, 0.75, 8).cyl(FUR, 0, 1.9, 0, 0.17, 0.3, 0.16, 10);
    for (const s of [-1, 1]) {
      p.rod(BLUE, s * 0.34, 1.8, 0, s * 0.44, 1.12, -0.06, 0.12, 0.1).cyl(FUR, s * 0.44, 1.08, -0.06, 0.12, 0.12, 0.14, 8).ball(FUR, s * 0.45, 0.95, -0.07, 0.1, 1, 1.2, 1, 6);
    }
    p.ball(SKIN, 0, 2.08, 0, 0.16, 1, 1.1, 1, 8);
    for (const s of [-1, 1]) p.ball(0x0c0e12, s * 0.06, 2.1, -0.145, 0.022, 1, 1, 0.5, 5);
    // the beard, the hat with its fur brim
    p.put(new THREE.ConeGeometry(0.2, 0.75, 8).rotateX(Math.PI), FUR, 0, 1.68, -0.13, 0, 0, 0, 1, 1, 0.55);
    p.cyl(FUR, 0, 2.24, 0, 0.2, 0.2, 0.13, 10).cyl(BLUE, 0, 2.46, 0, 0.15, 0.185, 0.34, 10).ball(BLUE, 0, 2.63, 0, 0.15, 1, 0.6, 1, 8).ball(FUR, 0, 2.74, 0, 0.06, 1, 1, 1, 6);
    // the staff in his right hand, a star of ice on it
    p.rod(0xdfe8f0, 0.5, 0, -0.1, 0.5, 2.7, -0.1, 0.03, 0.025);
    for (const a of [0, Math.PI / 4]) p.octa(0xbfe0ff, 0.5, 2.85, -0.1, 0.2, 1, 1, 0.3, a);
    return p;
  }

  /** The colours of a body: its torso (front and back), neck, head, sleeves, forearms, hands, thighs (and their fronts), shins, boots. */
  private cloth(c: readonly number[], o: { smear?: number; smearColor?: number; shirt?: boolean; band?: boolean } = {}): THREE.Material {
    const m = this.mat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94 }));
    const uC = { value: c.map((h) => new THREE.Color(h)) };
    const uS = { value: new THREE.Color(o.smearColor ?? 0x5a0f0c) };
    const uX = { value: new THREE.Vector4(o.smear ?? 0, o.shirt ? 1 : 0, o.band ? 1 : 0, 2.55) };
    m.userData.uX = uX;
    m.customProgramCacheKey = () => 'zarya-costume';
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uC = uC;
      sh.uniforms.uS = uS;
      sh.uniforms.uX = uX;
      // each part of the body is the bone that moves it most: no clothes are modelled, only coloured
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform vec3 uC[11];\nuniform vec3 uS;\nuniform vec4 uX;').replace(
        '#include <color_vertex>',
        [
          '#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )',
          '  float zb = 2.0;',
          '#ifdef USE_SKINNING',
          '  zb = skinIndex.x;',
          '  float zw = skinWeight.x;',
          '  if ( skinWeight.y > zw ) { zb = skinIndex.y; zw = skinWeight.y; }',
          '  if ( skinWeight.z > zw ) { zb = skinIndex.z; zw = skinWeight.z; }',
          '  if ( skinWeight.w > zw ) { zb = skinIndex.w; }',
          '#endif',
          '  float zf = step( position.z, 0.0 );',
          '  float zh = position.y / uX.w;',
          '  float zk = mod( zb, 3.0 );',
          '  vec3 zc;',
          '  if ( zb < 2.5 ) zc = mix( uC[1], uC[0], zf );',
          '  else if ( zb < 3.5 ) zc = uC[2];',
          '  else if ( zb < 5.5 ) zc = uC[3];',
          '  else if ( zb < 11.5 ) zc = zk < 0.5 ? uC[4] : zk < 1.5 ? uC[5] : uC[6];',
          '  else zc = zk < 0.5 ? mix( uC[7], uC[8], zf ) : zk < 1.5 ? uC[9] : uC[10];',
          '  float zn = sin( position.x * 23.0 + position.y * 9.0 ) * sin( position.y * 17.0 - position.x * 7.0 );',
          '  if ( zf > 0.5 && ( zb < 2.5 || ( zb > 11.5 && zk < 0.5 ) ) ) zc = mix( zc, uS, uX.x * smoothstep( 0.2, 0.42, zn ) );',
          '  if ( uX.y > 0.5 && zf > 0.5 && zb < 2.5 && zh > 0.6 && abs( position.x ) < ( zh - 0.6 ) * uX.w * 0.6 ) zc = vec3( 0.82 );',
          '  if ( uX.z > 0.5 && zf > 0.5 && zb < 2.5 && abs( position.x ) < 0.04 * uX.w ) zc = vec3( 0.78, 0.82, 0.88 );',
          '  vColor = vec4( zc, 1.0 );',
          '#endif',
        ].join('\n'),
      );
    };
    return m;
  }

  /** What each of the named ones wears over the boss's body. */
  private tailor(): Record<Named, Costume> {
    const piece = (p: Paint): THREE.Mesh => new THREE.Mesh(this.geo(p.build()), this.felt);
    const SKIN = 0xb49a8c;

    // ---- Mishka: the fair's bear suit, brown plush over everything, the head with its round ears and its mouth-hole ----
    const PLUSH = 0x6b4a2b;
    const TAN = 0xb08a5a;
    const DARK = 0x16181c;
    const bear = new Paint().ball(PLUSH, 0, 0.1, 0, 1, 1, 0.95, 1, 14);
    for (const s of [-1, 1]) bear.ball(PLUSH, s * 0.72, 0.86, 0.05, 0.36, 1, 1, 1, 14).ball(TAN, s * 0.72, 0.86, -0.12, 0.22, 1, 1, 1, 14).ball(DARK, s * 0.36, 0.34, -0.88, 0.1, 1, 1, 1, 14);
    bear.ball(TAN, 0, -0.1, -0.74, 0.46, 1, 0.8, 1, 14).ball(DARK, 0, 0.06, -1.16, 0.13, 1, 1, 1, 14).ball(DARK, 0, -0.3, -1.02, 0.2, 1, 0.6, 1, 14);
    const mishka: Costume = { body: this.mat(new THREE.MeshStandardMaterial({ color: PLUSH, roughness: 1 })), head: piece(bear), metres: false, hips: null, hand: null };

    // ---- Borya the butcher: a white apron smeared dark red, a white cap, his sleeves rolled, a cleaver ----
    const APRON = 0xe2ded2;
    const SHIRT = 0x8d9aa6;
    const TROUSER = 0x2b2d33;
    const cap = new Paint().cyl(APRON, 0, 0.17, 0.01, 0.17, 0.165, 0.11, 10).ball(APRON, 0, 0.25, 0.02, 0.2, 1, 0.5, 1, 10);
    // the apron's skirt and its bib, hung from his belt; the strings round his back
    const apron = new Paint().box(APRON, 0, -0.33, -0.27, 0.74, 0.8, 0.04, 0, -0.07);
    // what the day's work left on it: smears, not shapes
    for (const [x, y, r, sx, sy] of [[-0.14, -0.22, 0.16, 1.2, 0.8], [-0.05, -0.36, 0.13, 0.7, 1.5], [0.2, -0.5, 0.12, 1, 1.1], [0.14, -0.1, 0.09, 1.6, 0.6], [-0.24, -0.56, 0.08, 1, 1.4], [0.02, -0.62, 0.07, 2.2, 0.5]] as const) {
      apron.ball(r > 0.1 ? 0x5a0f0c : 0x741712, x, y, -0.293 + y * 0.07, r, sx, sy, 0.06, 7);
    }
    apron.cyl(APRON, 0, 0.06, 0, 0.43, 0.43, 0.07, 12, 0, 0, 0, true);
    const cleaver = new Paint().box(0x4d3725, 0, -0.14, -0.02, 0.05, 0.05, 0.24).box(0xaab2bc, 0, -0.06, -0.36, 0.02, 0.24, 0.44).box(0x5a0f0c, 0, -0.16, -0.38, 0.024, 0.06, 0.4);
    const borya: Costume = {
      body: this.cloth([APRON, SHIRT, SKIN, SKIN, SHIRT, SKIN, 0x7a2a26, TROUSER, APRON, TROUSER, 0x15161a], { smear: 0.85 }),
      head: piece(cap),
      metres: true,
      hips: piece(apron),
      hand: piece(cleaver),
    };

    // ---- Baba Yaga: a headscarf, a long hooked nose, a shawl and layered skirts in dull red and brown, her broom ----
    const DULL = 0x7a2a22;
    const BROWN = 0x5a3a26;
    const SALLOW = 0x8f9478;
    const scarf = new Paint().ball(DULL, 0, 0.03, 0.045, 0.19, 1, 1.08, 1, 10).ball(0x5a1c16, 0, 0.12, 0.03, 0.17, 1, 0.55, 1, 8);
    scarf.ball(DULL, 0, -0.2, -0.1, 0.06, 1.5, 1, 1, 6).rod(DULL, -0.03, -0.22, -0.1, -0.1, -0.42, -0.14, 0.035, 0.012, 5).rod(DULL, 0.03, -0.22, -0.1, 0.1, -0.4, -0.14, 0.035, 0.012, 5);
    // the nose: out, and hooked down at the end; a chin to meet it; grey hair escaping at the temples
    scarf.rod(SALLOW, 0, 0, -0.14, 0, -0.03, -0.36, 0.045, 0.03, 6).rod(SALLOW, 0, -0.03, -0.36, 0, -0.14, -0.4, 0.03, 0.008, 6).ball(SALLOW, 0, -0.02, -0.36, 0.032, 1, 1, 1, 6);
    scarf.rod(SALLOW, 0, -0.16, -0.12, 0, -0.2, -0.24, 0.04, 0.015, 5);
    for (const s of [-1, 1]) scarf.rod(0xb9b9b4, s * 0.13, 0.02, -0.1, s * 0.17, -0.26, -0.09, 0.025, 0.006, 4);
    const skirts = new Paint();
    const tier = (c: number, y0: number, y1: number, r0: number, r1: number): void => {
      skirts.put(new THREE.CylinderGeometry(r0, r1, y0 - y1, 12, 1, true), c, 0, (y0 + y1) / 2, 0, 0, 0, 0, 1, 1, 0.74);
    };
    tier(BROWN, 0.12, -0.45, 0.44, 0.6);
    tier(DULL, -0.38, -0.82, 0.57, 0.7);
    tier(0x6b5a2e, -0.76, -1.14, 0.66, 0.76);
    // her shawl's points hanging over the top skirt, front and back
    skirts.put(new THREE.ConeGeometry(0.34, 0.5, 4, 1, true).rotateX(Math.PI), BROWN, 0, -0.1, -0.36, 0, Math.PI / 4, 0, 1, 1, 0.3);
    const broom = new Paint().rod(0x7b5a3a, 0, 1.0, -0.05, 0, -1.0, -0.05, 0.03).put(new THREE.ConeGeometry(0.2, 0.6, 7, 1, true), 0xa98a5f, 0, -1.02, -0.05).cyl(0x4d3725, 0, -0.76, -0.05, 0.07, 0.09, 0.08, 7);
    const yaga: Costume = {
      body: this.cloth([BROWN, BROWN, SALLOW, SALLOW, BROWN, 0x3e4a3a, SALLOW, 0x2a2420, 0x2a2420, 0x2a2420, 0x1a1512], { smear: 0.7, smearColor: DULL }),
      head: piece(scarf),
      metres: true,
      hips: piece(skirts),
      hand: piece(broom),
    };

    // ---- the Tamada: a dark suit, a red bow tie, a paper party hat, a microphone ----
    const SUIT = 0x1d2029;
    const hat = new Paint();
    for (let i = 0; i < 4; i++) {
      // a cone in rings: gold, red, gold, red, with a pompom
      const y = 0.16 + i * 0.1;
      hat.cyl(i % 2 ? 0xb3261e : 0xe0b030, 0.02, y + 0.05, 0.02, 0.125 - (i + 1) * 0.03, 0.125 - i * 0.03, 0.1, 10, 0, 0, 0, true);
    }
    hat.ball(0xe9e6de, 0.02, 0.57, 0.02, 0.04, 1, 1, 1, 6).cyl(0xe9e6de, 0.02, 0.165, 0.02, 0.135, 0.135, 0.02, 10);
    // the bow tie rides under his chin
    for (const s of [-1, 1]) hat.put(new THREE.ConeGeometry(0.075, 0.15, 4).rotateZ(s * (Math.PI / 2)), 0xc0201a, s * 0.085, -0.3, -0.2, 0, 0, 0, 1, 1, 0.5);
    hat.ball(0x8a1612, 0, -0.3, -0.21, 0.035, 1, 1, 1, 6);
    const mic = new Paint().rod(0x16181c, 0, -0.2, -0.04, 0, 0.1, -0.1, 0.026, 0.03).ball(0xaab2bc, 0, 0.15, -0.11, 0.06, 1, 1, 1, 8).rod(0x16181c, 0, -0.2, -0.04, 0.05, -0.75, 0, 0.01, 0.01, 4);
    const tamada: Costume = {
      body: this.cloth([SUIT, SUIT, SKIN, SKIN, SUIT, SUIT, SKIN, SUIT, SUIT, SUIT, 0x0c0c0e], { shirt: true }),
      head: piece(hat),
      metres: true,
      hips: null,
      hand: piece(mic),
    };

    // ---- Morozko: a long blue coat trimmed with white fur, a tall blue hat with a white brim, a long white beard, a staff with a star ----
    const BLUE = 0x2456a8;
    const FUR = 0xe4e9f0;
    const crown = new Paint().cyl(FUR, 0, 0.16, 0.01, 0.2, 0.2, 0.13, 10).cyl(BLUE, 0, 0.39, 0.01, 0.15, 0.185, 0.36, 10).ball(BLUE, 0, 0.57, 0.01, 0.15, 1, 0.6, 1, 8).ball(FUR, 0, 0.68, 0.01, 0.06, 1, 1, 1, 6);
    crown.put(new THREE.ConeGeometry(0.2, 0.85, 8).rotateX(Math.PI), FUR, 0, -0.5, -0.14, 0, 0, 0, 1, 1, 0.55);
    for (const s of [-1, 1]) crown.ball(FUR, s * 0.07, -0.09, -0.16, 0.06, 1.4, 0.6, 0.7, 6).ball(FUR, s * 0.07, 0.07, -0.15, 0.04, 1.4, 0.5, 0.5, 5);
    const coat = new Paint();
    coat.put(new THREE.CylinderGeometry(0.45, 0.64, 1.16, 12, 1, true), BLUE, 0, -0.48, 0, 0, 0, 0, 1, 1, 0.78);
    coat.put(new THREE.CylinderGeometry(0.65, 0.68, 0.2, 12, 1, true), FUR, 0, -1.08, 0, 0, 0, 0, 1, 1, 0.78);
    coat.box(FUR, 0, -0.48, -0.43, 0.14, 1.16, 0.05, 0, -0.13);
    coat.put(new THREE.CylinderGeometry(0.46, 0.46, 0.1, 12, 1, true), 0xd6aa3c, 0, 0.08, 0, 0, 0, 0, 1, 1, 0.68);
    const staff = new Paint().rod(0xdfe8f0, 0, -1.3, -0.08, 0, 1.4, -0.08, 0.035, 0.03);
    for (const a of [0, Math.PI / 4]) staff.octa(0xd4ecff, 0, 1.6, -0.08, 0.32, 1, 1, 0.3, a);
    const morozko: Costume = {
      body: this.cloth([BLUE, BLUE, FUR, 0xa9b4c4, BLUE, BLUE, FUR, BLUE, BLUE, BLUE, 0xdfe2e8], { band: true }),
      head: piece(crown),
      metres: true,
      hips: piece(coat),
      hand: piece(staff),
    };
    return { mishka, borya, yaga, tamada, morozko };
  }

  // ---------------------------------------------------------------------------------------------
  // a run
  // ---------------------------------------------------------------------------------------------

  reset(): void {
    this.t = 0;
    this.asleep = 0;
    this.hut.stage.reset(); // (Baba Yaga's stage)
    this.yagaBody = null;
    this.yagaPots = [];
    this.doorA = 1.9;
    this.flareT = -1;
    this.flare.visible = false;
    this.snowOn = 1;
    this.fall = 1;
    this.snap = true;
    this.dollKey = -1;
    this.covered = -1;
    this.watchT = 0;
    this.watchWait = 30;
    this.watcher.visible = false;
    this.crowd.show(this.guardIdx, true);
    this.crowd.show(this.morozIdx, true);
    KIT.treeBulb.emissiveIntensity = 2.6;
  }

  /** The red star goes up from (x, z). */
  fire(x: number, z: number): void {
    this.flareT = 0;
    this.flare.position.set(x, 2, z);
    this.flare.visible = true;
  }

  update(dt: number, view: StoryView, cam: THREE.Vector3, underRoof: boolean, viewportH: number): void {
    this.t += dt;
    // free roam hands over only the first act's fields: the rest have not happened
    const v: StoryView = view.g === undefined ? { ...ZaryaStory.empty(), ...view } : view;
    this.rings.update(this.t, v);
    const snap = this.snap;
    this.snap = false;
    const has = (flag: number): boolean => ZaryaStory.has(v, flag);
    const did = (flag: number): boolean => ZaryaStory.did(v, flag);
    const woke = v.end === 1 || v.end === 3;
    for (const s of this.sites) s.g.visible = Math.abs(s.x - cam.x) < s.r && Math.abs(s.z - cam.z) < s.r;
    /** A swing toward where it should be: at once on a run's first frame and for anything out of sight. */
    const ease = (cur: number, to: number, rate: number, site: Site): number => (snap || !site.g.visible ? to : approach(cur, to, dt * rate));

    // ---- the town's people, and the weather ----
    // the town falls asleep over a few seconds once the door has sealed (nobody sees it happen: they are below), and
    // wakes the same way when the purge has gone through every pipe
    const want = ZaryaStory.asleep(v) ? 1 : 0;
    this.asleep = approach(this.asleep, want, dt * 0.5);
    this.crowd.show(this.guardIdx, !has(F.guard));
    this.crowd.show(this.morozIdx, v.ch < CH.act2);
    if (v.covered !== this.covered) {
      this.covered = v.covered;
      this.coverOf.forEach((who, i) => this.crowd.cover(who, (v.covered & (1 << i)) !== 0));
    }
    this.crowd.update(this.t, this.asleep, viewportH, cam);
    this.snowOn = Math.min(1, Math.max(0, approach(this.snowOn, underRoof || inInterior(cam.x) ? 0 : 1, dt * 2.5)));
    // the quiet snow stops when the town wakes, and thins when only its heated buildings do
    this.fall = approach(this.fall, woke ? 0 : v.end === 2 ? 0.35 : 1, dt * 0.22);
    // before the quiet snow there is only ordinary snow, and less of it
    this.snow.update(this.t, cam, this.snowOn * this.fall * (0.45 + 0.55 * (v.end ? 1 : this.asleep)), viewportH);
    // the tree's lights go out with the fuse they run from, and come on again with everything else
    KIT.treeBulb.emissiveIntensity = woke || !Unlock.has(v.parts, PART.fuse) ? 2.6 : 0.03;

    // ---- Act I ----
    if (this.shelter.g.visible) {
      // the blast door swings shut, and open again on the release
      const shut = ZaryaStory.doorShut(v);
      this.doorA = snap ? (shut ? 0 : 1.9) : approach(this.doorA, shut ? 0 : 1.9, dt * 1.6);
      this.door.rotation.y = this.doorA;
      this.lampMat.emissiveIntensity = shut ? 2.2 + Math.sin(this.t * 5) * 1.2 : 0;
      this.lever.rotation.x = has(F.released) ? 1.1 : 0;
      this.pistols.visible = !has(F.armed);
    } else this.doorA = ZaryaStory.doorShut(v) ? 0 : 1.9;
    // the shutter's motor: a bang every four seconds, until its plug is out
    if (this.front.g.visible) this.shutter.position.y = 3.35 + (has(F.plug) ? 0 : Math.max(0, 1 - (this.t % 4) / 0.35)) * 0.16;
    // the escalator (polish, square/store session): the rope drops at once, the shutter rolls up into its drum
    {
      const open = ZaryaStory.did(v, G.escalator);
      const e = this.escal;
      e.k = snap ? (open ? 1 : 0) : approach(e.k, open ? 1 : 0, dt * 0.8);
      e.rope.visible = !open;
      e.slack.visible = open;
      e.curtain.scale.y = 1 - e.k * 0.9;
      e.curtain.position.y = 4.3 + e.k * 0.85;
    }
    if (this.flareT >= 0) {
      this.flareT += dt;
      const k = Math.min(1, this.flareT / 5);
      this.flare.position.y = 2 + (1 - (1 - k) * (1 - k)) * 46 - Math.max(0, this.flareT - 6) * 0.5;
      this.flare.position.z += dt * 0.5;
      this.flareMat.opacity = Math.max(0, 1 - Math.max(0, this.flareT - 26) / 10);
      if (this.flareT > 36) {
        this.flareT = -1;
        this.flare.visible = false;
      }
    }
    this.prize.visible = has(F.prize);
    this.prize.rotation.y = this.t;

    // ---- what glints ----
    const S = this.sparks;
    TOWN.parts.forEach((_, i) => (S[this.partAt + i]!.on = ZaryaStory.can(v, 'part', i)));
    TOWN.finds.forEach((_, i) => (S[this.findAt + i]!.on = v.ch >= CH.ground && v.ch < CH.ended));
    TOOLS.forEach((_, i) => (S[this.toolAt + i]!.on = ZaryaStory.can(v, 'tool', i)));
    MOD_PARTS.forEach((_, i) => (S[this.modPartAt + i]!.on = ZaryaStory.can(v, 'modPart', i)));
    // items (round 3): each model lies there exactly while its twinkle does; the ornaments while they can be picked up
    {
      const I = this.items;
      const A = this.itemAt;
      TOWN.parts.forEach((_, i) => I.set(A.part + i, S[this.partAt + i]!.on));
      TOWN.finds.forEach((_, i) => I.set(A.find + i, S[this.findAt + i]!.on));
      TOOLS.forEach((_, i) => I.set(A.tool + i, S[this.toolAt + i]!.on));
      MOD_PARTS.forEach((_, i) => I.set(A.mod + i, S[this.modPartAt + i]!.on));
      ORNAMENTS.forEach((_, i) => I.set(A.ornament + i, ZaryaStory.can(v, 'ornament', i)));
      I.update(this.t);
    }
    // kiosks and mods: a shutter once paid for stays up; each tool the squad brings back lies on the repairman's bench
    this.kiosks.forEach((k, i) => (k.open.visible = ZaryaStory.shutterUp(v, i)));
    this.booth.tools.forEach((t, i) => (t.visible = (v.m & (1 << (6 + i))) !== 0));
    CLUES.forEach((_, i) => (S[this.clueAt + i]!.on = ZaryaStory.can(v, 'clue', i)));
    // ---- side stories (`sidestories.ts`): what stands in each place, and a speck over what can be done now ----
    {
      const shown = sideShown(v.side ?? [], v.ch >= CH.act2);
      SIDE_PLACES.forEach((q, j) => {
        S[this.sideAt + j]!.on = ZaryaStory.can(v, 'side', q.i);
        this.side.marks.set(this.side.model[j]!, shown[j]!.model);
        this.side.marks.set(this.side.after[j]!, shown[j]!.after);
      });
      this.side.marks.update(this.t);
    }
    this.fill(this.gems, S, cam, 70);

    // ---- what glows ----
    const O = this.orbs;
    const n = ORNAMENTS.length;
    for (let i = 0; i < n; i++) {
      // (items, round 3: an ornament lying where it rolled is its own model now, not a lit ball)
      O[i]!.on = false;
      O[n + i]!.on = did(G.hung);
    }
    let at = n * 2;
    TETS.valves.forEach((_, i) => {
      const o = O[at + i]!;
      const turned = (v.m & (1 << (3 + i))) !== 0;
      o.on = this.valves.site.g.visible;
      o.c.setHex(turned ? 0x30ff60 : 0xff3020).multiplyScalar(turned ? 2.2 : 0.35);
    });
    at += TETS.valves.length;
    const turnedKey = [false, false, false, false];
    for (let t = v.turned; t > 0; t = Math.floor(t / 10)) if (t % 10 >= 1 && t % 10 <= 4) turnedKey[(t % 10) - 1] = true;
    BERLOGA.keys.forEach((_, i) => {
      const o = O[at + i]!;
      o.on = this.hall.site.g.visible;
      o.c.setHex(turnedKey[i] ? 0xffb030 : 0xff3020).multiplyScalar(turnedKey[i] ? 2.6 : 0.25);
    });
    at += BERLOGA.keys.length;
    const windowOrb = O[at]!;
    const starOrb = O[at + 1]!;

    // ---- the gates ----
    for (const g of this.gates) {
      const open = ZaryaStory.gateOpen(v, g.def.opens);
      g.k = ease(g.k, open ? 1 : 0, 0.9, g.site);
      if (!g.site.g.visible) continue;
      // a swing that starts slowly and settles
      const k = g.k * g.k * (3 - 2 * g.k);
      for (const l of g.leaves) l.m.rotation.y = l.shut + l.way * k * SWING;
      if (g.arm) g.arm.rotation.z = k * 1.38;
      if (g.chain) g.chain.visible = !open;
      if (g.cut) g.cut.visible = open;
      if (g.drift) {
        // the drift is shouldered aside as the leaves come through it
        g.drift.visible = g.k < 0.98;
        g.drift.scale.set(1, 1 - g.k * 0.85, 1 - g.k * 0.4);
      }
    }

    // ---- the matryoshkas ----
    let key = 0;
    let dollNear = false;
    DOLLS.forEach((d, i) => {
      key = key * 8 + ZaryaStory.shells(v, i);
      if (Math.abs(d.x - cam.x) < 85 && Math.abs(d.z - cam.z) < 85) dollNear = true;
    });
    this.dollWhole.visible = this.dollTop.visible = this.dollFoot.visible = dollNear;
    if (dollNear && key !== this.dollKey) {
      this.dollKey = key;
      this.dolls(v);
    }

    // ---- the Rynok's cold store: its door open against the hall, or shut with the bar across it; Borya's keys ----
    {
      const c = this.cold;
      const shut = ZaryaStory.coldShut(v);
      c.a = ease(c.a, shut ? 0 : 1, 1.3, c.site);
      if (c.site.g.visible) {
        const C = RYNOK.coldDoor;
        const xw = RYNOK.coldStore.x0;
        // open: swung right back against the wall north of the doorway
        c.leaf.rotation.y = -Math.PI / 2 - c.a * ((5 * Math.PI) / 6);
        // barred: across the door in its brackets; else leaning on the wall where it is picked up
        if (shut && c.a < 0.05) {
          c.bar.position.set(xw - 0.44, 1.25, C.z);
          c.bar.rotation.set(Math.PI / 2, 0, 0);
        } else {
          c.bar.position.set(xw - 0.5, 1.38, RYNOK.bar.z);
          c.bar.rotation.set(0, 0, -0.13);
        }
      }
    }

    // ---- Baba Yaga's stage (`stageLook.ts`): the hut walking, her door, the machines, the frost pools ----
    {
      const h = this.hut;
      this.freshPools = h.site.g.visible ? h.stage.update(dt, v.st ?? 0, v.pa ?? 0, v.pb ?? 0, this.yagaBody, did(G.yagaDown), this.yagaPots) : [];
      // (the little window's light is the stage's own now)
      windowOrb.on = false;
      const c = this.cabinet;
      c.a = ease(c.a, did(G.hung) ? 1 : 0, 1.4, c.site);
      c.leaf.rotation.y = -c.a * 1.9;
    }

    // ---- the canteen's plugs, the plant's valves ----
    if (this.plugs.site.g.visible) {
      this.plugs.in.forEach((m, i) => {
        const pulled = (v.m & (1 << i)) !== 0;
        m.visible = !pulled;
        this.plugs.out[i]!.visible = pulled;
      });
    }
    this.valves.wheel.forEach((m, i) => {
      this.valves.a[i] = ease(this.valves.a[i]!, (v.m & (1 << (3 + i))) !== 0 ? 1 : 0, 1.2, this.valves.site);
      m.rotation.y = -this.valves.a[i]! * (Math.PI / 2);
    });

    // ---- the Berloga: the door with four key slots, the keys in it, the keys in the purge console ----
    const H = this.hall;
    const shutHall = ZaryaStory.keyDoorShut(v);
    H.y = ease(H.y, shutHall ? 0 : 1, 0.4, H.site);
    H.slab.position.z = -(H.y * H.y * (3 - 2 * H.y)) * (BERLOGA.doorHalf + 1.9);
    const near = H.site.g.visible;
    const coldNear = this.cold.site.g.visible;
    this.keys.visible = near || coldNear;
    if (this.keys.visible) {
      const K = this.keys;
      const c = new THREE.Color();
      let k = 0;
      const key = (x: number, y: number, z: number, ry: number, rz: number, tint: number, bright: number, size = 1.6): void => {
        this.e.set(0, ry, rz, 'YXZ');
        this.m.compose(this.p.set(x, y, z), this.q.setFromEuler(this.e), this.s.set(size, size, size));
        K.setMatrixAt(k, this.m);
        K.setColorAt(k, c.setHex(tint).multiplyScalar(bright));
        k++;
      };
      if (near) {
        // four in the door's panel once it has taken them, each in its own slot
        if (!shutHall) for (let i = 0; i < 4; i++) key(BERLOGA.doorX - 0.61, 1.31, BERLOGA.slots.z - 0.51 + i * 0.34, 0, 0, KEY_TINT[i]!, 0.7);
        // four standing in the console's switches: a quarter turn each
        BERLOGA.keys.forEach((s, i) => key(s.x + CONSOLE, 1.69, s.z, turnedKey[i] ? Math.PI / 2 : 0, -Math.PI / 2, KEY_TINT[i]!, turnedKey[i] ? 1.1 : 0.6));
      }
      // Borya's, on the hook by his door: brighter once the bar is across
      if (coldNear && !did(G.cosmoKey)) key(RYNOK.coldStore.x0 - 0.42, 1.6, RYNOK.keyHook.z + 0.12, 0, -Math.PI / 2, 0xffc040, ZaryaStory.can(v, 'cosmoKey') ? 1.6 + Math.sin(this.t * 4) * 0.6 : 0.6, 2.4);
      K.count = k;
      K.instanceMatrix.needsUpdate = true;
      if (K.instanceColor) K.instanceColor.needsUpdate = true;
    }

    // ---- the one who watches ----
    this.watch(dt, v, cam, underRoof);
    starOrb.on = this.watcher.visible;
    if (starOrb.on) {
      this.p.set(0.5, 2.85, -0.1).applyAxisAngle(Y, this.watcher.rotation.y);
      starOrb.x = this.watcher.position.x + this.p.x;
      starOrb.y = this.p.y;
      starOrb.z = this.watcher.position.z + this.p.z;
    }
    this.fill(this.balls, O, cam, 90);
  }

  /** Send the sparks that are lit and near to be drawn. */
  private fill(mesh: THREE.InstancedMesh, list: readonly Spark[], cam: THREE.Vector3, sight: number): void {
    let k = 0;
    for (let i = 0; i < list.length; i++) {
      const o = list[i]!;
      if (!o.on || Math.abs(o.x - cam.x) > sight || Math.abs(o.z - cam.z) > sight) continue;
      this.e.set(0, o.yaw ?? this.t * o.spin + i, 0);
      this.m.compose(this.p.set(o.x, o.y + (o.bob ? Math.sin(this.t * 2 + i) * o.bob : 0), o.z), this.q.setFromEuler(this.e), this.s.set(o.s * o.sx, o.s * o.sy, o.s * o.sz));
      mesh.setMatrixAt(k, this.m);
      mesh.setColorAt(k, o.c);
      k++;
    }
    mesh.count = k;
    mesh.visible = k > 0;
    if (k === 0) return;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  /** Stand every doll as the story has it: the one showing on its plinth, the shells it has shed open beside it. */
  private dolls(v: StoryView): void {
    const look = [ZARYA.tree, { x: 196, z: -10 }, { x: -23, z: 72 }];
    let tops = 0;
    DOLLS.forEach((d, i) => {
      const shells = ZaryaStory.shells(v, i);
      const yaw = yawTo(d.x, d.z, look[i]?.x ?? 0, look[i]?.z ?? 0);
      const h = DOLL_H[shells] ?? DOLL_H[DOLL_H.length - 1]!;
      this.e.set(0, yaw, 0);
      this.m.compose(this.p.set(d.x, PLINTH[i] ?? 0, d.z), this.q.setFromEuler(this.e), this.s.set(h, h, h));
      this.dollWhole.setMatrixAt(i, this.m);
      // each shell it has shed: its foot and its top side by side on the ground, in a ring round the plinth
      for (let j = 0; j < shells; j++) {
        const s = DOLL_H[j]!;
        const a = yaw + 0.9 + j * ((Math.PI * 2) / STORY.dollShells);
        for (const [mesh, da, turn] of [[this.dollFoot, 0, 0.5], [this.dollTop, 0.12 + s * 0.26, -0.4]] as const) {
          this.e.set(0, -a - da + Math.PI / 2 + turn, 0);
          this.m.compose(this.p.set(d.x + Math.cos(a + da) * 3.3, 0, d.z + Math.sin(a + da) * 3.3), this.q.setFromEuler(this.e), this.s.set(s, s, s));
          mesh.setMatrixAt(tops, this.m);
        }
        tops++;
      }
    });
    this.dollWhole.count = DOLLS.length;
    this.dollTop.count = this.dollFoot.count = tops;
    for (const m of [this.dollWhole, this.dollTop, this.dollFoot]) m.instanceMatrix.needsUpdate = true;
  }

  /**
   * The squad is sometimes watched. From the first tram ride until the hall under the Institute opens: a tall figure
   * in a blue coat, standing still in the open thirty-five to forty-five metres off. Come near, or look long enough,
   * and it is simply not there; then not again for a minute or two.
   */
  private watch(dt: number, v: StoryView, cam: THREE.Vector3, underRoof: boolean): void {
    const W = this.watcher;
    const may = v.ch >= CH.act2 && v.ch < CH.finale && v.end === 0 && !underRoof && !inInterior(cam.x) && !BUILDINGS.some((b) => inRect(b, cam.x, cam.z));
    if (W.visible) {
      this.watchT -= dt;
      const d = Math.hypot(W.position.x - cam.x, W.position.z - cam.z);
      // come near, look long enough, or leave him behind (a tram ride): he is not there any more
      if (!may || this.watchT <= 0 || d < 22 || d > 80) {
        W.visible = false;
        this.watchWait = 60 + Math.random() * 60;
      }
      return;
    }
    if (!may) return;
    this.watchWait -= dt;
    if (this.watchWait > 0) return;
    // somewhere open, in the zone the squad is in, far enough to be a shape and near enough to be seen through the snow
    const zone = ZaryaStory.zoneOf(cam.x, cam.z);
    const ok = this.spots.filter((s) => {
      const d = Math.hypot(s.x - cam.x, s.z - cam.z);
      return d >= 35 && d <= 45 && ZaryaStory.zoneOf(s.x, s.z) === zone && !BUILDINGS.some((b) => inRect(b, s.x, s.z, 1));
    });
    if (ok.length === 0) {
      // nowhere just now: look again in a few steps
      this.watchWait = 2;
      return;
    }
    const s = ok[Math.floor(Math.random() * ok.length)]!;
    W.position.set(s.x, 0, s.z);
    W.rotation.y = yawTo(s.x, s.z, cam.x, cam.z);
    W.visible = true;
    this.watchT = 22 + Math.random() * 6;
  }

  /**
   * Put a named one's costume on the boss's body (the same body until they are down: after the first call for a
   * body this costs one lookup).
   */
  dress(who: Named, z: Zombie): void {
    // ---- Baba Yaga's stage: her body is the size of her hut (shots at the hut find her) and drawn as the hut; a body
    // that was hers and is now another's is the Warden's again ----
    if (who === 'yaga') {
      if (z.def.radius !== HUT_DEF_PATCH.radius) z.def = { ...ZOMBIES.warden, ...HUT_DEF_PATCH };
    } else if (z.def.radius === HUT_DEF_PATCH.radius) {
      z.def = ZOMBIES.warden;
      showBody(z);
    }
    const rig = z.rig;
    const c = this.costumes[who];
    if (this.dressed.get(rig) === who && (!c.head || c.head.parent)) return;
    // a body that wore another's (the pool hands them round): take those off first
    const was = this.dressed.get(rig);
    if (was && was !== who) {
      const old = this.costumes[was];
      for (const o of [old.head, old.hips, old.hand]) if (o && this.within(o, rig.root)) o.removeFromParent();
    }
    this.dressed.set(rig, who);
    for (const o of [c.head, c.hips, c.hand]) o?.removeFromParent();
    rig.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.material = c.body;
    });
    const uX = (c.body.userData as { uX?: { value: THREE.Vector4 } }).uX;
    if (uX) uX.value.w = rig.height;
    const bones = (rig as { skeletonBones?: readonly THREE.Object3D[] }).skeletonBones;
    if (c.head) {
      // the bear's head is a ball of one, sized to the body; the rest are made in metres for a head this big
      const unit = rig.headAttach ? 1 / 1.14 : 1;
      c.head.scale.setScalar(c.metres ? (rig.headRadius / 0.27) * unit * HEAD : rig.headRadius * 1.9);
      c.head.position.set(0, 0, 0);
      if (rig.headAttach) rig.headAttach(c.head);
      else {
        c.head.position.set(0, rig.height - rig.headRadius, 0);
        rig.root.add(c.head);
      }
    }
    // what hangs from the belt and what is in the striking hand need the body's own bones
    if (bones && bones.length >= 12) {
      if (c.hips) bones[0]!.add(c.hips);
      if (c.hand) bones[11]!.add(c.hand);
    }
  }

  private within(o: THREE.Object3D, root: THREE.Object3D): boolean {
    for (let p = o.parent; p; p = p.parent) if (p === root) return true;
    return false;
  }

  /** Baba Yaga's body while she stands (null once down) and her pots in the air on this screen (`stageLook.ts`). */
  yaga(z: Zombie | null, pots: readonly { x0: number; z0: number; x1: number; z1: number; k: number }[]): void {
    this.yagaBody = z;
    this.yagaPots = pots;
  }

  /** Mishka's suit (the runtime's older name for `dress('mishka', z)`). */
  dressBear(z: Zombie): void {
    this.dress('mishka', z);
  }

  /** How bright the red star is now, 0..1 (the runtime tints the night with it). */
  get flareGlow(): number {
    if (this.flareT < 0) return 0;
    return Math.min(1, this.flareT / 3) * Math.max(0, 1 - Math.max(0, this.flareT - 22) / 14);
  }

  dispose(): void {
    this.crowd.dispose();
    this.snow.dispose();
    this.rings.dispose();
    this.items.dispose();
    this.side.marks.dispose(); // (side stories)
    for (const c of Object.values(this.costumes)) for (const o of [c.head, c.hips, c.hand]) o?.removeFromParent();
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    this.root.removeFromParent();
  }
}
