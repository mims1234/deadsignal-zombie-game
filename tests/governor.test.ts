import { describe, expect, it } from 'vitest';
import { GOVERNOR, QUALITY, QUALITY_TIERS } from '../src/config';
import {
  FrameHistogram,
  calibrate,
  governorStep,
  guessTier,
  newGovernor,
  p95,
  startTier,
  summarize,
  tierCeiling,
  type GovernorAction,
  type GovernorState,
} from '../src/logic/governor';
import { activeCap, liteOffset } from '../src/logic/director';
import { deviceClass, gpuVendor } from '../src/render/device';
import type { QualityLevel } from '../src/types';

/** A two-second window of frames all `ms` long (with `slow` of them replaced by `slowMs`). */
function win(ms: number, tier: QualityLevel, slow = 0, slowMs = 0) {
  const n = Math.round(2000 / ms);
  const frames = Array.from({ length: n }, (_, i) => (i < slow ? slowMs : ms));
  return summarize(frames, tier);
}

interface Sim {
  state: GovernorState;
  tier: QualityLevel;
  scale: number;
  actions: GovernorAction[];
}

/** Run the governor for `seconds` of identical windows, applying its actions the way the game does. */
function run(sim: Sim, seconds: number, ms: number | ((tier: QualityLevel, scale: number) => number), opts: { busy?: boolean; auto?: boolean } = {}): Sim {
  for (let t = 0; t < seconds; t += GOVERNOR.window) {
    const frame = typeof ms === 'number' ? ms : ms(sim.tier, sim.scale);
    const { state, action } = governorStep(sim.state, { window: win(frame, sim.tier), tier: sim.tier, renderScale: sim.scale, busy: opts.busy ?? false, auto: opts.auto ?? true });
    sim.state = state;
    if (action !== 'none') sim.actions.push(action);
    if (action === 'scale-down') sim.scale = Math.max(0.6, sim.scale - 0.1);
    if (action === 'scale-up') sim.scale = Math.min(1, sim.scale + 0.05);
    const i = QUALITY_TIERS.indexOf(sim.tier);
    if (action === 'tier-down') sim.tier = QUALITY_TIERS[i - 1]!;
    if (action === 'tier-up') sim.tier = QUALITY_TIERS[i + 1]!;
  }
  return sim;
}

const sim = (tier: QualityLevel, scale = 1, ceiling: QualityLevel = 'high+'): Sim => ({ state: newGovernor(ceiling), tier, scale, actions: [] });

describe('frame windows', () => {
  it('takes the nearest-rank 95th percentile and counts slow frames against the tier budget', () => {
    expect(p95([])).toBe(0);
    expect(p95(Array.from({ length: 100 }, (_, i) => i + 1))).toBe(95);
    const w = summarize([16, 16, 16, 30], 'medium');
    expect(w.frames).toBe(4);
    expect(w.slowShare).toBe(0.25); // 30 ms is over medium's 20 ms budget by more than 10%
    expect(w.seconds).toBeCloseTo(0.078);
    expect(summarize([30, 30], 'low').slowShare).toBe(0); // within a 30 fps tier's budget
  });

  it('a run histogram reports the mean frame rate and p95 without keeping every frame', () => {
    const h = new FrameHistogram();
    for (let i = 0; i < 95; i++) h.add(16);
    for (let i = 0; i < 5; i++) h.add(50);
    expect(h.frames).toBe(100);
    expect(h.p95).toBeCloseTo(16.25);
    h.add(50);
    expect(h.p95).toBeCloseTo(50.25);
    expect(h.avgFps).toBeCloseTo((101 * 1000) / (95 * 16 + 6 * 50));
    h.reset();
    expect(h.frames).toBe(0);
    expect(h.p95).toBe(0);
  });
});

