/**
 * The Crimson Theatre (north, HIGH threat), where the Crimson Empress waits. Before: an 1890s kabuki theatre, its last
 * star Kurenai Sayo, and behind it the "wellness clinic" Kurenai Biotech built. During: the audience turned before the
 * curtain fell on her last show; the clinic's quarantine tents were torn open from the inside. Now: the Kurenai Court
 * lives here - red cloth on everything, an altar to Sayo built from her posters, bonfires, sentries - and the pagoda in
 * the garden is where the surge rises from.
 */
import * as THREE from 'three';
import type { SpireHandle } from '../../landmarks';
import { barrelGroup, corpse, crateGroup, debris, sandbagWall, tent, vehicle, chainlinkFence } from '../../props';
import { addBox, building, groundDecal, groundRect } from '../../structures';
import { stairwellDown } from '../storeys';
import type { Ctx } from '../util';
import { SITES, ZONES } from './consts';
import { MAT, cherryTree, grass, ivy, jpSignMaterial, lanternString, nobori, pagoda, petals, signBoard, stoneLantern, wallWords } from './props';

/** The lab's stairwell, behind the clinic: its doorway facing south into the clinic yard. */
export const LAB_KIOSK = { x: -12, z: -40, yaw: 0 };

export interface TheatreInfo {
  spire: SpireHandle;
  /** The theatre's stage (the haiku note lies on it) and the clinic's specimen room (an Easter egg spot is in the lab). */
  stage: { x: number; y: number; z: number };
  /** The Court's bonfires (they light the courtyard; the humans gather round them). */
  fires: { x: number; z: number }[];
}

/** A poster of Sayo's last show: a red silhouette in a fan dance, the title in brush letters. */
function posterMaterial(): THREE.MeshStandardMaterial {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 384;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#1a0a0c';
  g.fillRect(0, 0, 256, 384);
  const grad = g.createRadialGradient(128, 170, 10, 128, 170, 160);
  grad.addColorStop(0, '#c8243a');
  grad.addColorStop(1, '#1a0a0c');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 384);
  // the dancer: a silhouette with an open fan
  g.fillStyle = '#0c0405';
  g.beginPath();
  g.ellipse(128, 120, 22, 26, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(100, 150);
  g.quadraticCurveTo(128, 140, 156, 150);
  g.lineTo(190, 330);
  g.lineTo(66, 330);
  g.closePath();
  g.fill();
  g.fillStyle = '#e8c070';
  g.beginPath();
  g.moveTo(160, 150);
  g.arc(160, 150, 70, -1.9, -0.4);
  g.closePath();
  g.fill();
  g.fillStyle = '#f2e8d8';
  g.font = 'bold 44px "Yu Mincho", "MS Mincho", serif';
  g.textAlign = 'center';
  g.fillText('紅 小夜', 128, 362);
  g.font = 'bold 18px "Yu Gothic", sans-serif';
  g.fillText('最終公演', 128, 36);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 });
}

