/**
 * The Sakura District's cast (`ANIME_CAST` in config): which VRoid model each character wears, loading them, and the
 * infected built from them. Every slot falls back: a missing person uses any other person's model, a missing infected
 * any other infected's, and with none at all the game's stock figures stand in. Each kind of infected wears its own
 * body, colours and gear (`looks.ts`).
 */
import * as THREE from 'three';
import { ANIME_CAST } from '../config';
import type { ZombieVariant } from '../enemies/variants';
import type { ZombieAnimState, ZombieRig } from '../enemies/zombieRigTypes';
import type { ZombieType } from '../types';
import { type Dims, type JointName, type Style, StyleFigure } from './figure';
import { FAR, farCrowd } from './farCrowd';
import { COURT_TINT, KIND_LOOKS, type KindLook, type SakuraKind } from './looks';
import { AnimeBody, type AnimeTemplate, type AnimeTint, type PoseSource, animeModel, animeSlotState, loadAnime, loadAnimeFiles } from './vrm';

const PEOPLE = [...ANIME_CAST.squad, ...ANIME_CAST.operators, ...ANIME_CAST.survivors];
const ALL = [...new Set<string>([...PEOPLE, ...ANIME_CAST.horde, ...Object.values(ANIME_CAST.kinds), ANIME_CAST.boss])];

/**
 * Load the cast: the core (the squad, the horde, the Court) before the run, the rest streaming in behind it (`rest`
 * resolves when every file is in; nothing waits on it).
 */
export function loadAnimeCast(): Promise<void> & { rest?: Promise<void> } {
  const core = loadAnimeFiles(ANIME_CAST.core);
  const rest = core.then(() => Promise.all(ALL.filter((f) => !(ANIME_CAST.core as readonly string[]).includes(f)).map((f) => loadAnime(f)))).then(() => undefined);
  return Object.assign(core, { rest });
}

/** Load every file at once (the bestiary). */
export function loadWholeCast(): Promise<void> {
  return loadAnimeFiles(ALL);
}

/** The model a squad member or survivor wears: their own file, else any other person's, else none. */
export function personModel(file: string | undefined): AnimeTemplate | null {
  return animeModel(file, PEOPLE);
}

/** The model a co-op teammate wears on the Sakura District (by seat): their own file, else any other person's. */
export function operatorModel(seat: number): AnimeTemplate | null {
  return animeModel(ANIME_CAST.operators[seat % ANIME_CAST.operators.length], PEOPLE);
}

/** The model a Kurenai Court member wears: their own file, else the stand-in (never the squad's faces). */
export function courtModel(i: number): AnimeTemplate | null {
  return animeModel(ANIME_CAST.survivors[i % ANIME_CAST.survivors.length]);
}

/** What the Court wears over their model: the theatre's crimson. */
export { COURT_TINT };

/** The file an infected wants: its kind's own body, the boss file for the Warden, one of the horde (by seed). */
export function hordeFile(type: ZombieType, seed: number, variant: ZombieVariant = ''): string {
  if (variant && variant !== 'court') return ANIME_CAST.kinds[variant];
  if (type === 'warden') return ANIME_CAST.boss;
  return ANIME_CAST.horde[seed % ANIME_CAST.horde.length]!;
}

/** The model an infected wears: the file it wants, else any loaded horde file, else the stand-in. */
export function hordeModel(type: ZombieType, seed: number, variant: ZombieVariant = ''): AnimeTemplate | null {
  const own = ANIME_CAST.horde.filter((f) => animeSlotState(f) === 'own');
  return animeModel(hordeFile(type, seed, variant), own);
}

