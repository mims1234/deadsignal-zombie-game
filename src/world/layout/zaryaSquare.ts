/**
 * ZARYA SQUARE (`zarya/places.ts`), built from `research_notes/zarya/refs/sq-*.webp`: the tram line and tram No. 1
 * along the north, the Palace of Culture on the west, the ice town and its slide in the south-west, the town fir tree
 * and the stage in the middle, the fair's two rows of kiosks, panel blocks behind the fence to the south.
 */
import * as THREE from 'three';
import { groundRect, solidBlock } from '../structures';
import type { Ctx } from './util';
import { CORE, KIOSKS, LAMPS, LINE_PORTALS, SQUARE, ZARYA, type KioskKind } from '../../zarya/places';
import { AT, SHUTTERS } from '../../zarya/story';
import { shutterKiosk } from './zaryaShutters';
import { GOODS, Z, ball, bench, box, bulbString, cyl, firTree, goods, lampPost, slab, solid } from './zaryaKit';

const B = CORE;
const P = ZARYA;

function kiosk(c: Ctx, kind: KioskKind, x: number, z: number, face: 1 | -1, i: number): void {
  const { b } = c;
  const fx = x + face * 1.5;
  box(b, Z.woodDark, x, 0.1, z, 3.2, 0.2, 5);
  box(b, Z.wood, x - face * 1.5, 1.35, z, 0.14, 2.5, 5); // back
  box(b, Z.warm, x - face * 1.42, 1.7, z, 0.02, 1.2, 4.4, 0, false); // lit from inside
  for (const s of [-1, 1]) box(b, Z.wood, x, 1.35, z + s * 2.43, 3, 2.5, 0.14);
  box(b, Z.wood, fx, 0.6, z, 0.14, 1.0, 5); // the counter's front
  box(b, Z.woodPale, fx + face * 0.12, 1.12, z, 0.7, 0.07, 5, 0, false);
  for (const s of [-1, 1]) box(b, Z.woodDark, fx, 1.35, z + s * 2.43, 0.16, 2.5, 0.16);
  // a pitched roof under snow, ridge along the kiosk
  for (const s of [-1, 1]) {
    slab(b, Z.woodDark, x + s * 0.95, 2.95, z, 2.2, 0.1, 5.6, 0, 0, -s * 0.42);
    slab(b, Z.snow, x + s * 0.95, 3.06, z, 2.1, 0.14, 5.5, 0, 0, -s * 0.42, false);
  }
  for (const s of [-1, 1]) box(b, Z.wood, x, 2.85, z + s * 2.43, 3, 0.55, 0.12);
  // the striped awning over the counter
  for (let k = 0; k < 10; k++) slab(b, k % 2 ? Z.white : Z.red, fx + face * 0.62, 2.3, z - 2.25 + k * 0.5, 1.35, 0.05, 0.5, 0, 0, -face * 0.34, false);
  bulbString(b, fx + face * 1.2, 2.1, z - 2.5, fx + face * 1.2, 2.1, z + 2.5, 12, 0.08);
  // what it sells, on the counter and on the shelf behind
  const g = (y: number, off: number, mats?: readonly THREE.Material[], h?: number): void => goods(b, x + face * off, y, z, 4.2, true, 40 + i * 7 + Math.round(y * 10), { mats, h });
  box(b, Z.woodPale, x - face * 1.1, 1.5, z, 0.5, 0.05, 4.6, 0, false);
  if (kind === 'tea') {
    cyl(b, Z.brass, fx + face * 0.1, 1.16, z - 1.2, 0.2, 0.16, 0.5, 10);
    cyl(b, Z.brass, fx + face * 0.1, 1.66, z - 1.2, 0.07, 0.05, 0.22, 8);
    g(1.16, 1.55, [Z.white, Z.cream], 0.12);
    g(1.53, -1.1, [Z.brass, Z.white], 0.2);
  } else if (kind === 'fireworks') {
    // rockets standing in boxes, and boxes of flare cartridges
    for (let k = 0; k < 9; k++) {
      const pz = z - 1.9 + k * 0.42;
      cyl(b, GOODS[k % 4]!, fx + face * 0.1, 1.16, pz, 0.05, 0.05, 0.34, 6);
      cyl(b, Z.red, fx + face * 0.1, 1.5, pz, 0.06, 0, 0.14, 6);
    }
    g(1.53, -1.1, [Z.red, Z.orange, Z.gold], 0.3);
    box(b, Z.redDark, fx - face * 0.2, 1.24, z + 2.0, 0.4, 0.18, 0.5);
  } else if (kind === 'ski') {
    // skis and poles stood against the front, skates on the shelf
    for (let k = 0; k < 7; k++) slab(b, GOODS[k % GOODS.length]!, fx + face * 0.5, 0.95, z - 2.1 + k * 0.28, 0.05, 1.9, 0.09, 0, 0, face * 0.12);
    for (let k = 0; k < 6; k++) slab(b, Z.steel, fx + face * 0.52, 0.72, z + 0.4 + k * 0.26, 0.025, 1.4, 0.025, 0, 0, face * 0.14);
    g(1.53, -1.1, [Z.white, Z.black], 0.2);
  } else if (kind === 'toys' || kind === 'souvenirs') {
    g(1.16, 1.55, undefined, 0.22);
    g(1.53, -1.1, undefined, 0.3);
    // a row of matryoshkas
    for (let k = 0; k < 5; k++) {
      const s = 1 - k * 0.14;
      cyl(b, k % 2 ? Z.red : Z.gold, fx + face * 0.12, 1.16, z + 1.1 + k * 0.24, 0.09 * s, 0.07 * s, 0.24 * s, 8);
      ball(b, Z.cream, fx + face * 0.12, 1.16 + 0.27 * s, z + 1.1 + k * 0.24, 0.065 * s);
    }
  } else if (kind === 'mittens') {
    g(1.16, 1.55, undefined, 0.1);
    g(1.53, -1.1, undefined, 0.16);
  } else {
    // pastries and blini: trays of pale things, a hot plate
    g(1.16, 1.55, [Z.woodPale, Z.cream, Z.gold], 0.1);
    g(1.53, -1.1, [Z.woodPale, Z.cream], 0.14);
    box(b, Z.iron, fx - face * 0.3, 1.2, z - 1.6, 0.5, 0.1, 0.7);
  }
  solid(c, x, z, 3.2, 5, 2.8, 'zarya-kiosk', { kind: 'building', surface: 'wood' });
  b.light({ x: x + face * 2.4, y: 2.2, z, color: 0xffb46a, intensity: 14, distance: 12, mode: 'steady', pool: 4.5, weight: 0.7 });
}

