/**
 * What the station looks like as it comes back to life (the screen only; the map's walls and floors are
 * `layout/mujin.ts`): the lamp board beside the bell, the jobs' things (the winding key in the tunnel mouth, the clock
 * stopped until it is wound, the breakers by the crossing, the lost tickets, the gates red until they are fed, the
 * shrine's rope black until it is retied, the PA desk), the station's dressing (the sign, the timetable, the poster,
 * the map), the level crossing's lamps, the night's mist over what it has taken, and Ren.
 */
import * as THREE from 'three';
import { Avatar } from '../coop/avatar';
import { animeModel } from '../anime/vrm';
import { ANIMEOPS } from './cast';
import { MujinJobs, type JobsView, REN_STATE } from './jobs';
import { MUJIN, PLACES, PLATFORM_Y, SEALS } from './places';

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

const std = (color: number, o: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...o });

/** The night's mist: dark, drifting, thick at the ground and thinning upward; `edge` makes a wall that frays at its top. */
function mistMaterial(edge: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { time: { value: 0 }, fade: { value: 0 }, height: { value: edge ? 7 : 6 } },
    vertexShader: `
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      uniform float time; uniform float fade; uniform float height;
      varying vec3 vW;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p) { float s = 0.0; float a = 0.5; for (int k = 0; k < 4; k++) { s += a * n(p); p *= 2.03; a *= 0.5; } return s; }
      void main() {
        vec2 q = vec2(vW.x + vW.z * 0.7, vW.y * 1.6) * 0.22;
        float m = fbm(q + vec2(time * 0.05, -time * 0.11)) * 0.65 + fbm(q * 2.3 - vec2(time * 0.09, time * 0.04)) * 0.35;
        float up = clamp(vW.y / height, 0.0, 1.0);
        float body = (1.0 - smoothstep(0.15, 1.0, up + (m - 0.5) * 0.7));
        float a = body * (0.55 + 0.45 * m) * fade;
        vec3 col = mix(vec3(0.012, 0.012, 0.03), vec3(0.11, 0.09, 0.2), m * (1.0 - up));
        gl_FragColor = vec4(col, a * 0.92);
      }`,
  });
}

export class StationLook {
  readonly root = new THREE.Group();
  private readonly lamps: THREE.Mesh[] = [];
  private readonly lampLight = new THREE.PointLight(0x5cff9a, 0, 10, 2);
  private readonly hands: { h: THREE.Object3D; m: THREE.Object3D; s: THREE.Object3D };
  private readonly crossLamps: THREE.Mesh[] = [];
  private readonly crossMat = std(0x300606, { emissive: 0xff1a10, emissiveIntensity: 0 });
  private readonly gateLights: THREE.Mesh[] = [];
  private readonly key: THREE.Group;
  private readonly keyLight = new THREE.PointLight(0xffd070, 0, 6, 2);
  private readonly breakers: { lever: THREE.Object3D; lamp: THREE.Mesh }[] = [];
  private readonly tickets: THREE.Mesh[] = [];
  private readonly ropeMat = std(0x0c0a0a, { roughness: 1 });
  private readonly micLamp: THREE.Mesh;
  /** Over each area the night has taken: the mist over it, the mist walls across its gaps, the rope barrier. */
  private readonly nights: { mats: THREE.ShaderMaterial[]; objs: THREE.Object3D[]; fade: number }[] = [];
  readonly ren: Avatar;
  private time = 0;
  private clockRunning = false;
  private crossingOn = false;

