/**
 * What the station looks like, loop by loop (the screen only; the map's walls and floors are `layout/mujin.ts`): the
 * five lamps on platform 1's canopy, the station's things that can change (each drawn both ways), the people who
 * wait here (passengers on platform 1, on the bench, a body on platform 2), the fog over what the night has taken,
 * the level crossing's lamps, Ren.
 */
import * as THREE from 'three';
import { Avatar } from '../coop/avatar';
import { animeModel } from '../anime/vrm';
import { ANIMEOPS } from './cast';
import { ANOMALIES } from './anomalies';
import { MUJIN, PLATFORM_Y, SEALS, SPOTS, type SpotId } from './places';

const spot = (id: SpotId): (typeof SPOTS)[number] => SPOTS.find((s) => s.id === id)!;

/** A texture drawn on a canvas. */
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const JP = '"Noto Sans JP", "Yu Gothic", "Meiryo", "Hiragino Sans", sans-serif';

function board(tex: THREE.Texture, w: number, h: number, glow = 0): THREE.Mesh {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, emissive: glow ? 0xffffff : 0, emissiveMap: glow ? tex : null, emissiveIntensity: glow }));
}

/** A thing drawn two ways: as it should be, and as it is when it is the change. */
interface Twin {
  normal: THREE.Object3D[];
  wrong: THREE.Object3D[];
}

const std = (color: number, o: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...o });