/** One car of tram No. 1: an open shell you can see into, lit from inside. Its doors (south side) stand open. */
function tramCar(c: Ctx, x0: number, x1: number, z: number, cab: boolean, doorSide: 1 | -1 = 1): void {
  const { b } = c;
  const len = x1 - x0;
  const xc = (x0 + x1) / 2;
  const hw = 1.25;
  box(b, Z.iron, xc, 0.3, z, len - 3, 0.5, 2); // underframe and bogies
  for (const s of [-1, 1]) box(b, Z.black, xc + s * (len / 2 - 2.6), 0.3, z, 2.2, 0.6, 2.3);
  box(b, Z.woodDark, xc, 0.8, z, len, 0.2, hw * 2);
  box(b, Z.grey, xc, 3.02, z, len + 0.1, 0.16, hw * 2 + 0.1);
  box(b, Z.cream, xc, 3.14, z, len - 0.8, 0.12, hw * 2 - 0.5);
  box(b, Z.warm, xc, 2.9, z, len - 1.2, 0.03, 0.5, 0, false);
  const doors = [x0 + 2.2, x1 - 2.2];
  for (const s of [-1, 1]) {
    const zz = z + s * hw;
    // lower panels in red (with gaps for the doors on the south side), the cream band, the window posts
    let cur = x0;
    const gaps = s === doorSide ? doors : [];
    for (const dx of [...gaps, x1 + 1]) {
      const end = Math.min(x1, dx - 0.7);
      if (end > cur) {
        box(b, Z.red, (cur + end) / 2, 1.3, zz, end - cur, 0.9, 0.08);
        box(b, Z.cream, (cur + end) / 2, 1.83, zz, end - cur, 0.16, 0.08, 0, false);
      }
      cur = dx + 0.7;
    }
    box(b, Z.cream, xc, 2.78, zz, len, 0.32, 0.08);
    for (let px = x0 + 0.05; px <= x1; px += 1.75) box(b, Z.cream, px, 2.27, zz, 0.12, 0.72, 0.08, 0, false);
  }
  for (const [ex, s] of [[x0, -1], [x1, 1]] as const) {
    box(b, Z.red, ex, 1.3, z, 0.08, 0.9, hw * 2);
    box(b, Z.cream, ex, 2.78, z, 0.08, 0.32, hw * 2);
    for (const q of [-1, 0, 1]) box(b, Z.cream, ex, 2.27, z + q * hw * 0.98, 0.08, 0.72, 0.1, 0, false);
    if (cab && s === 1) for (const q of [-1, 1]) ball(b, Z.bulb, ex + 0.06, 1.15, z + q * 0.8, 0.13);
  }
  // seats down the north side, a pole or two
  for (let px = x0 + 1.4; px < x1 - 2.4; px += 1.5) {
    box(b, Z.redDark, px, 1.15, z - 0.75, 0.9, 0.5, 0.8);
    box(b, Z.redDark, px - 0.4, 1.6, z - 0.75, 0.1, 0.5, 0.8, 0, false);
  }
  // the pantograph
  for (const s of [-1, 1]) slab(b, Z.iron, xc + s * 0.7, 3.9, z, 0.05, 1.6, 0.05, 0, 0, s * 0.7, false);
  box(b, Z.iron, xc, 4.5, z, 0.08, 0.06, 1.6, 0, false);
  solid(c, xc, z, len, hw * 2, 3.1, 'zarya-tram', { kind: 'building', surface: 'metal' });
  b.light({ x: xc, y: 2.4, z: z + doorSide * 2.6, color: 0xffc27a, intensity: 12, distance: 11, mode: 'steady', pool: 4, weight: 0.6 });
}

/**
 * The end of a track at x (the track running on east from it): a buffer stop. Two struts from each rail lean back to a
 * red-and-white beam across the track, a red lamp on it (in finishes the zones already batch, casting nothing: the
 * lamp's light is the glow field).
 */
function bufferStop(c: Ctx, x: number, z: number): void {
  const { b } = c;
  for (const s of [-1, 1]) {
    const zz = z + s * 0.72;
    box(b, Z.black, x + 0.15, 0.45, zz, 0.14, 0.9, 0.14, 0, false);
    slab(b, Z.black, x + 0.95, 0.45, zz, 1.75, 0.1, 0.12, 0, 0, 0.5, false);
  }
  box(b, Z.redDark, x + 0.05, 0.85, z, 0.32, 0.34, 2.7, 0, false);
  for (const dz of [-0.9, 0, 0.9]) box(b, Z.white, x + 0.05, 0.85, z + dz, 0.34, 0.35, 0.3, 0, false);
  box(b, Z.snow, x + 0.05, 1.06, z, 0.36, 0.08, 2.74, 0, false);
  box(b, Z.black, x - 0.05, 1.2, z + 1.05, 0.08, 0.4, 0.08, 0, false);
  box(b, Z.black, x - 0.05, 1.5, z + 1.05, 0.2, 0.3, 0.2, 0, false);
  box(b, Z.redDark, x + 0.07, 1.52, z + 1.05, 0.06, 0.14, 0.14, 0, false);
  b.glow({ x: x + 0.2, y: 1.52, z: z + 1.05, color: 0xff3020, size: 0.7, intensity: 2, mode: 'steady' });
  solid(c, x + 0.75, z, 1.7, 2.8, 1.1, 'zarya-buffer', { shots: false, kind: 'prop', surface: 'metal' });
}