describe('starting guess', () => {
  it('phones start on Low (Lite when weak), computers on Medium (Low when weak), never above the ceiling', () => {
    expect(guessTier(true, false)).toBe('low');
    expect(guessTier(true, true)).toBe('lite');
    expect(guessTier(false, false)).toBe('medium');
    expect(guessTier(false, true)).toBe('low');
    expect(startTier(null, false, false)).toBe('medium');
    expect(startTier('high+', false, false)).toBe('high+');
    expect(startTier('high', true, false)).toBe(GOVERNOR.touchCeiling);
    expect(startTier('lite', true, false)).toBe('lite');
  });
});

describe('calibration', () => {
  it('drops two tiers far over budget, one over budget, and raises one only when clearly fast', () => {
    expect(calibrate(win(45, 'high'), 'high', 'high+')).toBe('low'); // over twice the 20 ms budget
    expect(calibrate(win(27, 'medium'), 'medium', 'high+')).toBe('low');
    expect(calibrate(win(18, 'medium'), 'medium', 'high+')).toBe('medium'); // smooth enough, no room to raise
    expect(calibrate(win(12, 'medium'), 'medium', 'high+')).toBe('high'); // well under High's budget
    expect(calibrate(win(25, 'lite'), 'lite', 'low')).toBe('low');
    expect(calibrate(win(12, 'low'), 'low', 'low')).toBe('low'); // a phone's ceiling holds
    expect(calibrate(win(80, 'lite'), 'lite', 'low')).toBe('lite'); // nothing below Lite
    expect(calibrate(summarize([], 'low'), 'low', 'high+')).toBe('low');
  });
});

describe('tier governor', () => {
  it('leaves a smooth device alone', () => {
    const s = run(sim('medium'), 60, 16.7);
    expect(s.actions).toEqual([]);
    expect(s.tier).toBe('medium');
  });

  it('steps the resolution first and the tier only after the scale is at its floor and ~10 s over budget', () => {
    const s = run(sim('medium'), 60, 26);
    const firstTier = s.actions.indexOf('tier-down');
    expect(firstTier).toBeGreaterThan(0);
    expect(s.actions.slice(0, firstTier).every((a) => a === 'scale-down')).toBe(true);
    expect(s.actions.slice(0, firstTier)).toHaveLength(4); // 1.0 -> 0.6
    expect(s.tier).toBe('low'); // 26 ms is inside Low's 30 fps budget: it settles there
    expect(s.actions.filter((a) => a === 'tier-down')).toHaveLength(1);
  });

  it('does not step the tier down for a short spike', () => {
    const s = run(sim('medium', 0.6), 8, 26);
    expect(s.actions).not.toContain('tier-down');
    run(s, 30, 16.7);
    expect(s.actions).not.toContain('tier-down');
    expect(s.tier).toBe('medium');
  });

  it('holds the tier through a hold, horde or extraction, and steps down once it is over', () => {
    const s = run(sim('medium', 0.6), 30, 26, { busy: true });
    expect(s.actions).not.toContain('tier-down');
    run(s, 2, 26);
    expect(s.actions).toEqual(['tier-down']);
    expect(s.tier).toBe('low');
  });

  it('steps up only after ~2 minutes with room to spare, at full resolution', () => {
    const s = run(sim('low'), GOVERNOR.upAfter - 4, 16.7);
    expect(s.actions).not.toContain('tier-up');
    run(s, 6, 16.7);
    expect(s.actions).toEqual(['tier-up']);
    expect(s.tier).toBe('medium');
    // not at full resolution: the scale comes back first
    const ready = { ...newGovernor('high+'), under: GOVERNOR.upAfter, cooldown: 0 };
    expect(governorStep(ready, { window: win(16.7, 'low'), tier: 'low', renderScale: 0.8, busy: false, auto: true }).action).toBe('scale-up');
    expect(governorStep(ready, { window: win(16.7, 'low'), tier: 'low', renderScale: 1, busy: false, auto: true }).action).toBe('tier-up');
  });

  it('a window over budget restarts the wait for a step up', () => {
    const s = run(sim('low'), 100, 16.7);
    run(s, 2, 40);
    run(s, 100, 16.7);
    expect(s.actions).not.toContain('tier-up');
    run(s, 30, 16.7);
    expect(s.actions).toContain('tier-up');
  });

  it('no step up during a hold, and never past the ceiling', () => {
    expect(run(sim('low'), 200, 16.7, { busy: true }).actions).not.toContain('tier-up');
    const phone = run(sim('low', 1, tierCeiling(true)), 400, 16.7);
    expect(phone.actions).not.toContain('tier-up');
    expect(phone.tier).toBe('low');
    expect(run(sim('high+'), 400, 8).tier).toBe('high+');
  });

  it('a step up that has to be taken back lowers the ceiling for the session', () => {
    // High runs at 16.7 ms; High+ costs 30 ms: up after 2 minutes, then back down, then it stays on High
    const cost = (tier: QualityLevel) => (tier === 'high+' ? 30 : 16.7);
    const s = run(sim('high'), 600, cost);
    expect(s.actions.filter((a) => a === 'tier-up')).toHaveLength(1);
    expect(s.actions.filter((a) => a === 'tier-down')).toHaveLength(1);
    expect(s.tier).toBe('high');
    expect(QUALITY_TIERS[s.state.ceiling]).toBe('high');
  });

  it('a quality picked by hand keeps its tier; only the resolution moves', () => {
    const s = run(sim('high'), 120, 40, { auto: false });
    expect(s.tier).toBe('high');
    expect(s.actions).toContain('scale-down');
    expect(s.actions).not.toContain('tier-down');
    const t = run(sim('low', 0.8), 300, 16.7, { auto: false });
    expect(t.actions).toContain('scale-up');
    expect(t.actions).not.toContain('tier-up');
  });

  it('a heating phone that slows over minutes ends up a tier lower', () => {
    let clock = 0;
    const s = sim('low', 1, tierCeiling(true));
    // 28 ms at first, creeping past the 33 ms budget as it heats
    run(s, 900, (tier) => {
      clock += GOVERNOR.window;
      return tier === 'low' ? 28 + clock / 60 : 30;
    });
    expect(s.tier).toBe('lite');
  });
});

