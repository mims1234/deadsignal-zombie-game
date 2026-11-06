/**
 * The Sakura District's own runtime (built when the map is): the petals in the air, the story told aloud (Aoi on the
 * shrine relay and the squad, the first time you walk into each part of the district), the field file (a card the
 * first time you meet each kind of infected; the pause menu's page), KAIKA's chapters (`campaign.ts`), and the
 * Thousand Lanterns - the charms, the sacred tree, the five great lanterns, the bell, the bloom (the blood moon, the
 * crimson trees, the glowing canal, the ghost train) and Kisaragi Station's relics and altar.
 *
 * The quest's state is the simulation's in a co-op story run (`applyWire`; requests go to it through `request`) and
 * this runtime's own otherwise. Either way what changed is presented by comparing views, so both look the same; the
 * chapters are worked out from the same view and the contracts, so they move together for everyone. The radio, the
 * field file, the scroll, the relics and the altar are each player's own.
 */
import * as THREE from 'three';
import { PLAYER, WEAPONS } from '../config';
import type { Game } from '../game/game';
import type { InteractionTarget } from '../game/interaction';
import { activeWeapon, spendCash } from '../logic/economy';
import { applyUpgradeAmmo } from '../logic/ammo';
import { takePrize } from '../logic/mysteryBox';
import { getWeaponStats } from '../logic/weaponStats';
import type { GameRenderer } from '../render/renderer';
import { setSkyColors } from '../render/stage';
import { loadSakura, type SakuraProgress, saveSakura } from '../storage';
import type { HudState, MapDynamic } from '../ui/hudTypes';
import type { SakuraHandles } from '../world/layout/sakura';
import { CANAL_WATER } from '../world/layout/sakura/canal';
import { BLOSSOM, jpSignMaterial } from '../world/layout/sakura/props';
import { buildFieldFile, type FieldFileStory, type NoteText, SakuraHud, STAMP_URL } from './hud';
import { CHAPTERS, FIELD, type FieldKind, PLACE_NAMES, PLACE_RADIO, type Place, campaignSetPiece, chapterIndex, orderWords, placeAt, PROCESSION, processionWave } from './campaign';
import { NOTES, type SakuraNote } from './lore';
import { PetalFall } from './petalFall';
import { type RouteGoal, RouteTrail } from './trail';
import { metroPower } from '../world/layout/sakura/metro';
import { CHARM_PLACES, decodeQuest, FUSE_BIT, LANTERN_SIGNS, QUEST_REACH, type QuestSpots, type QuestView, SakuraQuest } from './quest';
import { EMPRESS_HP, empressAwake, LURES, populateSakura, SakuraDirector, sakuraTerritory, sakuraVariantPicker, Stalker } from './director';
import { BY_TEXT, LINE } from './lines';
import { type LineKind, SakuraVoice } from './voice';
import { LAB_KIOSK } from '../world/layout/sakura/theatre';
import { STORIES, type StoryId } from './missions';
import { questSpots } from './spots';

/** Blossom dusk (every run starts here) and the blood moon (the bloom). */
const DUSK = { sky: { zenith: 0x1e1434, mid: 0x5a3466, horizon: 0xd8869e, glow: 0xff9670, haze: 0x6a4058, stars: 0.35 }, fog: 0x4a2c44, hemi: 0xe6b4d2, ground: 0x2a1a2a, fill: 0xffb4d4 };
const BLOOD = { sky: { zenith: 0x12040a, mid: 0x420a18, horizon: 0xc8203a, glow: 0xff3a2a, haze: 0x5a1420, stars: 0.6 }, fog: 0x3a0a16, hemi: 0xd86a7a, ground: 0x2a0a10, fill: 0xff4050 };

/** The Blossom Altar: the gun in your hands to its top tier, and the two blessings. */
const ALTAR = { cost: 4000, perkCost: 3000 };
const PERKS = {
  spirit: { name: 'SAKURA SPIRIT', blurb: '+50 max health, and it comes back faster', color: 0xff7aa8 },
  step: { name: 'RAIJU STEP', blurb: 'Reload 30% faster, fire 15% faster', color: 0x7ac8ff },
} as const;
type PerkId = keyof typeof PERKS;

/** The lab stairwell's doorway, behind the clinic (the SEALED prompt stands here while nobody has the keycard). */
const LAB_DOOR = { x: LAB_KIOSK.x, z: LAB_KIOSK.z + 0.4 };

/** How far the story has come, 0..1 (the district's pressure rises with it). */
function storyProgress(v: QuestView, defense: string, hunt: string): number {
  let n = bitsOf(v.found) + (SakuraQuest.powered(v) ? 1 : 0) + (SakuraQuest.hasKey(v) ? 1 : 0);
  if (v.tied === 0b11111) n++;
  if (v.phase === 'bell' || v.phase === 'bloom') n++;
  if (v.phase === 'bloom') n += 2;
  if (defense === 'complete') n++;
  if (hunt === 'complete') n++;
  return Math.min(1, n / 13);
}

/** What a player asks of the quest (co-op: the simulation does it). */
type QuestAct = 'charm' | 'fuse' | 'tie' | 'light' | 'ring' | 'key' | 'flame' | 'relic';

interface NoteView {
  n: SakuraNote;
  root: THREE.Group;
  beam: THREE.Mesh;
  x: number;
  y: number;
  z: number;
}

export class SakuraRuntime {
  readonly petals: PetalFall;
  private readonly hud = new SakuraHud();
  private readonly h: SakuraHandles;
  private readonly spots: QuestSpots;
  /** Solo: the quest itself. */
  private readonly local: SakuraQuest;
  /** What the screen shows (solo: the local quest's view; co-op: the simulation's), and what was last presented. */
  private view: QuestView;
  private shown: QuestView;
  /** Co-op story run: the simulation decides; `request` asks it. */
  private follow = false;
  request: ((a: QuestAct, i: number) => void) | null = null;
  private progress: SakuraProgress;
  private readonly found: Set<string>;
  private readonly notes: NoteView[] = [];
  private readonly charms: THREE.Group[] = [];
  private readonly treeCharms: THREE.Object3D[] = [];
  private readonly flames: THREE.Group[] = [];
  private readonly ghost: THREE.Group;
  private readonly relicMeshes: THREE.Group[] = [];
  private readonly perkOrbs: THREE.Mesh[] = [];
  private readonly relicTaken = [false, false];
  private readonly perks = new Set<PerkId>();
  private bloomed = false;
  private time = 0;
  private bellCd = 0;
  /** Solo: the stalker who comes once a run (co-op: the simulation's). */
  private readonly stalker = new Stalker();
  /** Movement while an idol's song is in your ears (1 = free). */
  moveMul = 1;
  private idolWarned = false;
  /** This run's story mission (KAIKA: the campaign), and the chapter it is on (-1 before the first). */
  private tale: StoryId | null = null;
  private chapter = -1;
  /** The procession (`campaign.ts`): waves sent, and seconds since the helicopter was called after the bloom. */
  private procession = 0;
  private processionT = 0;
  /** Places whose transmission has played this run; kinds met this run (their field card shows once a run). */
  private readonly heard = new Set<Place>();
  private readonly met = new Set<string>();
  /** The lab keycard on the yard office's door (gone once taken). */
  private readonly keycard: THREE.Group;
  /** The first flame in its little shrine before Okada's izakaya (gone once carried). */
  private readonly flame: THREE.Group;
  /** Everything said aloud, one line at a time (`voice.ts`), and the score. */
  readonly voice: SakuraVoice;
  /** The district's pressure and its lures (solo: here; co-op: the simulation's). */
  private readonly dir: SakuraDirector;
  /** Lines that come back now and then (seconds until each may again). */
  private readonly again = new Map<string, number>();
  /** The Empress: seen, raging, down (her lines, once each); awake (her hunt open) as last seen. */
  private empress = { seen: false, rage: false, down: false, awake: false };
  private scanT = 0;
  /** The district's air: the next wind chime, crow or departure melody. */
  private ambT = 6;
  /** The festival scroll read this run (the field file shows the poem). */
  private poemRead = false;
  private readonly labArea: number;
  /** The petal trail to the next goal, and when the goal is worked out again. */
  private readonly trail: RouteTrail;
  private routeT = 0;
  /** The metro's fuses in their cabinets (gone once taken), and whether its power shows as on. */
  private readonly fuses: THREE.Group[] = [];
  private powerShown = false;
  /** Paper lanterns risen where a charm was taken (the place is at peace), cleared on a new run. */
  private readonly risen: THREE.Group[] = [];

