/**
 * HIRASAKA: the fights, the climb and the finale on this player's screen (`runtime.ts` owns one and calls it). Whoever
 * runs the infected runs the fights themselves (`director.ts` with `bossUmi.ts` and `bossKurogane.ts`); this draws them
 * (`bossLook.ts`, `climbLook.ts`), offers Kurogane's machines as prompts, says what changed once, writes the HUD's lines
 * and turns the view out to sea when it ends. Every rule reads with the sound off: what matters is on the HUD's top line
 * and the objective, never in the middle of a phone's screen.
 */
import * as THREE from 'three';
import type { Game } from '../game/game';
import type { InteractionTarget } from '../game/interaction';
import type { MapDynamic } from '../ui/hudTypes';
import type { Zombie } from '../enemies/zombie';
import { HIRASAKA_HABITS } from '../enemies/variants';
import { zaryaPull } from '../zarya/kinds';
import { BossLook } from './bossLook';
import { ClimbLook } from './climbLook';
import { KMACHINE, KMACHINES, KSTATE, Kuro, PSTATE, SKIP } from './bossKurogane';
import { harpoonStrikes, UMODE, Umi } from './bossUmi';
import type { HirasakaSound } from './sound';
import { HirasakaStory, type StoryView } from './story';

/** The endings' last look: from the summit's cliff edge over the dawn sea (the ferry's way and the boats' are below it), and when the fade to it runs (s). */
export const OUTRO = { view: { x: 20, y: 18, z: -74.4, yaw: 0, pitch: -0.1 }, fadeSealed: [1.8, 2.6], fadeHome: [5, 5.8] } as const;

const NODE_NAMES = ['RIGHT SHOULDER', 'LEFT SHOULDER', 'CHEST', 'BACK', 'RIGHT HIP', 'LEFT HIP', 'BELLY', 'HEAD'];

export class HirasakaBosses {
  readonly look = new BossLook();
  readonly climb = new ClimbLook();
  private prev: StoryView | null = null;
  private readonly said = new Set<string>();
  /** The ending's last look (seconds in, which ending), and the fade it moves through. */
  private outroT = -1;
  private outroKind = 0;
  private moved = false;
  private fade: HTMLDivElement | null = null;

  constructor(
    private readonly g: Game,
    private readonly sound: HirasakaSound,
    /** Ask the story (solo: here; co-op: the simulation). */
    private readonly act: (a: string, i?: number) => void,
  ) {
    g.worldRoot.add(this.look.root, this.climb.root);
  }

  prewarm(): THREE.Object3D[] {
    return [...this.look.prewarm(), ...this.climb.prewarm()];
  }

  reset(): void {
    this.look.reset();
    this.climb.reset();
    this.prev = null;
    this.said.clear();
    this.outroT = -1;
    this.moved = false;
    if (this.fade) this.fade.style.opacity = '0';
    // a funayūrei's drag moves this player (the simulation yanks instead)
    this.g.zenv.pull = zaryaPull(this.g.player);
    HIRASAKA_HABITS.lampOut = false;
  }

  /** A gift came down where this player threw it. */
  landed(kind: string, x: number, y: number, z: number): void {
    this.climb.landed(kind, x, y, z);
  }

  /** Does a harpoon fired from `o` along `d` strike the umibōzu now? (For the Mori: then `act('umiHit')`.) */
  strikes(v: StoryView, o: { x: number; y: number; z: number }, d: { x: number; y: number; z: number }): boolean {
    return v.umi === 1 && harpoonStrikes(v.ua, o, d);
  }