/**
 * A stop on Line One somewhere else in town: sixty metres of track and wire, a two-car tram standing on it with its
 * doors open on `doorSide` (+1 south, -1 north), a stop sign. (The square builds its own, with the shelter and the
 * fuse box.) The track runs from `o.from` to `o.to` (sixty metres round the stop unless the frame carries it on to the
 * zone's portals, `LINE_PORTALS`), a pole every 26 m along it; `o.buffer` ends it at its west end in a buffer stop.
 */
export function tramStop(c: Ctx, x: number, z: number, doorSide: 1 | -1, avoid: readonly { x: number; z: number }[] = [], o: { from?: number; to?: number; buffer?: boolean } = {}): void {
  const { b } = c;
  const from = o.from ?? x - 30;
  const to = o.to ?? x + 30;
  for (const s of [-1, 1]) box(b, Z.steel, (from + to) / 2, 0.05, z + s * 0.72, to - from, 0.09, 0.08, 0, false);
  box(b, Z.black, (from + to) / 2, 5.5, z, to - from, 0.03, 0.03, 0, false);
  for (let k = Math.ceil((from + 4 - x) / 26); x + k * 26 <= to - 4; k++) {
    const dx = k * 26;
    // no pole in a gate's way (a stop near a zone's edge)
    if (avoid.some((a) => Math.hypot(a.x - (x + dx), a.z - (z - doorSide * 3.2)) < 10)) continue;
    cyl(b, Z.iron, x + dx, 0, z - doorSide * 3.2, 0.14, 0.1, 6.2, 8);
    box(b, Z.iron, x + dx, 5.9, z - doorSide * 1.6, 0.07, 0.07, 3.2, 0, false);
    solid(c, x + dx, z - doorSide * 3.2, 0.3, 0.3, 6.2, 'zarya-pole', { kind: 'none', surface: 'metal' });
  }
  groundRect(b, Z.packed, from, z - 2.2, to, z + 2.2, 0.012);
  if (o.buffer) bufferStop(c, from, z);
  tramCar(c, x - 16, x - 0.5, z, false, doorSide);
  tramCar(c, x + 0.5, x + 16, z, true, doorSide);
  box(b, Z.black, x, 1.6, z, 1.2, 1.6, 1.6);
  cyl(b, Z.iron, x + 19, 0, z + doorSide * 2.6, 0.06, 0.06, 3, 6);
  box(b, Z.red, x + 19, 2.8, z + doorSide * 2.6, 0.7, 0.5, 0.05);
}

function tramLine(c: Ctx): void {
  const { b } = c;
  const z = P.trackZ;
  // rails and the wire, from the portal under the Palace's north wing (`LINE_PORTALS` 'square': the frame builds it)
  // to the edge of the square's zone (the store's zone carries them on)
  const west = LINE_PORTALS.find((q) => q.id === 'square')!;
  const w0 = west.x1;
  for (const s of [-1, 1]) box(b, Z.steel, (w0 + 68) / 2, 0.05, z + s * 0.72, 68 - w0, 0.09, 0.08, 0, false);
  box(b, Z.black, (w0 + 68) / 2, 5.5, z, 68 - w0, 0.03, 0.03, 0, false);
  for (let x = B.minX + 10; x < 68; x += 26) {
    if (x < w0 + 3) continue;
    cyl(b, Z.iron, x, 0, z - 3.6, 0.14, 0.1, 6.2, 8);
    box(b, Z.iron, x, 5.9, z - 1.8, 0.07, 0.07, 3.6, 0, false);
    solid(c, x, z - 3.6, 0.3, 0.3, 6.2, 'zarya-pole', { kind: 'none', surface: 'metal' });
  }
  groundRect(b, Z.packed, w0, z - 2.2, 68, z + 2.2, 0.012);
  // the stop: a roofed shelter with its back to the square, a bench, the stop's sign
  const s = P.stop;
  box(b, Z.snow, s.x, 2.78, s.z, 7.4, 0.2, 2.6, 0, false);
  box(b, Z.woodDark, s.x, 2.64, s.z, 7.2, 0.1, 2.4);
  for (const dx of [-3.4, 0, 3.4]) for (const dz of [-1, 1]) box(b, Z.woodDark, s.x + dx, 1.3, s.z + dz, 0.14, 2.6, 0.14);
  box(b, Z.snowBlue, s.x, 1.45, s.z + 1.05, 6.8, 1.7, 0.06);
  box(b, Z.wood, s.x, 0.5, s.z + 0.6, 5, 0.08, 0.5);
  box(b, Z.warm, s.x, 2.56, s.z, 3, 0.03, 0.2, 0, false);
  solid(c, s.x, s.z + 1.05, 6.8, 0.2, 2.6, 'zarya-stop', { kind: 'prop', surface: 'wood' });
  b.light({ x: s.x, y: 2.3, z: s.z - 0.4, color: 0xffc27a, intensity: 12, distance: 11, mode: 'steady', pool: 4, weight: 0.8 });
  cyl(b, Z.iron, s.x + 5, 0, s.z - 0.8, 0.06, 0.06, 3, 6);
  box(b, Z.red, s.x + 5, 2.8, s.z - 0.8, 0.7, 0.5, 0.05);
  // the fuse box on its pole (the spare that should be in it is not)
  const f = P.fuseBox;
  cyl(b, Z.woodDark, f.x, 0, f.z, 0.13, 0.11, 5.8, 8);
  box(b, Z.grey, f.x, 1.35, f.z + 0.2, 0.5, 0.7, 0.24);
  slab(b, Z.grey, f.x + 0.42, 1.35, f.z + 0.42, 0.5, 0.7, 0.03, 0, 1.1, 0, false);
  box(b, Z.black, f.x, 1.35, f.z + 0.3, 0.4, 0.58, 0.06, 0, false);
  solid(c, f.x, f.z, 0.5, 0.5, 5.8, 'zarya-pole', { kind: 'none', surface: 'wood' });
  // tram No. 1: two cars, the cab at the east end
  const t = P.tram;
  const half = (t.x1 - t.x0 - 1) / 2;
  tramCar(c, t.x0, t.x0 + half, z, false);
  tramCar(c, t.x1 - half, t.x1, z, true);
  box(b, Z.black, (t.x0 + t.x1) / 2, 1.6, z, 1.2, 1.6, 1.6);
  // the wall along the far side of the line, and the town going on behind it
  box(b, Z.concreteDark, (west.x0 + 68) / 2, 1.3, z - 6.6, 68 - west.x0, 2.6, 0.3);
  box(b, Z.snow, (west.x0 + 68) / 2, 2.66, z - 6.6, 68 - west.x0, 0.14, 0.44, 0, false);
}

