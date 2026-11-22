/**
 * HIRASAKA's arms in the game (arms wave): everything the island hands a player to fight with, on this screen. The
 * story keeps what is shared (`story.ts`: tools taken, obstacles opened, parts found, guns built, the comb's stage, the
 * offering box's shrine, the cage's stop); this keeps what is only this player's (the tools in their pack, each
 * obstacle's blows so far, the cache they took, the guns they carry) and draws it all (`armsLook.ts`).
 *
 *   tools      taken where they lie (`places.ts` TOOLS): each goes into the pack to swing (`logic/melee.ts`), and the
 *              story learns it was taken. An obstacle opens to its own tool only, after a few real blows of it
 *              (`armsPlaces.ts` OBSTACLE_HITS, a heavy blow two): the swing is told here as it lands
 *              (`MeleeSystem.onStrike`). Its prompt only brings the right tool to hand. The rotten props drop the
 *              roof on whatever stands under it; the slag gives up its coal sack; the sand its cache (each player once).
 *   built      parts taken where they lie, the gun built at its bench by anyone (shared), then each player takes their
 *              own from the bench (and its ammunition again there). The comb is lit at the Old Village's Bon fire with
 *              its oil and wick, and its teeth are lit again there; at the revived tree it becomes the Ōkamuzumi.
 *   buys       the company price boards: a gun each, for points; carried, its ammunition.
 *   box        the offering box moves between the four shrines (`g.entities.mover`; solo).
 *   workshop   the upgrade bench rides in the cage: it stands at whichever stop the cage is at, and the bell at the other
 *              stop calls it.
 *
 * Nothing here runs on a clock: a blow, a part, a bench, a board are each something a player does.
 */
import * as THREE from 'three';
import { PLAYER, WEAPONS } from '../config';
import type { Game } from '../game/game';
import type { InteractionTarget } from '../game/interaction';
import { isFull } from '../logic/ammo';
import { nextPlace } from '../logic/boxMove';
import { addGun, applyCrateReward, createCarried, slotOf } from '../logic/economy';
import { MELEE, type MeleeId } from '../logic/melee';
import type { HirasakaGunId, WeaponId } from '../types';
import { HirasakaGuns } from './armsGuns';
import { armsIcon, ITEM_MODEL, Marks, OBSTACLE_AT, OBSTACLE_LOOKS } from './armsLook';
import { ARMS_PARTS, BENCH, BOX_EVERY, BOX_PLACES, CACHES, KUSHI, OBSTACLE_HITS, OBSTACLE_REACH, PROP_ROOF, recipeMask, recipeProgress, shrineOpen, TOOL_MELEE, TOOL_VERB, WALL_GUNS, WALL_REACH, WORKSHOP, type RecipeId } from './armsPlaces';
import { CAGE, OBSTACLES, SHRINES, TOOL_IDS, TOOLS, UMIBOZU, WALL_BUYS, type Spot } from './places';
import { BUILT, HirasakaStory, type StoryView } from './story';

type Act = (a: string, i?: number, x?: number, z?: number) => void;
type Bench = 'mori' | 'happa' | 'sakuganki';
const BENCHES: readonly Bench[] = ['mori', 'happa', 'sakuganki'];
const BENCH_NAME: Record<Bench, string> = { mori: 'THE MORI', happa: 'THE HAPPA', sakuganki: 'THE SAKUGANKI' };
const BENCH_WHERE: Record<Bench, string> = { mori: 'the seawall winch', happa: 'the bench before the powder magazine', sakuganki: "the coal face's bench" };
/** Where the Mori's bench prompt stands: a step off the winch (the umibōzu fight's prompt is the winch's own). */
const MORI_AT: Spot = { x: UMIBOZU.winch.x + 1.6, y: UMIBOZU.winch.y, z: UMIBOZU.winch.z };
const benchAt = (b: Bench): Spot => (b === 'mori' ? MORI_AT : BENCH[b]);
const GLINT = { part: 0xffb84a, tool: 0x8fd8ff, built: 0xffa0c0, wall: 0x101010 } as const;
const MORI_PART_NAMES = ['THE HARPOON HEAD', "THE WINCH'S CABLE CUTTER"];
const MORI_PART_ICON = ['mori_head', 'mori_reel'];
const WALL_MODEL: Partial<Record<WeaponId, string>> = { shotgun: 'wall_shotgun', rifle: 'wall_rifle', signalka: 'wall_signalka', arbalet: 'wall_arbalet', rpg: 'wall_rpg' };