  /** Every frame. `deep`: this player is in the deep; `lampOut`: a lamp-eater has put their lamp out. */
  update(dt: number, v: StoryView, deep: boolean, lampOut: boolean): void {
    const g = this.g;
    HIRASAKA_HABITS.lampOut = lampOut;
    const boss = g.zombies.boss && g.zombies.boss.alive && g.zombies.boss.variant === 'overseer' ? g.zombies.boss : null;
    const scene = g.renderer.scene;
    this.look.update(dt, v, boss, (n) => scene.getObjectByName(n) ?? null, deep, g.zombies.zombies);
    this.climb.update(dt, v, g.renderer.camera, deep);
    this.react(this.prev, v, boss);
    this.prev = { ...v };
    this.outro(dt);
  }

  /**
   * The ending's last look. SEALED: the rock goes home; a fade; then from the summit's cliff edge the dawn sea below, the
   * lighthouse lit, and the ferry coming in. HOME: the view follows Mio as she walks away down the Hell Stairs; a fade;
   * then from the cliff edge the spirit boats going out in the morning.
   */
  private outro(dt: number): void {
    if (this.outroT < 0) return;
    const g = this.g;
    const p = g.player;
    this.outroT += dt;
    const t = this.outroT;
    const [f0, f1] = this.outroKind === 2 ? OUTRO.fadeHome : OUTRO.fadeSealed;
    const turn = (yaw: number, pitch: number, rate: number): void => {
      let d = yaw - p.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      p.yaw += d * Math.min(1, dt * rate);
      p.pitch += (pitch - p.pitch) * Math.min(1, dt * rate);
    };
    if (!this.moved && this.outroKind === 2) {
      // she goes home: watch her go
      const m = g.zombies.zombies.find((z) => z.variant === 'follower' && z.alive);
      if (m) turn(Math.atan2(-(m.x - p.x), -(m.z - p.z)), Math.atan2(m.y + 1.2 - (p.y + 1.6), Math.max(1, Math.hypot(m.x - p.x, m.z - p.z))), 2.5);
    }
    const el = this.fadeEl();
    if (t >= f0 && !this.moved) el.style.opacity = String(Math.min(1, (t - f0) / (f1 - f0)));
    if (t >= f1 && !this.moved) {
      this.moved = true;
      const V = OUTRO.view;
      p.teleport(V.x, V.z, V.yaw);
      p.y = V.y;
      p.pitch = V.pitch;
      g.flow.cancel();
      g.squad.regroupAt(V.x + 2, V.z + 2.5, V.yaw, g.level.floors.areaAt(V.x, V.y, V.z));
      el.style.transition = 'opacity 1.6s';
      el.style.opacity = '0';
    }
    if (this.moved) turn(OUTRO.view.yaw, OUTRO.view.pitch, 0.6);
  }

  private fadeEl(): HTMLDivElement {
    if (this.fade) return this.fade;
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:39;opacity:0;background:#05070a';
    document.body.appendChild(d);
    this.fade = d;
    return d;
  }

  private once(id: string, fn: () => void): void {
    if (this.said.has(id)) return;
    this.said.add(id);
    fn();
  }