function palace(c: Ctx): void {
  const { b } = c;
  const q = P.palace;
  const zc = (q.z0 + q.z1) / 2;
  const d = q.z1 - q.z0;
  const pass = 2.2;
  for (const [m0, m1] of [[q.z0, zc - pass], [zc + pass, q.z1]] as const) box(b, Z.cream, (q.x0 + q.x1) / 2, 6.5, (m0 + m1) / 2, q.x1 - q.x0, 13, m1 - m0);
  box(b, Z.cream, (q.x0 + q.x1) / 2, 9.1, zc, q.x1 - q.x0, 7.8, pass * 2);
  box(b, Z.woodDark, (q.x0 + q.x1) / 2, 0.03, zc, q.x1 - q.x0, 0.06, pass * 2, 0, false);
  // the passage through the front block to the foyer: indoors (a roof: no snow falls in it), the red carpet running
  // on from the doors to the foyer's, dark panelling to the shoulder, a lamp on each wall half way (the doors
  // themselves are the story's: `zarya/look.ts` swings them in from the square once the tickets are bought)
  const px = (q.x0 + q.x1) / 2;
  const plen = q.x1 - q.x0;
  b.collide({ x: px, z: zc, hx: plen / 2, hz: pass, y0: 5.2, y1: 5.6, mapKind: 'none', tag: 'roof' });
  box(b, Z.redDark, px - 0.3, 0.07, zc, plen - 0.6, 0.02, 2.8, 0, false);
  for (const s of [-1, 1]) {
    box(b, Z.gold, px - 0.3, 0.075, zc + s * 1.46, plen - 0.6, 0.02, 0.12, 0, false);
    box(b, Z.woodDark, px, 0.65, zc + s * (pass - 0.03), plen, 1.3, 0.06, 0, false);
    box(b, Z.gold, px, 1.32, zc + s * (pass - 0.05), plen, 0.06, 0.08, 0, false);
    for (const x of [q.x0 + 6.5, q.x1 - 6.5]) {
      box(b, Z.gold, x, 3.0, zc + s * (pass - 0.2), 0.06, 0.06, 0.34, 0, false);
      ball(b, Z.bulb, x, 3.15, zc + s * (pass - 0.38), 0.14);
    }
  }
  b.light({ x: px, y: 4.2, z: zc, color: 0xffcf96, intensity: 14, distance: 14, mode: 'steady', pool: 4, weight: 0.6 });
  box(b, Z.snow, (q.x0 + q.x1) / 2, 13.1, zc, q.x1 - q.x0 + 0.6, 0.25, d + 0.6, 0, false);
  // the portico: steps, eight columns, the entablature and a stepped pediment
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) box(b, Z.concrete, q.x1 + 1.6 - i * 0.5, 0.125 + i * 0.25, zc + s * ((d - 8) / 4 + 1.6), 4.6 - i, 0.25, (d - 8) / 2 - 3.2);
  for (let i = 0; i < 8; i++) {
    const z = q.z0 + 7 + (i * (d - 14)) / 7;
    cyl(b, Z.white, q.x1 + 1.9, 0.75, z, 0.62, 0.52, 8.6, 12);
    box(b, Z.white, q.x1 + 1.9, 0.9, z, 1.5, 0.3, 1.5);
    box(b, Z.white, q.x1 + 1.9, 9.45, z, 1.4, 0.25, 1.4);
  }
  box(b, Z.cream, q.x1 + 1.5, 10.3, zc, 3.4, 1.5, d - 8);
  for (let i = 0; i < 4; i++) box(b, Z.cream, q.x1 + 1.5, 11.4 + i * 0.6, zc, 3.2, 0.6, (d - 10) * (1 - i * 0.24));
  box(b, Z.snow, q.x1 + 1.5, 11.12, zc, 3.6, 0.14, d - 7.6, 0, false);
  // tall doors (shut), tall windows lit behind them
  for (let i = 0; i < 7; i++) {
    const z = q.z0 + 9.5 + (i * (d - 19)) / 6;
    if (i !== 3) box(b, Z.warm, q.x1 + 0.04, 4.4, z, 0.08, 4.6, 1.7, 0, false);
  }
  for (const [m0, m1] of [[q.z0, zc - pass], [zc + pass, q.z1]] as const) {
    solid(c, (q.x0 + q.x1) / 2, (m0 + m1) / 2, q.x1 - q.x0, m1 - m0, 13, 'zarya-palace', { kind: 'building' });
    // the steps either side of the way in
    solid(c, q.x1 + 1.6, (m0 + m1) / 2 + (m0 < zc - pass - 1 ? 1.6 : -1.6), 3.4, m1 - m0 - 6.4, 0.75, 'zarya-palace', { kind: 'none', shots: false });
  }
  for (let i = 0; i < 8; i++) solid(c, q.x1 + 1.9, q.z0 + 7 + (i * (d - 14)) / 7, 1.3, 1.3, 9, 'zarya-palace', { kind: 'none' });
  for (const z of [q.z0 + 6, zc, q.z1 - 6]) b.light({ x: q.x1 + 5, y: 4, z, color: 0xffc888, intensity: 16, distance: 18, mode: 'steady', pool: 6, weight: 0.6 });
  // a pair of firs by the steps
  firTree(b, q.x1 + 4, q.z0 + 2, 7);
  firTree(b, q.x1 + 4, q.z1 - 1, 6);
  ticketBooth(c);
}