export class StationLook {
  readonly root = new THREE.Group();
  private readonly lamps: THREE.Mesh[] = [];
  private readonly lampLight = new THREE.PointLight(0xffb070, 0, 16, 2);
  private readonly twins = new Map<string, Twin>();
  private shown: string | null = null;
  private readonly hands: { h: THREE.Object3D; m: THREE.Object3D; s: THREE.Object3D };
  private readonly crossLamps: THREE.Mesh[] = [];
  private readonly crossMat = std(0x300606, { emissive: 0xff1a10, emissiveIntensity: 0 });
  private readonly fog: THREE.Mesh[] = [];
  private readonly fogMat = new THREE.MeshBasicMaterial({ color: 0x020205, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  /** The people who wait: platform 1's row, the bench, the body; and the ones only some loops have. */
  readonly rows: Avatar[] = [];
  readonly bench: Avatar[] = [];
  readonly body: Avatar;
  readonly extra: { row: Avatar; bench: Avatar; bridge: Avatar; window: Avatar; you: Avatar };
  readonly ren: Avatar;
  private readonly tunnelLight = new THREE.PointLight(0xfff0c0, 0, 22, 2);
  private readonly vendGlow: THREE.Mesh;
  private time = 0;
  private sealedShown = -1;
  private fogT = 0;

  constructor() {
    this.root.name = 'MujinLook';
    const y = PLATFORM_Y;
    // ---- the lamps on platform 1's canopy (lit by right reads) ----
    for (let i = 0; i < 5; i++) {
      const x = -6 + i * 5;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.42, 12), std(0x3a2414, { emissive: 0xff8a30, emissiveIntensity: 0 }));
      m.position.set(x, y + 3.25, -6.1);
      const cord = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.4, 0.02), std(0x111111));
      cord.position.set(x, y + 3.65, -6.1);
      this.root.add(m, cord);
      this.lamps.push(m);
    }
    this.lampLight.position.set(4, y + 3, -6.1);
    this.root.add(this.lampLight);

    // ---- the station clock over the gates ----
    const c = spot('clock');
    const face = board(canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#f4f1e8';
      g.beginPath();
      g.arc(w / 2, h / 2, w / 2 - 4, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 10;
      g.strokeStyle = '#1a1a1a';
      g.stroke();
      g.fillStyle = '#1a1a1a';
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.fillRect(w / 2 + Math.sin(a) * 100 - 4, h / 2 - Math.cos(a) * 100 - 10, 8, 20);
      }
    }), 1.1, 1.1);
    face.position.set(c.x, c.y, c.z + 0.04);
    const hand = (len: number, wd: number, color: number): THREE.Object3D => {
      const p = new THREE.Group();
      const m = new THREE.Mesh(new THREE.BoxGeometry(wd, len, 0.01), std(color));
      m.position.y = len / 2 - 0.04;
      p.add(m);
      p.position.set(c.x, c.y, c.z + 0.06);
      return p;
    };
    this.hands = { h: hand(0.28, 0.05, 0x111111), m: hand(0.42, 0.035, 0x111111), s: hand(0.46, 0.012, 0xc01818) };
    this.root.add(face, this.hands.h, this.hands.m, this.hands.s);

    // ---- the timetable ----
    const tt = (extra: boolean): THREE.Mesh => {
      const m = board(canvasTex(256, 384, (g, w) => {
        g.fillStyle = '#10151c';
        g.fillRect(0, 0, w, 384);
        g.fillStyle = '#f2ede2';
        g.font = `bold 30px ${JP}`;
        g.fillText('時刻表  TIMETABLE', 14, 40);
        g.font = `24px ${JP}`;
        const rows = ['04:57  上り  UP', '05:12  下り  DOWN', '05:40  上り  UP', '06:05  下り  DOWN', '06:31  上り  UP'];
        rows.forEach((r, i) => g.fillText(r, 20, 90 + i * 46));
        if (extra) {
          g.fillStyle = '#ff2a2a';
          g.fillText('04:44  回送  NOT IN SERVICE', 20, 90 + 5 * 46);
        }
      }), 0.9, 1.35, 0.25);
      m.position.set(spot('timetable').x, spot('timetable').y, spot('timetable').z + 0.04);
      return m;
    };
    this.twin('timetable_extra', [tt(false)], [tt(true)]);

    // ---- the poster in the hall ----
    const poster = (face: boolean): THREE.Mesh => {
      const m = board(canvasTex(256, 360, (g, w, h) => {
        const grd = g.createLinearGradient(0, 0, 0, h);
        grd.addColorStop(0, '#7ab0d8');
        grd.addColorStop(1, '#e8d8b0');
        g.fillStyle = grd;
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#3a5a3a';
        g.beginPath();
        g.moveTo(0, 250);
        g.lineTo(90, 170);
        g.lineTo(170, 230);
        g.lineTo(256, 160);
        g.lineTo(256, 360);
        g.lineTo(0, 360);
        g.fill();
        g.fillStyle = '#1a1a1a';
        g.font = `bold 26px ${JP}`;
        g.fillText('黒瀬線で、ふるさとへ', 14, 40);
        g.font = '16px sans-serif';
        g.fillText('THE KUROSE LINE - TAKE YOU HOME', 14, 66);
        if (face) {
          // a face in the hills, looking out of the poster
          g.fillStyle = '#e8dcd0';
          g.beginPath();
          g.ellipse(128, 200, 56, 72, 0, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#0a0a0a';
          for (const ex of [104, 152]) {
            g.beginPath();
            g.ellipse(ex, 192, 12, 16, 0, 0, Math.PI * 2);
            g.fill();
          }
          g.fillRect(112, 238, 32, 4);
        }
      }), 0.9, 1.26);
      const s = spot('poster');
      m.position.set(s.x - 0.12, s.y, s.z);
      m.rotation.y = Math.PI / 2;
      return m;
    };
    this.twin('poster_face', [poster(false)], [poster(true)]);

    // ---- the area map ----
    const mapb = (here: 'station' | 'tunnel', named: boolean): THREE.Mesh => {
      const m = board(canvasTex(384, 256, (g, w, h) => {
        g.fillStyle = '#e8e4d8';
        g.fillRect(0, 0, w, h);
        g.strokeStyle = '#555';
        g.lineWidth = 6;
        g.beginPath();
        g.moveTo(0, 140);
        g.lineTo(w, 140);
        g.stroke();
        g.fillStyle = '#9a9a9a';
        g.fillRect(150, 90, 90, 40);
        g.fillStyle = '#333';
        g.fillRect(0, 118, 28, 44);
        g.font = `bold 22px ${JP}`;
        g.fillStyle = '#1a1a1a';
        g.fillText(named ? 'むじん駅  MUJIN STATION' : '周辺案内図  AREA MAP', 12, 32);
        const [hx, hy] = here === 'station' ? [195, 110] : [14, 140];
        g.fillStyle = '#e01818';
        g.beginPath();
        g.arc(hx, hy, 10, 0, Math.PI * 2);
        g.fill();
        g.font = '14px sans-serif';
        g.fillText('YOU ARE HERE', Math.min(hx + 14, w - 110), hy - 12);
      }), 1.5, 1);
      const s = spot('mapboard');
      m.position.set(s.x, s.y, s.z + 0.12);
      return m;
    };
    const mapNormal = mapb('station', false);
    this.twin('mapboard_tunnel', [mapNormal], [mapb('tunnel', false)]);
    this.twin('mapboard_name', [mapNormal], [mapb('station', true)]);

    // ---- the station sign on platform 1 ----
    const sign = (text: string, sub: string, color: string): THREE.Mesh => {
      const m = board(canvasTex(512, 160, (g, w, h) => {
        g.fillStyle = '#f2f0ea';
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#1a3a7a';
        g.fillRect(0, h - 22, w, 22);
        g.fillStyle = color;
        g.textAlign = 'center';
        g.font = `bold 78px ${JP}`;
        g.fillText(text, w / 2, 84);
        g.font = 'bold 28px sans-serif';
        g.fillText(sub, w / 2, 124);
      }), 2.6, 0.8, 0.15);
      const s = spot('sign');
      m.position.set(s.x, s.y, s.z);
      return m;
    };
    const signNormal = sign('むじん', 'MUJIN', '#1a1a1a');
    this.twin('sign_red', [signNormal], [sign('むじん', 'MUJIN', '#c81818')]);
    this.twin('sign_order', [signNormal], [sign('んじむ', 'NIJUM', '#1a1a1a')]);
    for (const x of [spot('sign').x - 1.32, spot('sign').x + 1.32]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), std(0x333333));
      post.position.set(x, spot('sign').y + 0.4, spot('sign').z);
      this.root.add(post);
    }

    // ---- the vending machine on platform 1 (dead, unless it is the change) ----
    const v = spot('vending');
    const vend = new THREE.Mesh(new THREE.BoxGeometry(1, 1.8, 0.8), std(0xc8ccd0, { metalness: 0.3 }));
    vend.position.set(v.x, y + 0.9, v.z - 0.5);
    this.vendGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 1.1), std(0x101418, { emissive: 0xbfe4ff, emissiveIntensity: 0 }));
    this.vendGlow.position.set(v.x, y + 1.15, v.z - 0.09);
    this.root.add(vend, this.vendGlow);

    // ---- the umbrella stand ----
    const u = spot('umbrellas');
    const brolly = (x: number, z: number, color: number): THREE.Object3D => {
      const g = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.9, 5), std(0x222222));
      shaft.position.y = 0.45;
      const fold = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.62, 8), std(color, { roughness: 0.9 }));
      fold.position.y = 0.42;
      fold.rotation.x = Math.PI;
      g.add(shaft, fold);
      g.position.set(x, 0, z);
      g.rotation.z = (Math.random() - 0.5) * 0.2;
      return g;
    };
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.5, 12, 1, true), std(0x5a5a5a, { side: THREE.DoubleSide }));
    stand.position.set(u.x, 0.25, u.z);
    this.root.add(stand);
    const black = [0, 1, 2, 3].map((i) => brolly(u.x - 0.1 + (i % 2) * 0.16, u.z - 0.08 + Math.floor(i / 2) * 0.14, 0x111114));
    const lastBlack = brolly(u.x + 0.02, u.z + 0.12, 0x111114);
    this.root.add(...black);
    this.twin('umbrella_red', [lastBlack], [brolly(u.x + 0.02, u.z + 0.12, 0xc0141c)]);

    // ---- the ticket gates' lights ----
    const gates = (color: number): THREE.Object3D[] =>
      [-8, -6, -4, -2].map((x) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.22), std(0x111111, { emissive: color, emissiveIntensity: 1.6 }));
        m.position.set(x, 1.05, -10.1);
        return m;
      });
    this.twin('gates_red', gates(0x2aa0ff), gates(0xff1a1a));

    // ---- the clock shop's shutter (open and dark; down, with something under it) ----
    const sh = spot('shutter');
    const down = new THREE.Group();
    const plate = new THREE.Mesh(new THREE.BoxGeometry(7.8, 2.1, 0.06), std(0x8a8e90, { metalness: 0.5 }));
    plate.position.set(sh.x, 1.95, sh.z + 0.5);
    down.add(plate);
    for (const dx of [-0.14, 0.14]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.9, 6), std(0xe8e4dc));
      leg.position.set(sh.x + 0.6 + dx, 0.45, sh.z + 0.56);
      down.add(leg);
    }
    this.twin('shutter_down', [], [down]);

    // ---- the shrine's rope ----
    const r = spot('rope');
    const rope = (color: number): THREE.Mesh => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4.6, 10), std(color, { roughness: 1 }));
      m.rotation.z = Math.PI / 2;
      m.position.set(r.x, r.y, r.z);
      return m;
    };
    this.twin('rope_black', [rope(0xe8dcc0)], [rope(0x0c0a0a)]);

    // ---- wet footprints on platform 2 ----
    const fp = new THREE.Group();
    const foot = new THREE.CircleGeometry(0.1, 8).scale(0.6, 1, 1).rotateX(-Math.PI / 2);
    const fpm = new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.8 });
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(foot, fpm);
      m.position.set(spot('footprints').x - 4 + i * 0.5, y + 0.006, 7.6 - i * 0.33 + (i % 2) * 0.16);
      m.rotation.y = 0.6;
      fp.add(m);
    }
    this.twin('footprints_wall', [], [fp]);

    // ---- a lamp lit inside the tunnel ----
    this.tunnelLight.position.set(-49, 2.4, 0);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff0c0 }));
    bulb.position.set(-48.9, 2.4, 0);
    this.root.add(this.tunnelLight);
    this.twin('tunnel_light', [], [bulb]);

    // ---- the level crossing's lamps ----
    for (const [x, z] of [[35.6, -5.5], [42.4, 5.5]] as const) {
      for (const dx of [-0.2, 0.2]) {
        const m = new THREE.Mesh(new THREE.CircleGeometry(0.11, 12), this.crossMat.clone());
        m.position.set(x + dx, 2.25, z + (z < 0 ? 0.08 : -0.08));
        if (z > 0) m.rotation.y = Math.PI;
        this.root.add(m);
        this.crossLamps.push(m);
      }
    }

    // ---- the fog over what the night has taken ----
    for (const s of SEALS) {
      const w = s.rect.x1 - s.rect.x0;
      const d = s.rect.z1 - s.rect.z0;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 9, d), this.fogMat);
      m.position.set((s.rect.x0 + s.rect.x1) / 2, 4.5, (s.rect.z0 + s.rect.z1) / 2);
      m.visible = false;
      m.renderOrder = 5;
      this.fog.push(m);
      this.root.add(m);
    }

    // ---- the people who wait ----
    const person = (name: string, i: number, file: string): Avatar => {
      const a = new Avatar(name, i, { weapon: 'none', helmet: false, tag: '', anime: animeModel(file, ANIMEOPS.fallback) });
      a.cowering = false;
      this.root.add(a.root);
      return a;
    };
    for (let i = 0; i < 5; i++) {
      const a = person('', i, ANIMEOPS.passengers[i % ANIMEOPS.passengers.length]!);
      a.set(15.5 + i * 1.4, y, -4.7, Math.PI, true);
      this.rows.push(a);
    }
    for (let i = 0; i < 2; i++) {
      const a = person('', 5 + i, ANIMEOPS.passengers[(i + 2) % ANIMEOPS.passengers.length]!);
      a.set(MUJIN.bench.x + 1 + i * 1.3, 0.1, MUJIN.bench.z - 0.15, 0, true);
      this.bench.push(a);
    }
    this.body = person('', 7, ANIMEOPS.passengers[1]!);
    this.body.set(spot('body').x, y, spot('body').z, 0.4, true);
    this.body.fall(0.3, 0.5, 0);
    this.extra = {
      row: person('', 8, ANIMEOPS.passengers[3]!),
      bench: person('', 9, ANIMEOPS.passengers[0]!),
      bridge: person('', 10, ANIMEOPS.passengers[2]!),
      window: person('', 11, ANIMEOPS.you),
      you: person('', 12, ANIMEOPS.you),
    };
    this.extra.row.set(15.5 + 5 * 1.4, y, -4.7, Math.PI, false);
    this.extra.bench.set(MUJIN.bench.x - 1.5, 0.1, MUJIN.bench.z - 0.15, 0, false);
    this.extra.bridge.set(-21.8, 5.3, 1.2, -Math.PI / 2, false);
    this.extra.window.set(spot('window').x, 0, spot('window').z - 1.2, 0, false);
    this.extra.you.set(spot('body').x, y, spot('body').z, 0.4, false);
    this.extra.you.fall(0.3, 0.5, 0);
    this.ren = new Avatar('Ren', 13, { weapon: 'none', helmet: false, tag: '', anime: animeModel(ANIMEOPS.ren, ANIMEOPS.fallback) });
    this.root.add(this.ren.root);
    this.ren.set(MUJIN.ren.x, y, MUJIN.ren.z, Math.PI, false);
  }

  private twin(id: string, normal: THREE.Object3D[], wrong: THREE.Object3D[]): void {
    for (const o of [...normal, ...wrong]) if (!o.parent) this.root.add(o);
    for (const o of wrong) o.visible = false;
    this.twins.set(id, { normal, wrong });
  }

  /** Show this loop's change (an `ANOMALIES` id, or null for none). */
  setChange(id: string | null): void {
    if (id === this.shown) return;
    // everything back as it should be
    for (const [, t] of this.twins) {
      for (const o of t.normal) o.visible = true;
      for (const o of t.wrong) o.visible = false;
    }
    const tw = id ? this.twins.get(id) : undefined;
    if (tw) {
      for (const o of tw.normal) o.visible = false;
      for (const o of tw.wrong) o.visible = true;
    }
    const e = this.extra;
    e.row.root.visible = id === 'rows_extra';
    e.bench.root.visible = id === 'bench_extra';
    e.bridge.root.visible = id === 'bridge_figure';
    e.window.root.visible = id === 'window_you';
    e.you.root.visible = id === 'body_you';
    this.body.root.visible = id !== 'body_you';
    // body_up: the body is on its feet where it lay
    const up = id === 'body_up';
    if (up !== this.bodyStanding) {
      if (up) this.body.rise();
      else this.body.fall(0.3, 0.5, 0);
    }
    this.bodyStanding = up;
    for (const a of this.rows) a.set(a.root.position.x, PLATFORM_Y, -4.7, id === 'rows_turn' ? 0 : Math.PI, true);
    this.tunnelLight.intensity = id === 'tunnel_light' ? 26 : 0;
    this.vendLit = id === 'vend_lit';
    this.shown = id;
  }

  private bodyStanding = false;
  private vendLit = false;
  /** The rows' and the bench's people turn their heads to whoever is near (bench_watch). */
  private watch = new THREE.Vector3();

  setLamps(n: number): void {
    this.lamps.forEach((m, i) => ((m.material as THREE.MeshStandardMaterial).emissiveIntensity = i < n ? 2.6 : 0));
    this.lampLight.intensity = n * 4;
  }

  setCrossing(on: boolean): void {
    this.crossing = on;
  }
  private crossing = false;

  /** Ren: where she is and whether she can be seen. */
  setRen(x: number, z: number, yaw: number, visible: boolean): void {
    this.ren.set(x, x > MUJIN.bench.x - 5 && x < MUJIN.bench.x + 5 && z < -9 && z > -22 ? 0.1 : PLATFORM_Y, z, yaw, visible);
  }

  /** Every frame: the clock, the lamps' flicker, the crossing, the fog, who turns to watch you. */
  update(dt: number, viewer: { x: number; z: number }, sealed: number): void {
    this.time += dt;
    const t = this.time;
    const id = this.shown;
    // the clock: 04:57 and running, backwards, or stopped and trembling
    const secs = id === 'clock_stop' ? 0 : id === 'clock_back' ? -t : t;
    const base = 4 * 3600 + 57 * 60;
    const now = base + secs;
    const tremble = id === 'clock_stop' ? Math.sin(t * 40) * 0.03 : 0;
    this.hands.s.rotation.z = -((now % 60) / 60) * Math.PI * 2 + tremble;
    this.hands.m.rotation.z = -(((now / 60) % 60) / 60) * Math.PI * 2;
    this.hands.h.rotation.z = -(((now / 3600) % 12) / 12) * Math.PI * 2;
    (this.vendGlow.material as THREE.MeshStandardMaterial).emissiveIntensity = this.vendLit ? 1.4 + Math.sin(t * 13) * 0.08 : 0;
    // the crossing's lamps: alternate while it rings
    this.crossLamps.forEach((m, i) => ((m.material as THREE.MeshStandardMaterial).emissiveIntensity = this.crossing && Math.floor(t / 0.36 + i) % 2 === 0 ? 3 : 0));
    // the fog closes in over a newly taken area
    if (sealed !== this.sealedShown) {
      this.sealedShown = sealed;
      this.fogT = 0;
    }
    this.fogT = Math.min(1, this.fogT + dt / 3);
    this.fog.forEach((m, i) => (m.visible = (sealed & (1 << i)) !== 0));
    this.fogMat.opacity = 0.94 * this.fogT;
    // bench_watch: the bench's passengers turn to follow you
    if (id === 'bench_watch') {
      for (const a of this.bench) {
        this.watch.set(viewer.x - a.root.position.x, 0, viewer.z - a.root.position.z);
        a.set(a.root.position.x, 0.1, a.root.position.z, Math.atan2(-this.watch.x, -this.watch.z), true);
      }
    } else for (const a of this.bench) a.set(a.root.position.x, 0.1, a.root.position.z, 0, true);
    // the people near enough to be seen breathe and shift (the far ones hold still)
    for (const a of [...this.rows, ...this.bench, this.extra.row, this.extra.bench, this.extra.bridge, this.extra.window, this.ren]) {
      if (!a.root.visible) continue;
      const d = Math.hypot(a.root.position.x - viewer.x, a.root.position.z - viewer.z);
      a.animeLod(d < 22);
      if (d < 40) a.update(dt);
    }
    if (this.body.root.visible || this.extra.you.root.visible) {
      this.body.update(dt);
      this.extra.you.update(dt);
    }
  }

  /** The anomaly ids the look can draw (a check for the tests and the dev tools). */
  static drawn(): string[] {
    return ANOMALIES.map((a) => a.id);
  }

  dispose(): void {
    for (const a of [...this.rows, ...this.bench, this.body, this.extra.row, this.extra.bench, this.extra.bridge, this.extra.window, this.extra.you, this.ren]) a.dispose();
    this.root.removeFromParent();
  }
}