/** What each kind of infected does to a model: grey-green skin, glowing eyes, dull clothes (the boss keeps her ink). */
const TINTS: Record<ZombieType, AnimeTint> = {
  shambler: { key: 'shambler', skin: 0x8fa486, cloth: 0x86807c, hair: 0x948c8c, eyes: 0xff3030, outlines: false },
  runner: { key: 'runner', skin: 0xa4b0cc, cloth: 0x9c96ac, hair: 0xb4b4c8, eyes: 0xff40c8, outlines: false },
  armored: { key: 'armored', skin: 0x84967e, cloth: 0x54565e, hair: 0x7c7676, eyes: 0xffa020, outlines: false },
  warden: { key: 'warden', skin: 0xe0c4d0, cloth: 0xc87888, hair: 0xf4e8f0, eyes: 0xff1848, outlines: true },
};

/**
 * An infected wearing a VRoid model: a bare `StyleFigure` runs the zombie animation (gait, reach, swipe, stagger,
 * fall) at the model's own proportions, and the model follows it. Hit tests use the figure's head, chest and hand,
 * which sit where the model's do.
 */
export class AnimeZombieRig implements ZombieRig {
  readonly type: ZombieType;
  readonly root: THREE.Group;
  readonly radius: number;
  readonly height: number;
  readonly headRadius: number;
  private readonly fig: StyleFigure;
  readonly body: AnimeBody;
  private readonly src: PoseSource;
  private d2 = 0;
  private skip = 0;
  /** Drawn in the far crowd (`farCrowd.ts`) instead of wearing the model. */
  private far = false;
  /** What the model hangs from (put back on it when the infected comes near again). */
  private bodyFrame!: THREE.Object3D;
  /** The kind's look (null: the plain horde, tinted by type). */
  private readonly look: KindLook | null;
  private readonly tint: AnimeTint;
  /** The kind's gear on the figure's joints (hidden while far). */
  private readonly gear: THREE.Object3D[] = [];
  /** A man's voice for a man's body. */
  readonly voice: 'female' | 'male';
  /** The file this infected wants (it may wear a stand-in until that file has streamed in). */
  readonly wants: string;

  constructor(type: ZombieType, template: AnimeTemplate, def: { radius: number; height: number; headRadius: number }, seed: number, variant: ZombieVariant = '') {
    this.type = type;
    this.radius = def.radius;
    this.height = def.height;
    this.headRadius = def.headRadius;
    this.look = variant && variant !== 'court' ? KIND_LOOKS[variant as SakuraKind] : null;
    this.tint = this.look?.tint ?? TINTS[type];
    this.voice = template.male ? 'male' : 'female';
    this.wants = hordeFile(type, seed, variant);
    const m = template.measure;
    const s = def.height / m.height;
    const torso = ((m.shoulderY - m.legTop) * s) / (1 - 0.05 / 0.52);
    const D: Dims = {
      foot: m.ankle * s,
      thigh: (m.legTop - m.knee) * s,
      shin: (m.knee - m.ankle) * s,
      torso,
      neck: m.headBone * s - m.legTop * s - torso,
      head: (m.height - m.headBone) * s,
      upper: m.upperArm * s,
      fore: m.foreArm * s,
      shoulderX: m.shoulderX * s,
      hipX: m.hipX * s,
      gun: 1,
    };
    const bare: Style = { id: 'vrm', name: '', tagline: '', lore: '', notes: '', dims: () => D, dress: () => {} };
    this.fig = new StyleFigure(bare, 'zombie', seed);
    this.root = this.fig.root;
    this.root.name = `AnimeZombie:${type}`;
    this.body = new AnimeBody(template, { scale: s, offset: new THREE.Vector3(), tint: this.tint, grip: this.look?.gear ? 0.8 : 0.45, shadows: true });
    const frame = this.fig.getFall();
    frame.add(this.body.root);
    this.bodyFrame = frame;
    const J = this.fig.J;
    this.src = {
      frame,
      pelvis: J.pelvis,
      bob: { joint: J.pelvis, rest: new THREE.Vector3(0, this.fig.pelvisBase(), 0) },
      chest: J.torso,
      head: J.head,
      arms: [
        { upper: J.armR, fore: J.foreR, len: D.fore },
        { upper: J.armL, fore: J.foreL, len: D.fore },
      ],
      legs: [
        { thigh: J.legR, shin: J.shinR, len: D.shin },
        { thigh: J.legL, shin: J.shinL, len: D.shin },
      ],
    };
    // the kind's gear, on the figure's joints (shared geometry and materials; never `dress`, so a reset keeps it)
    this.look?.gear?.(
      (joint: JointName, o: THREE.Object3D, x = 0, y = 0, z = 0) => {
        o.position.set(x, y, z);
        J[joint].add(o);
        this.gear.push(o);
        return o;
      },
      D,
    );
  }