/**
 * The pageant's box office on the square, at the foot of the south steps: a little lit booth whose window faces north,
 * onto the story's ticket spot (`AT.tickets`), so the three tickets are bought from somebody's window, not thin air.
 * Plain finishes only (they merge into batches the square already draws).
 */
function ticketBooth(c: Ctx): void {
  const { b } = c;
  const x = AT.tickets.x;
  const fz = AT.tickets.z + 0.6; // the window's face
  const w = 1.8;
  const d = 2.2;
  const z = fz + d / 2;
  box(b, Z.woodDark, x, 0.1, z, w + 0.1, 0.2, d + 0.1);
  box(b, Z.cream, x, 1.35, z + 0.07, w, 2.5, d - 0.14); // the body
  box(b, Z.woodDark, x, 0.45, fz + 0.02, w + 0.04, 0.7, 0.06); // the panel under the window
  box(b, Z.warm, x, 1.45, fz + 0.03, 1.2, 0.85, 0.04, 0, false); // the lit window
  for (const dx of [-0.62, 0, 0.62]) box(b, Z.woodDark, x + dx, 1.45, fz - 0.01, 0.06, 0.95, 0.06, 0, false);
  box(b, Z.woodPale, x, 0.98, fz - 0.14, 1.4, 0.06, 0.3, 0, false); // the little counter
  box(b, Z.red, x, 2.38, fz - 0.02, 1.5, 0.36, 0.05, 0, false); // the box office's sign
  box(b, Z.gold, x, 2.38, fz - 0.03, 1.1, 0.08, 0.04, 0, false);
  box(b, Z.woodDark, x, 2.7, z, w + 0.4, 0.14, d + 0.4); // the roof
  box(b, Z.snow, x, 2.82, z, w + 0.3, 0.12, d + 0.3, 0, false);
  solid(c, x, z, w, d, 2.8, 'zarya-kassa', { kind: 'prop', surface: 'wood' });
}

