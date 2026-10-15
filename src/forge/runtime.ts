/**
 * The Forge's story on this client: the people holed up in their rooms (seen through the barred windows), the doors
 * the infected pound on, talking someone out (a hold of E at a clear door) and watching them slip out the back to the
 * Hearth, the ledger pages, riry's bell, the reborn and the burnout at dawn - the radio, the banners, the HUD and the
 * maps for all of it.
 *
 * Solo: `story` (`story.ts`) runs the rules here. Co-op (`follow`): the simulation runs them, its state arrives
 * through `applyWire`, and talking someone out, a page and the bell are requests. Either way everything on screen is
 * played from what changed in that state (`present`), so a solo run and a co-op run look the same, and each player
 * pays themselves once for each person saved, each page and the Pit.
 */
import * as THREE from 'three';
import { FORGE_STORY, SURVIVORS } from '../config';
import { Avatar } from '../coop/avatar';
import type { Game } from '../game/game';
import type { InteractionTarget } from '../game/interaction';
import { addCash, applyContractReward } from '../logic/economy';
import type { HudObjective, HudState, MapDynamic } from '../ui/hudTypes';
import { ignisMaterial } from '../world/layout/ignis';
import { ForgeHud } from './hud';
import { DOOR_NOTES, FORGE_LINES as L, HOLDOUT_THANKS, LEDGER_PAGES } from './lore';
import { vulcanLook } from './looks';
import { decodeView } from './net';
import { rankTag, type VulcanRank } from './roster';
import type { SafeRoomDef } from './sites';
import { type FinalePhase, ForgeStory, type ForgeView, type HoldoutPhase, type RumblePhase, type StoryTick } from './story';

type PersonPhase = HoldoutPhase | 'leaving';

interface Person {
  name: string;
  rank: VulcanRank;
  room: number;
  avatar: Avatar;
  phase: PersonPhase;
  /** Seconds into leaving. */
  t: number;
  /** Hearth slot (-1 until they get there). */
  slot: number;
}

interface Shown {
  phases: HoldoutPhase[];
  ledger: boolean[];
  rumble: RumblePhase;
  wave: number;
  finale: FinalePhase;
  vault: boolean;
}

/** The night's look, and first light over the Forge (the burnout). */
const DAWN = { zenith: 0x56688a, mid: 0xd89a7a, horizon: 0xffc690, glow: 0xffd8a8, haze: 0xc8a088, fog: 0x7a5e50, hemiSky: 0xe4cdb6, hemiGround: 0x5a3a2a, fill: 0xffd2a0 };

export class ForgeRuntime {
  /** The rules (solo; idle while following a co-op simulation). */
  readonly story: ForgeStory;
  follow = false;
  requestHold: ((i: number) => void) | null = null;
  requestLedger: ((i: number) => void) | null = null;
  requestBell: (() => void) | null = null;
  private view: ForgeView | null = null;
  private shown: Shown | null = null;
  private people: Person[] = [];
  private readonly pages: THREE.Group[] = [];
  private readonly hud = new ForgeHud();
  private queue: { at: number; fn: () => void }[] = [];
  private clock = 0;
  private hearthNext = 0;
  /** Per room: seconds left of the door being cracked open, and the time to the next thud on it. */
  private doorOpen: number[];
  private thudT: number[];
  private shake: number[];
  private readonly noted = new Set<number>();
  private readonly askedAt = new Map<string, number>();
  private rosterWire: unknown = null;
  private dawnT = -1;
  private sky0: { u: Record<string, THREE.Color>; fog: THREE.Color; hemi: THREE.Color; ground: THREE.Color; fill: THREE.Color; stars: number } | null = null;
  private readonly tick: StoryTick;
  private readonly glowAmber = new THREE.Color(0xff8a2a);
  private readonly glowRed = new THREE.Color(0xff2a14);

