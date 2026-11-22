// HIRASAKA's fights as pure state (hs-bosses): the umibōzu's waves and harpoon, Kurogane's thunders worked with the Root
// Hall's machinery, and the kinds' spawn rule for the deep.
import { describe, expect, it } from 'vitest';
import { hirasakaVariant, HIRASAKA_DEEP_X } from '../src/enemies/variants';
import type { Zombie } from '../src/enemies/zombie';
import type { Rng } from '../src/logic/rng';
import { KMACHINE, KURO, Kuro, KuroFight, PSTATE, SKIP } from '../src/hirasaka/bossKurogane';
import { harpoonStrikes, UMI, UMODE, Umi, UmiFight } from '../src/hirasaka/bossUmi';
import { DEEP } from '../src/hirasaka/places';

const rng: Rng = { f: () => 0.5 } as unknown as Rng;
const run = (n: number, f: () => void): void => {
  for (let i = 0; i < n; i++) f();
};

describe('HIRASAKA kinds', () => {
  it('the deep starts where the places say (not at x 110)', () => {
    expect(HIRASAKA_DEEP_X).toBe(DEEP.x0 - 6);
    const r = (): number => 0.1;
    expect(hirasakaVariant('shambler', 120, 0, r)).toBe('resident'); // the pithead is the island's
    expect(hirasakaVariant('shambler', 300, 40, r)).toBe('miner');
    expect(hirasakaVariant('runner', 300, 40, r)).toBe('lampeater');
  });
});

describe('HIRASAKA: the umibōzu', () => {
  const onFront = (x: number, z: number) => [{ x, y: 0, z, up: true }];

  it('throws only while someone is on the seafront, and only then can a harpoon reach it', () => {
    const u = new UmiFight();
    u.rise();
    run(30 * 20, () => u.step(1 / 30, [{ x: 100, y: 0, z: 0, up: true }], rng));
    expect(Umi.mode(u.word)).toBe(UMODE.wade);
    expect(Umi.exposed(u.word)).toBe(false);
    run(30 * 8, () => u.step(1 / 30, onFront(44, 70), rng));
    // up over the wall: a harpoon from the winch straight at its chest strikes; one fired out to sea does not
    let saw = false;
    for (let i = 0; i < 30 * 10 && !saw; i++) {
      u.step(1 / 30, onFront(44, 70), rng);
      saw = Umi.exposed(u.word);
    }
    expect(saw).toBe(true);
    const o = { x: 44, y: 1.6, z: 70 };
    const tx = Umi.x(u.word) - o.x;
    const ty = UMI.bodyY - o.y;
    const tz = UMI.z - o.z;
    const l = Math.hypot(tx, ty, tz);
    expect(harpoonStrikes(u.word, o, { x: tx / l, y: ty / l, z: tz / l })).toBe(true);
    expect(harpoonStrikes(u.word, o, { x: 0, y: 0, z: -1 })).toBe(false);
  });

  it('a wave runs east down its lane and throws whoever stands in it, not the other lane', () => {
    const u = new UmiFight();
    u.rise();
    // two in the seaward lane (it throws down the lane most of them stand in), one in the landward lane, east of it
    const stand = [
      { x: 40, y: 0, z: 70, up: true },
      { x: 30, y: 0, z: 72, up: true },
      { x: 40, y: 0, z: 58, up: true },
    ];
    const hurts: number[] = [];
    run(30 * 40, () => {
      u.step(1 / 30, stand, rng);
      for (const h of u.drainHurts()) hurts.push(h.i);
    });
    expect(hurts.length).toBeGreaterThan(0);
    expect(hurts.every((i) => i !== 2)).toBe(true);
  });

  it('a hit makes it drop the wave it held and reel; three sink it', () => {
    const u = new UmiFight();
    u.rise();
    for (let i = 0; i < 30 * 20 && Umi.mode(u.word) !== UMODE.windup; i++) u.step(1 / 30, onFront(44, 70), rng);
    u.hit(1, false);
    expect(Umi.mode(u.word)).toBe(UMODE.reel);
    expect(Umi.waves(u.waveWord).length).toBe(1);
    u.hit(3, true);
    expect(Umi.mode(u.word)).toBe(UMODE.sunk);
  });

  // (final polish) wary after a hit: one throw from low in the water with nothing to harpoon, then up over the wall again
  it('after a hit its next throw is guarded (a wave to dodge, nothing to harpoon); the one after is open', () => {
    const u = new UmiFight();
    u.rise();
    const stepTo = (mode: number): void => {
      for (let i = 0; i < 30 * 40 && Umi.mode(u.word) !== mode; i++) u.step(1 / 30, onFront(44, 70), rng);
    };
    stepTo(UMODE.windup);
    expect(Umi.guarded(u.word)).toBe(false);
    u.hit(1, false);
    stepTo(UMODE.windup);
    let exposed = false;
    for (let i = 0; i < 30 * 4 && Umi.mode(u.word) !== UMODE.wade; i++) {
      expect(Umi.guarded(u.word)).toBe(true);
      exposed ||= Umi.exposed(u.word);
      u.step(1 / 30, onFront(44, 70), rng);
    }
    expect(exposed).toBe(false);
    stepTo(UMODE.windup);
    expect(Umi.guarded(u.word)).toBe(false);
    for (let i = 0; i < 30 * 3 && !Umi.exposed(u.word); i++) u.step(1 / 30, onFront(44, 70), rng);
    expect(Umi.exposed(u.word)).toBe(true);
  });
});