function iceTown(c: Ctx): void {
  const { b } = c;
  const I = P.ice;
  const wallRun = (x0: number, z0: number, x1: number, z1: number): void => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    box(b, Z.ice, cx, 1.1, cz, alongX ? len : 1.1, 2.2, alongX ? 1.1 : len);
    // crenels, and the block courses scored into it
    const n = Math.floor(len / 2);
    for (let i = 0; i < n; i++) {
      const t = -len / 2 + (i + 0.5) * (len / n);
      box(b, Z.ice, alongX ? cx + t : cx, 2.5, alongX ? cz : cz + t, alongX ? 1 : 1.1, 0.6, alongX ? 1.1 : 1, 0, false);
    }
    solid(c, cx, cz, alongX ? len : 1.1, alongX ? 1.1 : len, 2.4, 'zarya-ice');
  };
  const tower = (x: number, z: number, h: number, r: number): void => {
    cyl(b, Z.ice, x, 0, z, r, r * 0.92, h, 10);
    cyl(b, Z.ice, x, h, z, r * 1.25, 0, h * 0.45, 10, false);
    cyl(b, Z.redLamp, x, h * 1.45, z, 0.07, 0.07, 0.3, 5, false);
    solid(c, x, z, r * 1.8, r * 1.8, h, 'zarya-ice');
  };
  // the walls: a gate arch in the north wall, the east side open at the foot of the slide
  const gx = -56;
  wallRun(I.x0, I.z0, gx - 3.5, I.z0);
  wallRun(gx + 3.5, I.z0, I.x1, I.z0);
  wallRun(I.x0, I.z0, I.x0, I.z1);
  wallRun(I.x0, I.z1, I.x1, I.z1);
  wallRun(I.x1, I.z0, I.x1, 26);
  wallRun(I.x1, 46, I.x1, I.z1);
  for (const [x, z] of [[I.x0, I.z0], [I.x1, I.z0], [I.x0, I.z1], [I.x1, I.z1]] as const) tower(x, z, 4.2, 1.4);
  tower(gx - 3.6, I.z0, 6.4, 1.5);
  tower(gx + 3.6, I.z0, 6.4, 1.5);
  box(b, Z.ice, gx, 4.4, I.z0, 5.4, 1.2, 1.2);
  tower(I.x1, 26, 3.4, 1.1);
  tower(I.x1, 46, 3.4, 1.1);
  // the statues: the Snow Maiden, a bear, a snowman, small firs of ice
  const maiden = (x: number, z: number): void => {
    box(b, Z.ice, x, 0.3, z, 1.6, 0.6, 1.6);
    cyl(b, Z.ice, x, 0.6, z, 0.75, 0.3, 2.2, 10);
    ball(b, Z.ice, x, 3.05, z, 0.3);
    cyl(b, Z.ice, x, 3.25, z, 0.34, 0.1, 0.4, 8, false);
    slab(b, Z.ice, x + 0.5, 2.5, z, 0.9, 0.16, 0.16, 0, 0, 0.5, false);
    solid(c, x, z, 1.6, 1.6, 3, 'zarya-ice');
  };
  const bear = (x: number, z: number): void => {
    box(b, Z.ice, x, 0.3, z, 2, 0.6, 2);
    ball(b, Z.ice, x, 1.5, z, 0.95, 1.1, 10);
    ball(b, Z.ice, x, 2.75, z, 0.55, 1, 10);
    for (const s of [-1, 1]) {
      ball(b, Z.ice, x + s * 0.4, 3.2, z, 0.18);
      ball(b, Z.ice, x + s * 0.7, 1.9, z + 0.5, 0.3);
    }
    solid(c, x, z, 2, 2, 3.2, 'zarya-ice');
  };
  maiden(-66, 24);
  bear(-44, 22);
  for (const [x, z] of [[-75.4, 29.5], [-40, 49]] as const) {
    for (let i = 0; i < 3; i++) ball(b, Z.snow, x, 0.55 + i * 0.85 - i * i * 0.07, z, 0.62 - i * 0.14, 1, 9);
    solid(c, x, z, 1.2, 1.2, 2.2, 'zarya-ice', { kind: 'none' });
  }
  for (const [x, z, h] of [[-60, 47, 3], [-52, 49, 2.4], [-38, 30, 2.6], [-74, 22, 2.2]] as const) {
    cyl(b, Z.ice, x, 0, z, h * 0.3, 0, h, 7);
    solid(c, x, z, h * 0.4, h * 0.4, h, 'zarya-ice', { kind: 'none' });
  }
  // the slide: a wooden tower at its west end with a stair up the back, and the ice running down to the east
  const S = P.slide;
  const tx = S.x0 - 2;
  for (const dx of [-1.8, 1.8]) for (const dz of [-1.5, 1.5]) box(b, Z.wood, tx + dx, (S.top + 2.4) / 2, S.z + dz, 0.2, S.top + 2.4, 0.2);
  box(b, Z.woodPale, tx, S.top - 0.08, S.z, 4, 0.16, 3.4);
  for (const dz of [-1.6, 1.6]) box(b, Z.wood, tx, S.top + 0.9, S.z + dz, 3.8, 0.1, 0.1, 0, false);
  for (const s of [-1, 1]) slab(b, Z.red, tx + s * 1.05, S.top + 2.75, S.z, 2.5, 0.1, 3.8, 0, 0, -s * 0.5, false);
  // the stair down the tower's north side, inside the walls, roped off at its foot (the slide is shut for the night)
  const sz0 = S.z - 1.7;
  for (let i = 0; i < 12; i++) box(b, Z.woodPale, tx, S.top - 0.2 - i * 0.34, sz0 - 0.225 - i * 0.45, 1.6, 0.1, 0.45);
  const sLen = Math.hypot(12 * 0.45, S.top);
  for (const s of [-1, 1]) {
    slab(b, Z.wood, tx + s * 0.85, S.top / 2 - 0.1, sz0 - 2.7, 0.1, 0.3, sLen, -Math.atan2(S.top, 12 * 0.45), 0, 0);
    cyl(b, Z.brass, tx + s * 1.0, 0, sz0 - 5.75, 0.05, 0.05, 1, 6);
  }
  box(b, Z.redDark, tx, 0.86, sz0 - 5.75, 2.0, 0.06, 0.06, 0, false);
  box(b, Z.white, tx, 0.62, sz0 - 5.76, 0.5, 0.3, 0.03, 0, false);
  const run = S.x1 - S.x0;
  const drop = S.top - 0.35;
  const ang = Math.atan2(drop, run);
  const L = Math.hypot(run, drop);
  slab(b, Z.ice, (S.x0 + S.x1) / 2, S.top / 2 + 0.1, S.z, L, 0.3, S.w, 0, 0, -ang);
  for (const s of [-1, 1]) slab(b, Z.ice, (S.x0 + S.x1) / 2, S.top / 2 + 0.5, S.z + s * (S.w / 2 + 0.2), L, 0.9, 0.4, 0, 0, -ang);
  for (let x = S.x0 + 3; x < S.x1 - 4; x += 5) {
    const h = S.top - ((x - S.x0) / run) * drop - 0.2;
    for (const s of [-1, 1]) box(b, Z.ice, x, h / 2, S.z + s * 1.1, 0.7, h, 0.7);
  }
  solid(c, tx, S.z, 4.2, 3.6, S.top + 1, 'zarya-slide', { kind: 'prop', surface: 'wood' });
  solid(c, tx, sz0 - 2.9, 2.2, 5.8, S.top, 'zarya-slide', { shots: false, kind: 'prop', surface: 'wood' });
  solid(c, (S.x0 + S.x1) / 2 - 5, S.z, run - 10, S.w + 1.2, 2.6, 'zarya-slide', { kind: 'prop' });
  solid(c, S.x1 - 5, S.z, 10, S.w + 1.2, 1.2, 'zarya-slide', { shots: false, kind: 'none' });
  // the hook at its foot, where the fair hangs a prize
  const h = P.hook;
  cyl(b, Z.wood, h.x, 0, h.z + 2.2, 0.1, 0.08, 2.6, 6);
  box(b, Z.wood, h.x, 2.5, h.z + 1.7, 0.08, 0.08, 1.1, 0, false);
  box(b, Z.iron, h.x, 2.36, h.z + 1.25, 0.04, 0.24, 0.04, 0, false);
  solid(c, h.x, h.z + 2.2, 0.3, 0.3, 2.6, 'zarya-pole', { kind: 'none', surface: 'wood' });
  // pale blue light inside the walls
  for (const [x, z] of [[-66, 30], [-50, 28], [-58, 44], [-42, 40], [-56, 17]] as const) b.light({ x, y: 2.2, z, color: 0x6fb4ff, intensity: 15, distance: 17, mode: 'steady', pool: 6, weight: 0.7 });
}