  constructor(private readonly g: Game) {
    const sites = g.level.data.forge!;
    this.story = new ForgeStory(sites, g.zombies, g.level.nav);
    this.doorOpen = sites.rooms.map(() => 0);
    this.thudT = sites.rooms.map(() => Math.random());
    this.shake = sites.rooms.map(() => 0);
    // the ledger's pages: the Ignis mark on a sheet, lifting off its spot under a faint beam
    const paper = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.9, emissive: 0x4a3a20, emissiveIntensity: 0.5 });
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    for (const s of sites.ledger) {
      const root = new THREE.Group();
      root.position.set(s.x, s.y, s.z);
      const sheet = new THREE.Group();
      sheet.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.012, 0.4), paper));
      const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.18), ignisMaterial('lit'));
      mark.rotation.x = -Math.PI / 2;
      mark.position.y = 0.008;
      sheet.add(mark);
      sheet.position.y = 0.1;
      sheet.scale.setScalar(1.4);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.32, 2.6, 10, 1, true), beamMat);
      beam.position.y = 1.3;
      root.add(sheet, beam);
      g.worldRoot.add(root);
      this.pages.push(root);
    }
    g.interaction.sources.push((t) => this.targets(t));
    this.tick = {
      elapsed: 0,
      defenseDone: false,
      huntDone: false,
      calledAt: null,
      players: [{ x: 0, z: 0, alive: false, eyeY: 1.6 }],
      playerCount: 1,
      envNear: () => g.zenv,
      seen: (x, z) => {
        const p = g.player;
        if (!g.playerAlive() || Math.hypot(p.x - x, p.z - z) > 70) return false;
        return !g.level.world.segmentBlocked(p.x, p.eyeY(), p.z, x, 1.5, z, 'shots');
      },
    };
  }

  private get sites(): NonNullable<Game['level']['data']['forge']> {
    return this.g.level.data.forge!;
  }

  // ---------------------------------------------------------------------------------------------
  // lifecycle
  // ---------------------------------------------------------------------------------------------

  /** A fresh run. Solo: the roster is drawn here (returned: the co-leaders who deploy). Co-op: it comes from the simulation. */
  reset(coop: boolean): string[] | null {
    this.follow = coop;
    for (const p of this.people) p.avatar.dispose();
    this.people = [];
    this.view = null;
    this.shown = null;
    this.rosterWire = null;
    this.queue = [];
    this.clock = 0;
    this.hearthNext = 0;
    this.noted.clear();
    this.askedAt.clear();
    this.doorOpen.fill(0);
    this.shake.fill(0);
    this.hud.hide();
    for (const p of this.pages) p.visible = true;
    const fx = this.g.level.forgeFx;
    if (fx) {
      for (const m of fx.flameForges) m.emissiveIntensity = 0.15;
      fx.hearthGlow.emissive.copy(this.glowAmber);
      for (const d of fx.doors) d.pivot.rotation.y = d.yaw;
    }
    this.endDawn();
    if (coop) return null;
    const roster = this.story.reset(this.g.rng);
    this.setView(this.story.view);
    return roster.squad;
  }

  /** Co-op: the simulation's roster (when sent) and state. */
  applyWire(roster: unknown, state: unknown): void {
    if (!this.follow) return;
    if (roster !== undefined && roster !== null) this.rosterWire = roster;
    const v = decodeView(this.rosterWire, state, this.sites.ledger.length);
    if (!v) return;
    const first = !this.view || this.view.holdouts.map((h) => h.name).join('|') !== v.holdouts.map((h) => h.name).join('|');
    if (first) {
      this.setView(v);
      this.g.squad.deployForge(v.squad);
    } else this.view = v;
  }

  /** Who is holed up where this run: build everyone in their rooms (and, joining late, wherever they are now). */
  private setView(v: ForgeView): void {
    for (const p of this.people) p.avatar.dispose();
    this.view = v;
    this.people = v.holdouts.map((h, i) => {
      const { look, color } = vulcanLook(h.name);
      const avatar = new Avatar(h.name, i, { look, color, helmet: false, weapon: 'none', tag: rankTag(h.rank), tagColor: '#ffb060' });
      this.g.worldRoot.add(avatar.root);
      const person: Person = { name: h.name, rank: h.rank, room: h.room, avatar, phase: 'room', t: 0, slot: -1 };
      this.place(person);
      return person;
    });
    // nothing that already happened is played again (a late join): only what changes from here on
    this.shown = { phases: v.holdouts.map(() => 'room'), ledger: v.ledger.map(() => false), rumble: 'idle', wave: 0, finale: 'idle', vault: false };
    this.present(v, true);
  }

  /** Put a person where their phase says (no animation). */
  private place(p: Person): void {
    const a = p.avatar;
    if (p.phase === 'room') {
      const r = this.sites.rooms[p.room]!;
      a.set(r.inX, 0, r.inZ, r.inYaw, true);
    } else if (p.phase === 'hearth' || p.phase === 'fallen') {
      if (p.slot < 0) p.slot = this.hearthNext++;
      const s = this.sites.hearth.slots[p.slot % this.sites.hearth.slots.length]!;
      a.set(s.x, 0, s.z, s.yaw, true);
      if (p.phase === 'fallen' && !a.fallen) a.fall(Math.sin(s.yaw), Math.cos(s.yaw), 1.2);
    } else a.root.visible = false;
  }

  // ---------------------------------------------------------------------------------------------
  // per frame
  // ---------------------------------------------------------------------------------------------

  update(dt: number): void {
    const g = this.g;
    this.clock += dt;
    if (!this.follow && this.view) {
      const s = g.session;
      const t = this.tick;
      t.elapsed = s.elapsed;
      t.defenseDone = s.defense.status === 'complete';
      t.huntDone = s.hunt.status === 'complete';
      t.calledAt = s.extraction.calledAt;
      const pl = t.players[0]!;
      pl.x = g.player.x;
      pl.z = g.player.z;
      pl.alive = g.playerAlive();
      pl.eyeY = g.player.eyeY();
      if (dt > 0) this.story.tick(dt, t, g.rng);
    }
    if (this.view) this.present(this.view, false);
    if (dt > 0) {
      this.pickups();
      this.beats();
    }
    for (let i = 0; i < this.queue.length; i++) {
      if (this.queue[i]!.at > this.clock) continue;
      const q = this.queue.splice(i, 1)[0]!;
      i--;
      q.fn();
    }
    this.animate(dt);
    this.hud.update(dt);
  }

  private later(seconds: number, fn: () => void): void {
    this.queue.push({ at: this.clock + seconds, fn });
  }

  /** Who speaks for the clan on the radio: a co-leader still standing, else Anya, else COMMAND. */
  private voice(): string {
    const lead = this.g.squad.aliveNames()[0];
    if (lead) return lead.toUpperCase();
    const anya = this.people.find((p) => p.name === 'Anya');
    if (anya && anya.phase !== 'fallen') return L.anya;
    return L.command;
  }

  private once(key: string): boolean {
    const f = this.g.session.flags;
    if (f.has(key)) return false;
    f.add(key);
    return true;
  }

  /** The story's radio, by the clock. */
  private beats(): void {
    const g = this.g;
    const e = g.session.elapsed;
    const anyaIn = this.people.some((p) => p.name === 'Anya' && p.phase === 'room');
    if (e > 7 && anyaIn && this.once('fg:anyaGate')) g.radio(L.anya, L.anyaGate, 9);
    if (e > 19 && this.once('fg:squadHello')) {
      const lead = g.squad.aliveNames()[0];
      if (lead) g.radio(lead.toUpperCase(), L.squadHello, 7);
    }
    if (e > 50 && this.view && this.view.ledger.some((f) => !f) && this.once('fg:ledgerAsk')) g.radio(this.voice(), L.ledgerAsk, 7);
  }

  /** Walk into a ledger page to take it. */
  private pickups(): void {
    const g = this.g;
    const v = this.view;
    if (!v || !g.playerAlive()) return;
    const p = g.player;
    this.sites.ledger.forEach((s, i) => {
      if (v.ledger[i] || Math.hypot(s.x - p.x, s.z - p.z) > FORGE_STORY.ledger.pickupRadius) return;
      if (!this.follow) this.story.takeLedger(i, p.x, p.z);
      else if (this.ask(`ledger${i}`)) this.requestLedger?.(i);
    });
  }

  /** A request at most twice a second (a pickup or a hold asks every frame it is in reach). */
  private ask(key: string): boolean {
    const now = this.clock;
    if (now - (this.askedAt.get(key) ?? -9) < 0.5) return false;
    this.askedAt.set(key, now);
    return true;
  }

  // ---------------------------------------------------------------------------------------------
  // what changed
  // ---------------------------------------------------------------------------------------------

  private present(v: ForgeView, silent: boolean): void {
    const was = this.shown;
    if (!was) return;
    const g = this.g;
    v.holdouts.forEach((h, i) => {
      const before = was.phases[i]!;
      if (h.phase === before) return;
      was.phases[i] = h.phase;
      const p = this.people[i];
      if (!p) return;
      if (silent) {
        p.phase = h.phase;
        this.place(p);
        return;
      }
      if (h.phase === 'hearth' && before === 'room') this.leave(p);
      else if (h.phase === 'fallen') this.fall(p);
      else if (h.phase === 'reborn') {
        p.phase = 'reborn';
        p.avatar.root.visible = false;
      } else {
        p.phase = h.phase;
        this.place(p);
      }
    });
    v.ledger.forEach((taken, i) => {
      if (!taken || was.ledger[i]) return;
      was.ledger[i] = true;
      this.pages[i]!.visible = false;
      if (!silent) this.onLedger(i);
    });
    if (v.rumble.phase !== was.rumble || v.rumble.wave !== was.wave) {
      const from = was.rumble;
      was.rumble = v.rumble.phase;
      was.wave = v.rumble.wave;
      if (!silent) this.onRumble(from, v.rumble.phase, v.rumble.wave);
    }
    if (v.finale.phase !== was.finale) {
      const from = was.finale;
      was.finale = v.finale.phase;
      if (silent) {
        if (v.finale.phase === 'burnout') this.startDawn(true);
      } else this.onFinale(from, v.finale.phase, v.finale.carrier);
    }
    const vault = g.session.defense.status === 'complete';
    if (vault && !was.vault) {
      was.vault = true;
      const tomoe = this.people.find((p) => this.sites.rooms[p.room]?.vault);
      if (!silent && tomoe && tomoe.phase === 'room') {
        g.banner('THE VAULT IS OPEN', `${tomoe.name} is waiting in Vulcan HQ`, 'good', 4.5);
        this.later(2, () => g.radio(this.voice(), L.vaultOpen, 6));
      }
    }
  }

  /** Someone slips out the back: the door cracks open, a word through it, then they are gone to the Hearth. */
  private leave(p: Person): void {
    const g = this.g;
    p.phase = 'leaving';
    p.t = 0;
    this.doorOpen[p.room] = 2.2;
    const total = this.people.length;
    const safe = this.people.filter((q) => q.phase === 'hearth' || q.phase === 'leaving').length;
    addCash(g.session.inv, FORGE_STORY.rescueCash);
    g.hudEvent({ type: 'cash', amount: FORGE_STORY.rescueCash });
    g.audio.play('contract_complete', { priority: 3, volume: 0.7 });
    g.banner(`${p.name.toUpperCase()} IS OUT`, `Heading for the Hearth ${safe}/${total}   +$${FORGE_STORY.rescueCash}`, 'good', 4);
    g.feed(`${p.name.toUpperCase()} MADE IT TO THE HEARTH`, 'good');
    const line = HOLDOUT_THANKS[Math.floor(g.rng.f() * HOLDOUT_THANKS.length)]!;
    this.later(0.7, () => g.radio(p.name.toUpperCase(), line, 5));
    if (this.once('fg:hearthHint')) this.later(6.5, () => g.radio(p.name === 'Anya' ? this.voice() : L.anya, L.anyaHearth, 7));
    if (this.people.every((q) => q.phase !== 'room') && this.once('fg:allSafe')) this.later(8, () => g.radio(this.voice(), L.allSafe, 6));
  }

  private fall(p: Person): void {
    const g = this.g;
    const prev = p.phase;
    p.phase = 'fallen';
    if (prev === 'room' || prev === 'leaving' || p.slot < 0) {
      this.place(p);
    } else if (!p.avatar.fallen) {
      const s = this.sites.hearth.slots[p.slot % this.sites.hearth.slots.length]!;
      p.avatar.fall(Math.sin(s.yaw) + (g.rng.f() - 0.5), Math.cos(s.yaw), 1.6);
    }
    const h = this.sites.hearth;
    g.feed(`${p.name.toUpperCase()} WAS KILLED`, 'danger');
    g.audio.play('player_death', { priority: 2, volume: 0.7, rate: 0.9 + g.rng.f() * 0.2, pos: { x: h.x, y: 1.5, z: h.z } });
    g.fx.blood({ x: p.avatar.root.position.x, y: 1.1, z: p.avatar.root.position.z }, { x: 0, y: 0.3, z: 1 }, { amount: 1, kill: true });
    this.later(1.2, () => g.radio(this.voice(), L.finaleFall(p.name), 3));
  }

  private onLedger(i: number): void {
    const g = this.g;
    const total = this.sites.ledger.length;
    const count = this.shown!.ledger.filter((f) => f).length;
    const done = count >= total;
    const cash = FORGE_STORY.ledger.cashEach + (done ? FORGE_STORY.ledger.bonus : 0);
    const a = applyContractReward(g.session.inv, { cash, plates: 0, grenades: 0 });
    g.hudEvent({ type: 'cash', amount: a.cash });
    g.audio.play('pickup_cash', { priority: 2 });
    g.audio.play('objective_ping', { priority: 2, volume: 0.8 });
    const page = LEDGER_PAGES[i] ?? LEDGER_PAGES[0]!;
    if (done) {
      g.banner('THE LEDGER IS WHOLE', `${page.title}   +$${a.cash.toLocaleString('en-US')}`, 'good', 5);
      g.audio.play('contract_complete', { priority: 3 });
    } else g.banner(`LEDGER PAGE ${count}/${total}`, `${page.title}   +$${a.cash.toLocaleString('en-US')}`, 'good', 4);
    g.feed(`LEDGER PAGE ${count}/${total}  +$${a.cash}`, 'good');
    this.hud.show({ tag: `LEDGER PAGE ${i + 1}/${total}`, title: page.title, source: page.source, body: page.body }, 18);
    this.later(2.5, () => g.radio(this.voice(), page.comment, 8));
  }

  private onRumble(from: RumblePhase, to: RumblePhase, wave: number): void {
    const g = this.g;
    const waves = FORGE_STORY.rumble.waves.length;
    if (to === 'wave') {
      if (from === 'idle') {
        g.radio(this.voice(), L.rumbleRing, 6);
        g.audio.play('klaxon', { priority: 3, volume: 0.7 });
      }
      g.banner('RUMBLE PIT', `Wave ${wave + 1}/${waves} - hold the ring`, 'warn', 3.5);
    } else if (to === 'gap') {
      g.feed(`RUMBLE WAVE ${wave + 1}/${waves} CLEARED`, 'good');
    } else if (to === 'done') {
      const R = FORGE_STORY.rumble;
      const a = applyContractReward(g.session.inv, { cash: R.cash, plates: R.plates, grenades: 0 });
      g.hudEvent({ type: 'cash', amount: a.cash });
      g.banner('RUMBLE PIT CLEARED', `+$${a.cash.toLocaleString('en-US')}${a.plates ? `   +${a.plates} ARMOR PLATES` : ''}`, 'good', 5);
      g.audio.play('contract_complete', { priority: 3 });
      this.later(1.5, () => g.radio(this.voice(), L.rumbleDone, 5));
    }
  }

  private onFinale(from: FinalePhase, to: FinalePhase, carrier: number): void {
    const g = this.g;
    const fx = g.level.forgeFx;
    const h = this.sites.hearth;
    if (to === 'warning') {
      fx?.hearthGlow.emissive.copy(this.glowRed);
      g.radio(L.anya, L.finaleWarn, 3);
      g.audio.play('klaxon', { priority: 3 });
      g.audio.play('zombie_screech', { priority: 3, volume: 1.3, rate: 0.6, pos: { x: h.x, y: 2, z: h.z } });
      g.shake(0.4);
    } else if (to === 'reborn') {
      fx?.hearthGlow.emissive.copy(this.glowRed);
      const name = this.people[carrier]?.name ?? 'Someone';
      g.banner(`${name.toUpperCase()} - REBORN`, 'They hid the bite. Kill it before it burns through the Hearth.', 'danger', 6);
      g.radio(L.command, L.finaleReborn(name), 7);
      this.later(7.5, () => g.radio(L.pilot, L.finaleHold, 5));
      g.audio.play('warden_roar', { priority: 3, volume: 1.5, rate: 0.8, pos: { x: h.gateX, y: 2, z: h.gateZ } });
      g.shake(0.8);
    } else if (to === 'burnout') {
      fx?.hearthGlow.emissive.copy(this.glowAmber);
      g.banner('THE FIRE IS OUT', 'Every infected left in the Forge is burning out', 'good', 6);
      g.audio.play('victory_sting', { priority: 3, volume: 0.6 });
      this.later(1.5, () => g.radio(this.voice(), L.burnout, 6));
      this.later(9, () => g.radio(L.pilot, L.dawn, 5));
      this.startDawn(false);
    }
    void from;
  }

  // ---------------------------------------------------------------------------------------------
  // animation: rooms, doors, the Hearth, the pages, the pounding, the dawn
  // ---------------------------------------------------------------------------------------------

  private animate(dt: number): void {
    const g = this.g;
    const fx = g.level.forgeFx;
    const sites = this.sites;
    // people (only drawn near enough to see: a room shows them through its window, the Hearth through its gate)
    const me = g.player;
    for (const p of this.people) {
      if (p.phase === 'leaving') {
        p.t += dt;
        const r = sites.rooms[p.room]!;
        // a moment at the window, then away to the back door
        if (p.t > 1.0) p.avatar.set(r.backX, 0, r.backZ, Math.atan2(-(r.backX - r.inX), -(r.backZ - r.inZ)), true);
        if (p.t > 3.4) {
          p.phase = 'hearth';
          this.place(p);
        }
      }
      const a = p.avatar;
      if (p.phase !== 'reborn') {
        const far = Math.hypot(a.root.position.x - me.x, a.root.position.z - me.z) > (p.phase === 'room' || p.phase === 'leaving' ? 42 : 70);
        a.root.visible = !far;
      }
      if (a.root.visible) a.update(dt);
    }
    // the doors: cracked open to talk, and shaking under the blows
    if (fx) {
      sites.rooms.forEach((r, i) => {
        const d = fx.doors[i];
        if (!d) return;
        let open = 0;
        if (this.doorOpen[i]! > 0) {
          this.doorOpen[i]! -= dt;
          const t = this.doorOpen[i]!;
          open = 0.5 * Math.min(1, (2.2 - t) / 0.4, t / 0.6);
        }
        this.shake[i] = Math.max(0, this.shake[i]! - dt * 6);
        d.pivot.rotation.y = d.yaw + Math.max(0, open) + Math.sin(this.clock * 70) * 0.012 * this.shake[i]!;
        void r;
      });
      // the seven forges light up when all seven flames are found
      const lit = g.squad.flamesAllTaken();
      for (let i = 0; i < fx.flameForges.length; i++) {
        const m = fx.flameForges[i]!;
        const want = lit ? 2.2 + Math.sin(this.clock * 3 + i) * 0.3 : 0.15;
        m.emissiveIntensity += (want - m.emissiveIntensity) * Math.min(1, dt * 1.5);
      }
    }
    this.pound(dt);
    // the pages bob under their beams
    for (let i = 0; i < this.pages.length; i++) {
      const pg = this.pages[i]!;
      if (!pg.visible) continue;
      const sheet = pg.children[0]!;
      sheet.position.y = 0.1 + Math.sin(this.clock * 2.1 + i) * 0.03;
      sheet.rotation.y += dt * 0.5;
    }
    if (this.dawnT >= 0) this.stepDawn(dt);
  }

  /** The infected at the doors: thuds, dust and the door shaking, for the doors near enough to hear. */
  private pound(dt: number): void {
    const g = this.g;
    const v = this.view;
    if (!v) return;
    const p = g.player;
    const rooms = this.sites.rooms;
    const occupied = new Set(v.holdouts.filter((h) => h.phase === 'room').map((h) => h.room));
    rooms.forEach((r, i) => {
      if (!occupied.has(i) || Math.hypot(r.doorX - p.x, r.doorZ - p.z) > 48) return;
      let n = 0;
      for (const z of g.zombies.zombies) {
        if (!z.active || z.dormant || Math.hypot(z.x - r.doorX, z.z - r.doorZ) > 2.4) continue;
        if (z.poseMode === 'attack') n++;
      }
      if (n === 0) return;
      this.thudT[i]! -= dt;
      if (this.thudT[i]! > 0) return;
      this.thudT[i] = (0.5 + Math.random() * 0.5) / Math.min(2.4, 0.6 + n * 0.45);
      const at = { x: r.doorX - r.nx * 0.9, y: 1.2, z: r.doorZ - r.nz * 0.9 };
      g.audio.play('impact_wood', { pos: at, volume: Math.min(1.1, 0.55 + 0.12 * n), rate: 0.55 + Math.random() * 0.2, priority: 1 });
      if (Math.random() < 0.18) g.audio.play('amb_clang', { pos: at, volume: 0.45, rate: 0.8, priority: 0 });
      if (Math.random() < 0.3) g.fx.dust({ x: at.x, y: 2.1, z: at.z }, 0.25);
      this.shake[i] = 1;
    });
  }

  private startDawn(instant: boolean): void {
    const r = this.g.renderer;
    if (!this.sky0) {
      const u = r.sky.userData.uniforms as Record<string, { value: THREE.Color | number }>;
      const cols: Record<string, THREE.Color> = {};
      for (const k of ['uZenith', 'uMid', 'uHorizon', 'uGlow', 'uHazeColor']) cols[k] = (u[k]!.value as THREE.Color).clone();
      const fog = (r.scene.fog as THREE.FogExp2 | null)?.color.clone() ?? new THREE.Color(0x2a1710);
      this.sky0 = { u: cols, fog, hemi: r.light.hemi.color.clone(), ground: r.light.hemi.groundColor.clone(), fill: r.light.fill.color.clone(), stars: Number(u.uStars?.value ?? 1) };
    }
    this.dawnT = instant ? 1 : 0;
    this.stepDawn(0);
  }

  private stepDawn(dt: number): void {
    const s = this.sky0;
    if (!s) return;
    this.dawnT = Math.min(1, this.dawnT + dt / 12);
    const k = this.dawnT * this.dawnT * (3 - 2 * this.dawnT);
    const r = this.g.renderer;
    const u = r.sky.userData.uniforms as Record<string, { value: THREE.Color | number }>;
    const mix = (from: THREE.Color, to: number, out: THREE.Color): void => void out.copy(from).lerp(new THREE.Color(to), k);
    mix(s.u.uZenith!, DAWN.zenith, u.uZenith!.value as THREE.Color);
    mix(s.u.uMid!, DAWN.mid, u.uMid!.value as THREE.Color);
    mix(s.u.uHorizon!, DAWN.horizon, u.uHorizon!.value as THREE.Color);
    mix(s.u.uGlow!, DAWN.glow, u.uGlow!.value as THREE.Color);
    mix(s.u.uHazeColor!, DAWN.haze, u.uHazeColor!.value as THREE.Color);
    if (u.uStars) u.uStars.value = s.stars * (1 - k);
    const fog = r.scene.fog as THREE.FogExp2 | null;
    if (fog) mix(s.fog, DAWN.fog, fog.color);
    mix(s.hemi, DAWN.hemiSky, r.light.hemi.color);
    mix(s.ground, DAWN.hemiGround, r.light.hemi.groundColor);
    mix(s.fill, DAWN.fill, r.light.fill.color);
    if (this.dawnT >= 1) this.dawnT = -2; // held at dawn
  }

  /** Back to ember night (a new run). */
  private endDawn(): void {
    const s = this.sky0;
    this.dawnT = -1;
    if (!s) return;
    const r = this.g.renderer;
    const u = r.sky.userData.uniforms as Record<string, { value: THREE.Color | number }>;
    for (const k of Object.keys(s.u)) (u[k]!.value as THREE.Color).copy(s.u[k]!);
    if (u.uStars) u.uStars.value = s.stars;
    (r.scene.fog as THREE.FogExp2 | null)?.color.copy(s.fog);
    r.light.hemi.color.copy(s.hemi);
    r.light.hemi.groundColor.copy(s.ground);
    r.light.fill.color.copy(s.fill);
  }

  // ---------------------------------------------------------------------------------------------
  // the rules, as the game asks
  // ---------------------------------------------------------------------------------------------

  /** The helicopter holds off while the reborn is loose. */
  get holdExtraction(): boolean {
    const f = this.view?.finale.phase;
    return f === 'warning' || f === 'reborn';
  }

  /** The virus is over: no more spawns, the firestorm dies down, dawn. */
  get burnedOut(): boolean {
    return this.view?.finale.phase === 'burnout';
  }

  /** True while the burnout is killing (those kills pay nothing). */
  get burning(): boolean {
    return !this.follow && this.story.burning;
  }

  /** Names no infected may carry this run. */
  get reserved(): ReadonlySet<string> {
    return new Set(this.view?.holdouts.map((h) => h.name) ?? []);
  }

  /** Who made it, who did not, and who is still barricaded in (the ending): the Hearth, the squad, the rooms. */
  ending(): { saved: { name: string; tag: string }[]; fallen: { name: string; tag: string }[]; left: { name: string; tag: string }[] } {
    const saved: { name: string; tag: string }[] = [];
    const fallen: { name: string; tag: string }[] = [];
    const left: { name: string; tag: string }[] = [];
    for (const n of this.g.squad.aliveNames()) saved.push({ name: n, tag: rankTag('coLead') });
    for (const n of this.g.squad.fallenNames()) fallen.push({ name: n, tag: rankTag('coLead') });
    for (const p of this.people) {
      const entry = { name: p.name, tag: p.phase === 'reborn' ? 'REBORN' : rankTag(p.rank) };
      if (p.phase === 'hearth' || p.phase === 'leaving') saved.push(entry);
      else if (p.phase === 'fallen' || p.phase === 'reborn') fallen.push(entry);
      else left.push(entry);
    }
    return { saved, fallen, left };
  }

  /** Holdouts' looks (the ending's portraits). */
  lookOf(name: string): ReturnType<typeof vulcanLook> {
    return vulcanLook(name);
  }

  // ---------------------------------------------------------------------------------------------
  // interactions
  // ---------------------------------------------------------------------------------------------

  private doorThreats(r: SafeRoomDef): number {
    let n = 0;
    for (const z of this.g.zombies.zombies) if (z.active && Math.hypot(z.x - r.doorX, z.z - r.doorZ) < FORGE_STORY.doorClear) n++;
    return n;
  }

  private targets(out: InteractionTarget[]): void {
    const g = this.g;
    const v = this.view;
    if (!v || !g.playerAlive()) return;
    const p = g.player;
    const sites = this.sites;
    v.holdouts.forEach((h, i) => {
      if (h.phase !== 'room') return;
      const r = sites.rooms[h.room]!;
      const d = Math.hypot(r.doorX - p.x, r.doorZ - p.z);
      if (d > 6) return;
      // the note on the door, the first time you come up to it
      if (d < 4.2 && !this.noted.has(i)) {
        this.noted.add(i);
        const note = (DOOR_NOTES[r.id] ?? '{name}').replace('{name}', h.name);
        this.hud.show({ tag: 'ON THE DOOR', title: r.place.toUpperCase(), body: note }, 9);
      }
      if (d > FORGE_STORY.doorReach + 0.6) return;
      const name = h.name.toUpperCase();
      if (r.vault && g.session.defense.status !== 'complete') {
        out.push({ id: `hold-sealed:${i}`, dist: d, text: `${name} - THE VAULT IS SEALED`, sub: L.vaultSealed, tone: 'warn', hold: 0, enabled: false, onUse: () => {} });
        return;
      }
      const n = this.doorThreats(r);
      if (n > 0) {
        out.push({ id: `hold-blocked:${i}`, dist: d, text: `${name} WON'T OPEN UP`, sub: `Clear the door first - ${n} infected ${n === 1 ? 'is' : 'are'} still on it`, tone: 'warn', hold: 0, enabled: false, onUse: () => {} });
        return;
      }
      out.push({
        id: `hold:${i}`,
        dist: d,
        text: `CALL ${name} OUT`,
        sub: "It's clear - they'll slip out the back to the Hearth",
        tone: 'good',
        hold: FORGE_STORY.rescueHold,
        enabled: true,
        onUse: () => {
          if (!this.follow) this.story.rescue(i, g.player.x, g.player.z);
          else this.requestHold?.(i);
        },
      });
    });
    const pit = sites.rumble;
    if (v.rumble.phase === 'idle' && v.finale.phase !== 'burnout') {
      const d = Math.hypot(pit.bellX - p.x, pit.bellZ - p.z);
      if (d < 2.8) {
        out.push({
          id: 'bell',
          dist: d,
          text: "RING RIRY'S BELL",
          sub: `Three waves in the Rumble Pit - $${FORGE_STORY.rumble.cash} and armor if you hold the ring`,
          tone: 'warn',
          hold: 0.8,
          enabled: true,
          onUse: () => {
            if (!this.follow) this.story.ringBell(g.player.x, g.player.z, this.tick, g.rng);
            else this.requestBell?.();
          },
        });
      }
    }
  }

  // ---------------------------------------------------------------------------------------------
  // HUD and maps
  // ---------------------------------------------------------------------------------------------

  decorateHud(st: HudState, md: MapDynamic): void {
    const g = this.g;
    const v = this.view;
    if (!v) return;
    const p = g.player;
    const sites = this.sites;
    const total = v.holdouts.length;
    const safe = v.holdouts.filter((h) => h.phase === 'hearth').length;
    // the nearest door still shut
    let near: { i: number; d: number } | null = null;
    v.holdouts.forEach((h, i) => {
      if (h.phase !== 'room') return;
      const r = sites.rooms[h.room]!;
      const d = Math.hypot(r.doorX - p.x, r.doorZ - p.z);
      if (!near || d < near.d) near = { i, d };
    });
    const nearest = near as { i: number; d: number } | null;
    const objs: HudObjective[] = [];
    if (total > 0) {
      let detail = safe + v.holdouts.filter((h) => h.phase === 'fallen' || h.phase === 'reborn').length >= total ? 'Everyone left is at the Hearth' : '';
      if (nearest) {
        const h = v.holdouts[nearest.i]!;
        const r = sites.rooms[h.room]!;
        const status = r.vault && g.session.defense.status !== 'complete' ? 'sealed until the beacon burns' : this.doorThreats(r) > 0 ? 'infected at the door' : 'the door is clear';
        detail = `${h.name} - ${r.place}: ${status}`;
      }
      objs.push({ id: 'holdouts', title: `REACH THE HOLDOUTS  ${safe}/${total}`, detail, state: nearest ? 'active' : 'complete', progress: safe / total, tracked: false, distance: nearest ? nearest.d : -1 });
    }
    const pages = sites.ledger.length;
    const got = v.ledger.filter((f) => f).length;
    let pageNear: { i: number; d: number } | null = null;
    sites.ledger.forEach((s, i) => {
      if (v.ledger[i]) return;
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (!pageNear || d < pageNear.d) pageNear = { i, d };
    });
    const pn = pageNear as { i: number; d: number } | null;
    objs.push({ id: 'ledger', title: `TOMOE'S LEDGER  ${got}/${pages}`, detail: pn ? `Nearest page in ${sites.ledger[pn.i]!.place}` : 'Every page recovered', state: got >= pages ? 'complete' : 'active', progress: got / pages, tracked: false, distance: pn ? pn.d : -1 });
    const pit = sites.rumble;
    const pitD = Math.hypot(pit.x - p.x, pit.z - p.z);
    if (v.rumble.phase === 'wave' || v.rumble.phase === 'gap') objs.push({ id: 'rumble', title: `RUMBLE PIT  WAVE ${v.rumble.wave + 1}/${FORGE_STORY.rumble.waves.length}`, detail: v.rumble.phase === 'gap' ? 'Next wave incoming' : 'Hold the ring', state: 'active', progress: (v.rumble.wave + (v.rumble.phase === 'gap' ? 1 : 0)) / FORGE_STORY.rumble.waves.length, tracked: false, distance: pitD });
    else if (v.rumble.phase === 'idle' && pitD < 30) objs.push({ id: 'rumble', title: 'RUMBLE PIT', detail: "Ring riry's bell for three waves (optional)", state: 'available', progress: -1, tracked: false, distance: pitD });
    const reborn = this.rebornZombie();
    if (reborn) {
      const name = this.people[v.finale.carrier]?.name ?? '';
      const d = Math.hypot(reborn.x - p.x, reborn.z - p.z);
      objs.unshift({ id: 'reborn', title: `${name.toUpperCase()} - REBORN`, detail: "Kill it - the bird can't land while it lives", state: 'active', progress: Math.max(0, reborn.hp / reborn.maxHp), tracked: true, distance: d });
      for (const o of st.objectives) o.tracked = false;
      md.markers.push({ id: 'reborn', kind: 'hunt', x: reborn.x, z: reborn.z, label: 'REBORN', color: '#ff3a2a', visible: true, compass: true, pulse: true });
    }
    const ext = st.objectives.find((o) => o.id === 'extract');
    if (ext && this.holdExtraction) ext.detail = 'The bird is holding off - kill the reborn';
    st.objectives.push(...objs.filter((o) => o.id !== 'reborn'));
    const r0 = objs.find((o) => o.id === 'reborn');
    if (r0) st.objectives.unshift(r0);
    // the maps and the compass
    v.holdouts.forEach((h, i) => {
      if (h.phase !== 'room') return;
      const r = sites.rooms[h.room]!;
      const sealed = r.vault && g.session.defense.status !== 'complete';
      md.markers.push({ id: `hold:${i}`, kind: 'objective', x: r.doorX, z: r.doorZ, label: sealed ? 'VAULT' : h.name.toUpperCase(), color: '#9fd0ff', visible: true, compass: !!nearest && nearest.i === i, dim: sealed });
    });
    md.markers.push({ id: 'hearth', kind: 'landmark', x: sites.hearth.gateX, z: sites.hearth.gateZ - 2, label: 'HEARTH', color: '#ffb060', visible: true, dim: true });
    sites.ledger.forEach((s, i) => {
      if (!v.ledger[i]) md.markers.push({ id: `ledger:${i}`, kind: 'objective', x: s.x, z: s.z, label: 'LEDGER', color: '#ffd27a', visible: true, compass: !!pn && pn.i === i && pn.d < 60 });
    });
    if (v.rumble.phase !== 'done') md.markers.push({ id: 'rumble', kind: 'landmark', x: pit.x, z: pit.z, label: 'RUMBLE PIT', color: '#ff8ac8', visible: true, dim: v.rumble.phase === 'idle' });
    void SURVIVORS;
  }

  /** The reborn, while it lives (found by its name: a solo run's own, or the simulation's puppet). */
  private rebornZombie(): { x: number; z: number; hp: number; maxHp: number } | null {
    const v = this.view;
    if (!v || v.finale.phase !== 'reborn') return null;
    const name = this.people[v.finale.carrier]?.name;
    if (!name) return null;
    for (const z of this.g.zombies.zombies) if (z.alive && z.type === 'warden' && z.tag === name) return { x: z.x, z: z.z, hp: z.hp, maxHp: z.maxHp };
    return null;
  }

  dispose(): void {
    for (const p of this.people) p.avatar.dispose();
    this.people = [];
    for (const pg of this.pages) pg.removeFromParent();
    this.hud.dispose();
  }
}
