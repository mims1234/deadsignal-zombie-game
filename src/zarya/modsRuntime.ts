/**
 * ZARYA's kiosk shutters, weapon mods and repair booth on screen (`mods.ts` has the rules): the prompts (BUY THE
 * SHUTTER, FIT A BIG MAGAZINE saying what it will do, the booth's refusal), the mod parts picked up in passing (Timur
 * says what they are for the first time one is found), what a shutter going up gives whoever stands by it, the frost
 * seen on what frost rounds hit, the mod's word on the HUD's weapon panel, the journal's mods section, and this
 * player's own mods plugged into the weapon system.
 *
 * `runtime.ts` owns it and calls it in a few places (each marked "kiosks and mods"). Like the rest of the story, the
 * shutters and the parts change on whoever runs the story (the solo game, or the co-op host) and this reacts to the
 * state changing; a fitted mod is this player's alone, put on their gun once the story says the parts were spent.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Zombie } from '../enemies/zombie';
import type { Game } from '../game/game';
import type { InteractionTarget } from '../game/interaction';
import { spendCash } from '../logic/economy';
import type { HudState } from '../ui/hudTypes';
import { WEAPONS } from '../config';
import { MOD, MODS, WeaponMods, benchOffer, boothRefusal, fitPreview, modJournal, modWord } from './mods';
import type { Beat } from './lines';
import { BENCHES, CH, KBIT, MOD_COST, MOD_PARTS, SHUTTERS, STORY, ZaryaStory, type StoryAct, type StoryView } from './story';
import { TOWN } from './unlock';
// (items, round 3: the mod part's picture with its feed line)
import { MOD_ICON } from './items';
import type { Spot } from './places';

/**
 * Frost rounds, as seen: a crust of ice shards round a slowed infected's feet and shins, and two pale rings of rime
 * up its legs (why it walks slow). One mesh a body, only while it is frosted, hung on its rig's root (a pooled rig takes
 * it on switched off); one shape and one material shared by all of them.
 */
let frostParts: { geo: THREE.BufferGeometry; mat: THREE.Material } | null = null;
function frostCrust(): { geo: THREE.BufferGeometry; mat: THREE.Material } {
  if (frostParts) return frostParts;
  // for a body 1 m tall (scaled to the body's height)
  const bits: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + (i % 2) * 0.2;
    const h = 0.08 + (i % 3) * 0.035;
    bits.push(new THREE.ConeGeometry(0.03, h, 4).rotateZ(-0.35).rotateY(-a).translate(Math.cos(a) * 0.13, h / 2, Math.sin(a) * 0.13).toNonIndexed());
  }
  bits.push(new THREE.TorusGeometry(0.13, 0.018, 4, 16).rotateX(Math.PI / 2).translate(0, 0.14, 0).toNonIndexed());
  bits.push(new THREE.TorusGeometry(0.12, 0.012, 4, 16).rotateX(Math.PI / 2).translate(0, 0.3, 0).toNonIndexed());
  const geo = mergeGeometries(bits)!;
  for (const b of bits) b.dispose();
  const mat = new THREE.MeshBasicMaterial({ color: 0xcdeeff, transparent: true, opacity: 0.85, depthWrite: false });
  frostParts = { geo, mat };
  return frostParts;
}

/** Show or hide the frost crust on an infected (`on`), its shards turned a little each frame so they glint. */
function showFrost(z: Zombie, on: boolean): void {
  const root = z.rig?.root;
  if (!root) return;
  let m = root.userData.frostCrust as THREE.Mesh | undefined;
  if (!on) {
    if (m) m.visible = false;
    return;
  }
  if (!m) {
    const p = frostCrust();
    m = new THREE.Mesh(p.geo, p.mat);
    m.name = 'FrostCrust';
    m.frustumCulled = false;
    root.userData.frostCrust = m;
    root.add(m);
  }
  m.visible = true;
  m.scale.setScalar(z.def.height);
}

/** How near a lying mod part has to be to be picked up in passing; how near a kiosk a player must be to share in it. */
const PICKUP = 2.4;
const SHARE = 12;
/** Seconds a fit waits for the story to say the parts were spent (co-op: the host's answer). */
const FIT_WAIT = 3;

export class KiosksAndMods {
  readonly mods = new WeaponMods();
  private prevK = 0;
  private askT = 0;
  private t = 0;
  private pending: { c: NonNullable<Game['session']['inv']['slots'][0]>; i: number; until: number; spent: number } | null = null;
  /** A line on the wire (`runtime.ts` sets it): Timur on the first mod part found. */
  say: ((beat: Beat) => void) | null = null;