function treeAndStage(c: Ctx): void {
  const { b } = c;
  const T = P.tree;
  firTree(b, T.x, T.z, 19, { lights: true, star: true, seed: 3, bulb: Z.treeBulb });
  // the round of snow it stands in and the low fence round it
  cyl(b, Z.snow, T.x, 0, T.z, T.r - 0.4, T.r - 1.4, 0.5, 20, false);
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    box(b, Z.iron, T.x + Math.cos(a) * T.r, 0.5, T.z + Math.sin(a) * T.r, 0.08, 1, 0.08, 0, false);
    box(b, Z.iron, T.x + Math.cos(a + 0.112) * T.r, 0.85, T.z + Math.sin(a + 0.112) * T.r, 1.36, 0.05, 0.05, -a - 0.112 - Math.PI / 2, false);
  }
  for (let i = 0; i < 12; i++) {
    const a = ((i + 0.5) / 12) * Math.PI * 2;
    solid(c, T.x + Math.cos(a) * T.r, T.z + Math.sin(a) * T.r, 3.2, 0.3, 1, 'zarya-treefence', { rot: -a - Math.PI / 2, shots: false, kind: 'none', surface: 'metal' });
  }
  solid(c, T.x, T.z, 3, 3, 16, 'zarya-tree', { kind: 'prop', surface: 'wood' });
  // inside the fence is the tree's, not ground
  for (const a of [0, Math.PI / 3, (2 * Math.PI) / 3]) solid(c, T.x, T.z, T.r * 2 - 0.4, T.r * 1.14, 1, 'zarya-treefence', { rot: a, shots: false, kind: 'none', surface: 'wood' });
  b.light({ x: T.x, y: 7, z: T.z + 7, color: 0xffc27a, intensity: 26, distance: 26, mode: 'steady', pool: 9, weight: 1 });
  // the junction box the tree's lights run from, on a post by the fence (the tram's spare fuse went into it)
  const J = P.junction;
  cyl(b, Z.iron, J.x, 0, J.z, 0.06, 0.06, 1.5, 6);
  box(b, Z.grey, J.x, 1.3, J.z, 0.26, 0.5, 0.42);
  box(b, Z.black, J.x + 0.14, 1.3, J.z, 0.02, 0.36, 0.3, 0, false);
  solid(c, J.x, J.z, 0.36, 0.5, 1.6, 'zarya-pole', { kind: 'none', surface: 'metal' });

  // the stage: boards a metre up, a painted back wall, a roof, curtains, steps at both front corners
  const S = P.stage;
  const z0 = S.z - S.d / 2;
  const z1 = S.z + S.d / 2;
  box(b, Z.woodPale, S.x, S.h - 0.06, S.z, S.w, 0.12, S.d);
  box(b, Z.woodDark, S.x, (S.h - 0.12) / 2, z1 - 0.06, S.w, S.h - 0.12, 0.12);
  for (const s of [-1, 1]) box(b, Z.woodDark, S.x + s * (S.w / 2 - 0.06), (S.h - 0.12) / 2, S.z, 0.12, S.h - 0.12, S.d);
  box(b, Z.blue, S.x, S.h + 2.1, z0 + 0.1, S.w, 4.2, 0.2);
  // a snowflake on it
  for (let i = 0; i < 4; i++) slab(b, Z.white, S.x, S.h + 2.3, z0 + 0.22, 2.4, 0.16, 0.03, 0, 0, (i * Math.PI) / 4, false);
  for (const s of [-1, 1]) {
    box(b, Z.woodDark, S.x + s * (S.w / 2 - 0.15), S.h + 2.1, z1 - 0.15, 0.3, 4.2, 0.3);
    box(b, Z.woodDark, S.x + s * (S.w / 2 - 0.15), S.h + 2.1, z0 + 0.4, 0.3, 4.2, 0.3);
    box(b, Z.red, S.x + s * (S.w / 2 - 0.9), S.h + 1.9, z0 + 0.5, 1.4, 3.8, 0.16);
  }
  box(b, Z.woodDark, S.x, S.h + 4.3, S.z, S.w + 0.8, 0.2, S.d + 0.8);
  box(b, Z.snow, S.x, S.h + 4.5, S.z, S.w + 0.8, 0.22, S.d + 0.8, 0, false);
  box(b, Z.red, S.x, S.h + 3.9, z1 - 0.1, S.w, 0.6, 0.08, 0, false);
  bulbString(b, S.x - S.w / 2, S.h + 3.5, z1, S.x + S.w / 2, S.h + 3.5, z1, 26, 0.2);
  // nobody climbs it: the boards are a block a metre high (shots pass over), the back wall stands on it
  solid(c, S.x, S.z, S.w, S.d, S.h, 'zarya-stage', { shots: false, kind: 'prop', surface: 'wood' });
  solid(c, S.x, z0 + 0.1, S.w, 0.3, S.h + 4.2, 'zarya-stage', { kind: 'none', surface: 'wood' });
  for (const s of [-1, 1]) {
    const sx = S.x + s * (S.w / 2 - 1);
    for (let i = 0; i < 4; i++) box(b, Z.woodPale, sx, (S.h - i * 0.25) / 2, z1 + 0.2 + i * 0.4, 1.8, S.h - i * 0.25, 0.4);
    // the steps are for the performers: a rope across their foot on two brass posts
    for (const d of [-1, 1]) cyl(b, Z.brass, sx + d * 0.95, 0, z1 + 1.75, 0.05, 0.05, 1, 6);
    box(b, Z.redDark, sx, 0.86, z1 + 1.75, 1.9, 0.06, 0.06, 0, false);
    solid(c, sx, z1 + 0.95, 2.0, 1.9, 1, 'zarya-stage', { shots: false, kind: 'none', surface: 'wood' });
  }
  b.light({ x: S.x, y: S.h + 3.4, z: S.z + 1, color: 0xffc888, intensity: 22, distance: 20, mode: 'steady', pool: 7, weight: 1 });
}

function clock(c: Ctx): void {
  const { b } = c;
  const K = P.clock;
  cyl(b, Z.iron, K.x, 0, K.z, 0.16, 0.1, 3.8, 8);
  cyl(b, Z.iron, K.x, 0, K.z, 0.3, 0.22, 0.5, 8);
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.3, 18), Z.iron);
  face.position.set(K.x, 4.3, K.z);
  face.rotation.x = Math.PI / 2;
  b.add(face);
  for (const s of [-1, 1]) {
    const d = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.54, 0.02, 18), Z.bulb);
    d.position.set(K.x, 4.3, K.z + s * 0.16);
    d.rotation.x = Math.PI / 2;
    b.add(d, { cast: false });
    // 23:57: the hour hand a breath before twelve, the minute hand three minutes short of it
    slab(b, Z.black, K.x - s * 0.02, 4.44, K.z + s * 0.18, 0.05, 0.3, 0.02, 0, 0, s * 0.03, false);
    slab(b, Z.black, K.x - s * 0.065, 4.5, K.z + s * 0.18, 0.035, 0.44, 0.02, 0, 0, s * 0.31, false);
  }
  solid(c, K.x, K.z, 0.4, 0.4, 4.6, 'zarya-pole', { kind: 'none', surface: 'metal' });
}