  private react(a: StoryView | null, b: StoryView, boss: Zombie | null): void {
    const g = this.g;
    if (!a) return;
    // ---- the umibōzu ----
    if (b.umi === 1) {
      const ma = Umi.mode(a.ua);
      const mb = Umi.mode(b.ua);
      if (mb === UMODE.windup && ma !== UMODE.windup) {
        this.once('umi-up', () => g.radio('NATSUKI', 'It is lifting the sea! While it is up over the wall the harpoon can reach it.', 6));
        this.sound.thunder(0.4);
      }
      if (mb === UMODE.throw_ && ma !== UMODE.throw_) {
        g.shake(0.35);
        this.once('umi-wave', () => g.radio('DAIGO', 'Wave down the street! Get into the other half of it, or up off the street.', 6));
      }
      if (Umi.waves(b.ub).length > Umi.waves(a.ub).length) this.sound.thunder(0.8);
    }
    // ---- Kurogane ----
    if (b.hairpin && !b.bossDown) {
      const pa = Kuro.phase(a.kw);
      const pb = Kuro.phase(b.kw);
      if (pb !== pa && pb > 0) {
        g.shake(0.5);
        if (pb === 1) g.banner('KUROGANE', 'Iron all over. Drop an ore skip on him from the hoist: run him under the rail.', 'danger', 7);
        else if (pb === 2) g.banner('BLACK DAMP', 'Nothing reaches him in his gas, and it chokes. The fan in the north wall blows it out.', 'danger', 7);
        else g.banner('THE FLOOR IS UNDER WATER', 'The roots are under it. Pump it dry, then bring him to the tree.', 'danger', 7);
      }
      if (Kuro.stunned(b.kw) && !Kuro.stunned(a.kw)) {
        g.banner('DOWN UNDER THE ORE', 'Break a thunder while he is down', 'good', 3.5);
        g.shake(0.6);
        this.sound.grind({ x: boss?.x ?? 300, y: 1, z: boss?.z ?? -30 }, 1);
      }
      const dropped = [0, 1, 2].some((i) => Kuro.skip(b.kw, i) === SKIP.down && Kuro.skip(a.kw, i) === SKIP.running);
      if (dropped && !Kuro.stunned(b.kw)) g.feed('THE SKIP MISSED HIM - HE WAS NOT UNDER THE RAIL', 'warn');
      if (Kuro.fan(b.kw) === KSTATE.running && Kuro.fan(a.kw) !== KSTATE.running) {
        g.banner('THE FAN CLEARS HIS GAS', 'His thunders are splitting off him', 'good', 4);
        this.sound.grind({ x: 330, y: 4, z: -62 }, 0.8);
      }
      if (Kuro.pump(b.kw) === PSTATE.dry && Kuro.pump(a.kw) !== PSTATE.dry) g.banner('THE FLOOR IS DRY', 'The roots can reach him: bring him to the tree', 'good', 4.5);
      if (Kuro.pinned(b.kw) && !Kuro.pinned(a.kw)) {
        g.banner('THE ROOTS HAVE HIM', b.thunders & 64 ? 'The head!' : 'Break a thunder while they hold him', 'good', 4);
        g.shake(0.5);
      }
      if (Kuro.open(b.kw) !== Kuro.open(a.kw) && Kuro.open(b.kw)) this.sound.chime();
    }
    if (b.thunders !== a.thunders) {
      const n = HirasakaStory.count(b.thunders);
      for (let i = 0; i < 8; i++) if (b.thunders & (1 << i) && !(a.thunders & (1 << i))) g.feed(`THUNDER BROKEN: ${NODE_NAMES[i]} (${n} OF 8)`, 'good');
      g.shake(0.4);
      this.sound.thunder(1);
      if (boss) g.fx.sparkle({ x: boss.x, y: boss.y + 2.4, z: boss.z }, 0x9ae8ff, 40);
    }
    // ---- the endings ----
    if (b.ending > 0 && a.ending === 0) {
      this.outroT = 0;
      this.outroKind = b.ending;
      this.moved = false;
    }
  }

  /** Kurogane's machines, as prompts where they stand (only the one his phase uses, and only while it can be worked). */
  targets(out: InteractionTarget[], v: StoryView): void {
    const g = this.g;
    const p = g.player;
    if (!v.hairpin || v.bossDown) return;
    const ph = Kuro.phase(v.kw);
    KMACHINES.forEach((m, i) => {
      if (i !== ph - 1) return;
      const d = Math.hypot(m.at.x - p.x, m.at.z - p.z);
      if (d > 2.6 || Math.abs(m.at.y - p.y) > 2.2) return;
      const ready = Kuro.ready(v.kw, i);
      out.push({ id: `hs:ku:${m.id}`, dist: d, text: m.verb, sub: ready ? this.machineSub(v, i) : this.machineWait(v, i), tone: 'warn', hold: 0.5, enabled: ready, onUse: () => this.act('kuMachine', i) });
    });
  }