export function buildTheatre(c: Ctx, lab: { area: number; x: number; z: number; yaw: number }): TheatreInfo {
  const { b, d, rng } = c;
  const Z = ZONES.theatre;

  // ---- the compound wall, its gates (south on Kita-dori, east on Kamotsu-dori, a postern by the clinic) ----
  const wallSeg = (x0: number, z0: number, x1: number, z1: number): void => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 0.5) return;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    addBox(b, 'plaster', cx, 1.6, cz, alongX ? len : 0.5, 3.2, alongX ? 0.5 : len);
    addBox(b, MAT.tileRoof(), cx, 3.35, cz, alongX ? len : 0.9, 0.3, alongX ? 0.9 : len);
    b.collideBox(cx, cz, alongX ? len : 0.5, alongX ? 0.5 : len, 3.2, { mapKind: 'wall', tag: 'theatre-wall' });
  };
  wallSeg(Z.x0 + 0.5, Z.z1 - 0.5, 14, Z.z1 - 0.5);
  wallSeg(26, Z.z1 - 0.5, Z.x1 - 0.5, Z.z1 - 0.5);
  wallSeg(Z.x1 - 0.5, Z.z0 + 0.5, Z.x1 - 0.5, -44);
  wallSeg(Z.x1 - 0.5, -36, Z.x1 - 0.5, Z.z1 - 0.5);
  wallSeg(Z.x0 + 0.5, Z.z0 + 0.5, Z.x0 + 0.5, -36);
  wallSeg(Z.x0 + 0.5, -31, Z.x0 + 0.5, Z.z1 - 0.5);
  wallSeg(Z.x0 + 0.5, Z.z0 + 0.5, Z.x1 - 0.5, Z.z0 + 0.5);
  // the south gate: a big red gate frame, its doors gone; the Court's red cloth on it
  for (const x of [14, 26]) addBox(b, MAT.vermilion(), x, 2.5, Z.z1 - 0.5, 0.7, 5, 0.7);
  addBox(b, MAT.blackLacquer(), 20, 5.2, Z.z1 - 0.5, 13.5, 0.6, 1.2);
  signBoard(b, { x: 20, z: Z.z1 - 1.15, y: 4.2, rot: 0, w: 5, h: 0.9, text: '紅劇場', sign: { bg: '#2a0a0e', fg: '#f0d070', sub: 'KURENAI-ZA  (CRIMSON THEATRE)', worn: 0.7 } });
  vehicle(b, { x: 31, z: -23, rot: 2.6, kind: 'van', paint: 'white', burnt: true, wrecked: true, seed: 71 });
  wallWords(b, { x: 6, y: 1.8, z: Z.z1 - 0.2, rot: 0, w: 7, h: 1.4, text: '紅の宮廷\n女神は選んだ', color: '#c81a2a', drip: true });

  // ---- the theatre: a long hall under a deep tiled roof, Sayo's posters, banners, lanterns ----
  groundRect(b, 'concreteSlab', -16, -50, 64, -28, 0.024);
  building(b, {
    x: 20,
    z: -57,
    w: 40,
    d: 14,
    height: 9,
    wallMaterial: 'wood',
    roofMaterial: 'roof',
    floorMaterial: 'wood',
    sides: {
      S: { openings: [{ at: 12, width: 3.2, height: 3.4, kind: 'door' }, { at: 28, width: 3.2, height: 3.4, kind: 'door' }, { at: 20, width: 4, height: 2, sill: 4.5, kind: 'window' }] },
      E: { openings: [{ at: 7, width: 2.2, height: 2.8, kind: 'door' }] },
    },
    tag: 'theatre',
  });
  // the great roof: two slopes and a ridge
  for (const side of [-1, 1]) {
    const r = addBox(b, MAT.tileRoof(), 20, 11.2, -57 + side * 4.8, 44, 0.35, 10.6);
    r.rotation.x = side * 0.48;
    r.updateMatrixWorld(true);
  }
  addBox(b, MAT.blackLacquer(), 20, 13.4, -57, 45, 0.5, 0.6);
  // the façade: the name, Sayo's posters, red banners and lanterns
  signBoard(b, { x: 20, z: -49.85, y: 8.0, rot: 0, w: 12, h: 1.6, text: '紅劇場', sign: { bg: '#1a0608', fg: '#f0c050', sub: 'THE CRIMSON THEATRE', glow: 0.1, worn: 0.6 } });
  const poster = posterMaterial();
  for (const x of [4, 9, 31, 36]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 3.3), poster);
    p.position.set(x, 3.2, -49.85);
    b.addDynamic(p);
  }
  for (let x = 2; x <= 38; x += 6) nobori(b, { x, z: -48.6, text: '紅小夜', color: '#a8141e', torn: rng.f() < 0.4 });
  lanternString(c, { x0: 0, z0: -50.2, x1: 40, z1: -50.2, y: 6.6, lit: 0.5, seed: 91 });
  ivy(b, { x: 38.5, z: -49.9, rot: 0, w: 3, h: 7 });
  // inside: the stage at the north end (raised, steps up), rows of benches, the red curtain
  const stage = { x: 20, y: 1.2, z: -61 };
  addBox(b, 'wood', 20, 0.6, -61.5, 30, 1.2, 4.6);
  b.collide({ x: 20, z: -61.5, hx: 15, hz: 2.3, y1: 1.2, floor: true, surface: 'wood', mapKind: 'none', tag: 'stage' });
  for (const x of [5.5, 34.5]) {
    for (let i = 0; i < 4; i++) {
      addBox(b, 'wood', x, 0.15 + i * 0.3, -58.9 + i * -0.3, 2, 0.3, 0.3);
      b.collide({ x, z: -58.9 - i * 0.3, hx: 1, hz: 0.15, y1: 0.3 + i * 0.3, floor: true, surface: 'wood', mapKind: 'none', tag: 'stage-step' });
    }
  }
  const curtain = new THREE.MeshStandardMaterial({ color: 0x7a0a14, roughness: 0.9, side: THREE.DoubleSide });
  for (let k = 0; k < 6; k++) {
    const cm = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 6.5), curtain);
    cm.position.set(5 + k * 6, 4.6, -63.6);
    cm.rotation.y = (k % 2 ? 0.1 : -0.1);
    b.addDynamic(cm);
  }
  for (let r = 0; r < 4; r++) {
    for (const x of [10, 30]) {
      addBox(b, 'wood', x, 0.4, -55 + r * 1.6, 14, 0.12, 0.5);
      b.collideBox(x, -55 + r * 1.6, 14, 0.5, 0.45, { blocksShots: false, mapKind: 'none', tag: 'bench', surface: 'wood' });
    }
  }
  // the audience never left
  for (const [x, z] of [[8, -54], [14, -52.6], [26, -55], [31, -51.4], [20, -59.6]] as const) corpse(b, { x, z, rot: rng.f() * 6, kind: 'civilian', seed: Math.round(x * 7 + z) });

  // ---- the Court's camp in the courtyard: bonfires, red cloth, the altar, sentries ----
  const fires = [{ x: 8, z: -38 }, { x: 34, z: -36 }, { x: 52, z: -42 }];
  for (const f of fires) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.2, 6, 12), MAT.stoneDark());
    ring.rotation.x = Math.PI / 2;
    ring.position.set(f.x, 0.12, f.z);
    b.addDynamic(ring);
    addBox(b, 'burnt', f.x, 0.2, f.z, 0.9, 0.25, 0.9);
    b.light({ x: f.x, y: 1.0, z: f.z, color: 0xff6a20, intensity: 60, distance: 14, mode: 'flicker', pool: 4, glow: 1.2, tag: 'bonfire' });
    b.collideBox(f.x, f.z, 1.6, 1.6, 0.4, { mapKind: 'prop', tag: 'bonfire' });
  }
  // the altar to Sayo, under the façade: posters, candles, offerings
  addBox(b, MAT.blackLacquer(), 20, 0.5, -48.6, 5, 1, 1.4);
  b.collideBox(20, -48.6, 5, 1.4, 1, { mapKind: 'prop', tag: 'altar', surface: 'wood' });
  for (let i = 0; i < 12; i++) {
    const cnd = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.2 + rng.f() * 0.2, 6), new THREE.MeshStandardMaterial({ color: 0xf0e8d8, emissive: 0xffa040, emissiveIntensity: 0.6 }));
    cnd.position.set(18 + rng.f() * 4, 1.12, -48.3 - rng.f() * 0.6);
    b.addDynamic(cnd);
  }
  b.light({ x: 20, y: 1.4, z: -48, color: 0xff9040, intensity: 14, distance: 6, mode: 'flicker', pool: 2, glow: 0.4, tag: 'altar' });
  // red cloth hung on lines across the courtyard
  for (let i = 0; i < 4; i++) {
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.2), new THREE.MeshStandardMaterial({ color: 0x9a0a16, roughness: 1, side: THREE.DoubleSide }));
    cloth.position.set(-8 + i * 18, 3.1, -30.4);
    b.addDynamic(cloth);
  }
  sandbagWall(b, { x0: 12, z0: -30, x1: 17, z1: -30, height: 1.2 });
  sandbagWall(b, { x0: 23, z0: -30, x1: 28, z1: -30, height: 1.2 });
  sandbagWall(b, { x0: 60, z0: -46, x1: 60, z1: -34, height: 1.2 });
  tent(b, { x: 44, z: -31, rot: 0.1, kind: 'command', w: 7, d: 5 });
  tent(b, { x: -4, z: -31, rot: -0.1, kind: 'mess', w: 6, d: 4.4 });
  barrelGroup(b, { x: 54, z: -33, count: 5, radius: 1.6, seed: 93 });
  crateGroup(b, { x: 2, z: -44, count: 4, radius: 1.6, kind: 'wood', seed: 95 });

  // ---- the clinic: Kurenai Biotech's "wellness clinic", the quarantine tents torn from inside ----
  building(b, {
    x: -10,
    z: -57,
    w: 12,
    d: 14,
    height: 5,
    wallMaterial: 'labPanel',
    roofMaterial: 'roof',
    floorMaterial: 'labFloor',
    sides: { E: { openings: [{ at: 4, width: 2, height: 2.6, kind: 'door' }] }, S: { openings: [{ at: 6, width: 2.2, height: 2.6, kind: 'door' }] } },
    tag: 'clinic',
  });
  signBoard(b, { x: -10, z: -49.85, y: 4.3, rot: 0, w: 8, h: 0.8, text: '紅バイオ クリニック', sign: { bg: '#f0f0ee', fg: '#a8141e', sub: 'KURENAI BIOTECH WELLNESS', worn: 0.7 } });
  groundDecal(b, 'biohazard', -6, -46, 2.4, 2.4, 0.3);
  tent(b, { x: -4, z: -44, rot: 1.2, kind: 'medical', w: 5, d: 3.4 });
  chainlinkFence(b, { x0: -17, z0: -48, x1: -1, z1: -48, height: 2.4, damaged: true, barbed: true, gaps: [{ at: 5, width: 3 }] });
  corpse(b, { x: -8, z: -45, rot: 0.6, kind: 'hazmat', seed: 77 });
  corpse(b, { x: -2, z: -47, rot: 2.4, kind: 'hazmat', seed: 78 });
  stairwellDown(c, LAB_KIOSK, lab, { wall: 'labPanel', sign: jpSignMaterial('関係者以外立入禁止', { bg: '#f0f0ee', fg: '#a8141e', aspect: 4.8, sub: 'STAFF ONLY', worn: 0.6 }) });

  // ---- the pagoda garden ----
  groundRect(b, 'gravel', 44, -64, 64, -48, 0.026);
  const P = SITES.hazard;
  const pg = pagoda(b, { x: P.x, z: P.z });
  for (const [x, z] of [[47, -50], [63, -50], [47, -63], [63, -63]] as const) stoneLantern(b, { x, z, lit: rng.f() < 0.5 });
  for (const [x, z, s] of [[-14, -62, 1.1], [44, -28, 1.2], [64, -30, 1.0], [-15, -30, 0.9]] as const) {
    cherryTree(c, { x, z, scale: s, rot: rng.f() * 6 });
    petals(b, { x, z, r: 3.5 * s });
  }
  grass(c, { x0: Z.x0 + 1, z0: -49.5, x1: Z.x1 - 1, z1: Z.z1 - 1.2, density: 0.06, seed: 401, avoid: (x, z) => fires.some((f) => Math.hypot(f.x - x, f.z - z) < 2.4) });
  debris(b, { x: 30, z: -42, radius: 6, density: 0.5, seed: 41 });
  // the pagoda's finial: a glass orb that glows the colour of the surge
  const orbMat = new THREE.MeshStandardMaterial({ color: 0x2a0a10, emissive: 0xff4a6a, emissiveIntensity: 0.7, roughness: 0.3 });
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), orbMat);
  orb.position.set(P.x, pg.topY + 0.3, P.z);
  b.addDynamic(orb);
  let surge = false;
  b.tick((_dt, t) => {
    orbMat.emissiveIntensity = surge ? 2.6 + Math.sin(t * 9) * 1.2 : 0.7 + Math.sin(t * 1.4) * 0.25;
  });
  const spire: SpireHandle = {
    top: { x: P.x, y: pg.topY, z: P.z },
    setSurge(on: boolean) {
      surge = on;
      orbMat.emissive.set(on ? 0xff1a2a : 0xff4a6a);
    },
  };

  // ---- gameplay ----
  d.crate(56, -45, 0.4, 'high');
  d.crate(-2, -38, 1.2, 'high');
  d.crate(38, -62, 0, 'high');
  d.crate(-14, -52, 0.8, 'high');
  d.spawn('high', 'general', [[-16, -64], [64, -64], [64, -28], [-16, -28], [20, -64]], 1.2);
  d.zombies('high', 'shambler', [[0, -34], [12, -44], [30, -46], [44, -38], [56, -30], [-8, -36], [24, -33], [48, -52]]);
  d.zombies('high', 'runner', [[6, -30], [40, -44], [58, -58]]);
  d.zombies('high', 'armored', [[20, -36], [-10, -42], [36, -30]]);
  return { spire, stage, fires };
}