  constructor(private readonly g: Game) {
    this.h = g.level.sakura!;
    this.spots = questSpots(this.h);
    this.local = new SakuraQuest(this.spots);
    this.view = this.local.view;
    this.shown = SakuraQuest.empty();
    this.progress = loadSakura();
    this.found = new Set(this.progress.notes);
    this.petals = new PetalFall(g.touchMode ? 140 : 320);
    g.worldRoot.add(this.petals.mesh);
    this.buildNotes();
    this.buildQuest();
    this.ghost = this.buildGhost();
    this.buildKisaragi();
    g.interaction.sources.push((t) => this.targets(t));
    this.labArea = g.level.floors.areas.findIndex((a) => a.name === 'Kurenai lab');
    this.trail = new RouteTrail(g.level, g.worldRoot);
    this.buildFuses();
    this.keycard = this.buildKeycard();
    this.flame = this.buildFlame();
    this.voice = new SakuraVoice(g.audio);
    this.voice.onCaption = (who, text, dur) => g.hud.event({ type: 'radio', speaker: who, text, duration: dur });
    this.voice.canSpeak = (who) => !((who === 'HANA' || who === 'YUZU') && g.squad.lost(who));
    g.radioHook = (who, text) => this.onRadio(who, text);
    this.dir = new SakuraDirector(g.zombies);
    g.zombies.pickVariant = sakuraVariantPicker(g.level, () => this.dir.kinds);
    g.zombies.territoryOf = sakuraTerritory();
    g.zombies.bossHpMul = EMPRESS_HP;
    g.menus.pauseTab = () => ({ label: 'FIELD FILE', build: () => buildFieldFile({ story: this.fieldStory(), seen: new Set(this.progress.seen), poem: this.poemRead ? SakuraQuest.poem(this.view.order) : null }) });
  }

  /** Load the voices and the score (the loading screen waits for it). */
  preload(progress?: (done: number, total: number) => void): Promise<void> {
    return this.voice.load(progress);
  }

  /** The dusk look (sky, fog, lights): the map's own; the bloom changes it. */
  static applyDusk(r: GameRenderer): void {
    SakuraRuntime.look(r, DUSK);
  }

  private static look(r: GameRenderer, l: typeof DUSK): void {
    setSkyColors(r.sky, l.sky);
    (r.scene.fog as THREE.FogExp2 | null)?.color.set(l.fog);
    r.light.hemi.color.set(l.hemi);
    r.light.hemi.groundColor.set(l.ground);
    r.light.fill.color.set(l.fill);
  }

  // ---------------------------------------------------------------------------------------------
  // building
  // ---------------------------------------------------------------------------------------------

  private buildNotes(): void {
    const g = this.g;
    const fl = g.level.floors;
    const paper = new THREE.MeshStandardMaterial({ color: 0xece2d0, roughness: 0.9, emissive: 0x3a2a30, emissiveIntensity: 0.5, side: THREE.DoubleSide });
    const stamp = new THREE.MeshBasicMaterial({ map: new THREE.TextureLoader().load(STAMP_URL), transparent: true, depthWrite: false });
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xff9ec8, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const sheet = new THREE.PlaneGeometry(0.26, 0.34);
    const seal = new THREE.PlaneGeometry(0.09, 0.09);
    const beamGeo = new THREE.CylinderGeometry(0.12, 0.26, 2.2, 10, 1, true);
    for (const n of NOTES) {
      const area = n.area === 'street' ? 0 : fl.areas.findIndex((a) => a.name === n.area);
      if (area < 0) continue;
      const nav = fl.navOf(area);
      const cell = nav.nearestFree(n.x, n.z, 5);
      const x = cell >= 0 ? nav.cellCenterX(cell) : n.x;
      const z = cell >= 0 ? nav.cellCenterZ(cell) : n.z;
      const y = fl.areas[area]!.y;
      const root = new THREE.Group();
      root.position.set(x, y, z);
      const page = new THREE.Mesh(sheet, paper);
      page.rotation.set(-Math.PI / 2 + 0.25, 0, (n.x * 7 + n.z * 3) % 6);
      page.position.y = 0.06;
      root.add(page);
      if (n.clue) {
        const s = new THREE.Mesh(seal, stamp);
        s.position.set(0.06, 0.004, 0.09);
        page.add(s);
      }
      const beam = new THREE.Mesh(beamGeo, beamMat.clone());
      beam.position.y = 1.1;
      root.add(beam);
      g.worldRoot.add(root);
      this.notes.push({ n, root, beam, x, y, z });
    }
    this.refreshNotes();
  }