describe('Lite keeps the same threat', () => {
  it('where its cap cuts, ambient infected are tougher and refill sooner; elsewhere nothing changes', () => {
    expect(activeCap('high', 3, 'lite')).toBe(QUALITY.lite.maxEnemies);
    const cut = activeCap('high', 3, 'low') / activeCap('high', 3, 'lite');
    expect(cut).toBeGreaterThan(1);
    const o = liteOffset('high', 3, 'lite');
    expect(o.hp).toBeCloseTo(1 + (cut - 1) * 0.5);
    expect(o.interval).toBeLessThan(1);
    // fewer alive at once, about the same health on the field
    expect(activeCap('high', 3, 'lite') * o.hp).toBeGreaterThan(activeCap('high', 3, 'low') * 0.8);
    for (const q of ['low', 'medium', 'high', 'high+'] as const) expect(liteOffset('high', 3, q)).toEqual({ hp: 1, interval: 1 });
    expect(liteOffset('low', 0, 'lite')).toEqual({ hp: 1, interval: 1 }); // a quiet zone is under Lite's cap anyway
  });
});

describe('device class', () => {
  it('keeps only a coarse class and the GPU maker', () => {
    expect(deviceClass(false, 400)).toBe('computer');
    expect(deviceClass(true, 390)).toBe('phone');
    expect(deviceClass(true, 820)).toBe('tablet');
    expect(gpuVendor('Apple GPU')).toBe('Apple');
    expect(gpuVendor('ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)')).toBe('Apple');
    expect(gpuVendor('Adreno (TM) 640')).toBe('Adreno');
    expect(gpuVendor('Mali-G78 MC14')).toBe('Mali');
    expect(gpuVendor('ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 (0x00002786) Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe('NVIDIA');
    expect(gpuVendor('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe('Intel');
    expect(gpuVendor('ANGLE (AMD, AMD Radeon RX 6600 Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe('AMD');
    expect(gpuVendor('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)')).toBe('Software');
    expect(gpuVendor('WebKit WebGL')).toBeNull();
  });
});