  private machineSub(v: StoryView, m: number): string {
    if (m === KMACHINE.hoist) return 'The skip runs to over him and drops: he has to be under the rail';
    if (m === KMACHINE.fan) return 'Blows his gas out of the hall for a while';
    return 'Pumps the floor dry so the roots can reach him';
  }

  private machineWait(v: StoryView, m: number): string {
    if (Kuro.raging(v.kw)) return 'He is raging';
    if (m === KMACHINE.hoist) return Kuro.stunned(v.kw) ? 'He is already down' : 'A skip is still being hoisted back';
    if (m === KMACHINE.fan) return Kuro.fan(v.kw) === KSTATE.running ? 'Running' : 'Winding back';
    return Kuro.pump(v.kw) === PSTATE.dry ? 'The floor is dry: bring him to the tree' : Kuro.pump(v.kw) === PSTATE.pumping ? 'Pumping' : 'The sump is flooding the floor again';
  }

  /** The line under PUT DOWN KUROGANE. */
  kuDetail(v: StoryView): string {
    const kw = v.kw;
    const ph = Kuro.phase(kw);
    const n = HirasakaStory.count(v.thunders);
    const left = `${8 - n} of 8 thunders left`;
    if (ph === 0) return left;
    if (Kuro.raging(kw)) return `Phase ${ph} of 3 - ${left}`;
    if (Kuro.open(kw)) return Kuro.pinned(kw) && (v.thunders & 127) === 127 ? 'The roots hold him: THE HEAD' : `Open! Break a thunder - ${left}`;
    if (ph === 1) return `Run the hoist when he is under the rail - ${left}`;
    if (ph === 2) return Kuro.fan(kw) === KSTATE.ready ? `Start the fan in the north wall - ${left}` : `The fan is winding back - ${left}`;
    if (Kuro.pump(kw) === PSTATE.dry) return `Bring him to the tree: the roots will take him - ${left}`;
    return Kuro.pump(kw) === PSTATE.flooded ? `Pump the floor dry (the pump on the west wall) - ${left}` : `${Kuro.pump(kw) === PSTATE.pumping ? 'Pumping' : 'The floor is flooding'} - ${left}`;
  }

  /** Where the machine of his phase is (for the objective's distance and the marker). */
  kuAt(v: StoryView): { x: number; z: number } | null {
    const ph = Kuro.phase(v.kw);
    if (ph === 0 || Kuro.open(v.kw)) return null;
    if (ph === 3 && Kuro.pump(v.kw) === PSTATE.dry) return null;
    return KMACHINES[ph - 1]!.at;
  }

  /** The line under SINK IT, once the Mori is built. */
  umiDetail(v: StoryView): string {
    const hits = `${v.umiHits} of 3 hits`;
    // (final polish) wary after a hit: a throw from low in the water, nothing to harpoon
    if (Umi.guarded(v.ua)) return `It is throwing from low in the water, face behind its arms: get out of the wave's lane - ${hits}`;
    return Umi.exposed(v.ua) ? `It is up over the wall: harpoon it now! - ${hits}` : `When it rises to throw, harpoon it from the seawall winch - ${hits}`;
  }

  /** Markers for the machine of Kurogane's phase. */
  markers(v: StoryView, md: MapDynamic, deep: boolean): void {
    if (!deep) return;
    const at = this.kuAt(v);
    if (at && Kuro.ready(v.kw, Kuro.phase(v.kw) - 1)) md.markers.push({ id: 'hs-ku-machine', kind: 'objective', x: at.x, z: at.z, label: KMACHINES[Kuro.phase(v.kw) - 1]!.id.toUpperCase(), color: '#ffe08a', visible: true, compass: true, pulse: true });
  }

  dispose(): void {
    if (this.g.zenv.pull) this.g.zenv.pull = undefined;
    this.fade?.remove();
    this.look.dispose();
    this.climb.dispose();
  }
}