/** A stand-in for Kurogane's body: only what the fight touches. */
function body(): Zombie {
  return { x: 306, z: -30, y: 0, yaw: 0, hp: 3000, maxHp: 3000, alive: true, invulnerable: false, hurtMul: null, script: null, scriptPose: { mode: 'idle', actionT: 0, speed: 0, lift: 0 }, vx: 0, vz: 0, state: 'chase', aggro: () => {} } as unknown as Zombie;
}
/** Shoot him (from in front) until a thunder breaks or the window shuts. */
function shoot(k: Zombie, f: KuroFight): number {
  const before = f.broken;
  for (let i = 0; i < 400 && k.hp > 0; i++) {
    const a = k.hurtMul ? k.hurtMul(50, Math.PI) : 50;
    k.hp -= a;
    if (f.broken !== before || a === 0) break;
  }
  return f.broken;
}
const players = [{ x: 284, y: 0, z: -15, up: true }];

describe('HIRASAKA: Kurogane', () => {
  it('nothing reaches him until the hall is turned on him; a skip dropped on him opens one thunder', () => {
    const spawned: number[] = [];
    const f = new KuroFight({ spawn: () => spawned.push(1), count: () => spawned.length });
    const k = body();
    f.begin(k, 1);
    run(30 * 3, () => f.step(1 / 30, k, players, rng));
    expect(Kuro.phase(f.word)).toBe(1);
    expect(shoot(k, f)).toBe(0);
    // under the rail: the skip runs over and drops on him
    k.x = 300;
    k.z = KURO.rail.z + 2;
    expect(Kuro.ready(f.word, KMACHINE.hoist)).toBe(true);
    f.use(KMACHINE.hoist, k);
    run(30 * 2, () => f.step(1 / 30, k, players, rng));
    expect(Kuro.stunned(f.word)).toBe(true);
    expect(Kuro.open(f.word)).toBe(true);
    const b = shoot(k, f);
    expect(HirasakaCount(b)).toBe(1);
    expect(Kuro.open(f.word)).toBe(false); // one thunder a window
    expect(shoot(k, f)).toBe(b);
  });

  it('a skip dropped where he is not misses', () => {
    const f = new KuroFight({ spawn: () => {}, count: () => 0 });
    const k = body();
    f.begin(k, 1);
    run(30 * 3, () => f.step(1 / 30, k, players, rng));
    k.z = -55; // far south of the rail
    f.use(KMACHINE.hoist, k);
    run(30 * 2, () => f.step(1 / 30, k, players, rng));
    expect(Kuro.stunned(f.word)).toBe(false);
    expect([0, 1, 2].some((i) => Kuro.skip(f.word, i) === SKIP.down)).toBe(true);
  });

  it('the whole fight: skips, the fan (thunderlings split off), the pump and the roots for the head', () => {
    let n = 0;
    const f = new KuroFight({ spawn: () => n++, count: () => 0 });
    const k = body();
    const hurts: number[] = [];
    const step = (secs: number, stand = players): void =>
      run(Math.round(secs * 30), () => {
        f.step(1 / 30, k, stand, rng);
        // the infected drop a script that lets go (nothing holds him): as `Zombie.update` does
        if (k.script && !(k.script as unknown as { held: boolean }).held) k.script = null;
        hurts.push(...f.drainHurts().map((h) => h.amount));
      });
    f.begin(k, 1);
    step(3);
    // phase 1: three skips
    for (let i = 0; i < 3; i++) {
      k.x = 300;
      k.z = KURO.rail.z;
      for (let w = 0; w < 30 * 20 && !Kuro.ready(f.word, KMACHINE.hoist); w++) step(1 / 30);
      f.use(KMACHINE.hoist, k);
      step(1.5);
      shoot(k, f);
    }
    step(3);
    expect(Kuro.phase(f.word)).toBe(2);
    // phase 2: his gas chokes whoever stands in it; the fan clears it and opens him
    expect(Kuro.gas(f.word)).toBe(true);
    step(2, [{ x: k.x + 2, y: 0, z: k.z, up: true }]);
    expect(hurts.length).toBeGreaterThan(0);
    for (let i = 0; i < 3; i++) {
      for (let w = 0; w < 30 * 30 && !Kuro.ready(f.word, KMACHINE.fan); w++) step(1 / 30);
      f.use(KMACHINE.fan, k);
      step(0.1);
      expect(Kuro.gas(f.word)).toBe(false);
      expect(k.invulnerable).toBe(false); // open to the guns, though nothing holds him
      shoot(k, f);
    }
    expect(n).toBeGreaterThan(0);
    step(KURO.rage + 0.5);
    expect(Kuro.phase(f.word)).toBe(3);
    // phase 3: the floor floods; pumped dry, the roots take him at the tree
    step(KURO.pump.refill + 0.5);
    expect(Kuro.pump(f.word)).toBe(PSTATE.flooded);
    k.x = 340;
    k.z = -20;
    for (let i = 0; i < 2 && k.hp > 0; i++) {
      for (let w = 0; w < 30 * 30 && !Kuro.ready(f.word, KMACHINE.pump); w++) step(1 / 30);
      f.use(KMACHINE.pump, k);
      step(KURO.pump.drain + 0.5);
      expect(Kuro.pump(f.word)).toBe(PSTATE.dry);
      expect(Kuro.pinned(f.word)).toBe(false); // not near the tree yet
      k.x = 303;
      k.z = -35;
      step(0.2);
      expect(Kuro.pinned(f.word)).toBe(true);
      shoot(k, f);
      k.x = 340;
      k.z = -20;
      step(0.5);
    }
    expect(f.broken).toBe(255);
    expect(k.hp).toBeLessThanOrEqual(0);
  });
});

function HirasakaCount(b: number): number {
  let c = 0;
  for (let i = 0; i < 8; i++) if (b & (1 << i)) c++;
  return c;
}