  /** Whether the file it wants has loaded since it was made (the manager makes a fresh one in its place). */
  stale(): boolean {
    return this.body.template.file !== this.wants && animeSlotState(this.wants) === 'own';
  }

  reset(seed: number): void {
    this.fig.reset(seed);
  }

  setDistance2(d2: number): void {
    this.d2 = d2;
  }

  update(s: ZombieAnimState, dt: number): void {
    // far away: the model comes off and ten boxes in the far crowd follow the stand-in skeleton (one draw call for all)
    const far = this.d2 > FAR * FAR;
    if (far !== this.far) {
      this.far = far;
      // off the figure entirely while far: its ~180 bones are not even walked
      if (far) this.body.root.removeFromParent();
      else this.bodyFrame.add(this.body.root);
      for (const g of this.gear) g.visible = !far;
    }
    if (far) {
      this.fig.update(s, dt);
      this.root.updateMatrixWorld(true);
      const c = this.look?.far ?? this.tint;
      farCrowd().write(this.fig, c.skin, c.cloth, this.root.parent);
      return;
    }
    // a model is ~13 skinned meshes: the farther of the near ones are re-posed only every 2nd frame (the pose is a pure
    // function of time, so it just steps), the dying and the struck always are
    const every = this.d2 > 16 * 16 ? 2 : 1;
    if (every > 1 && s.mode !== 'death' && s.hitKick <= 0 && this.skip++ % every !== 0) return;
    this.fig.update(s, dt);
    if (this.look?.sway && s.mode !== 'death') this.look.sway(this.gear, s.time);
    // bring the stand-in's joints up to date without walking the model's whole skeleton twice
    this.body.root.matrixWorldAutoUpdate = false;
    this.root.updateMatrixWorld(true);
    this.body.root.matrixWorldAutoUpdate = true;
    this.body.follow(this.src);
    // a snarl; the mouth opens into a strike; eyes close for good
    const dead = s.mode === 'death';
    this.body.setExpression('angry', dead ? 0 : s.enraged ? 1 : 0.7);
    const strike = s.mode === 'attack' || s.mode === 'slam' || s.mode === 'roar' ? Math.sin(Math.PI * Math.min(1, s.actionT * 1.4)) : 0;
    this.body.setExpression('aa', dead ? 0.2 : Math.max(0.25 + 0.1 * Math.sin(s.time * 2.3), strike));
    this.body.setExpression('blink', dead ? Math.min(1, s.deathT * 2) : 0);
  }

  getHeadWorld(out: THREE.Vector3): THREE.Vector3 {
    return this.fig.getHeadWorld(out);
  }
  getChestWorld(out: THREE.Vector3): THREE.Vector3 {
    return this.fig.getChestWorld(out);
  }
  getHandWorld(out: THREE.Vector3): THREE.Vector3 {
    return this.fig.getHandWorld(out);
  }
  setVisible(v: boolean): void {
    this.root.visible = v;
  }
  dispose(): void {
    // the model's geometry and materials are shared with every other clone: take it out before the figure is freed
    for (const g of this.gear) g.removeFromParent();
    this.body.dispose();
    this.fig.dispose();
    this.root.removeFromParent();
  }
}

/** Debug / bestiary: what a model costs. */
export function modelStats(t: AnimeTemplate): [string, string][] {
  return [
    ['Model', t.title + (t.author ? ` by ${t.author}` : '')],
    ['Triangles', t.tris.toLocaleString('en-US')],
    ['Materials', `${t.materials}`],
  ];
}
