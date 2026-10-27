/**
 * SLIME HOLLOW's sound: the score, the cast's voices and every effect, hung off the scene clock so they stay in step
 * through slow motion, replays and film mode (the same approach as Excalibur's).
 *
 * The score (`music.mp3`: three Lyria 3 cues cut to the scene - the village and the order, the Hollow's storm with a
 * hard stop at the catch, the mourning at the end) and the voices (`voice/*.mp3`: ElevenLabs v4, the best of several takes each)
 * were made for this film; the effects are synthesised here with Web Audio: the ooze, the march, the crowd's murmur
 * and panic, the spikes, the crystal, the clink and the grinding blades, the whack and its thunder.
 */
import type * as THREE from 'three';
import { VERSION } from '../version';
import type { Cue } from './scene';

const BASE = './hollow/';
/** Held at the dawn (not looping), the score's dawn swell plays on round. */
const HOLD_FROM = 66;
const HOLD_TO = 75;
const HOLD_FADE = 2;

const VOICES = [
  'suzu-cry', 'officer-hold', 'soldier-who', 'soldier-never', 'raigen-kael', 'goro-nothim', 'raigen-who', 'kael-came',
  'officer-advance', 'kael-order', 'goro-behind', 'soldier-monster', 'soldier-run', 'soldier-monster2', 'soldier-run2',
  'auren-monster', 'auren-beg', 'raigen-head', 'raigen-get', 'raigen-name', 'kael-gasp', 'raigen-today', 'kael-rai',
] as const;
type Voice = (typeof VOICES)[number];
/** The quiet ones (whispers, under the score) lifted so they still carry. */
const HUSHED: Voice[] = ['suzu-cry', 'soldier-never', 'raigen-kael', 'raigen-who', 'kael-order', 'kael-rai', 'raigen-today'];
/** The army's voices: further off, in a bigger space. */
const FAR: Voice[] = ['soldier-who', 'soldier-never', 'soldier-monster', 'soldier-run', 'soldier-monster2', 'soldier-run2', 'officer-hold', 'officer-advance'];

/** When each line is spoken (scene seconds). */
const LINES: [number, Voice][] = [
  [7.4, 'suzu-cry'],
  [10.9, 'officer-hold'],
  [14.6, 'soldier-who'],
  [16.9, 'soldier-never'],
  [18.7, 'raigen-kael'],
  [20.2, 'goro-nothim'],
  [21.8, 'raigen-who'],
  [27.0, 'kael-came'],
  [28.7, 'officer-advance'],
  [31.4, 'kael-order'],
  [34.6, 'goro-behind'],
  [36.0, 'soldier-monster'],
  [38.2, 'soldier-run'],
  [40.2, 'soldier-monster2'],
  [42.0, 'soldier-run2'],
  [43.6, 'auren-monster'],
  [46.2, 'auren-beg'],
  [50.5, 'raigen-head'],
  [51.8, 'raigen-get'],
  [55.15, 'raigen-name'],
  [56.0, 'kael-gasp'],
  [60.4, 'raigen-today'],
  [63.2, 'kael-rai'],
  [66.0, 'suzu-cry'],
];

export class SceneAudio {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfx!: GainNode;
  private voiceBus!: GainNode;
  private verb!: ConvolverNode;
  private farVerb!: ConvolverNode;
  private noise!: AudioBuffer;
  music: AudioBuffer | null = null;
  readonly voices = new Map<Voice, AudioBuffer>();
  private musicSrc: AudioBufferSourceNode | null = null;
  private musicAnchor = { ctx: 0, pos: 0, rate: 1 };
  private holding = false;
  private holdNext = 0;
  private holdSrcs: AudioBufferSourceNode[] = [];
  private lastCtx = 0;
  private wind: GainNode | null = null;
  private fire: GainNode | null = null;
  /** the cold hum under the drained stretch */
  private hum: GainNode | null = null;
  private prevT = 0;
  private crackle = 0;
  private preloaded = false;
  muted = false;
  readonly volume = { master: 0.8, music: 0.7, sfx: 0.7, voice: 0.85 };

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9 * this.volume.master;
    this.master.connect(comp).connect(ctx.destination);