  constructor(
    private readonly g: Game,
    private readonly act: (a: StoryAct, i: number) => void,
    private readonly view: () => StoryView,
    private readonly live: () => boolean,
  ) {
    g.weapons.mods = this.mods;
    // frost rounds: a burst of cold glitter where one lands, and a little more on it for as long as it is slowed
    this.mods.onFrost = (z, still) => {
      g.fx.sparkle({ x: z.x, y: z.y + (still ? 0.2 + Math.random() * 0.6 : 1.2), z: z.z }, still ? 0xcfeeff : 0x9fd8ff, still ? 4 : 10);
      if (!still) g.fx.sparkle({ x: z.x, y: z.y + 0.15, z: z.z }, 0xe8f6ff, 8);
    };
    // ...and the ice on its legs for as long as it is slowed
    this.mods.onChill = showFrost;
    // (co-op: the host walks the infected, so a frosted one is stopped stiff for a moment instead, through it)
    this.mods.onStiff = (z, seconds) => g.zombies.affect(z, g.zenv, 0, seconds);
    // the repair booth upgrades nothing until the sleeping repairman's three tools are back on his counter
    g.interaction.stationGate = (def) => (this.live() && def.kind === 'upgrade' && /repair/i.test(def.name) ? boothRefusal(this.view()) : null);
  }

  reset(coop: boolean): void {
    this.mods.reset();
    // (in co-op the infected walk on the host: a frost coat glints but cannot slow one)
    this.mods.slows = !coop;
    this.prevK = 0;
    this.askT = 0;
    this.t = 0;
    this.pending = null;
  }

  /** Every frame of a run: the mods in hand, the parts lying about, and what changed in the shared state. */
  update(dt: number, v: StoryView, alive: boolean, remote: boolean): void {
    const g = this.g;
    const inv = g.session.inv;
    this.t += dt;
    this.askT = Math.max(0, this.askT - dt);
    this.mods.update(dt, inv.slots);

    // a mod part lying about, picked up in passing
    if (alive && this.askT <= 0) {
      const p = g.player;
      MOD_PARTS.forEach((at, i) => {
        if (this.askT > 0 || Math.hypot(at.x - p.x, at.z - p.z) > PICKUP || !ZaryaStory.can(v, 'modPart', i)) return;
        this.act('modPart', i);
        if (remote) this.askT = 0.4;
      });
    }

    // what changed, whoever changed it
    const k = v.k;
    const was = this.prevK;
    this.prevK = k;
    if (k !== was) this.react(was, k, v);
    // the fit this player asked for: the parts are spent, so the mod goes on their gun
    const pend = this.pending;
    if (pend) {
      const spent = k >> KBIT.spent;
      if (spent >= pend.spent + MOD_COST[pend.i]!) {
        this.pending = null;
        const before = pend.c.ammo.magSize;
        this.mods.fit(pend.c, pend.i);
        g.audio.play('upgrade_ok', { priority: 2 });
        const gun = WEAPONS[pend.c.id].short;
        g.feed(pend.i === MOD.drum ? `BIG MAGAZINE ON THE ${gun}  -  ${before} -> ${pend.c.ammo.magSize} A LOAD` : `FROST ROUNDS IN THE ${gun}  -  WHAT THEY HIT IS SLOWED`, 'good');
      } else if (this.t > pend.until) this.pending = null;
    }
  }

  private react(was: number, k: number, v: StoryView): void {
    const g = this.g;
    const p = g.player;
    SHUTTERS.forEach((s, i) => {
      const bit = 1 << (KBIT.shutter + i);
      if (!(k & bit) || was & bit) return;
      g.audio.play('station_open', { priority: 2, volume: 0.9 });
      // everyone standing by it shares what is inside: the guns in their hands filled
      if (Math.hypot(s.at.x - p.x, s.at.z - p.z) <= SHARE && g.playerAlive()) {
        for (const c of g.session.inv.slots) {
          if (!c) continue;
          c.ammo.reserve = c.ammo.reserveMax;
          c.ammo.mag = c.ammo.magSize;
          c.ammo.reload = null;
        }
        g.weapons.cancelActions();
        g.audio.play('pickup_ammo', { priority: 2 });
        g.hudEvent({ type: 'feed', text: 'THE SHUTTER ROLLS UP  -  AMMUNITION, AND A MOD PART', tone: 'good', icon: MOD_ICON });
      } else g.hudEvent({ type: 'feed', text: `A KIOSK SHUTTER ROLLS UP ${s.name.toUpperCase()}  -  A MOD PART`, tone: 'good', icon: MOD_ICON });
    });
    const found = (n: number): number => ZaryaStory.count(n & ((1 << KBIT.spent) - 1));
    const parts = ZaryaStory.modParts(v);
    // the first mod part the squad finds: Timur says what it is for (once a run, whoever found it)
    if (found(k) > 0 && found(was) === 0) this.say?.('modPart');
    MOD_PARTS.forEach((_, i) => {
      const bit = 1 << (KBIT.part + i);
      if (!(k & bit) || was & bit) return;
      g.audio.play('pickup_ammo', { priority: 2, volume: 0.8 });
      g.hudEvent({ type: 'feed', text: `A MOD PART  -  ${parts} TO FIT`, tone: 'good', icon: MOD_ICON });
    });
    // someone else's fit (or this player's, said once it lands): how many are left for the squad
    if (k >> KBIT.spent !== was >> KBIT.spent && !this.pending && found(k) > 0) g.feed(`MOD PARTS LEFT  -  ${parts}`, 'normal');
  }