const bit = (bits: number, i: number): boolean => (bits & (1 << i)) !== 0;
/** A yaw that looks thrown down rather than lined up, the same every run. */
const yawOf = (x: number, z: number): number => (((Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1) + 1) * Math.PI;

export class HirasakaArms {
  readonly guns: HirasakaGuns;
  private readonly items: Marks;
  private readonly looks: Marks;
  /** Blows landed on each shut obstacle by this player (by `OBSTACLES` index). */
  readonly blows = new Map<number, number>();
  private readonly cached = new Set<string>();
  /** A gun this player built and is owed from the bench once the story says it is built. */
  private readonly owed = new Set<HirasakaGunId>();
  private prev: StoryView | null = null;
  private workshopAt = -1;
  private rootsMesh: THREE.Object3D | null | undefined = undefined;
  /** (final polish) the zones' named pieces an opened obstacle takes away: the rubble fall, the rotten props. */
  private readonly gone = new Map<string, THREE.Object3D | null>();
  private t = 0;
  private active = false;

  constructor(
    private readonly g: Game,
    private readonly view: () => StoryView,
    private readonly act: Act,
  ) {
    this.guns = new HirasakaGuns(g, (kind, x, z) => act(kind, 0, x, z));
    this.hook();
    g.interaction.sources.push((out) => this.targets(out));
    g.interaction.boxName = 'OFFERING BOX';
    // ---- what lies about: the tools, the parts, the built guns on their benches, the guns on the boards, the cache ----
    const items: { key: string; model: string; kind: 'part' | 'tool' | 'find'; x: number; y: number; z: number; yaw: number; glint: number }[] = [];
    TOOL_IDS.forEach((id) => {
      const t = TOOLS[id];
      items.push({ key: `tool:${id}`, model: id, kind: 'tool', x: t.x, y: t.y + 0.02, z: t.z, yaw: yawOf(t.x, t.z), glint: GLINT.tool });
    });
    UMIBOZU.parts.forEach((p, i) => items.push({ key: `mori:${i}`, model: MORI_PART_ICON[i]!, kind: 'part', x: p.x, y: p.y + 0.02, z: p.z, yaw: yawOf(p.x, p.z), glint: GLINT.part }));
    ARMS_PARTS.forEach((p) => items.push({ key: `part:${p.id}`, model: p.id, kind: 'part', x: p.at.x, y: p.at.y + p.h, z: p.at.z, yaw: yawOf(p.at.x, p.at.z), glint: GLINT.part }));
    for (const b of BENCHES) {
      const at = benchAt(b);
      const on = b === 'mori' ? 0.02 : 0.95;
      items.push({ key: `built:${b}`, model: b, kind: 'find', x: at.x, y: at.y + on, z: at.z, yaw: yawOf(at.x, at.z), glint: GLINT.built });
    }
    for (const w of WALL_BUYS) {
      const gun = WALL_GUNS[w.id];
      const model = gun ? WALL_MODEL[gun.gun] : undefined;
      if (!model) continue;
      items.push({ key: `wall:${w.id}`, model, kind: 'find', x: w.x + Math.sin(w.yaw) * 0.16, y: w.y + 1.25, z: w.z + Math.cos(w.yaw) * 0.16, yaw: w.yaw + Math.PI / 2, glint: GLINT.wall });
    }
    const sand = OBSTACLE_AT.sand!;
    items.push({ key: 'cache:sand', model: 'cachebox', kind: 'find', x: sand.x, y: sand.y + 0.02, z: sand.z, yaw: 0.4, glint: GLINT.part });
    this.items = new Marks(items, ITEM_MODEL, 1.3);
    // ---- the obstacles, shut and opened ----
    const looks: typeof items = [];
    // (a shut door in a dark doorway is lit a little by its own rim, so it reads as shut and not as a black hole)
    const RIM: Record<string, number> = { bathDoor: 0x2a1c10 };
    for (const [id, at] of Object.entries(OBSTACLE_AT)) {
      if (OBSTACLE_LOOKS[id]) looks.push({ key: id, model: id, kind: 'find', ...at, glint: RIM[id] ?? 0 });
      if (OBSTACLE_LOOKS[`${id}Open`]) looks.push({ key: `${id}Open`, model: `${id}Open`, kind: 'find', ...at, glint: 0 });
    }
    this.looks = new Marks(looks, OBSTACLE_LOOKS, 1);
    this.items.mesh.name = 'HirasakaArmsItems';
    this.looks.mesh.name = 'HirasakaObstacles';
    g.worldRoot.add(this.items.mesh, this.looks.mesh);
    // ---- the offering box moves between the shrines (solo: `game/entities.ts`; the place goes into the story) ----
    g.entities.mover = {
      every: BOX_EVERY,
      places: BOX_PLACES,
      open: (i) => shrineOpen(i, this.view().cageDown),
      next: (current, roll) => nextPlace(BOX_PLACES.length, current, (i) => shrineOpen(i, this.view().cageDown), roll),
      moved: (_crate, place, quiet) => {
        this.act('box', place);
        const s = SHRINES[place];
        if (!quiet && s) g.hudEvent({ type: 'feed', text: `THE OFFERING BOX HAS GONE TO ${s.name}`, tone: 'normal' });
      },
    };
  }

  private readonly onStrike = (id: MeleeId, heavy: boolean): void => this.strike(id, heavy);
  /** The weapon system's map-gun door and the melee system's swing door (a run may build its melee system anew). */
  private hook(): void {
    const g = this.g;
    if (g.weapons && g.weapons.mapGun !== this.guns) g.weapons.mapGun = this.guns;
    if (g.melee && g.melee.onStrike !== this.onStrike) g.melee.onStrike = this.onStrike;
  }

  /** A new run: nothing of this player's is carried over. */
  reset(): void {
    this.active = true;
    this.blows.clear();
    this.cached.clear();
    this.owed.clear();
    this.prev = null;
    this.workshopAt = -1;
    this.guns.reset();
    this.hook();
  }

  // ---------------------------------------------------------------------------------------------
  // what this player carries
  // ---------------------------------------------------------------------------------------------

  private hasMelee(id: MeleeId): boolean {
    return this.g.melee?.pack.includes(id) ?? false;
  }
  private hasGun(id: WeaponId): boolean {
    return slotOf(this.g.session.inv, id) >= 0;
  }

  /** Put gun `id` in this player's hands (carried already: its ammunition topped up). */
  give(id: WeaponId): void {
    const g = this.g;
    const inv = g.session.inv;
    const r = addGun(inv, id);
    if (r.added) {
      inv.activeSlot = r.slot;
      g.weapons.cancelActions();
      g.melee?.setOut(false);
    }
    g.audio.play('pickup_ammo', { priority: 2 });
    g.hudEvent({ type: 'feed', text: r.added ? WEAPONS[id].name.toUpperCase() : `+${r.topped} ${WEAPONS[id].short}`, tone: 'good', icon: armsIcon(id) || undefined });
  }

  /** Take tool `i` into the pack (and tell the story it was taken). */
  takeTool(i: number): void {
    const id = TOOL_IDS[i];
    if (!id) return;
    const m = TOOL_MELEE[id];
    this.g.melee?.equip(m);
    this.g.melee?.setOut(true);
    this.act('tool', i);
    this.g.audio.play('pickup_ammo', { priority: 2 });
    this.g.hudEvent({ type: 'feed', text: `${MELEE[m].name} - IT OPENS WHAT NOTHING ELSE DOES`, tone: 'good', icon: armsIcon(id) || undefined });
  }

  // ---------------------------------------------------------------------------------------------
  // a swing lands
  // ---------------------------------------------------------------------------------------------

  /** A swing of `id` landed: an obstacle of its tool in front of the player, within reach, takes the blow. */
  strike(id: MeleeId, heavy: boolean): void {
    const g = this.g;
    const v = this.view();
    const p = g.player;
    const fx = -Math.sin(p.yaw);
    const fz = -Math.cos(p.yaw);
    OBSTACLES.forEach((o, i) => {
      if (bit(v.obstacles, i) || TOOL_MELEE[o.tool] !== id) return;
      const dx = o.at.x - p.x;
      const dz = o.at.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > OBSTACLE_REACH || Math.abs(o.at.y - p.y) > 2) return;
      if (d > 1.2 && (dx * fx + dz * fz) / d < 0.25) return;
      this.blow(i, heavy);
    });
  }

  /** One blow on obstacle `i` (`heavy` counts two): enough of them and it opens. (The QA script's door too.) */
  blow(i: number, heavy = false): boolean {
    const g = this.g;
    const o = OBSTACLES[i];
    if (!o) return false;
    const n = (this.blows.get(i) ?? 0) + (heavy ? 2 : 1);
    this.blows.set(i, n);
    const at = OBSTACLE_AT[o.id];
    const pos = { x: o.at.x, y: o.at.y + 1, z: o.at.z };
    if (at) pos.y = at.y + 1;
    g.fx.impact(pos, { x: g.player.x - o.at.x, y: 0.3, z: g.player.z - o.at.z }, o.tool === 'axe' ? 'wood' : o.tool === 'shovel' ? 'dirt' : o.tool === 'tachi' ? 'wood' : 'concrete', { strong: true });
    g.audio.play(o.tool === 'axe' ? 'board_rip' : o.tool === 'shovel' ? 'impact_dirt' : o.tool === 'tachi' ? 'shears_snip' : 'impact_concrete', { pos, priority: 2, volume: 0.9 });
    g.shake(0.06);
    if (n >= OBSTACLE_HITS[o.tool]) {
      this.act('open', i);
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------------------------
  // every frame
  // ---------------------------------------------------------------------------------------------

  update(dt: number): void {
    if (!this.active) return;
    this.t += dt;
    const g = this.g;
    const v = this.view();
    this.hook();
    this.guns.update(dt);
    this.react(this.prev, v);
    this.prev = { ...v };
    // the items: each shown until taken (a tool until this player has it; a part until the squad has it)
    TOOL_IDS.forEach((id) => this.items.set(`tool:${id}`, !this.hasMelee(TOOL_MELEE[id])));
    UMIBOZU.parts.forEach((_, i) => this.items.set(`mori:${i}`, !bit(v.moriParts, i)));
    ARMS_PARTS.forEach((p, i) => this.items.set(`part:${p.id}`, !bit(v.parts, i)));
    for (const b of BENCHES) this.items.set(`built:${b}`, bit(v.built, BUILT[b]) && !this.hasGun(b));
    for (const w of WALL_BUYS) this.items.set(`wall:${w.id}`, true);
    this.items.set('cache:sand', HirasakaStory.open(v, 'sand') && !this.cached.has('sand'));
    this.items.update(this.t);
    // the obstacles
    for (const id of Object.keys(OBSTACLE_AT)) {
      const open = HirasakaStory.open(v, id);
      this.looks.set(id, !open);
      this.looks.set(`${id}Open`, open);
    }
    this.looks.update(0);
    if (this.rootsMesh === undefined) this.rootsMesh = g.renderer.scene.getObjectByName('hs-hairpin-roots') ?? null;
    if (this.rootsMesh) this.rootsMesh.visible = !HirasakaStory.open(v, 'roots');
    // (final polish) the rubble the pick clears, the posts the axe brings down with the roof
    for (const [id, name] of [['rubble', 'hs-rubble'], ['props', 'hs-rotten-props']] as const) {
      if (!this.gone.has(name)) this.gone.set(name, g.renderer.scene.getObjectByName(name) ?? null);
      const m = this.gone.get(name);
      if (m) m.visible = !HirasakaStory.open(v, id);
    }
    // the pit workshop rides in the cage
    this.placeWorkshop(v.cageAt === 1 ? 1 : 0);
    // owed guns: built by this player, handed over as soon as the story has it built
    for (const id of this.owed) {
      const b = id as Bench;
      const ok = id === 'kushibi' ? v.kushi >= 2 : id === 'okamuzumi' ? v.kushi >= 3 : bit(v.built, BUILT[b]);
      if (!ok) continue;
      this.owed.delete(id);
      if (id === 'okamuzumi') this.toOkamuzumi();
      else this.give(id);
    }
  }

  /** Put the upgrade station (the pit workshop) in the cage at stop `at`. */
  private placeWorkshop(at: number): void {
    if (this.workshopAt === at) return;
    const s = this.g.entities.stations.find((st) => st.def.kind === 'upgrade');
    const w = WORKSHOP[at];
    if (!s || !w) return;
    // the first time: the bench the level stood by the headframe gives up its collider (it lives in the cage now, and
    // nobody walks into the cage: it is ridden by its prompt)
    if (this.workshopAt < 0) {
      const lv = this.g.level;
      const ox = s.def.x;
      const oz = s.def.z;
      lv.world.forEachNear(ox, oz, 1.2, (c) => {
        if (c.tag !== 'station' || !c.blocksMove) return;
        c.blocksMove = false;
        c.blocksShots = false;
        lv.nav.refresh(lv.world, c.minX - 1.5, c.minZ - 1.5, c.maxX + 1.5, c.maxZ + 1.5);
      });
    }
    this.workshopAt = at;
    s.def.x = w.x;
    s.def.z = w.z;
    s.def.yaw = w.yaw;
    s.model.root.position.set(w.x, w.y, w.z);
    s.model.root.rotation.y = w.yaw;
  }

  /** What changed in the shared state: said once, on every screen. */
  private react(a: StoryView | null, b: StoryView): void {
    const g = this.g;
    if (!a) return;
    if (b.parts !== a.parts) {
      ARMS_PARTS.forEach((p, i) => {
        if (!bit(b.parts, i) || bit(a.parts, i)) return;
        const pr = recipeProgress(b.parts, p.recipe);
        g.hudEvent({ type: 'feed', text: `${p.name} - ${pr.have} OF ${pr.need} FOR ${p.recipe === 'kushibi' ? "GENZŌ'S COMB" : BENCH_NAME[p.recipe as Bench]}`, tone: 'good', icon: armsIcon(p.id) || undefined });
      });
    }
    for (const bn of ['happa', 'sakuganki'] as const) {
      const i = BUILT[bn];
      if (bit(b.built, i) && !bit(a.built, i)) g.banner(BENCH_NAME[bn], bn === 'happa' ? 'The blasting launcher is built: take one at its bench' : 'The drill lance is built: take one at its bench', 'good', 5);
    }
    if (b.kushi >= 2 && a.kushi < 2) g.banner('KUSHI-BI', "Genzō's comb is lit, tooth by tooth. The hags will not cross its fire.", 'good', 6);
    if (b.kushi >= 3 && a.kushi < 3) g.banner('ŌKAMUZUMI', 'The comb has taken the tree’s light', 'good', 6);
    // the rotten props: the roof comes down on whatever stands under it
    const pi = OBSTACLES.findIndex((o) => o.id === 'props');
    if (pi >= 0 && bit(b.obstacles, pi) && !bit(a.obstacles, pi)) this.dropRoof();
  }

  /** The props chopped through: the roof comes down on every infected under it. */
  private dropRoof(): void {
    const g = this.g;
    const R = PROP_ROOF;
    const cx = (R.x0 + R.x1) / 2;
    const cz = (R.z0 + R.z1) / 2;
    let kills = 0;
    for (const z of g.zombies.zombies) {
      if (!z.active || z.dormant || z.isBoss) continue;
      if (z.x < R.x0 || z.x > R.x1 || z.z < R.z0 || z.z > R.z1 || Math.abs(z.y - R.y) > 2.5) continue;
      if (g.zombies.damage(z, R.damage, false, g.zenv, 0, 0, 0.5)) kills++;
    }
    for (let k = 0; k < 4; k++) g.fx.dust({ x: cx + (k - 1.5) * 2, y: R.y + 1, z: cz }, 1.5);
    g.fx.explosion({ x: cx, y: R.y + 2, z: cz }, 3);
    g.audio.play('earth_burst', { pos: { x: cx, y: R.y + 2, z: cz }, priority: 3, volume: 1 });
    if (Math.hypot(g.player.x - cx, g.player.z - cz) < 20) g.shake(0.6);
    g.banner('THE ROOF COMES DOWN', kills ? `${kills} under it` : 'On the gallery behind you', 'good', 4);
  }

  /** Swap this player's Kushi-bi for the Ōkamuzumi (or hand one over). */
  private toOkamuzumi(): void {
    const g = this.g;
    const inv = g.session.inv;
    const at = slotOf(inv, 'kushibi');
    if (at >= 0) {
      inv.slots[at] = createCarried('okamuzumi', inv.slots[at]!.tier);
      inv.activeSlot = at;
      g.weapons.cancelActions();
      g.melee?.setOut(false);
      g.audio.play('upgrade_ok', { priority: 3 });
      g.hudEvent({ type: 'feed', text: WEAPONS.okamuzumi.name.toUpperCase(), tone: 'good', icon: armsIcon('okamuzumi') || undefined });
    } else this.give('okamuzumi');
  }

  // ---------------------------------------------------------------------------------------------
  // what can be done here
  // ---------------------------------------------------------------------------------------------

  private targets(out: InteractionTarget[]): void {
    const g = this.g;
    if (!this.active || !g.playerAlive() || !g.hirasaka) return;
    const p = g.player;
    const v = this.view();
    const near = (o: Spot, r: number): number => {
      const d = Math.hypot(o.x - p.x, o.z - p.z);
      return d <= r && Math.abs(o.y - p.y) < 2.2 ? d : -1;
    };
    const push = (id: string, at: Spot, r: number, text: string, sub: string, use: () => void, o: { tone?: InteractionTarget['tone']; hold?: number; enabled?: boolean } = {}): void => {
      const d = near(at, r);
      if (d < 0) return;
      out.push({ id: `hs-arms:${id}`, dist: d, text, sub, tone: o.tone ?? 'good', hold: o.hold ?? 0, enabled: o.enabled ?? true, onUse: use });
    };
    const inv = g.session.inv;
    // ---- the tools (each player takes their own) and what each opens ----
    TOOL_IDS.forEach((id, i) => {
      if (!this.hasMelee(TOOL_MELEE[id])) push(`tool:${id}`, TOOLS[id], 2, `TAKE THE ${TOOLS[id].name}`, TOOLS[id].where, () => this.takeTool(i));
    });
    OBSTACLES.forEach((o, i) => {
      if (bit(v.obstacles, i)) return;
      const m = TOOL_MELEE[o.tool];
      const what = o.what.replace(/^the /, '').toUpperCase();
      const need = OBSTACLE_HITS[o.tool];
      const done = Math.min(need - 1, this.blows.get(i) ?? 0);
      if (!this.hasMelee(m)) {
        push(`ob:${o.id}`, o.at, 2.6, what, `Only the ${MELEE[m].name.toLowerCase()} gets through it (${TOOLS[o.tool].where})`, () => {}, { enabled: false, tone: 'warn' });
        return;
      }
      const inHand = g.melee?.out && g.melee.carried === m;
      if (inHand) push(`ob:${o.id}`, o.at, 2.6, `${TOOL_VERB[o.tool].verb} ${what}`, `Swing the ${MELEE[m].name.toLowerCase()} at it${done ? ` (${done} of ${need})` : ''}`, () => {}, { enabled: false, tone: 'good' });
      else
        push(`ob:${o.id}`, o.at, 2.6, `${TOOL_VERB[o.tool].verb} ${what}`, `Take up the ${MELEE[m].name.toLowerCase()} and swing`, () => {
          g.melee?.select(m);
          g.melee?.setOut(true);
        });
    });
    // the cache dug out of the sand (each player's own share, once)
    if (HirasakaStory.open(v, 'sand') && !this.cached.has('sand')) {
      const c = CACHES.sand!;
      push('cache:sand', OBSTACLE_AT.sand as Spot, 2.4, "TAKE THE FISHERMAN'S TIN", 'Dug out of the sand', () => {
        if (this.cached.has('sand')) return;
        this.cached.add('sand');
        const got = applyCrateReward(inv, { cash: c.cash, ammo: inv.slots.map((s) => (s ? s.ammo.magSize * 2 : 0)), plates: inv.plates < PLAYER.maxPlates ? c.plates : 0, grenades: c.grenades });
        g.audio.play('pickup_cash', { priority: 3 });
        g.feed(`+$${got.cash}  ${got.plates ? '+PLATE  ' : ''}${got.grenades ? `+${got.grenades} GRENADES  ` : ''}+AMMO`, 'good');
      });
    }
    // ---- the parts (the squad's: taken once) ----
    UMIBOZU.parts.forEach((s, i) => {
      if (!bit(v.moriParts, i)) push(`mori:${i}`, s, 2, `TAKE ${MORI_PART_NAMES[i]}`, 'For the Mori, at the seawall winch', () => this.act('part', i));
    });
    ARMS_PARTS.forEach((pt, i) => {
      if (bit(v.parts, i)) return;
      const sub = pt.recipe === 'kushibi' ? "For Genzō's comb: its teeth want oil and a wick" : `For ${BENCH_NAME[pt.recipe as Bench].toLowerCase().replace(/^the /, 'the ')}, at ${BENCH_WHERE[pt.recipe as Bench]}`;
      push(`part:${pt.id}`, pt.at, 2.2, `TAKE THE ${pt.name.replace(/^(THE|A) /, '')}`, sub, () => this.act('apart', i));
    });
    // ---- the benches ----
    for (const b of BENCHES) {
      const i = BUILT[b];
      const at = benchAt(b);
      if (b === 'mori' && v.umi === 0 && !bit(v.built, i) && v.moriParts === 0) continue; // (the winch is nothing yet)
      if (!bit(v.built, i)) {
        const has = b === 'mori' ? v.moriParts === 3 : (v.parts & recipeMask(b as RecipeId)) === recipeMask(b as RecipeId);
        const pr = b === 'mori' ? { have: HirasakaStory.count(v.moriParts), need: 2 } : recipeProgress(v.parts, b as RecipeId);
        push(`build:${b}`, at, 2.4, has ? `BUILD ${BENCH_NAME[b]}` : `${BENCH_NAME[b]}'S BENCH`, has ? 'Every part is here' : `Its parts: ${pr.have} of ${pr.need}`, () => {
          this.owed.add(b);
          this.act('built', i);
        }, { enabled: has, hold: 1.4 });
      } else if (!this.hasGun(b)) push(`take:${b}`, at, 2.4, `TAKE ${BENCH_NAME[b]}`, WEAPONS[b].name, () => this.give(b));
      else {
        const w = inv.slots[slotOf(inv, b)]!;
        if (!isFull(w.ammo)) push(`ammo:${b}`, at, 2.4, `RESTOCK ${BENCH_NAME[b]}`, b === 'mori' ? 'Harpoons from the winch house' : b === 'happa' ? 'Charges from the magazine' : 'Air and drill steels', () => this.give(b));
      }
    }
    // ---- Genzō's comb: lit at the Bon fire, and at the revived tree ----
    if (v.kushi >= 1 && v.kushi < 2) {
      const pr = recipeProgress(v.parts, 'kushibi');
      const ok = pr.have >= pr.need;
      push('kushi:light', KUSHI.light, 2.6, ok ? "LIGHT GENZŌ'S COMB AT THE FIRE" : "GENZŌ'S COMB WILL NOT TAKE THE FLAME", ok ? 'Tooth by tooth' : `It wants oil and a wick (${pr.have} of ${pr.need})`, () => {
        this.owed.add('kushibi');
        this.act('kushi', 2);
      }, { enabled: ok, hold: 1.4 });
    } else if (v.kushi >= 2) {
      if (!this.hasGun('kushibi') && !this.hasGun('okamuzumi')) push('kushi:take', KUSHI.light, 2.6, 'LIGHT A COMB OF YOUR OWN', 'Kushi-bi', () => this.give('kushibi'));
      else if (this.hasGun('kushibi')) {
        const w = inv.slots[slotOf(inv, 'kushibi')]!;
        if (!isFull(w.ammo) || w.ammo.mag < w.ammo.magSize) push('kushi:relight', KUSHI.light, 2.6, 'LIGHT ITS TEETH AGAIN', 'At the Bon fire', () => {
          w.ammo.mag = w.ammo.magSize;
          w.ammo.reserve = w.ammo.reserveMax;
          w.ammo.reload = null;
          g.audio.play('lantern_light', { priority: 2 });
          g.feed('THE COMB IS LIT AGAIN', 'good');
        });
      }
      if (v.bossDown && v.kushi < 3 && this.hasGun('kushibi'))
        push('kushi:tree', KUSHI.tree, 3, "HOLD THE COMB TO THE TREE'S LIGHT", 'The peaches are ripe', () => {
          this.owed.add('okamuzumi');
          this.act('kushi', 3);
        }, { hold: 1.6 });
      if (v.kushi >= 3 && !this.hasGun('okamuzumi')) push('kushi:okami', KUSHI.tree, 3, 'TAKE THE TREE’S LIGHT', 'Ōkamuzumi', () => this.toOkamuzumi(), { hold: 0.6 });
    }
    // ---- the company price boards ----
    for (const w of WALL_BUYS) {
      const o = WALL_GUNS[w.id];
      if (!o) continue;
      const have = slotOf(inv, o.gun);
      if (have >= 0) {
        const full = isFull(inv.slots[have]!.ammo);
        push(`wall:${w.id}`, w, WALL_REACH, full ? o.name : `AMMUNITION FOR THE ${o.name}  $${o.ammo}`, full ? 'Carried, and its ammunition is full' : 'The company store', () => {
          if (inv.cash < o.ammo) return;
          inv.cash -= o.ammo;
          g.audio.play('buy_ok', { priority: 3 });
          this.give(o.gun);
        }, { enabled: !full && inv.cash >= o.ammo, tone: inv.cash >= o.ammo ? 'good' : 'warn' });
      } else
        push(`wall:${w.id}`, w, WALL_REACH, `BUY THE ${o.name}  $${o.price}`, inv.cash >= o.price ? 'The company store' : `You need $${o.price}`, () => {
          if (inv.cash < o.price) return;
          inv.cash -= o.price;
          g.audio.play('buy_ok', { priority: 3 });
          this.give(o.gun);
        }, { enabled: inv.cash >= o.price, tone: inv.cash >= o.price ? 'good' : 'warn' });
    }
    // ---- the cage's bell: call it (and the pit workshop in it) to this stop ----
    if (HirasakaStory.ready(v) && !v.bossDown) {
      const stops = [CAGE.top, CAGE.bottom];
      stops.forEach((s, i) => {
        if (v.cageAt === i) return;
        push(`call:${i}`, { x: s.x + (i === 0 ? 2 : -1.5), y: s.y, z: s.z + (i === 0 ? 3 : -2.5) }, 2.2, 'RING FOR THE CAGE', 'The pit workshop rides in it', () => this.act('call', i), { tone: 'normal', hold: 0.6 });
      });
    }
  }

  dispose(): void {
    const g = this.g;
    if (g.weapons.mapGun === this.guns) g.weapons.mapGun = null;
    if (g.melee?.onStrike === this.onStrike) g.melee.onStrike = null;
    if (g.entities.mover?.places === BOX_PLACES) g.entities.mover = null;
    this.guns.dispose();
    this.items.mesh.removeFromParent();
    this.looks.mesh.removeFromParent();
    this.items.dispose();
    this.looks.dispose();
  }
}