function van(c: Ctx): void {
  const { b } = c;
  const V = P.van;
  box(b, Z.cream, V.x, 1.15, V.z, 4.4, 1.5, 1.9);
  box(b, Z.red, V.x, 1.0, V.z, 4.44, 0.26, 1.94, 0, false);
  box(b, Z.black, V.x + 0.2, 1.55, V.z, 3.6, 0.5, 1.96, 0, false);
  box(b, Z.snow, V.x, 1.96, V.z, 4.3, 0.12, 1.8, 0, false);
  box(b, Z.blueLamp, V.x + 1.2, 2.1, V.z, 0.3, 0.16, 0.3, 0, false);
  for (const sx of [-1.4, 1.4]) for (const sz of [-0.9, 0.9]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.26, 10), Z.black);
    w.position.set(V.x + sx, 0.38, V.z + sz);
    w.rotation.x = Math.PI / 2;
    b.add(w);
  }
  for (const s of [-1, 1]) ball(b, Z.bulb, V.x + 2.22, 1.0, V.z + s * 0.6, 0.12);
  solid(c, V.x, V.z, 4.4, 1.9, 2, 'zarya-van', { kind: 'prop', surface: 'metal' });
}

export function buildSquare(c: Ctx): void {
  const { b } = c;
  // ---- the ground: snow everywhere, the paving trodden grey, the lanes people have worn across it ----
  groundRect(b, Z.snow, B.minX, B.minZ, 68, B.maxZ, 0.004);
  groundRect(b, Z.packed, SQUARE.x0, SQUARE.z0, 68, SQUARE.z1, 0.012);
  groundRect(b, Z.paving, 21.6, -25, 32.4, 16, 0.02); // the fair's aisle
  groundRect(b, Z.paving, -14, 18, -2, 30, 0.02); // in front of the stage
  groundRect(b, Z.paving, 40, -12, 68, 8, 0.02); // the way to the store's doors

  tramLine(c);
  palace(c);
  iceTown(c);
  treeAndStage(c);
  clock(c);
  van(c);
  KIOSKS.forEach((k, i) => kiosk(c, k.kind, k.x, k.z, k.face, i));
  // one more at the south end of the west row, its shutter down for the holiday (bought open: `zarya/mods.ts`)
  shutterKiosk(c, SHUTTERS[0]!.at, SHUTTERS[0]!.yaw, 6);
  LAMPS.forEach((l) => lampPost(c, l.x, l.z, true));
  for (const [x, z, yaw] of [[-30, 26, 0], [-18, -30, Math.PI], [12, 26, 0], [44, -30, Math.PI], [56, 30, -Math.PI / 2], [-44, 0, Math.PI / 2], [0, 48, 0], [40, 50, 0]] as const) bench(c, x, z, yaw);

  // the small fir at the edge of the fair (the sack lies under it: `zarya/look.ts`)
  firTree(b, P.sackFir.x, P.sackFir.z, 5.5, { lights: true, seed: 11 });
  solid(c, P.sackFir.x, P.sackFir.z, 1, 1, 5, 'zarya-tree', { kind: 'none', surface: 'wood' });

  // ---- the south: a low wall and railings, bare ground, the panel blocks ----
  const fz = SQUARE.z1 + 1;
  for (const [fx0, fx1] of [[SQUARE.x0, -27], [-19, 68]] as const) {
    const fm = (fx0 + fx1) / 2;
    const fl = fx1 - fx0;
    box(b, Z.concrete, fm, 0.3, fz, fl, 0.6, 0.5);
    box(b, Z.snow, fm, 0.66, fz, fl, 0.12, 0.6, 0, false);
    for (let x = fx0; x <= fx1; x += 3) box(b, Z.iron, x, 1.2, fz, 0.14, 1.3, 0.14, 0, false);
    for (const y of [1.1, 1.75]) box(b, Z.iron, fm, y, fz, fl, 0.05, 0.05, 0, false);
    for (let x = fx0 + 0.5; x < fx1; x += 0.5) box(b, Z.iron, x, 1.4, fz, 0.03, 0.75, 0.03, 0, false);
    solid(c, fm, fz, fl, 0.5, 2.2, 'zarya-fence', { shots: false, kind: 'wall', surface: 'metal' });
  }
  // the archway between the blocks, through to the courtyards
  groundRect(b, Z.packed, -27, SQUARE.z1, -19, B.maxZ, 0.014);
  box(b, Z.concrete, -23, 5.4, 66, 8, 1.2, 9);
  b.light({ x: -23, y: 4, z: 62, color: 0xffb060, intensity: 14, distance: 14, mode: 'steady', pool: 5, weight: 0.6 });
  for (const [x, w, seed] of [[-52, 50, 21], [8, 54, 22]] as const) {
    solidBlock(b, { x, z: 66, w, d: 9, height: 15, wallMaterial: 'concreteWall', facade: { floors: 5, floorHeight: 3, litFraction: 0.6, seed, faces: ['N'] }, mapKind: 'building', tag: 'zarya-block' });
  }
  // bare trees along the railings
  for (let x = SQUARE.x0 + 6; x < 62; x += 11) {
    cyl(b, Z.woodDark, x, 0, fz + 2, 0.16, 0.07, 3.6, 6);
    for (let i = 0; i < 5; i++) slab(b, Z.woodDark, x + Math.cos(i * 2.2) * 0.5, 3.4 + (i % 3) * 0.5, fz + 2 + Math.sin(i * 2.2) * 0.5, 0.06, 1.8, 0.06, Math.sin(i * 1.7) * 0.6, i * 2.2, 0.7, false);
  }

  // ---- the west, south of the Palace: a snow bank against a wall ----
  box(b, Z.concreteDark, SQUARE.x0 - 2, 1.5, 28.5, 0.4, 3, 53);
  solid(c, SQUARE.x0 - 2, 28.5, 0.4, 53, 3, 'zarya-wall', { kind: 'wall' });
  for (const [x, z, w, d] of [[SQUARE.x0 - 0.6, 8, 2.4, 9], [-20, SQUARE.z1 - 1, 14, 2], [56, SQUARE.z1 - 1.2, 12, 2.4], [SQUARE.x0 + 6, SQUARE.z0 + 1, 10, 2.4]] as const) {
    slab(b, Z.snow, x, 0.25, z, w, 0.7, d, 0, 0.1, 0, false);
  }
}