    this.verb = ctx.createConvolver();
    this.verb.buffer = this.impulse(2.4);
    const verbOut = ctx.createGain();
    verbOut.gain.value = 0.3;
    this.verb.connect(verbOut).connect(this.master);
    this.farVerb = ctx.createConvolver();
    this.farVerb.buffer = this.impulse(3.6);
    const farOut = ctx.createGain();
    farOut.gain.value = 0.55;
    this.farVerb.connect(farOut).connect(this.master);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.55 * this.volume.music;
    this.musicBus.connect(this.master);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.volume.sfx;
    this.sfx.connect(this.master);
    this.sfx.connect(this.verb);
    this.voiceBus = ctx.createGain();
    this.voiceBus.gain.value = 1.1 * this.volume.voice;
    this.voiceBus.connect(this.master);
    this.voiceBus.connect(this.verb);

    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    this.startBeds();
    if (!this.preloaded) void this.load();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) void ctx.suspend();
      else if (!this.muted) void ctx.resume();
    });
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9 * this.volume.master, this.ctx.currentTime, 0.05);
  }

  setVolume(which: keyof SceneAudio['volume'], v: number): void {
    this.volume[which] = Math.min(1, Math.max(0, v));
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    if (which === 'master') this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9 * this.volume.master, now, 0.05);
    else if (which === 'sfx') this.sfx.gain.setTargetAtTime(this.volume.sfx, now, 0.05);
    else if (which === 'voice') this.voiceBus.gain.setTargetAtTime(1.1 * this.volume.voice, now, 0.05);
  }

  /** Fetch and decode the score and every line before anything plays (the loading screen). */
  async preload(progress?: (done: number, total: number) => void): Promise<void> {
    await this.load(new OfflineAudioContext(1, 1, 48000), progress);
    this.preloaded = true;
  }

  private async load(ctx: BaseAudioContext = this.ctx!, progress?: (done: number, total: number) => void): Promise<void> {
    const total = 1 + VOICES.length;
    let done = 0;
    const get = async (path: string): Promise<AudioBuffer | null> => {
      try {
        const res = await fetch(`${BASE}${path}?${VERSION}`);
        return await ctx.decodeAudioData(await res.arrayBuffer());
      } catch {
        return null;
      } finally {
        progress?.(++done, total);
      }
    };
    const [music, ...voices] = await Promise.all([get('music.mp3'), ...VOICES.map((n) => get(`voice/${n}.mp3`))]);
    this.music = music;
    VOICES.forEach((n, i) => voices[i] && this.voices.set(n, voices[i]!));
    this.musicSrc = null;
  }

  private impulse(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * seconds;
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return b;
  }

  // ------------------------------------------------------------------------------------------------------------------
  // the clock

  /** Where the score is (scene seconds) while it plays: the page runs the scene on this clock. */
  position(): number | null {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || !this.music || !this.musicSrc || this.holding) return null;
    return this.musicAnchor.pos + (ctx.currentTime - this.musicAnchor.ctx) * this.musicAnchor.rate;
  }

  update(t: number, rate: number, held = false): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') {
      this.prevT = t;
      return;
    }
    const looped = t < this.prevT;
    if (looped) this.prevT = 0;
    const real = Math.max(0, Math.min(0.25, ctx.currentTime - this.lastCtx));
    this.lastCtx = ctx.currentTime;
    const now = ctx.currentTime;

    if (this.music && held) {
      if (!this.holding) this.startHold();
      if (now > this.holdNext - 1) this.holdPass(this.holdNext);
      this.musicBus.gain.setTargetAtTime(0.6 * this.volume.music, now, 0.3);
    } else if (this.music) {
      if (this.holding) this.stopHold();
      const pos = this.musicAnchor.pos + (now - this.musicAnchor.ctx) * this.musicAnchor.rate;
      if (!this.musicSrc || looped || Math.abs(pos - t) > 0.45 || Math.abs(this.musicAnchor.rate - rate) > 0.02) this.playMusic(t, rate);
      // the film fades out at the end: so does the score
      const fade = t > 72.4 ? Math.max(0, 1 - (t - 72.4) / 3.2) : 1;
      this.musicBus.gain.setTargetAtTime(0.6 * fade * this.volume.music, now, 0.08);
    }

    if (!held && t - this.prevT < 4)
      for (const [at, v] of LINES) {
        const buf = this.voices.get(v);
        if (this.prevT < at && t >= at && buf) this.voice(v, buf, rate);
      }

    // the village fires crackle while they burn; the wind breathes; a cold hum under the drained stretch
    this.crackle -= real;
    const burning = t < 27 || t > 60 || held;
    if (this.crackle <= 0) {
      this.crackle = burning ? 0.05 + Math.random() * 0.2 : 0.3 + Math.random() * 0.6;
      this.tick(burning ? 0.05 + Math.random() * 0.08 : 0.02, 700 + Math.random() * 2400);
    }
    if (this.fire) this.fire.gain.setTargetAtTime(burning ? 0.07 : 0.015, now, 1.2);
    const drained = t > 27 && t < 60 && !held;
    if (this.hum) this.hum.gain.setTargetAtTime(drained ? (t > 50 && t < 56 ? 0.12 : 0.05) : 0, now, 0.8);
    if (this.wind) this.wind.gain.setTargetAtTime(0.05 + (t > 50 && t < 57 ? 0.04 : 0), now, 0.5);
    this.prevT = t;
  }

  private startHold(): void {
    const ctx = this.ctx!;
    this.holding = true;
    if (this.musicSrc) {
      try {
        this.musicSrc.stop(ctx.currentTime + HOLD_FADE);
      } catch {
        /* never started */
      }
      this.musicSrc = null;
    }
    this.holdNext = ctx.currentTime;
    this.holdPass(this.holdNext);
  }

  private holdPass(at: number): void {
    const ctx = this.ctx!;
    const len = HOLD_TO - HOLD_FROM;
    const src = ctx.createBufferSource();
    src.buffer = this.music;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(1, at + HOLD_FADE);
    g.gain.setValueAtTime(1, at + len - HOLD_FADE);
    g.gain.linearRampToValueAtTime(0.0001, at + len);
    src.connect(g).connect(this.musicBus);
    src.start(at, HOLD_FROM, len);
    src.onended = () => (this.holdSrcs = this.holdSrcs.filter((s) => s !== src));
    this.holdSrcs.push(src);
    this.holdNext = at + len - HOLD_FADE;
  }

  private stopHold(): void {
    this.holding = false;
    for (const s of this.holdSrcs) {
      try {
        s.stop();
      } catch {
        /* already done */
      }
    }
    this.holdSrcs = [];
    this.musicSrc = null;
  }

  private playMusic(at: number, rate: number): void {
    const ctx = this.ctx!;
    if (this.musicSrc) {
      try {
        this.musicSrc.stop();
      } catch {
        /* already stopped */
      }
      this.musicSrc = null;
    }
    if (!this.music || at >= this.music.duration) {
      this.musicAnchor = { ctx: ctx.currentTime, pos: at, rate };
      this.musicSrc = ctx.createBufferSource();
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.music;
    src.playbackRate.value = rate;
    src.connect(this.musicBus);
    src.start(ctx.currentTime, Math.max(0, at));
    this.musicSrc = src;
    this.musicAnchor = { ctx: ctx.currentTime, pos: at, rate };
  }

  private voice(v: Voice, buf: AudioBuffer, rate: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = HUSHED.includes(v) ? 1.6 : FAR.includes(v) ? 0.75 : 1;
    src.connect(g);
    if (FAR.includes(v)) {
      // the army is across the field: thinner, and in a bigger space
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 220;
      g.connect(hp).connect(this.voiceBus);
      hp.connect(this.farVerb);
    } else g.connect(this.voiceBus);
    src.start();
  }

  // ------------------------------------------------------------------------------------------------------------------
  // effects

  cue(c: Cue, _at: THREE.Vector3): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    switch (c) {
      case 'march':
        // the Choir's drum and boots coming closer
        for (let i = 0; i < 15; i++) this.boom(i * 0.64, 0.4, 62, 0.08 + i * 0.022);
        break;
      case 'halt':
        this.boom(0, 0.6, 58, 0.45);
        this.boom(0.32, 0.6, 58, 0.5);
        this.clatter(0.35, 0.5);
        break;
      case 'drip':
        for (let i = 0; i < 9; i++) this.drop(0.4 + i * (0.6 + Math.random() * 0.5), 0.18);
        break;
      case 'murmur':
        this.babble(6.5, 0.12);
        break;
      case 'transform':
        this.riser(6.5, 40, 160, 0.3);
        for (let i = 0; i < 6; i++) this.drop(i * 0.9 + Math.random() * 0.4, 0.25);
        break;
      case 'heartbeat':
        this.boom(0, 0.35, 34, 0.9);
        this.boom(0.27, 0.32, 30, 0.65);
        break;
      case 'drain':
        // the colour going out of the world: a long fall into a cold hum
        this.whoosh(0, 4.5, 4000, 120, 0.35);
        this.riser(4.5, 300, 50, 0.2);
        break;
      case 'spikes':
        this.boom(0, 2.6, 38, 1.4);
        this.boom(0.02, 1.2, 80, 0.9);
        this.crunch(1.4);
        this.whoosh(0, 0.6, 300, 4000, 0.6);
        break;
      case 'spike-line':
        for (let i = 0; i < 6; i++) setTimeout(() => this.crunch(0.5), i * 120);
        this.boom(0, 1.0, 50, 0.45);
        break;
      case 'panic':
        this.babble(14, 0.22, true);
        break;
      case 'rise':
        this.riser(2.2, 60, 260, 0.35);
        break;
      case 'crystal':
        for (let i = 0; i < 9; i++) setTimeout(() => this.chime(0.25), i * 140 + Math.random() * 80);
        this.whoosh(0, 2.4, 200, 6000, 0.3);
        break;
      case 'raise':
        this.riser(2.3, 90, 600, 0.35);
        break;
      case 'dash':
        this.whoosh(0, 0.8, 300, 3200, 0.7);
        this.zap(1.2, 0.35);
        break;
      case 'clink':
        this.clang(1.3);
        this.boom(0, 1.0, 70, 0.9);
        break;
      case 'grind':
        this.grind(5.0);
        break;
      case 'whack':
        this.thwack();
        break;
      case 'thunder':
        this.zap(0.5, 0.8);
        this.boom(0.08, 3.2, 34, 1.3);
        this.debris(2.5);
        break;
      case 'shatter':
        for (let i = 0; i < 14; i++) setTimeout(() => this.chime(0.2), i * 60 + Math.random() * 50);
        this.debris(2);
        break;
      case 'shed':
        this.whoosh(0, 2.6, 1600, 90, 0.3);
        for (let i = 0; i < 7; i++) this.drop(i * 0.35, 0.3);
        break;
      case 'dawn':
        // his last heartbeat
        this.boom(0, 0.5, 30, 0.6);
        break;
      case 'loop':
        break;
    }
  }

  private noiseSrc(): AudioBufferSourceNode {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    return s;
  }

  private env(g: GainNode, at: number, peak: number, attack: number, dur: number): void {
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  }

  private whoosh(delay: number, dur: number, f0: number, f1: number, vol: number): void {
    const ctx = this.ctx!;
    const at = ctx.currentTime + delay;
    const n = this.noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(f0, at);
    bp.frequency.exponentialRampToValueAtTime(f1, at + dur);
    const g = ctx.createGain();
    this.env(g, at, vol, dur * 0.4, dur);
    n.connect(bp).connect(g).connect(this.sfx);
    n.start(at);
    n.stop(at + dur + 0.05);
  }

  /** A sub drop with a noise body. */
  private boom(delay: number, dur: number, f: number, vol: number): void {
    const ctx = this.ctx!;
    const at = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(f * 2.4, at);
    o.frequency.exponentialRampToValueAtTime(f * 0.5, at + dur * 0.6);
    const g = ctx.createGain();
    this.env(g, at, vol, 0.005, dur);
    o.connect(g).connect(this.sfx);
    o.start(at);
    o.stop(at + dur + 0.05);
    const n = this.noiseSrc();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2000, at);
    lp.frequency.exponentialRampToValueAtTime(120, at + dur * 0.7);
    const gn = ctx.createGain();
    this.env(gn, at, vol * 0.5, 0.004, dur * 0.8);
    n.connect(lp).connect(gn).connect(this.sfx);
    n.start(at);
    n.stop(at + dur);
  }

  private riser(dur: number, f0: number, f1: number, vol: number): void {
    const ctx = this.ctx!;
    const at = ctx.currentTime;
    for (const detune of [-12, 0, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0, at);
      o.frequency.exponentialRampToValueAtTime(f1, at + dur);
      o.detune.value = detune;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(200, at);
      lp.frequency.exponentialRampToValueAtTime(1800, at + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(vol * 0.2, at + dur * 0.9);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.4);
      o.connect(lp).connect(g).connect(this.sfx);
      o.start(at);
      o.stop(at + dur + 0.5);
    }
  }

  /** A wet drop of the ooze: a falling sine blip, low-passed. */
  private drop(delay: number, vol: number): void {
    const ctx = this.ctx!;
    const at = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const f = 300 + Math.random() * 300;
    o.frequency.setValueAtTime(f * 2.2, at);
    o.frequency.exponentialRampToValueAtTime(f * 0.6, at + 0.09);
    const g = ctx.createGain();
    this.env(g, at, vol, 0.004, 0.14);
    o.connect(g).connect(this.sfx);
    o.start(at);
    o.stop(at + 0.18);
  }

  /** Many voices far off: band-passed noise with a slow, uneven swell (`panic`: higher, wilder). */
  private babble(dur: number, vol: number, panic = false): void {
    const ctx = this.ctx!;
    const at = ctx.currentTime;
    for (let k = 0; k < 3; k++) {
      const n = this.noiseSrc();
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 4;
      bp.frequency.value = (panic ? 900 : 450) + k * (panic ? 500 : 250);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = (panic ? 5 : 2.6) + k * 1.3;
      const depth = ctx.createGain();
      depth.gain.value = 0.5;
      const trem = ctx.createGain();
      trem.gain.value = 0.5;
      lfo.connect(depth).connect(trem.gain);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(vol, at + (panic ? 0.4 : 1.5));
      g.gain.setValueAtTime(vol, at + dur * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      n.connect(bp).connect(trem).connect(g).connect(this.sfx);
      n.connect(bp);
      g.connect(this.farVerb);
      n.start(at, Math.random());
      lfo.start(at);
      n.stop(at + dur + 0.05);
      lfo.stop(at + dur + 0.05);
    }
  }

  /** Earth and stone torn up: a short noisy crunch. */
  private crunch(vol: number): void {
    const ctx = this.ctx!;
    const at = ctx.currentTime;
    const n = this.noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 600 + Math.random() * 500;
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    this.env(g, at, vol * 0.6, 0.003, 0.35);
    n.connect(bp).connect(g).connect(this.sfx);
    n.start(at, Math.random());
    n.stop(at + 0.4);
    this.boom(0, 0.4, 90, vol * 0.4);
  }

  private clatter(delay: number, vol: number): void {
    for (let i = 0; i < 18; i++) setTimeout(() => this.tick(vol * (0.3 + Math.random() * 0.5), 2500 + Math.random() * 3500), (delay + Math.random() * 0.35) * 1000);
  }

  /** Steel on steel: inharmonic partials with a bright transient. */
  private clang(vol: number): void {
    const ctx = this.ctx!;
    const at = ctx.currentTime;
    const base = 520 + Math.random() * 120;
    for (const [ratio, amp, decay] of [
      [1, 1, 1.6],
      [2.76, 0.6, 1.1],
      [5.4, 0.45, 0.7],
      [8.93, 0.3, 0.45],
      [13.3, 0.2, 0.3],
    ]) {
      const o = ctx.createOscillator();
      o.frequency.value = base * ratio;
      const g = ctx.createGain();
      this.env(g, at, vol * amp * 0.25, 0.002, decay);
      o.connect(g).connect(this.sfx);
      o.start(at);
      o.stop(at + decay + 0.05);
    }
    const n = this.noiseSrc();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3000;
    const g = ctx.createGain();
    this.env(g, at, vol * 0.5, 0.001, 0.12);
    n.connect(hp).connect(g).connect(this.sfx);
    n.start(at);
    n.stop(at + 0.15);
  }

  /** Two blades ground together: a trembling metallic scrape. */
  private grind(dur: number): void {
    const ctx = this.ctx!;
    const at = ctx.currentTime;
    const n = this.noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 9;
    bp.frequency.setValueAtTime(1500, at);
    bp.frequency.linearRampToValueAtTime(2300, at + dur);
    const trem = ctx.createGain();
    trem.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 27;
    const depth = ctx.createGain();
    depth.gain.value = 0.5;
    lfo.connect(depth).connect(trem.gain);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.3, at + 0.2);
    g.gain.linearRampToValueAtTime(0.5, at + dur * 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    n.connect(bp).connect(trem).connect(g).connect(this.sfx);
    n.start(at);
    lfo.start(at);
    n.stop(at + dur + 0.05);
    lfo.stop(at + dur + 0.05);
  }

  /** The scabbard across his head: a hard wooden crack with a body thump. */
  private thwack(): void {
    const ctx = this.ctx!;
    const at = ctx.currentTime;
    const n = this.noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    bp.Q.value = 1.5;
    const g = ctx.createGain();
    this.env(g, at, 1.2, 0.001, 0.12);
    n.connect(bp).connect(g).connect(this.sfx);
    n.start(at);
    n.stop(at + 0.15);
    this.boom(0, 0.5, 110, 1.1);
  }

  /** Lightning crackle: bursts of bright noise. */
  private zap(dur: number, vol: number): void {
    const ctx = this.ctx!;
    const at = ctx.currentTime;
    const n = this.noiseSrc();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    for (let s = 0; s < dur; s += 0.04) g.gain.setValueAtTime(Math.random() < 0.55 ? vol * (0.3 + Math.random() * 0.7) : 0.0001, at + s);
    g.gain.setValueAtTime(0.0001, at + dur);
    n.connect(hp).connect(g).connect(this.sfx);
    n.start(at);
    n.stop(at + dur + 0.05);
  }

  private debris(dur: number): void {
    for (let i = 0; i < 22; i++) setTimeout(() => this.tick(0.1 + Math.random() * 0.2, 600 + Math.random() * 1500), (0.2 + Math.pow(Math.random(), 1.6) * dur) * 1000);
  }

  private tick(vol: number, freq = 2500 + Math.random() * 3000): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const at = ctx.currentTime;
    const n = this.noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = 4;
    const g = ctx.createGain();
    this.env(g, at, vol, 0.002, 0.05 + Math.random() * 0.06);
    n.connect(bp).connect(g).connect(this.sfx);
    n.start(at, Math.random() * 1.5);
    n.stop(at + 0.15);
  }

  /** Glassy crystal: a bright bell with a few partials. */
  private chime(vol: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const at = ctx.currentTime;
    const base = [987.8, 1174.7, 1318.5, 1568][(Math.random() * 4) | 0];
    for (const [r, a] of [
      [1, 1],
      [2.4, 0.4],
      [3.9, 0.2],
    ]) {
      const o = ctx.createOscillator();
      o.frequency.value = base * r;
      const g = ctx.createGain();
      this.env(g, at, vol * a * 0.3, 0.005, 1.8);
      o.connect(g).connect(this.sfx);
      o.start(at);
      o.stop(at + 1.9);
    }
  }

  /** The beds: wind, the fires' low roar, and the Hollow's cold hum. */
  private startBeds(): void {
    const ctx = this.ctx!;
    const n = this.noiseSrc();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lg = ctx.createGain();
    lg.gain.value = 250;
    lfo.connect(lg).connect(lp.frequency);
    this.wind = ctx.createGain();
    this.wind.gain.value = 0.05;
    n.connect(lp).connect(this.wind).connect(this.master);
    n.start();
    lfo.start();

    const fn = this.noiseSrc();
    const fbp = ctx.createBiquadFilter();
    fbp.type = 'bandpass';
    fbp.frequency.value = 320;
    fbp.Q.value = 0.6;
    this.fire = ctx.createGain();
    this.fire.gain.value = 0;
    fn.connect(fbp).connect(this.fire).connect(this.master);
    fn.start();

    this.hum = ctx.createGain();
    this.hum.gain.value = 0;
    for (const f of [55, 82.4, 1318.5]) {
      const o = ctx.createOscillator();
      o.type = f > 1000 ? 'sine' : 'triangle';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = f > 1000 ? 0.08 : 0.5;
      o.connect(g).connect(this.hum);
      o.start();
    }
    this.hum.connect(this.master);
  }
}