  constructor() {
    this.root.name = 'MujinLook';
    const y = PLATFORM_Y;

    // ---- the lamp board beside the bell: one lamp for each job done; unlit dark glass, lit green ----
    const B = MUJIN.board;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.5, 0.12), std(0x2a1c14));
    frame.position.set(B.x, y + 1.95, B.z);
    const head = board(canvasTex(512, 96, (g, w) => {
      g.fillStyle = '#efe9dc';
      g.fillRect(0, 0, w, 96);
      g.fillStyle = '#16301e';
      g.textAlign = 'center';
      g.font = `bold 44px ${JP}`;
      g.fillText('運行灯   SERVICE LAMPS', w / 2, 62);
    }), 4.2, 0.4, 0.25);
    head.position.set(B.x, y + 2.95, B.z + 0.07);
    this.root.add(frame, head);
    for (const x of [B.x - 2.05, B.x + 2.05]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, y + 1.3, 0.1), std(0x2a1c14));
      leg.position.set(x, (y + 1.3) / 2, B.z);
      this.root.add(leg);
    }
    const LAMP_SIGNS = ['時計', '踏切', '切符', '注連', '放送'];
    for (let i = 0; i < 5; i++) {
      const x = B.x - 1.6 + i * 0.8;
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), std(0x1a1e1c, { emissive: 0x18e060, emissiveIntensity: 0, roughness: 0.25, metalness: 0.1 }));
      m.position.set(x, y + 1.95, B.z + 0.2);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.035, 6, 20), std(0x8a7a5a, { metalness: 0.6, roughness: 0.4 }));
      ring.position.copy(m.position);
      const plate = board(canvasTex(96, 64, (g, w, h) => {
        g.fillStyle = '#efe9dc';
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#1a1a1a';
        g.textAlign = 'center';
        g.font = `bold 34px ${JP}`;
        g.fillText(LAMP_SIGNS[i]!, w / 2, 44);
      }), 0.36, 0.24);
      plate.position.set(x, y + 1.45, B.z + 0.07);
      this.root.add(m, ring, plate);
      this.lamps.push(m);
    }
    this.lampLight.position.set(B.x, y + 2.1, B.z + 1.2);
    this.root.add(this.lampLight);

    // ---- the station clock over the gates: stopped at 4:57 until it is wound ----
    const c = PLACES.clock;
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

    // ---- the station's dressing: the timetable, the poster, the map, the sign ----
    const tt = board(canvasTex(256, 384, (g, w) => {
      g.fillStyle = '#10151c';
      g.fillRect(0, 0, w, 384);
      g.fillStyle = '#f2ede2';
      g.font = `bold 30px ${JP}`;
      g.fillText('時刻表  TIMETABLE', 14, 40);
      g.font = `24px ${JP}`;
      ['04:57  上り  UP', '05:12  下り  DOWN', '05:40  上り  UP', '06:05  下り  DOWN', '06:31  上り  UP'].forEach((r, i) => g.fillText(r, 20, 90 + i * 46));
      g.fillStyle = '#ff9a40';
      g.fillText('始発  FIRST TRAIN: AT DAWN', 20, 90 + 5 * 46 + 10);
    }), 0.9, 1.35, 0.25);
    tt.position.set(-10.5, 1.8, -8.21);
    const poster = board(canvasTex(256, 360, (g, w, h) => {
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
    }), 0.9, 1.26);
    poster.position.set(-13.52, 1.7, -17.5);
    poster.rotation.y = Math.PI / 2;
    const map = board(canvasTex(384, 256, (g, w, h) => {
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
      g.font = `bold 22px ${JP}`;
      g.fillStyle = '#1a1a1a';
      g.fillText('周辺案内図  AREA MAP', 12, 32);
      g.fillStyle = '#e01818';
      g.beginPath();
      g.arc(195, 110, 10, 0, Math.PI * 2);
      g.fill();
    }), 1.5, 1);
    map.position.set(-7, 1.7, -21.18);
    const sign = board(canvasTex(512, 160, (g, w, h) => {
      g.fillStyle = '#f2f0ea';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#1a3a7a';
      g.fillRect(0, h - 22, w, 22);
      g.fillStyle = '#1a1a1a';
      g.textAlign = 'center';
      g.font = `bold 78px ${JP}`;
      g.fillText('むじん', w / 2, 84);
      g.font = 'bold 28px sans-serif';
      g.fillText('MUJIN', w / 2, 124);
    }), 2.6, 0.8, 0.15);
    sign.position.set(12, 2.5, -4.4);
    this.root.add(tt, poster, map, sign);

    // ---- the ticket gates' lights: red until the tickets are back ----
    for (const x of [-8, -6, -4, -2]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.22), std(0x111111, { emissive: 0xff1a1a, emissiveIntensity: 1.6 }));
      m.position.set(x, 1.05, -10.1);
      this.gateLights.push(m);
      this.root.add(m);
    }

    // ---- the winding key, in the tunnel mouth ----
    this.key = new THREE.Group();
    const gold = std(0xd8b048, { metalness: 0.8, roughness: 0.3, emissive: 0x6a4a10, emissiveIntensity: 0.8 });
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.03, 8, 16), gold);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.36, 8), gold);
    shaft.rotation.z = Math.PI / 2;
    shaft.position.x = 0.28;
    const bit = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.03), gold);
    bit.position.set(0.42, -0.05, 0);
    this.key.add(bow, shaft, bit);
    this.key.position.set(PLACES.key.x, PLACES.key.y + 0.9, PLACES.key.z);
    this.keyLight.position.set(PLACES.key.x, PLACES.key.y + 1.2, PLACES.key.z);
    this.root.add(this.key, this.keyLight);

    // ---- the breakers by the crossing: a cabinet, a lever, a lamp (red, then green) ----
    for (const b of PLACES.breakers) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.4, 0.45), std(0x5a6a5a, { metalness: 0.4 }));
      box.position.set(b.x, 0.7, b.z);
      const lever = new THREE.Group();
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.06), std(0x202020));
      arm.position.y = 0.2;
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), std(0xc81818));
      knob.position.y = 0.4;
      lever.add(arm, knob);
      lever.position.set(b.x, 1.0, b.z + 0.26);
      lever.rotation.x = 0.7;
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), std(0x300606, { emissive: 0xff2a1a, emissiveIntensity: 2 }));
      lamp.position.set(b.x, 1.5, b.z + 0.1);
      this.root.add(box, lever, lamp);
      this.breakers.push({ lever, lamp });
    }

    // ---- the lost tickets: glowing paper slips ----
    const slip = canvasTex(128, 64, (g, w, h) => {
      g.fillStyle = '#f2e8c8';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#a02020';
      g.font = `bold 22px ${JP}`;
      g.fillText('乗車券', 10, 28);
      g.fillStyle = '#333';
      g.font = '14px sans-serif';
      g.fillText('MUJIN  04:57', 10, 52);
    });
    for (const t of PLACES.tickets) {
      const m = board(slip, 0.36, 0.18, 0.9);
      m.position.set(t.x, 0.9, t.z);
      m.visible = false;
      this.tickets.push(m);
      this.root.add(m);
    }

    // ---- the shrine's rope: black, until a new one is tied ----
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4.6, 10), this.ropeMat);
    rope.rotation.z = Math.PI / 2;
    rope.position.set(PLACES.rope.x, PLACES.rope.y, PLACES.rope.z);
    this.root.add(rope);

    // ---- the PA desk in the ticket hall: a microphone with a red ON AIR lamp ----
    const desk = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 0.6), std(0x3a2a1c));
    desk.position.set(PLACES.mic.x, 0.45, PLACES.mic.z);
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.35, 6), std(0x222222, { metalness: 0.7 }));
    stand.position.set(PLACES.mic.x, 1.07, PLACES.mic.z);
    const micHead = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), std(0x333333, { metalness: 0.6 }));
    micHead.position.set(PLACES.mic.x, 1.27, PLACES.mic.z);
    this.micLamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.04), std(0x300606, { emissive: 0xff2020, emissiveIntensity: 0 }));
    this.micLamp.position.set(PLACES.mic.x, 1.9, PLACES.mic.z - 0.29);
    this.root.add(desk, stand, micHead, this.micLamp);

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

    // ---- the night: mist over each area it can take, mist walls across its gaps, a rope barrier with paper streamers
    // and a sign at each gap (built hidden; they rise when it takes the area) ----
    const no = canvasTex(256, 128, (g, w, h) => {
      g.fillStyle = '#efe9dc';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#a01818';
      g.textAlign = 'center';
      g.font = `bold 52px ${JP}`;
      g.fillText('立入禁止', w / 2, 62);
      g.fillStyle = '#1a1a1a';
      g.font = 'bold 22px sans-serif';
      g.fillText('THE NIGHT HAS TAKEN IT', w / 2, 104);
    });
    for (const s of SEALS) {
      const mats: THREE.ShaderMaterial[] = [];
      const objs: THREE.Object3D[] = [];
      const r = s.rect;
      const over = mistMaterial(false);
      const sheet = new THREE.Mesh(new THREE.BoxGeometry(r.x1 - r.x0, 6, r.z1 - r.z0), over);
      sheet.position.set((r.x0 + r.x1) / 2, 3, (r.z0 + r.z1) / 2);
      sheet.renderOrder = 5;
      mats.push(over);
      objs.push(sheet);
      for (const g of s.gaps) {
        const along = g.hx > g.hz;
        const wide = (along ? g.hx : g.hz) * 2 + 1;
        const wallMat = mistMaterial(true);
        const wall = new THREE.Mesh(new THREE.PlaneGeometry(wide, 7, 1, 1), wallMat);
        wall.position.set(g.x, 3.5, g.z);
        wall.rotation.y = along ? 0 : Math.PI / 2;
        wall.renderOrder = 6;
        mats.push(wallMat);
        objs.push(wall);
        // the barrier: two posts, a rope, paper streamers, the sign
        const barrier = new THREE.Group();
        const ux = along ? 1 : 0;
        const uz = along ? 0 : 1;
        const half = wide / 2 - 0.3;
        for (const sgn of [-1, 1]) {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.3, 8), std(0x5a3a22));
          post.position.set(g.x + ux * sgn * half, 0.65, g.z + uz * sgn * half);
          barrier.add(post);
        }
        const line = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, half * 2, 6), std(0xe8dcc0, { roughness: 1 }));
        line.position.set(g.x, 1.15, g.z);
        line.rotation.z = along ? Math.PI / 2 : 0;
        line.rotation.x = along ? 0 : Math.PI / 2;
        barrier.add(line);
        const paper = std(0xf4f2ec, { side: THREE.DoubleSide, roughness: 1 });
        for (let k = 0; k < 6; k++) {
          const f = -half + ((k + 0.5) / 6) * half * 2;
          const shide = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.32), paper);
          shide.position.set(g.x + ux * f, 0.98, g.z + uz * f);
          shide.rotation.y = along ? 0 : Math.PI / 2;
          shide.rotation.z = 0.25 * (k % 2 ? 1 : -1);
          barrier.add(shide);
        }
        const tag = board(no, 0.7, 0.35);
        tag.position.set(g.x, 1.55, g.z);
        tag.rotation.y = along ? 0 : Math.PI / 2;
        barrier.add(tag);
        const back = tag.clone();
        back.rotation.y += Math.PI;
        barrier.add(back);
        objs.push(barrier);
      }
      for (const o of objs) {
        o.visible = false;
        this.root.add(o);
      }
      this.nights.push({ mats, objs, fade: 0 });
    }

    // ---- Ren ----
    this.ren = new Avatar('Ren', 13, { weapon: 'none', helmet: false, tag: '', anime: animeModel(ANIMEOPS.ren, ANIMEOPS.fallback) });
    this.root.add(this.ren.root);
    this.ren.set(MUJIN.ren.x, y, MUJIN.ren.z, Math.PI, false);
  }

  /** Every frame: everything follows the jobs' state; the clock runs once wound; the mist rolls in. */
  update(dt: number, v: JobsView, viewer: { x: number; z: number }): void {
    this.time += dt;
    const t = this.time;
    // the lamps
    const lit = MujinJobs.lamps(v);
    this.lamps.forEach((m, i) => {
      const mat = m.material as THREE.MeshStandardMaterial;
      const on = (v.done & (1 << i)) !== 0;
      mat.emissiveIntensity = on ? 1.5 : 0;
      mat.color.set(on ? 0x30d070 : 0x1a1e1c);
    });
    this.lampLight.intensity = lit * 3;
    // the clock: stopped at 4:57 until wound
    if (MujinJobs.isDone(v, 'clock')) this.clockRunning = true;
    else this.clockRunning = false;
    const secs = this.clockRunning ? t : 0;
    const now = 4 * 3600 + 57 * 60 + secs;
    const tremble = this.clockRunning ? 0 : Math.sin(t * 40) * 0.02;
    this.hands.s.rotation.z = -((now % 60) / 60) * Math.PI * 2 + tremble;
    this.hands.m.rotation.z = -(((now / 60) % 60) / 60) * Math.PI * 2;
    this.hands.h.rotation.z = -(((now / 3600) % 12) / 12) * Math.PI * 2;
    // the key: turning in the tunnel mouth until taken
    this.key.visible = v.key === 0;
    this.key.rotation.y = t * 1.5;
    this.key.position.y = PLACES.key.y + 0.9 + Math.sin(t * 2) * 0.08;
    this.keyLight.intensity = v.key === 0 ? 6 : 0;
    // the breakers
    this.breakers.forEach((b, i) => {
      const on = (v.breakers & (1 << i)) !== 0;
      b.lever.rotation.x = on ? -0.7 : 0.7;
      const mat = b.lamp.material as THREE.MeshStandardMaterial;
      mat.emissive.set(on ? 0x40ff70 : 0xff2a1a);
      mat.emissiveIntensity = on ? 2.4 : 1 + Math.sin(t * 6) * 0.8;
    });
    // the crossing rings while it powers up, then for a while once it runs
    this.crossingOn = (v.breakers === 0b111 && !MujinJobs.isDone(v, 'crossing')) || (MujinJobs.isDone(v, 'crossing') && Math.floor(t / 20) % 3 === 0);
    this.crossLamps.forEach((m, i) => ((m.material as THREE.MeshStandardMaterial).emissiveIntensity = this.crossingOn && Math.floor(t / 0.36 + i) % 2 === 0 ? 3 : 0));
    // the tickets still lying where they fell
    this.tickets.forEach((m, i) => {
      m.visible = (v.ticketSet & (1 << i)) !== 0 && !(v.picked & (1 << i));
      m.rotation.y = t * 1.2 + i;
      m.position.y = 0.9 + Math.sin(t * 2.2 + i) * 0.07;
    });
    // the gates go blue when the tickets are back
    for (const m of this.gateLights) (m.material as THREE.MeshStandardMaterial).emissive.set(MujinJobs.isDone(v, 'tickets') ? 0x2aa0ff : 0xff1a1a);
    // the rope
    this.ropeMat.color.set(MujinJobs.isDone(v, 'rope') ? 0xe8dcc0 : 0x0c0a0a);
    // ON AIR while the announcement plays
    (this.micLamp.material as THREE.MeshStandardMaterial).emissiveIntensity = v.announcing && !MujinJobs.isDone(v, 'announce') ? 2 + Math.sin(t * 5) : 0;
    // the night's mist: rolls in over three seconds when it takes an area
    this.nights.forEach((n, i) => {
      const on = (v.sealed & (1 << i)) !== 0;
      n.fade = on ? Math.min(1, n.fade + dt / 3) : 0;
      for (const o of n.objs) o.visible = on;
      for (const m of n.mats) {
        m.uniforms.time!.value = t;
        m.uniforms.fade!.value = n.fade;
      }
    });
    // Ren
    const shown = v.ren === REN_STATE.here || v.ren === REN_STATE.safe;
    const inRoom = v.renX > MUJIN.bench.x - 6 && v.renX < MUJIN.bench.x + 5 && v.renZ < -9 && v.renZ > -22;
    this.ren.set(v.renX, inRoom ? 0.1 : PLATFORM_Y, v.renZ, Math.atan2(-(viewer.x - v.renX), -(viewer.z - v.renZ)), shown);
    if (shown) this.ren.update(dt);
  }

  /** Whether the crossing is ringing (the runtime plays its bells). */
  get crossingRinging(): boolean {
    return this.crossingOn;
  }

  dispose(): void {
    this.ren.dispose();
    this.root.removeFromParent();
  }
}