  private buildQuest(): void {
    const g = this.g;
    const s = this.spots;
    const red = new THREE.MeshStandardMaterial({ color: 0xc8243a, roughness: 0.6, emissive: 0x5a0a14, emissiveIntensity: 0.6 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xe8c060, roughness: 0.3, metalness: 0.8, emissive: 0x4a3010, emissiveIntensity: 0.5 });
    const glowMat = new THREE.SpriteMaterial({ color: 0xff6a8a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const pouch = new THREE.BoxGeometry(0.07, 0.1, 0.025);
    const knot = new THREE.SphereGeometry(0.014, 8, 6);
    const makeCharm = (): THREE.Group => {
      const c = new THREE.Group();
      const p = new THREE.Mesh(pouch, red);
      const k = new THREE.Mesh(knot, gold);
      k.position.y = 0.06;
      c.add(p, k);
      return c;
    };
    // the five charms where Aoi left them
    for (const at of s.charms) {
      const c = makeCharm();
      c.scale.setScalar(1.6);
      const glow = new THREE.Sprite(glowMat);
      glow.scale.setScalar(0.5);
      c.add(glow);
      c.position.set(at.x, at.y, at.z);
      g.worldRoot.add(c);
      this.charms.push(c);
    }
    // and hung on the sacred tree once tied
    for (let i = 0; i < 5; i++) {
      const c = makeCharm();
      const a = (i / 5) * Math.PI * 2;
      c.position.set(s.tree.x + Math.cos(a) * 1.7, 2.4 + (i % 2) * 0.5, s.tree.z + Math.sin(a) * 1.7);
      c.visible = false;
      g.worldRoot.add(c);
      this.treeCharms.push(c);
    }
    // the great lanterns: a plaque with each one's sign over it, and its flame (dark until lit)
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffb060, fog: false });
    const haloMat = new THREE.SpriteMaterial({ color: 0xff9040, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    s.lanterns.forEach((l, j) => {
      const sign = LANTERN_SIGNS[j]!;
      const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), jpSignMaterial(sign.kanji, { bg: '#2a1a14', fg: '#f2e2c0', aspect: 1, sub: sign.word, worn: 0.6 }));
      plaque.position.set(l.x, 2.75, l.z);
      g.worldRoot.add(plaque);
      const back = plaque.clone();
      back.rotation.y = Math.PI;
      g.worldRoot.add(back);
      const f = new THREE.Group();
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), flameMat);
      const halo = new THREE.Sprite(haloMat);
      halo.scale.setScalar(2.2);
      f.add(core, halo);
      f.position.set(l.x, 1.45, l.z);
      f.visible = false;
      g.worldRoot.add(f);
      this.flames.push(f);
    });
  }

  private buildGhost(): THREE.Group {
    const k = this.h.kisaragi;
    const g = new THREE.Group();
    const body = new THREE.MeshStandardMaterial({ color: 0xbfe8ff, emissive: 0x6ac8ff, emissiveIntensity: 0.9, transparent: true, opacity: 0.38, depthWrite: false, roughness: 0.3 });
    const win = new THREE.MeshBasicMaterial({ color: 0xfff4d8, transparent: true, opacity: 0.85, fog: false });
    const car = new THREE.Mesh(new THREE.BoxGeometry(22, 3.1, 2.9), body);
    car.position.y = 1.75;
    g.add(car);
    for (let i = 0; i < 8; i++) {
      for (const sz of [-1.46, 1.46]) {
        const w = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9), win);
        w.position.set(-9 + i * 2.6, 2.2, sz);
        if (sz < 0) w.rotation.y = Math.PI;
        g.add(w);
      }
    }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.5), jpSignMaterial('きさらぎ', { bg: '#101418', fg: '#ff6a6a', aspect: 4.8, glow: 0.6, sub: 'KISARAGI' }));
    sign.position.set(-10.9, 3, 0);
    sign.rotation.y = -Math.PI / 2;
    g.add(sign);
    g.position.set(k.ghost.x, 0, k.ghost.z);
    g.visible = false;
    this.g.worldRoot.add(g);
    return g;
  }

  private buildKisaragi(): void {
    const k = this.h.kisaragi;
    const glowBeam = (color: number): THREE.Mesh =>
      new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.5, 3, 12, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    // the relics on their plinths: the petal cannon (pink lacquer, six barrels) and the thunder drum
    const pink = new THREE.MeshStandardMaterial({ color: 0xf2b2c8, roughness: 0.35, emissive: 0x5a1a2a, emissiveIntensity: 0.5 });
    const steel = new THREE.MeshStandardMaterial({ color: 0xd0ccd0, roughness: 0.3, metalness: 0.8 });
    const lacq = new THREE.MeshStandardMaterial({ color: 0x8a1a1a, roughness: 0.35 });
    const blue = new THREE.MeshStandardMaterial({ color: 0x9fd8ff, emissive: 0x4aa8ff, emissiveIntensity: 1.2 });
    const hana = new THREE.Group();
    const bodyH = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.2), pink);
    hana.add(bodyH);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.6, 8).rotateZ(Math.PI / 2), steel);
      b.position.set(0.62, Math.cos(a) * 0.05, Math.sin(a) * 0.05);
      hana.add(b);
    }
    const drumH = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.14, 20), pink);
    drumH.rotation.x = Math.PI / 2;
    drumH.position.set(-0.05, -0.2, 0);
    hana.add(drumH);
    const rai = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.34, 24), lacq);
    shell.rotation.z = Math.PI / 2;
    rai.add(shell);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.02, 6, 32), blue);
    ring.rotation.y = Math.PI / 2;
    rai.add(ring);
    [hana, rai].forEach((m, i) => {
      const p = k.plinths[i]!;
      const root = new THREE.Group();
      root.position.set(p.x, 1.4, p.z);
      root.add(m);
      const beam = glowBeam(i === 0 ? 0xff7aa8 : 0x7ac8ff);
      beam.position.y = 0.2;
      root.add(beam);
      this.g.worldRoot.add(root);
      this.relicMeshes.push(root);
    });
    // the altar's two blessings: an orb each side of it
    (['spirit', 'step'] as const).forEach((id, i) => {
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshStandardMaterial({ color: PERKS[id].color, emissive: PERKS[id].color, emissiveIntensity: 1.4 }));
      const at = this.perkSpot(i);
      orb.position.set(at.x, 1.3, at.z);
      this.g.worldRoot.add(orb);
      this.perkOrbs.push(orb);
    });
  }

  private perkSpot(i: number): { x: number; z: number } {
    const a = this.h.kisaragi.altar;
    return { x: a.x + (i === 0 ? -3.4 : 3.4), z: a.z + 1.2 };
  }

  // ---------------------------------------------------------------------------------------------
  // a run
  // ---------------------------------------------------------------------------------------------

  /** A new run (`coop`: a co-op story run, where the simulation keeps the quest; `tale`: a story mission). */
  reset(coop = false, tale: StoryId | null = null): void {
    const g = this.g;
    this.follow = coop;
    this.local.reset(() => g.rng.f());
    // solo: the Court's sentries on the decks and at their fires (co-op: the simulation places its own)
    if (!coop) populateSakura(g.zombies, g.level, g.rng);
    this.stalker.reset();
    this.moveMul = 1;
    this.idolWarned = false;
    this.tale = tale;
    this.chapter = -1;
    this.procession = 0;
    this.processionT = 0;
    this.heard.clear();
    this.met.clear();
    this.timers.length = 0;
    this.voice.stopAll();
    this.dir.reset();
    this.again.clear();
    this.empress = { seen: false, rage: false, down: false, awake: false };
    // the Empress is not on the map until her moment (`director.ts` empressAwake); the hunt says what she waits for
    g.mission.huntClosed = () => 'She waits on her stage. The Court has shut the theatre.';
    this.poemRead = false;
    this.routeT = 0;
    this.trail.set(null);
    for (const r of this.risen) r.removeFromParent();
    this.risen.length = 0;
    this.powerShown = false;
    metroPower(g.level.lights, false);
    // KAIKA: the helicopter waits for the bloom (co-op: the simulation holds it)
    g.mission.extractGate = () => !this.campaign || this.view.phase === 'bloom';
    // the relay draws from the station substation: no uplink until the metro's power is back
    g.mission.relayBlock = () => (SakuraQuest.powered(this.view) ? null : 'NO POWER');
    // Command's briefing (the mission says it a few seconds in)
    g.mission.brief = () => LINE.cmd_brief_kaika!.text;
    this.voice.cue('dusk', 4);
    this.view = this.local.view;
    this.shown = { ...this.view, found: 0, tied: 0, lit: 0, phase: 'charms' };
    this.relicTaken.fill(false);
    this.perks.clear();
    g.weapons.perkReloadMul = 1;
    g.weapons.perkFireIntervalMul = 1;
    this.unbloom();
    this.present(true);
    this.hud.hide();
  }

  /** A story mission won: it goes in the journal (the title and the lobby list it as done). */
  completeStory(id: StoryId): void {
    if (this.progress.missions.includes(id)) return;
    this.progress.missions = [...this.progress.missions, id];
    saveSakura(this.progress);
  }

  /** Co-op: the simulation's quest state (in every report). */
  applyWire(w: unknown): void {
    const v = decodeQuest(w);
    if (!v) return;
    this.view = v;
    this.present(false);
  }

  /** Every rendered frame (menus too): what is only to be seen. */
  frame(dt: number): void {
    const c = this.g.renderer.camera.position;
    this.petals.update(dt, c.x, c.y, c.z);
  }

  /** A run's simulation step. */
  update(dt: number): void {
    const g = this.g;
    this.time += dt;
    this.bellCd = Math.max(0, this.bellCd - dt);
    for (let i = this.timers.length - 1; i >= 0; i--) {
      if (this.timers[i]!.t > this.time) continue;
      this.timers.splice(i, 1)[0]!.fn();
    }
    this.hud.update(dt);
    this.voice.update(this.time);
    for (const [k, v] of this.again) this.again.set(k, v - dt);
    if (!this.follow) {
      this.dir.progress = storyProgress(this.view, g.session.defense.status, g.session.hunt.status);
      this.dir.tick(dt);
      this.local.tick(dt);
      this.view = this.local.view;
      this.consumeLocal();
      this.present(false);
      if (this.stalker.update(dt, g.zombies, g.level, [{ x: g.player.x, z: g.player.z, alive: g.playerAlive() }], g.rng)) this.stalkerCame();
    } else if (!this.stalker.spawned && g.zombies.zombies.some((z) => z.variant === 'kuchisake' && z.alive)) {
      this.stalker.spawned = true;
      this.stalkerCame();
    }
    // the procession: after the bloom, calling the helicopter brings the dead of Sakuragi up the hill (co-op: the
    // simulation sends them; every screen says so)
    const ex = g.session.extraction;
    if (this.view.phase === 'bloom' && this.procession < PROCESSION.at.length && (ex.phase === 'called' || ex.phase === 'inbound' || ex.phase === 'landing')) {
      this.processionT += dt;
      while (this.procession < PROCESSION.at.length && this.processionT >= PROCESSION.at[this.procession]!) {
        if (!this.follow) {
          processionWave(this.procession, g.zombies);
          this.dir.draw(LURES.procession);
        }
        const calling = (): boolean => ['called', 'inbound', 'landing'].includes(g.session.extraction.phase);
        if (this.procession === 0) {
          g.banner('THE PROCESSION', 'Everyone the bell woke is coming up the hill. Hold the landing zone.', 'danger', 6);
          this.voice.sayAll(['aoi_procession', 'aoi_procession_2'], { kind: 'story' });
          this.voice.say('yuzu_procession', { kind: 'place' });
        } else {
          g.feed(this.procession === 1 ? 'THE PROCESSION: ONI ON THE SLOPE' : 'THE PROCESSION: THE LAST OF THEM', 'danger');
          this.voice.say(this.procession === 1 ? 'hana_oni' : 'yuzu_last', { kind: 'direction', valid: calling });
        }
        this.procession++;
      }
    }
    // the Empress's hunt: shut (and she off the map) until her moment, then the curtain rises (co-op: the simulation's)
    const s = g.session;
    const awake = empressAwake(this.view.phase, this.view.marks);
    if (!this.follow && s.hunt.status !== 'complete') {
      if (!awake) {
        s.hunt.status = 'available';
        if (g.zombies.boss) g.zombies.remove(g.zombies.boss);
      } else if (s.hunt.status === 'available') s.hunt.status = 'active';
    }
    if (s.hunt.status === 'active' && awake && !this.empress.awake) this.curtainRises();
    this.empress.awake = awake || s.hunt.status === 'complete';
    // KAIKA: the chapter it is on
    if (this.campaign) {
      const ch = chapterIndex(this.campaignState());
      if (ch !== this.chapter) this.onChapter(ch);
    }
    // a place's transmission the first time in, and the field file's card the first time a kind is met
    this.scanT -= dt;
    if (this.scanT <= 0 && g.playerAlive()) {
      this.scanT = 0.4;
      const place = this.placeOf();
      if (place && !this.heard.has(place) && !(place === 'station' && this.time < 50)) {
        this.heard.add(place);
        this.voice.sayAll(PLACE_RADIO[place], { kind: 'place', delay: 0.6 });
        this.enter(place);
      }
      this.scanKinds();
      this.watch();
    }
    this.music();
    // the petal trail: the goal worked out twice a second, the petals every frame
    this.routeT -= dt;
    if (this.routeT <= 0) {
      this.routeT = 0.5;
      this.trail.set(g.playerAlive() ? this.routeGoal() : null);
    }
    this.trail.update(dt, this.time, g.player.x, g.player.y, g.player.z);
    for (const f of this.fuses) f.rotation.y += dt * 1.5;
    this.keycard.children[0]!.position.y = Math.sin(this.time * 2) * 0.02;
    for (const r of this.risen) for (let i = 0; i < r.children.length; i++) r.children[i]!.position.y = 2.4 + i * 0.35 + Math.sin(this.time * 1.2 + i) * 0.18;
    this.ambT -= dt;
    if (this.ambT <= 0) {
      this.ambT = 9 + g.rng.f() * 14;
      this.airSound();
    }
    // an idol's song: slower while one sings within reach
    let near = Infinity;
    for (const z of g.zombies.zombies) if (z.variant === 'idol' && z.alive && !z.dormant) near = Math.min(near, Math.hypot(z.x - g.player.x, z.z - g.player.z));
    const want = near < 18 ? 0.72 + (near / 18) * 0.2 : 1;
    this.moveMul += (want - this.moveMul) * Math.min(1, dt * 3);
    if (near < 18 && !this.idolWarned) {
      this.idolWarned = true;
      this.voice.say('hana_idol', { kind: 'story' });
    }
    // the charms bob and turn; the flames flicker; the relics turn over their plinths
    for (const c of this.charms) {
      c.rotation.y += dt * 1.2;
      c.position.y += Math.sin(this.time * 2 + c.position.x) * 0.0015;
    }
    for (let i = 0; i < this.flames.length; i++) this.flames[i]!.scale.setScalar(1 + Math.sin(this.time * 13 + i * 2) * 0.08);
    for (const r of this.relicMeshes) r.children[0]!.rotation.y += dt * 0.8;
    for (const n of this.notes) (n.beam.material as THREE.MeshBasicMaterial).opacity = (this.poemRead ? 0.05 : 0.16) + Math.sin(this.time * 2 + n.x) * 0.03;
    if (this.bloomed) this.ghost.position.y = Math.sin(this.time * 0.9) * 0.08;
    // the blessings
    const v = g.session.vitals;
    const maxH = this.maxHealth;
    if (v.health > maxH) v.health = maxH;
    g.weapons.perkReloadMul = this.perks.has('step') ? 0.7 : 1;
    g.weapons.perkFireIntervalMul = this.perks.has('step') ? 0.85 : 1;
  }

  /** She is out there now. */
  private stalkerCame(): void {
    const g = this.g;
    g.audio.play('fzombie_giggle', { priority: 3, volume: 0.8 });
    this.voice.sayAll(['yuzu_stalker', 'hana_stalker'], { kind: 'story' });
  }

  private readonly timers: { t: number; fn: () => void }[] = [];
  private later(s: number, fn: () => void): void {
    this.timers.push({ t: this.time + s, fn });
  }

  // ---------------------------------------------------------------------------------------------
  // what is said
  // ---------------------------------------------------------------------------------------------

  /** The mission's own radio (Command, the pilot, the squad's cries): through the voice director, voiced where it can be. */
  private onRadio(who: string, text: string): boolean {
    const id = BY_TEXT.get(`${who}|${text}`);
    const kind: LineKind = who === 'COMMAND' || who === 'PILOT' ? 'system' : /hit bad/.test(text) ? 'bark' : 'story';
    if (!id) {
      this.voice.caption(who, text, { kind });
      return true;
    }
    this.voice.say(id, { kind });
    if (id === 'cmd_relay_done') {
      this.voice.say('aoi_relay_done', { kind: 'story' });
    }
    return true;
  }

  /** Her moment: the theatre's doors open, she is on her stage, and the Court knows. */
  private curtainRises(): void {
    const g = this.g;
    g.audio.play('bloom_swell', { priority: 2, volume: 0.6 });
    g.banner('THE CURTAIN RISES', 'The Crimson Empress is on her stage at the Kurenai Theatre', 'danger', 5);
    g.feed('THE THEATRE DOORS ARE OPEN', 'danger');
    if (!this.follow) this.dir.draw(LURES.key);
  }

  /** Where a chapter points: its own target, but Kisaragi's relics once you are there (not the train back). */
  private chapterTarget(ch: (typeof CHAPTERS)[number], st: ReturnType<SakuraRuntime['campaignState']>): { x: number; z: number; y?: number; label: string } | null {
    const p = this.g.player;
    const k = this.h.kisaragi;
    if (ch.id === 'kisaragi' && this.g.level.floors.areaAt(p.x, p.y, p.z) === k.area) return { x: k.plinths[0]!.x, z: k.plinths[0]!.z, label: 'THE RELICS' };
    return ch.target(this.spots, st);
  }

  /** The first time into a place: what it wakes. */
  private enter(place: Place): void {
    if (place === 'kisaragi') this.voice.say('aoi_kisaragi', { kind: 'story', once: true, delay: 1 });
    if (place === 'lab' && !this.follow) this.dir.draw(LURES.lab);
  }

  /** A line that may come back now and then (`every` seconds apart at the least). */
  private now(id: string, every: number): boolean {
    if ((this.again.get(id) ?? 0) > 0) return false;
    this.again.set(id, every);
    return true;
  }

  /** What is worth a word as it happens: the Empress, the masked woman, Mei, the station's speakers, a dead relay. */
  private watch(): void {
    const g = this.g;
    const p = g.player;
    const b = g.zombies.boss;
    if (b && b.alive) {
      const d = Math.hypot(b.x - p.x, b.z - p.z);
      if (!this.empress.seen && d < 34 && Math.abs(b.y - p.y) < 4) {
        this.empress.seen = true;
        this.voice.say('sayo_seen', { kind: 'story', pos: { x: b.x, y: b.y + 2.2, z: b.z }, valid: () => !!b.alive });
      }
      if (this.empress.seen && !this.empress.rage && b.hp < b.maxHp * 0.5) {
        this.empress.rage = true;
        this.voice.say('sayo_rage', { kind: 'story', pos: { x: b.x, y: b.y + 2.2, z: b.z }, valid: () => !!b.alive });
        this.voice.say('hana_empress_rage', { kind: 'place', valid: () => !!b.alive });
      }
    }
    if (!this.empress.down && g.session.hunt.status === 'complete') {
      this.empress.down = true;
      this.voice.sayAll(['sayo_down', 'aoi_rest'], { kind: 'story' });
    }
    for (const z of g.zombies.zombies) {
      if (!z.alive || z.dormant) continue;
      const d = Math.hypot(z.x - p.x, z.z - p.z);
      if (z.variant === 'kuchisake' && d < 7 && this.now('mask_near', 30)) this.voice.say('mask_near', { kind: 'bark', pos: { x: z.x, y: z.y + 1.6, z: z.z } });
      if (z.variant === 'idol' && d < 30 && this.now('mei_sing', 35)) this.voice.say('mei_sing', { kind: 'bark', pos: { x: z.x, y: z.y + 1.6, z: z.z } });
    }
    const v = this.view;
    const place = this.placeOf();
    if (place === 'metro' && SakuraQuest.powered(v) && this.now('pa_line', 80)) this.voice.say('pa_line', { kind: 'bark' });
    if (this.bloomed) {
      const k = this.h.kisaragi.boardStreet;
      if (Math.hypot(k.x - p.x, k.z - p.z) < 45) this.voice.say('pa_arriving', { kind: 'story', once: true });
    }
    const d = g.level.data.defense;
    if (!SakuraQuest.powered(v) && g.session.defense.status !== 'complete' && Math.hypot(d.x - p.x, d.z - p.z) < 9) this.voice.say('cmd_nopower', { kind: 'system', once: true });
  }

  /** The score: dusk, the blood moon, Kisaragi, the procession, home. */
  private music(): void {
    const g = this.g;
    const p = g.player;
    const ex = g.session.extraction.phase;
    const inK = g.level.floors.areaAt(p.x, p.y, p.z) === this.h.kisaragi.area;
    const want = ex === 'extracted' || ex === 'boarding' ? 'home' : inK ? 'kisaragi' : this.procession > 0 && ['called', 'inbound', 'landing', 'landed'].includes(ex) ? 'procession' : this.bloomed ? 'bloom' : 'dusk';
    this.voice.cue(want);
  }

  /** Where the petal trail leads: KAIKA's chapter; otherwise the operation's next contract (then the landing zone). */
  private routeGoal(): RouteGoal | null {
    const g = this.g;
    const fl = g.level.floors;
    const at = (x: number, z: number, y = 0): RouteGoal => {
      const area = fl.areaAt(x, y, z);
      return { x, z, y: fl.areas[area]?.y ?? 0, area };
    };
    if (this.campaign) {
      const ch = CHAPTERS[this.chapter];
      const t = ch ? this.chapterTarget(ch, this.campaignState()) : null;
      if (t) return at(t.x, t.z, t.y ?? 0);
      if (!ch || ch.id !== 'home') return null;
    }
    const s = g.session;
    const d = g.level.data;
    if (s.extraction.phase === 'extracted') return null;
    if (s.defense.status !== 'complete') return at(d.defense.x, d.defense.z);
    if (s.hunt.status !== 'complete') {
      const b = g.zombies.boss;
      return b && b.alive ? at(b.x, b.z, b.y) : at(d.hunt.searchX, d.hunt.searchZ);
    }
    return at(d.extraction.lzX, d.extraction.lzZ);
  }

  /** The first flame: a paper lantern burning in a little roadside shrine (a hokora) before Okada's izakaya. */
  private buildFlame(): THREE.Group {
    const g = this.g;
    const f = this.spots.flame;
    const grp = new THREE.Group();
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.42, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0xfff0d0, roughness: 0.8, emissive: 0xff8a30, emissiveIntensity: 2.2, side: THREE.DoubleSide }));
    shade.position.y = 1.25;
    grp.add(shade);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffd080, emissive: 0xffa040, emissiveIntensity: 4 }));
    core.position.y = 1.22;
    grp.add(core);
    grp.position.set(f.x, 0, f.z - 0.75);
    g.worldRoot.add(grp);
    return grp;
  }

  /** The lab keycard on the yard office's door: a white card glowing on its hook until someone takes it. */
  private buildKeycard(): THREE.Group {
    const g = this.g;
    const k = this.spots.key;
    const grp = new THREE.Group();
    const card = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.012), new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.4, emissive: 0xffd8dc, emissiveIntensity: 0.9 }));
    grp.add(card);
    // the reader it hangs by: a dark plate, its red light still on
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.42, 0.02), new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.6 }));
    plate.position.set(0, 0.06, -0.012);
    grp.add(plate);
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.02), new THREE.MeshStandardMaterial({ color: 0xff2030, emissive: 0xff2030, emissiveIntensity: 2.5 }));
    led.position.set(0, 0.22, 0);
    grp.add(led);
    grp.position.set(k.x, 1.35, k.z - 0.72);
    g.worldRoot.add(grp);
    return grp;
  }

  /** The metro's fuses: yellow cartridges glowing in their cabinets until taken. */
  private buildFuses(): void {
    const g = this.g;
    const body = new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: 0.4, emissive: 0xffb000, emissiveIntensity: 0.9 });
    const cap = new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.3, metalness: 0.8 });
    const glowMat = new THREE.SpriteMaterial({ color: 0xffd040, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    for (const f of this.spots.fuses) {
      const grp = new THREE.Group();
      grp.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.26, 10), body));
      for (const y of [-0.15, 0.15]) {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.05, 10), cap);
        c.position.y = y;
        grp.add(c);
      }
      const glow = new THREE.Sprite(glowMat);
      glow.scale.setScalar(0.7);
      grp.add(glow);
      grp.position.set(f.x, f.y, f.z);
      g.worldRoot.add(grp);
      this.fuses.push(grp);
    }
  }

  /** Paper lanterns rising where a charm was taken: the place is at peace, and anyone can see it from afar. */
  private riseLanterns(x: number, y: number, z: number): void {
    const shade = new THREE.MeshStandardMaterial({ color: 0xffe0b0, roughness: 0.8, emissive: 0xff9a40, emissiveIntensity: 1.6, side: THREE.DoubleSide });
    const halo = new THREE.SpriteMaterial({ color: 0xffb060, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const grp = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const l = new THREE.Group();
      l.add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.36, 10, 1, true), shade));
      const h = new THREE.Sprite(halo);
      h.scale.setScalar(1.1);
      l.add(h);
      const a = (i / 5) * Math.PI * 2;
      l.position.set(Math.cos(a) * 0.9, 2.4 + i * 0.35, Math.sin(a) * 0.9);
      grp.add(l);
    }
    grp.position.set(x, y - 1, z);
    this.g.worldRoot.add(grp);
    this.risen.push(grp);
  }

  // ---------------------------------------------------------------------------------------------
  // the story: places, kinds, chapters
  // ---------------------------------------------------------------------------------------------

  /** A KAIKA run. */
  private get campaign(): boolean {
    return !!this.tale && !!STORIES[this.tale].campaign;
  }

  private campaignState(): { quest: QuestView; defense: string; hunt: string; extracted: boolean } {
    const s = this.g.session;
    return { quest: this.view, defense: s.defense.status, hunt: s.hunt.status, extracted: s.extraction.phase === 'extracted' };
  }

  /** Which part of the district the player is in. */
  private placeOf(): Place | null {
    const g = this.g;
    const p = g.player;
    const fl = g.level.floors;
    const area = fl.areaAt(p.x, p.y, p.z);
    return placeAt(p.x, p.z, fl.areas[area]?.kind === 'under', area === this.labArea && area >= 0, area === this.h.kisaragi.area);
  }

  /** The district's air round the player: the station's melody below and by the station, chimes and crows elsewhere. */
  private airSound(): void {
    const g = this.g;
    const p = g.player;
    const place = this.placeOf();
    const a = g.rng.f() * Math.PI * 2;
    const at = (d: number, y: number): { x: number; y: number; z: number } => ({ x: p.x + Math.cos(a) * d, y: p.y + y, z: p.z + Math.sin(a) * d });
    if ((place === 'station' || place === 'metro') && g.rng.f() < 0.5) g.audio.play('station_chime', { pos: at(22, 4), priority: 0, volume: 0.7 });
    else if (place === 'metro' || place === 'lab' || place === 'kisaragi') return;
    else if (g.rng.f() < 0.55) g.audio.play('amb_furin', { pos: at(7 + g.rng.f() * 6, 2.5), priority: 0, volume: 0.6 });
    else g.audio.play('amb_crow', { pos: at(20 + g.rng.f() * 12, 9), priority: 0, volume: 0.7 });
  }

  /** The first kind of infected in sight this run that has not been met yet. */
  private scanKinds(): void {
    const g = this.g;
    const p = g.player;
    for (const z of g.zombies.zombies) {
      const k = z.variant;
      if (!k || !z.alive || z.dormant || this.met.has(k)) continue;
      if (Math.hypot(z.x - p.x, z.z - p.z) > 24 || Math.abs(z.y - p.y) > 3) continue;
      this.meet(k as FieldKind);
      return;
    }
  }

  /** The field file's card for a kind (and, the first time ever, the squad's word on it). */
  private meet(k: FieldKind): void {
    this.met.add(k);
    const f = FIELD[k];
    const first = !this.progress.seen.includes(k);
    if (first) {
      this.progress.seen = [...this.progress.seen, k];
      saveSakura(this.progress);
      if (k !== 'kuchisake') this.voice.say(f.quip, { kind: 'place' });
    }
    this.hud.card(first ? 'FIELD FILE  //  NEW' : 'FIELD FILE', `${f.name}  -  ${f.tag}`, first ? `${f.look}\n\n${f.does}\n\n${f.why}` : f.does, first ? 13 : 6);
  }

  /** KAIKA moved on (or a co-op player joined part way in). */
  private onChapter(i: number): void {
    const g = this.g;
    const prev = this.chapter;
    this.chapter = i;
    if (i <= prev) return;
    if (!this.follow) campaignSetPiece(i, g.zombies, g.level, this.spots, g.rng, [{ x: g.player.x, y: g.player.y, z: g.player.z }]);
    const done = prev >= 0 ? CHAPTERS[prev] : undefined;
    if (done) {
      g.audio.play('contract_complete', { priority: 2 });
      g.banner(`CHAPTER ${prev + 1} COMPLETE`, done.title, 'good', 3);
    }
    const ch = CHAPTERS[i];
    if (!ch) return;
    this.later(done ? 3.4 : 5.5, () => {
      g.audio.play('chapter_koto', { priority: 3 });
      g.banner(`CHAPTER ${i + 1}/${CHAPTERS.length}  //  ${ch.title}`, ch.goal, 'info', 6);
    });
    // the first chapter's call opens the story (said whatever happens); the others say the way on, while it still is
    if (i === 0) this.voice.sayAll(ch.intro, { kind: 'story', delay: 7 });
    else this.voice.sayAll(ch.intro, { kind: 'direction', delay: done ? 4 : 2, valid: () => !ch.done(this.campaignState()) });
  }

  /** The field file's story page. */
  private fieldStory(): FieldFileStory {
    const v = this.view;
    const lanterns = { done: this.progress.egg, status: v.found === 0 && v.phase === 'charms' ? 'THE THOUSAND LANTERNS: listen to the shrine relay. Aoi Kisaragi says where her charms went.' : `THE THOUSAND LANTERNS: ${SakuraQuest.status(v)}` };
    if (!this.campaign) return { chapters: null, lanterns };
    const at = this.chapter;
    return { chapters: CHAPTERS.map((c, i) => ({ title: c.title, place: PLACE_NAMES[c.place], goal: c.goal, state: i < at ? 'done' : i === at ? 'now' : 'todo' })), lanterns };
  }

  /** Max health with SAKURA SPIRIT (regeneration and the HUD read it). */
  get maxHealth(): number {
    return PLAYER.maxHealth + (this.perks.has('spirit') ? 50 : 0);
  }

  decorateHud(st: HudState, md: MapDynamic): void {
    st.maxHealth = this.maxHealth;
    const v = this.view;
    if (this.campaign) {
      // KAIKA: the chapter on top, its marker on the compass
      const i = this.chapter;
      const ch = CHAPTERS[i];
      if (ch) {
        const s = this.campaignState();
        const goal = ch.id === 'lanterns' ? (this.poemRead ? `${ch.goal}: ${orderWords(v)}` : `${ch.goal} (read the scroll at the shrine hall)`) : ch.id === 'tree' ? `${ch.goal} (${SakuraQuest.held(v)} carried)` : ch.goal;
        const tg = this.chapterTarget(ch, s);
        const dist = tg ? Math.round(Math.hypot(tg.x - this.g.player.x, tg.z - this.g.player.z)) : -1;
        st.objectives.unshift({ id: 'kaika', title: `${i + 1}/${CHAPTERS.length}  ${ch.title}`, detail: goal, state: 'active', progress: i / CHAPTERS.length, tracked: true, distance: dist });
        if (tg) md.markers.push({ id: 'kaika', kind: 'objective', x: tg.x, z: tg.z, label: tg.label, color: '#ff9ec8', visible: true, compass: true, pulse: true });
      }
    }
    if (this.bloomed) md.markers.push({ id: 'ghost-train', kind: 'landmark', x: this.h.kisaragi.boardStreet.x, z: this.h.kisaragi.boardStreet.z, label: 'GHOST TRAIN', color: '#9fe8ff', visible: true, compass: true, pulse: true });
  }

  // ---------------------------------------------------------------------------------------------
  // what can be done here
  // ---------------------------------------------------------------------------------------------

  private targets(out: InteractionTarget[]): void {
    const g = this.g;
    if (!g.playerAlive()) return;
    const p = g.player;
    const near = (x: number, z: number, y: number, r: number): number => {
      const d = Math.hypot(x - p.x, z - p.z);
      return d <= r && Math.abs(y - p.y) < 1.7 ? d : -1;
    };
    // notes
    for (const nv of this.notes) {
      const d = near(nv.x, nv.z, nv.y, 1.8);
      if (d < 0) continue;
      const seen = this.found.has(nv.n.id);
      out.push({ id: `note:${nv.n.id}`, dist: d, text: seen && this.poemRead ? 'READ AGAIN' : 'READ THE SCROLL', sub: nv.n.title, tone: this.poemRead ? 'normal' : 'good', hold: 0, enabled: true, onUse: () => this.read(nv.n) });
    }
    const v = this.view;
    const s = this.spots;
    // the metro's fuses
    s.fuses.forEach((f, i) => {
      if (v.marks & (FUSE_BIT << i)) return;
      const d = Math.hypot(f.x - p.x, f.z - p.z);
      if (d > QUEST_REACH.charm || Math.abs(f.y - 1.4 - p.y) > 2.4) return;
      out.push({ id: `fuse:${i}`, dist: d * 0.5, text: 'TAKE THE FUSE', sub: `Metro power ${SakuraQuest.fuses(v)}/3`, tone: 'good', hold: 0.5, enabled: true, onUse: () => this.act('fuse', i) });
    });
    // the charms
    s.charms.forEach((c, i) => {
      if (v.found & (1 << i)) return;
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d > (i === 3 ? QUEST_REACH.boat : QUEST_REACH.charm) - 0.15 || Math.abs(c.y - p.y) > 2.4) return;
      out.push({ id: `charm:${i}`, dist: d * 0.5, text: 'TAKE THE OMAMORI', sub: i === 3 ? 'Reach over the rail for it' : 'A shrine charm', tone: 'good', hold: 0.5, enabled: true, onUse: () => this.act('charm', i) });
    });
    // the first flame
    if (!SakuraQuest.hasFlame(v)) {
      const df = near(s.flame.x, s.flame.z, 0, QUEST_REACH.flame - 0.2);
      if (df >= 0) out.push({ id: 'flame', dist: df * 0.5, text: 'TAKE THE FIRST FLAME', sub: v.tied === 0b11111 ? 'For the great lanterns' : 'Still burning, after seven years', tone: 'good', hold: 1, enabled: true, onUse: () => this.act('flame', 0) });
    }
    // the lab keycard at the yard office, and the lab's stairs while they are sealed
    if (!SakuraQuest.hasKey(v)) {
      const dk = near(s.key.x, s.key.z, 0, QUEST_REACH.key - 0.2);
      if (dk >= 0) out.push({ id: 'key', dist: dk * 0.5, text: 'TAKE THE KEYCARD', sub: 'Kurenai Biotech, level B2', tone: 'good', hold: 0.6, enabled: true, onUse: () => this.act('key', 0) });
      const ds = near(LAB_DOOR.x, LAB_DOOR.z, 0, 2.6);
      if (ds >= 0) {
        out.push({ id: 'lab-sealed', dist: ds, text: 'SEALED', sub: 'Kurenai Biotech B2 - the keycard is at the freight yard office', tone: 'warn', hold: 0, enabled: false, onUse: () => {} });
        this.voice.say('hana_locked', { kind: 'place', once: true });
      }
    }
    // the tree
    {
      const d = near(s.tree.x, s.tree.z, 0, QUEST_REACH.tree - 0.15);
      if (d >= 0 && v.phase === 'charms') {
        const held = this.follow ? SakuraQuest.held(v) : this.local.charmsHeld;
        out.push(
          held > 0
            ? { id: 'tree', dist: d, text: `TIE THE OMAMORI (${held})`, sub: 'To the sacred tree', tone: 'good', hold: 1.2, enabled: true, onUse: () => this.act('tie', 0) }
            : { id: 'tree', dist: d, text: 'THE SACRED TREE', sub: 'Bare. Its rope has five empty knots.', tone: 'normal', hold: 0, enabled: false, onUse: () => {} },
        );
      }
    }
    // the lanterns
    s.lanterns.forEach((l, j) => {
      const d = near(l.x, l.z, 0, QUEST_REACH.lantern - 0.15);
      if (d < 0) return;
      const sign = LANTERN_SIGNS[j]!;
      const lit = v.order.indexOf(j) < v.lit || v.phase === 'bell' || v.phase === 'bloom';
      if (lit) out.push({ id: `lantern:${j}`, dist: d, text: `${sign.kanji}  ${sign.word} LANTERN`, sub: 'Burning', tone: 'normal', hold: 0, enabled: false, onUse: () => {} });
      else if (v.phase === 'lanterns' && !SakuraQuest.hasFlame(v)) out.push({ id: `lantern:${j}`, dist: d, text: `${sign.kanji}  ${sign.word} LANTERN`, sub: 'It needs the first flame, from the izakaya row', tone: 'normal', hold: 0, enabled: false, onUse: () => {} });
      else if (v.phase === 'lanterns') out.push({ id: `lantern:${j}`, dist: d, text: `LIGHT THE ${sign.kanji} ${sign.word} LANTERN`, sub: `${v.lit}/5 lit`, tone: 'good', hold: 0.8, enabled: true, onUse: () => this.act('light', j) });
      else out.push({ id: `lantern:${j}`, dist: d, text: `${sign.kanji}  ${sign.word} LANTERN`, sub: 'It will not take the flame', tone: 'normal', hold: 0, enabled: false, onUse: () => {} });
    });
    // the bell
    {
      const d = near(s.bell.x, s.bell.z, 0, QUEST_REACH.bell - 0.15);
      if (d >= 0 && v.phase !== 'bloom') out.push({ id: 'bell', dist: d, text: 'RING THE BELL', sub: 'The shrine\'s great bell', tone: 'normal', hold: 0.6, enabled: this.bellCd <= 0, onUse: () => this.ring() });
    }
    // the ghost train, both ends
    const k = this.h.kisaragi;
    if (this.bloomed) {
      const ds = near(k.boardStreet.x, k.boardStreet.z, 0, 2.6);
      if (ds >= 0) out.push({ id: 'ghost:out', dist: ds, text: 'BOARD THE TRAIN', sub: 'Next stop: Kisaragi', tone: 'good', hold: 0.8, enabled: true, onUse: () => this.ride(0) });
    }
    const inK = g.level.floors.areaAt(p.x, p.y, p.z) === k.area;
    if (inK) {
      const dh = near(k.boardHere.x, k.boardHere.z, 0, 2.6);
      if (dh >= 0) out.push({ id: 'ghost:back', dist: dh, text: 'BOARD THE TRAIN', sub: 'Back to Sakuragi', tone: 'good', hold: 0.8, enabled: true, onUse: () => this.ride(k.area) });
      (['hanafubuki', 'raijin'] as const).forEach((id, i) => {
        const pl = k.plinths[i]!;
        const d = near(pl.x, pl.z, 0, 2.2);
        if (d < 0 || this.relicTaken[i]) return;
        out.push({ id: `relic:${id}`, dist: d, text: `TAKE ${WEAPONS[id].name.toUpperCase()}`, sub: i === 0 ? 'A 300-round petal belt. Slow to reload.' : 'Two strikes of the storm', tone: 'good', hold: 1, enabled: true, onUse: () => this.takeRelic(i) });
      });
      this.altarTargets(out, near);
    }
  }

  private altarTargets(out: InteractionTarget[], near: (x: number, z: number, y: number, r: number) => number): void {
    const g = this.g;
    const a = this.h.kisaragi.altar;
    const inv = g.session.inv;
    const d = near(a.x, a.z, 0, 2.4);
    if (d >= 0) {
      const w = activeWeapon(inv);
      if (!w) out.push({ id: 'altar', dist: d, text: 'BLOSSOM ALTAR', sub: 'Nothing in your hands', tone: 'normal', hold: 0, enabled: false, onUse: () => {} });
      else if (w.tier >= 2) out.push({ id: 'altar', dist: d, text: 'BLOSSOM ALTAR', sub: `${WEAPONS[w.id].short} is already in full bloom`, tone: 'normal', hold: 0, enabled: false, onUse: () => {} });
      else {
        const ok = inv.cash >= ALTAR.cost;
        const label = WEAPONS[w.id].tiers[1].label;
        out.push({ id: 'altar', dist: d, text: `BLOSSOM ALTAR - $${ALTAR.cost}`, sub: ok ? `${WEAPONS[w.id].short} -> ${label}, filled` : 'NOT ENOUGH $', tone: ok ? 'good' : 'warn', hold: 1.4, enabled: ok, onUse: () => this.bless() });
      }
    }
    (['spirit', 'step'] as const).forEach((id, i) => {
      const at = this.perkSpot(i);
      const dp = near(at.x, at.z, 0, 1.8);
      if (dp < 0) return;
      const def = PERKS[id];
      if (this.perks.has(id)) out.push({ id: `perk:${id}`, dist: dp, text: def.name, sub: 'Yours', tone: 'normal', hold: 0, enabled: false, onUse: () => {} });
      else {
        const ok = inv.cash >= ALTAR.perkCost;
        out.push({ id: `perk:${id}`, dist: dp, text: `${def.name} - $${ALTAR.perkCost}`, sub: ok ? def.blurb : 'NOT ENOUGH $', tone: ok ? 'good' : 'warn', hold: 1, enabled: ok, onUse: () => this.takePerk(id) });
      }
    });
  }

  // ---------------------------------------------------------------------------------------------
  // doing it
  // ---------------------------------------------------------------------------------------------

  private act(a: QuestAct, i: number): void {
    const g = this.g;
    const p = g.player;
    if (this.follow) {
      this.request?.(a, i);
      return;
    }
    const q = this.local;
    if (a === 'charm') q.takeCharm(i, p.x, p.y, p.z);
    else if (a === 'fuse') q.takeFuse(i, p.x, p.y, p.z);
    else if (a === 'tie') q.tie(p.x, p.z);
    else if (a === 'light') q.light(i, p.x, p.z);
    else if (a === 'key') q.takeKey(p.x, p.z);
    else if (a === 'flame') q.takeFlame(p.x, p.z);
    else if (a === 'relic') q.takeRelic();
    else q.ring(p.x, p.z);
    this.consumeLocal();
    this.present(false);
  }

  /** Solo: what the quest's own events mean here (the dead at the shrine). */
  private consumeLocal(): void {
    const g = this.g;
    for (const e of this.local.drain()) {
      if (e.kind === 'wrong') {
        g.zombies.queue('shambler', 4, 'defense', 0.6);
        g.zombies.queue('runner', 2, 'defense', 0.9);
        this.dir.draw(LURES.wrong);
        g.audio.play('fzombie_scream', { priority: 3 });
        g.banner('THE LANTERNS GO OUT', 'Wrong. The dead come for the shrine.', 'danger', 4);
        this.voice.sayAll(['yuzu_wrong', 'aoi_again'], { kind: 'story' });
      }
      if (e.kind === 'noFlame') this.voice.say('hana_noflame', { kind: 'place' });
    }
  }

  private ring(): void {
    const g = this.g;
    this.bellCd = 6;
    const b = this.spots.bell;
    g.audio.play('temple_bell', { pos: { x: b.x, y: 3, z: b.z }, priority: 3 });
    g.zombies.emitNoise(g.player.x, g.player.z, 40);
    // say why nothing answers (here, so a co-op player hears it too: the simulation sends no event for it)
    const v = this.view;
    if (v.phase !== 'bell') g.banner('THE BELL TOLLS', v.phase === 'lanterns' ? 'Nothing answers. Light every great lantern first.' : 'Nothing answers. Tie the five charms to the sacred tree first.', 'info', 4);
    this.act('ring', 0);
  }

  private read(n: SakuraNote): void {
    const g = this.g;
    const first = !this.found.has(n.id);
    this.hud.show(n, this.textOf(n), 'THE THOUSAND LANTERNS', 20);
    if (!this.poemRead) {
      this.poemRead = true;
      this.voice.say('aoi_poem', { kind: 'story', delay: 1.5 });
    }
    if (!first) return;
    this.found.add(n.id);
    this.progress.notes = [...this.found];
    saveSakura(this.progress);
    this.refreshNotes();
    g.audio.play('objective_ping', { priority: 1, volume: 0.6 });
    g.banner('THE FESTIVAL SCROLL', 'The poem is in the field file (pause menu)', 'info', 4);
  }

  /** A note's text as shown: the festival scroll's poem is this run's. */
  private textOf(n: SakuraNote): NoteText {
    if (n.id === 'shrine-scroll') return { was: n.was, during: n.during, now: SakuraQuest.poem(this.view.order).join('\n'), clue: n.clue };
    return { was: n.was, during: n.during, now: n.now, clue: n.clue };
  }

  private refreshNotes(): void {
    for (const nv of this.notes) nv.root.children[0]!.scale.setScalar(this.found.has(nv.n.id) ? 0.85 : 1);
  }

  /** The ghost train: from the street to Kisaragi, or back. */
  private ride(from: number): void {
    const g = this.g;
    const k = this.h.kisaragi;
    const out = g.level.floors.exitOf(k.link, from);
    g.fadeThroughBlack(1.2);
    g.player.teleport(out.x, out.z, out.yaw);
    g.squad.regroupAt(out.x, out.z, out.yaw, out.area);
    g.audio.play('ghost_train', { priority: 2 });
    if (out.area === k.area) g.banner('KISARAGI', 'A station on no line. Take what the shrine left here, and the train back.', 'info', 5);
  }

  private takeRelic(i: number): void {
    const g = this.g;
    const id = i === 0 ? 'hanafubuki' : 'raijin';
    const inv = g.session.inv;
    // holding the other relic: the new one goes in the other hand
    const relic = (w: { id: string } | null | undefined): boolean => w?.id === 'hanafubuki' || w?.id === 'raijin';
    const other = inv.activeSlot === 0 ? 1 : 0;
    if (relic(activeWeapon(inv)) && !relic(inv.slots[other])) {
      inv.activeSlot = other;
      g.weapons.cancelActions();
    }
    const r = takePrize(inv, { kind: 'weapon', id });
    if (!r.ok) {
      g.banner(WEAPONS[id].short, r.message, 'warn', 2.5);
      return;
    }
    if (r.swapped) g.weapons.cancelActions();
    this.relicTaken[i] = true;
    this.act('relic', i);
    this.relicMeshes[i]!.visible = false;
    g.audio.play('box_reveal', { priority: 2 });
    g.banner(WEAPONS[id].name.toUpperCase(), r.message, 'good', 4);
    this.voice.say(i === 0 ? 'yuzu_relic' : 'hana_relic', { kind: 'place' });
  }

  /** The Blossom Altar: the gun in your hands to its top tier, magazine and reserve filled. */
  private bless(): void {
    const g = this.g;
    const inv = g.session.inv;
    const w = activeWeapon(inv);
    if (!w || w.tier >= 2 || !spendCash(inv, ALTAR.cost)) return;
    w.tier = 2;
    const st = getWeaponStats(WEAPONS[w.id], w.tier);
    applyUpgradeAmmo(w.ammo, st.magSize, st.reserveMax);
    g.weapons.cancelActions();
    g.audio.play('upgrade_ok', { priority: 3 });
    const a = this.h.kisaragi.altar;
    g.fx.sparkle({ x: a.x, y: 1.4, z: a.z }, 0xff6a9a, 30);
    g.banner('IN FULL BLOOM', `${WEAPONS[w.id].short} ${WEAPONS[w.id].tiers[1].label}`, 'good', 3);
  }

  private takePerk(id: PerkId): void {
    const g = this.g;
    if (this.perks.has(id) || !spendCash(g.session.inv, ALTAR.perkCost)) return;
    this.perks.add(id);
    if (id === 'spirit') g.session.vitals.health = this.maxHealth;
    g.audio.play('upgrade_ok', { priority: 2 });
    g.banner(PERKS[id].name, PERKS[id].blurb, 'good', 3);
  }

  // ---------------------------------------------------------------------------------------------
  // showing what changed
  // ---------------------------------------------------------------------------------------------

  /** Bring the scene in line with the view; with `silent`, no banners or sounds (a new run, joining late). */
  private present(silent: boolean): void {
    const g = this.g;
    const v = this.view;
    const was = this.shown;
    const s = this.spots;
    // the metro's fuses, and its power
    for (let i = 0; i < 3; i++) {
      const taken = (v.marks & (FUSE_BIT << i)) !== 0;
      this.fuses[i]!.visible = !taken;
      if (taken && !(was.marks & (FUSE_BIT << i)) && !silent && !SakuraQuest.powered(v)) {
        g.audio.play('pickup_plate', { priority: 2 });
        g.banner(`FUSE ${SakuraQuest.fuses(v)}/3`, 'The metro\'s power', 'good', 3);
      }
    }
    const powered = SakuraQuest.powered(v);
    if (powered !== this.powerShown) {
      this.powerShown = powered;
      metroPower(g.level.lights, powered);
      if (powered && !silent) {
        g.audio.play('defense_start', { priority: 3 });
        g.audio.play('station_chime', { priority: 2, volume: 0.9 });
        g.banner('POWER RESTORED', 'The metro\'s lights are back on', 'good', 4);
        // the station's tapes wake with the lights (and say where the last train goes); Command sees the relay go live
        this.voice.sayAll(['pa_delay_ja', 'pa_delay_en', 'yuzu_kisaragi_pa'], { kind: 'story', delay: 1.2 });
        if (!this.follow) this.dir.draw(LURES.power);
      }
    }
    // the lab's stairs: sealed until someone has the keycard
    this.h.theatre.labLink.closed = !SakuraQuest.hasKey(v);
    this.keycard.visible = !SakuraQuest.hasKey(v);
    // the first flame: in its shrine until someone carries it; then the lanterns will take it
    this.flame.visible = !SakuraQuest.hasFlame(v);
    if (SakuraQuest.hasFlame(v) && !SakuraQuest.hasFlame(was) && !silent) {
      g.audio.play('lantern_light', { pos: { x: s.flame.x, y: 1.4, z: s.flame.z }, priority: 2 });
      g.banner('THE FIRST FLAME', 'Carry it to the shrine - the lanterns will take it', 'good', 4);
      this.voice.sayAll(['yuzu_flame', 'aoi_flame', 'aoi_tied'], { kind: 'story' });
      if (!this.follow) this.dir.draw(LURES.flame);
    }
    if (SakuraQuest.hasKey(v) && !SakuraQuest.hasKey(was) && !silent) {
      g.audio.play('pickup_plate', { priority: 2 });
      g.banner('LAB KEYCARD', 'Kurenai Biotech, level B2 - the stairs behind the clinic are open', 'good', 4);
      this.voice.sayAll(['hana_key', 'yuzu_key'], { kind: 'story' });
      if (!this.follow) this.dir.draw(LURES.key);
    }
    // charms found: lanterns rise where each one was
    for (let i = 0; i < 5; i++) {
      const has = (v.found & (1 << i)) !== 0;
      this.charms[i]!.visible = !has;
      if (has && !(was.found & (1 << i))) {
        const c = s.charms[i]!;
        this.riseLanterns(c.x, c.y, c.z);
      }
      if (has && !(was.found & (1 << i)) && !silent) {
        const n = bitsOf(v.found);
        g.audio.play('omamori_chime', { priority: 2 });
        g.banner(`OMAMORI ${n}/5`, `From ${CHARM_PLACES[i]}`, 'good', 3.5);
        // whose charm it was: told whenever it is taken, in whatever order
        this.voice.say(`aoi_charm_${i}`, { kind: 'story', delay: 0.8 });
        if (n === 5) this.voice.say('aoi_all', { kind: 'story', delay: 1 });
        if (!this.follow) this.dir.draw(LURES.charm[i]!);
        this.hud.card('THE THOUSAND LANTERNS', `Omamori ${n}/5`, n === 5 ? 'All five. Tie them to the sacred tree at the shrine.' : 'Aoi\'s charm. The sacred tree at the shrine has knots for five.', 8);
      }
    }
    // tied to the tree
    for (let i = 0; i < 5; i++) this.treeCharms[i]!.visible = (v.tied & (1 << i)) !== 0;
    if (bitsOf(v.tied) > bitsOf(was.tied) && !silent) {
      const all = v.tied === 0b11111;
      g.audio.play('omamori_chime', { pos: { x: s.tree.x, y: 2, z: s.tree.z }, priority: 2 });
      g.banner('THE SACRED TREE', all ? 'All five charms are tied. The lanterns are waiting.' : `${bitsOf(v.tied)}/5 charms tied`, 'good', 4);
      if (all) {
        this.voice.say('hana_tree', { kind: 'story' });
        if (!this.follow) this.dir.draw(LURES.tied);
      }
    }
    // the lanterns
    const lit = v.phase === 'bell' || v.phase === 'bloom' ? 5 : v.phase === 'lanterns' ? v.lit : 0;
    for (let j = 0; j < 5; j++) this.flames[j]!.visible = v.order.indexOf(j) < lit;
    const wasLit = was.phase === 'bell' || was.phase === 'bloom' ? 5 : was.phase === 'lanterns' ? was.lit : 0;
    if (!silent && v.phase === was.phase && v.phase === 'lanterns') {
      if (v.lit > wasLit) {
        const j = v.order[v.lit - 1]!;
        g.audio.play('lantern_light', { pos: { x: s.lanterns[j]!.x, y: 1.5, z: s.lanterns[j]!.z }, priority: 2 });
        g.banner(`LANTERN ${v.lit}/5`, `${LANTERN_SIGNS[j]!.kanji}  ${LANTERN_SIGNS[j]!.word}`, 'good', 3);
      } else if (this.follow && v.lit < wasLit) {
        g.audio.play('fzombie_scream', { priority: 3 });
        g.banner('THE LANTERNS GO OUT', 'Wrong. The dead come for the shrine.', 'danger', 4);
      }
    }
    if (!silent && v.phase === 'bell' && was.phase !== 'bell') {
      const j = v.order[4]!;
      g.audio.play('lantern_light', { pos: { x: s.lanterns[j]!.x, y: 1.5, z: s.lanterns[j]!.z }, priority: 2 });
      g.banner('EVERY LANTERN BURNS', 'Ring the shrine bell', 'good', 5);
      this.voice.say('aoi_bell', { kind: 'story', delay: 0.8 });
    }
    // the bloom
    if (v.phase === 'bloom' && !this.bloomed) this.bloom(silent);
    else if (v.phase !== 'bloom' && this.bloomed) this.unbloom();
    this.shown = { ...v, order: [...v.order] };
  }

  /** The blood moon, the crimson trees and the glowing canal. */
  private redMoon(): void {
    SakuraRuntime.look(this.g.renderer, BLOOD);
    BLOSSOM.color.setHex(0xff2a48);
    BLOSSOM.emissive.setHex(0x5a0a10);
    CANAL_WATER.emissive.setHex(0xff2a6a);
    CANAL_WATER.emissiveIntensity = 0.9;
    this.petals.setColor(0xd8203a);
  }

  private bloom(silent: boolean): void {
    const g = this.g;
    this.bloomed = true;
    this.redMoon();
    this.ghost.visible = true;
    this.h.kisaragi.link.closed = false;
    if (!this.progress.egg) {
      this.progress.egg = true;
      saveSakura(this.progress);
    }
    if (silent) return;
    g.audio.play('bloom_swell', { priority: 3 });
    g.audio.play('ghost_train', { pos: { x: this.h.kisaragi.ghost.x, y: 2, z: this.h.kisaragi.ghost.z }, priority: 2 });
    g.banner('THE THOUSAND LANTERNS', 'The dead of Sakuragi are seen home. A train is waiting at the station.', 'good', 7);
    this.voice.sayAll(['yuzu_bloom', 'aoi_bloom'], { kind: 'story' });
    if (!this.follow) this.dir.draw(LURES.bloom);
    g.fadeThroughBlack(0.8);
  }

  private unbloom(): void {
    this.bloomed = false;
    SakuraRuntime.look(this.g.renderer, DUSK);
    BLOSSOM.color.setHex(0xffffff);
    BLOSSOM.emissive.setHex(0x2a0a14);
    CANAL_WATER.emissive.setHex(0x000000);
    CANAL_WATER.emissiveIntensity = 1;
    this.petals.setColor(0xffc4dc);
    this.ghost.visible = false;
    this.h.kisaragi.link.closed = true;
  }
}

function bitsOf(v: number): number {
  let n = 0;
  for (let i = 0; i < 5; i++) if (v & (1 << i)) n++;
  return n;
}