  /** The prompts: a kiosk's shutter, and a mod at a bench. */
  targets(out: InteractionTarget[], v: StoryView): void {
    const g = this.g;
    const p = g.player;
    const R = STORY.reach;
    const dist = (o: Spot): number => Math.hypot(o.x - p.x, o.z - p.z);

    // ---- the kiosk shutters ----
    SHUTTERS.forEach((s, i) => {
      const d = dist(s.at);
      if (d > R || !ZaryaStory.can(v, 'shutter', i)) return;
      const cash = g.session.inv.cash;
      const ok = cash >= STORY.shutter;
      out.push({
        id: `zy-shutter-${i}`,
        dist: d,
        text: `BUY THE SHUTTER  $${STORY.shutter}`,
        sub: ok ? 'Ammunition and a mod part inside. One pays for the squad' : `You have $${cash}`,
        tone: ok ? 'good' : 'warn',
        hold: 0.8,
        enabled: ok,
        onUse: () => {
          // the buyer's own points, then the act (as the pageant tickets)
          if (!ZaryaStory.can(this.view(), 'shutter', i) || !spendCash(g.session.inv, STORY.shutter)) return;
          g.hudEvent({ type: 'cash', amount: -STORY.shutter });
          this.act('shutter', i);
        },
      });
    });

    // ---- a mod at a bench, for the gun in hand ----
    if (v.ch < CH.ground || g.weapons.holstered || g.weapons.hidden) return;
    const inv = g.session.inv;
    const held = inv.slots[inv.activeSlot];
    if (!held) return;
    const parts = ZaryaStory.modParts(v);
    const found = ZaryaStory.count(v.k & ((1 << KBIT.spent) - 1));
    for (const bench of BENCHES) {
      const d = dist(bench.at);
      if (d > R) continue;
      // the story's own building comes first at a bench; a mod comes before taking what was built
      const first = TOWN.recipes.some((_, r) => ZaryaStory.can(v, 'build', r)) ? d + 0.05 : d - 0.05;
      const offer = benchOffer(held.id, this.mods.mask(held), parts);
      if (offer.i >= 0) {
        const m = MODS[offer.i]!;
        const busy = this.pending !== null;
        out.push({
          id: `zy-mod-${offer.i}`,
          dist: first,
          text: `FIT ${m.name.replace(/^A /, '')} TO THE ${WEAPONS[held.id].short}`,
          sub: busy ? 'Fitting...' : `${fitPreview(held, offer.i)}. Uses ${MOD_COST[offer.i]} of the squad's ${parts} mod part${parts === 1 ? '' : 's'}`,
          tone: 'good',
          hold: 1.2,
          enabled: !busy,
          onUse: () => {
            const now = this.view();
            if (this.pending || !ZaryaStory.can(now, 'mod', offer.i)) return;
            this.pending = { c: held, i: offer.i, until: this.t + FIT_WAIT, spent: now.k >> KBIT.spent };
            this.act('mod', offer.i);
          },
        });
      } else if (offer.short === 'parts' && found > 0 && d <= R * 0.7) {
        out.push({ id: 'zy-mod-parts', dist: first + 0.1, text: 'WORKBENCH', sub: parts ? `A mod wants more parts: the squad has ${parts}` : 'No mod parts left. The kiosks each hold one', tone: 'warn', hold: 0, enabled: false, onUse: () => {} });
      }
      return;
    }
  }

  /** The mods on the gun in hand, as a word on the HUD's weapon panel (with the Charge's state). */
  decorate(st: HudState): void {
    const w = st.weapon;
    if (!w || w.melee) return;
    const inv = this.g.session.inv;
    const held = inv.slots[inv.activeSlot] ?? null;
    const mask = this.mods.mask(held);
    if (!mask) return;
    const word = modWord(mask);
    st.weapon = { ...w, tierLabel: w.tierLabel ? `${w.tierLabel} · ${word}` : word };
  }

  /**
   * The journal's mods section (from the tram on, or once a part is found): the parts the squad holds, what each mod
   * does and needs and which of this player's guns wear it, and where the parts are.
   */
  journalRows(v: StoryView): string[] | null {
    const found = ZaryaStory.count(v.k & ((1 << KBIT.spent) - 1));
    if (!found && v.ch < CH.act2) return null;
    const guns = this.g.session.inv.slots.flatMap((c) => (c ? [{ name: WEAPONS[c.id].short, mask: this.mods.mask(c) }] : []));
    return modJournal(v, guns);
  }
}

