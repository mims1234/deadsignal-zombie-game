/**
 * The scene's sound: the score, the two voices and every effect, all hung off the scene clock so they stay in step
 * through slow motion, replays and film mode.
 *
 * The score (`music.mp3`, Lyria 3) and the voices (`voice/*.mp3`, ElevenLabs v4 and Fish Audio Drama 3) were generated
 * for this scene and cut to it; the effects are
 * synthesised here with Web Audio (no files): filtered-noise whooshes, inharmonic metal for the sword strikes, a
 * rising hum for the charge, a roaring beam, sub-bass booms and the ringing silence of the cut to black.
 */
import type * as THREE from 'three';
import type { Cue } from './scene';

const BASE = './freeroam/';
/** The score's own climax lands 0.6 s after the blast: play it that far ahead. */
const MUSIC_SHIFT = 0.6;

type Voice = 'still' | 'roar' | 'war' | 'dash' | 'kiai' | 'kiai2' | 'charge' | 'release' | 'struck' | 'after';
const VOICES: Voice[] = ['still', 'roar', 'war', 'dash', 'kiai', 'kiai2', 'charge', 'release', 'struck', 'after'];
const GIANT: Voice[] = ['roar', 'war', 'struck'];

/**
 * When each line is spoken (scene seconds). The charge line ends just before "Ex...", and "CALIBUR" (1.08 s into its
 * clip) lands on the downswing at 17.5.
 */
const LINES: [number, Voice][] = [
  [4.6, 'still'],
  [6.3, 'roar'],
  [8.05, 'war'],
  [9.0, 'dash'],
  [10.35, 'kiai'],
  [11.6, 'kiai2'],
  [12.7, 'charge'],
  [16.42, 'release'],
  [17.75, 'struck'],
  [25.4, 'after'],
];

export class SceneAudio {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfx!: GainNode;
  private voiceBus!: GainNode;
  private verb!: ConvolverNode;
  private noise!: AudioBuffer;
  music: AudioBuffer | null = null;
  readonly voices = new Map<Voice, AudioBuffer>();
  private musicSrc: AudioBufferSourceNode | null = null;
  private musicAnchor = { ctx: 0, pos: 0, rate: 1 };
  private wind: GainNode | null = null;
  private prevT = 0;
  private crackle = 0;
  muted = false;

  /** Start on the first gesture (browsers keep audio locked until then). */
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
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(comp).connect(ctx.destination);

    this.verb = ctx.createConvolver();
    this.verb.buffer = this.impulse(2.8);
    const verbOut = ctx.createGain();
    verbOut.gain.value = 0.35;
    this.verb.connect(verbOut).connect(this.master);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.55;
    this.musicBus.connect(this.master);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.sfx.connect(this.verb);
    this.voiceBus = ctx.createGain();
    this.voiceBus.gain.value = 1.1;
    this.voiceBus.connect(this.master);
    this.voiceBus.connect(this.verb);

    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    this.startWind();
    void this.load();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) void ctx.suspend();
      else if (!this.muted) void ctx.resume();
    });
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  private async load(): Promise<void> {
    const ctx = this.ctx!;
    const get = async (path: string): Promise<AudioBuffer | null> => {
      try {
        const res = await fetch(BASE + path);
        return await ctx.decodeAudioData(await res.arrayBuffer());
      } catch {
        return null; // the scene still plays without it
      }
    };
    const [music, ...voices] = await Promise.all([get('music.mp3'), ...VOICES.map((n) => get(`voice/${n}.mp3`))]);
    this.music = music;
    VOICES.forEach((n, i) => voices[i] && this.voices.set(n, voices[i]!));
    this.musicSrc = null; // (re)start on the next update
  }

  /** A synthetic room: decaying stereo noise. */
  private impulse(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * seconds;
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    return b;
  }

  // ------------------------------------------------------------------------------------------------------------------
  // the clock

  /** `t`: scene seconds; `rate`: slow motion; `ear`: the camera. */
  update(t: number, rate: number, ear: THREE.Vector3): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') {
      this.prevT = t;
      return;
    }
    const looped = t < this.prevT;
    if (looped) this.prevT = 0;

    // the score follows the scene clock
    if (this.music) {
      const want = t + MUSIC_SHIFT;
      const now = ctx.currentTime;
      const pos = this.musicAnchor.pos + (now - this.musicAnchor.ctx) * this.musicAnchor.rate;
      if (!this.musicSrc || looped || Math.abs(pos - want) > 0.2 || this.musicAnchor.rate !== rate) this.playMusic(want, rate);
      // the cut: the music drops away under the beam, is gone in the black, and comes back with the blast
      const duck = t > 17.62 && t < 19.4 ? (t < 18.9 ? 0.25 : 0.02) : 1;
      this.musicBus.gain.setTargetAtTime(0.55 * duck, now, t > 19.38 && t < 19.5 ? 0.01 : 0.08);
    }

    // voices
    for (const [at, v] of LINES) {
      const buf = this.voices.get(v);
      if (this.prevT < at && t >= at && buf) this.voice(v, buf, rate);
    }

    // embers crackle and the wind breathes
    this.crackle -= t - this.prevT;
    if (this.crackle <= 0) {
      this.crackle = 0.08 + Math.random() * 0.35;
      this.tick(0.04 + Math.random() * 0.05);
    }
    if (this.wind) this.wind.gain.setTargetAtTime(0.05 + (t > 13.6 && t < 17.5 ? 0.08 : 0), ctx.currentTime, 0.5);
    void ear;
    this.prevT = t;
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
      this.musicSrc = ctx.createBufferSource(); // a silent stand-in so it isn't restarted every frame
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
    const giant = GIANT.includes(v);
    // the giant: pitched down, saturated and darkened, so a human voice becomes a monster
    src.playbackRate.value = (giant ? 0.74 : 1) * rate;
    let node: AudioNode = src;
    if (giant) {
      const shaper = ctx.createWaveShaper();
      shaper.curve = this.drive(3.5);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2400;
      const g = ctx.createGain();
      g.gain.value = 0.8;
      node.connect(shaper).connect(lp).connect(g);
      node = g;
      // a sub growl under him
      this.growl(buf.duration / 0.74 / rate);
    }
    node.connect(this.voiceBus);
    src.start();
  }

  private drive(k: number): Float32Array<ArrayBuffer> {
    const c = new Float32Array(1024);
    for (let i = 0; i < c.length; i++) {
      const x = (i / c.length) * 2 - 1;
      c[i] = Math.tanh(k * x) / Math.tanh(k);
    }
    return c;
  }

  // ------------------------------------------------------------------------------------------------------------------
  // effects

  cue(c: Cue, at: THREE.Vector3, ear: THREE.Vector3): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const near = 1 / (1 + at.distanceTo(ear) / 35);
    switch (c) {
      case 'shadow':
        this.riser(3.5, 60, 400, 0.25);
        break;
      case 'charge-run':
        for (let i = 0; i < 5; i++) this.boom(0.32 * i, 0.35 + i * 0.08, 55, 0.35);
        break;
      case 'dash':
        this.whoosh(0, 0.55, 300, 2400, 0.6 * Math.max(near, 0.4));
        break;
      case 'clash':
        this.clang(0.8 * Math.max(near, 0.35));
        this.whoosh(0, 0.25, 900, 3000, 0.3);
        break;
      case 'clash-big':
        this.clang(1.1 * Math.max(near, 0.45));
        this.boom(0, 1.2, 70, 0.8);
        break;
      case 'leap':
        this.whoosh(0, 0.7, 2000, 400, 0.4);
        break;
      case 'charge':
        this.chargeHum(3.9);
        break;
      case 'release':
        this.beamRoar(1.6);
        break;
      case 'black':
        this.ringing(0.9);
        break;
      case 'impact':
        this.boom(0, 4.5, 42, 1.4);
        this.debris(3);
        break;
      case 'ring':
        this.chime(0.35);
        break;
      case 'reform':
        this.riser(2.4, 40, 160, 0.3);
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
    g.gain.exponentialRampToValueAtTime(peak, at + attack);
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

  /** Steel on stone: inharmonic partials with a bright transient. */
  private clang(vol: number): void {
    const ctx = this.ctx!;
    const at = ctx.currentTime;
    const base = 380 + Math.random() * 140;
    for (const [ratio, amp, decay] of [
      [1, 1, 1.1],
      [2.76, 0.6, 0.8],
      [5.4, 0.45, 0.5],
      [8.93, 0.3, 0.35],
      [13.3, 0.2, 0.2],
    ]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = base * ratio * (1 + (Math.random() - 0.5) * 0.01);
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
    lp.frequency.setValueAtTime(2400, at);
    lp.frequency.exponentialRampToValueAtTime(120, at + dur * 0.7);
    const gn = ctx.createGain();
    this.env(gn, at, vol * 0.6, 0.004, dur * 0.8);
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

  /** The blade drinking in the dark: a climbing hum that trembles faster and faster, over a noise riser. */
  private chargeHum(dur: number): void {
    const ctx = this.ctx!;
    const at = ctx.currentTime;
    this.riser(dur, 45, 220, 0.5);
    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(3, at);
    lfo.frequency.exponentialRampToValueAtTime(28, at + dur);
    const depth = ctx.createGain();
    depth.gain.value = 0.5;
    const trem = ctx.createGain();
    trem.gain.value = 0.5;
    lfo.connect(depth).connect(trem.gain);
    const n = this.noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 3;
    bp.frequency.setValueAtTime(300, at);
    bp.frequency.exponentialRampToValueAtTime(5000, at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.5, at + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.15);
    n.connect(bp).connect(trem).connect(g).connect(this.sfx);
    n.start(at);
    lfo.start(at);
    n.stop(at + dur + 0.2);
    lfo.stop(at + dur + 0.2);
  }

  /** The beam: a wall of torn noise and detuned saws, saturated. */
  private beamRoar(dur: number): void {
    const ctx = this.ctx!;
    const at = ctx.currentTime;
    const shaper = ctx.createWaveShaper();
    shaper.curve = this.drive(6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.7, at + 0.06);
    g.gain.setValueAtTime(0.7, at + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    shaper.connect(g).connect(this.sfx);
    const n = this.noiseSrc();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(6000, at);
    lp.frequency.exponentialRampToValueAtTime(700, at + dur);
    n.connect(lp).connect(shaper);
    n.start(at);
    n.stop(at + dur + 0.05);
    for (const f of [55, 55.7, 82.4, 110.3]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = 0.15;
      o.connect(og).connect(shaper);
      o.start(at);
      o.stop(at + dur + 0.05);
    }
    this.boom(0, 1.4, 60, 0.9);
  }

  /** The cut to black: everything gone but a high ringing in the ears. */
  private ringing(dur: number): void {
    const ctx = this.ctx!;
    const at = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.value = 3900;
    const g = ctx.createGain();
    this.env(g, at, 0.05, 0.05, dur);
    o.connect(g).connect(this.master);
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  private debris(dur: number): void {
    for (let i = 0; i < 26; i++) {
      const d = 0.3 + Math.pow(Math.random(), 1.6) * dur;
      setTimeout(() => this.tick(0.12 + Math.random() * 0.2, 600 + Math.random() * 1500), d * 1000);
    }
  }

  /** A short filtered click: an ember popping, a stone landing. */
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

  private chime(vol: number): void {
    const ctx = this.ctx!;
    const at = ctx.currentTime;
    const base = [523.3, 622.3, 784, 932.3][(Math.random() * 4) | 0];
    for (const [r, a] of [
      [1, 1],
      [2.01, 0.4],
      [3.02, 0.2],
    ]) {
      const o = ctx.createOscillator();
      o.frequency.value = base * r;
      const g = ctx.createGain();
      this.env(g, at, vol * a * 0.3, 0.01, 2.2);
      o.connect(g).connect(this.sfx);
      o.start(at);
      o.stop(at + 2.3);
    }
  }

  /** A rumble under the giant's voice. */
  private growl(dur: number): void {
    const ctx = this.ctx!;
    const at = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 48;
    const am = ctx.createOscillator();
    am.frequency.value = 23;
    const amg = ctx.createGain();
    amg.gain.value = 0.5;
    const g = ctx.createGain();
    g.gain.value = 0.5;
    am.connect(amg).connect(g.gain);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 300;
    const out = ctx.createGain();
    this.env(out, at, 0.35, 0.08, dur);
    o.connect(lp).connect(g).connect(out).connect(this.sfx);
    o.start(at);
    am.start(at);
    o.stop(at + dur + 0.1);
    am.stop(at + dur + 0.1);
  }

  /** The bed: wind through the dead trees. */
  private startWind(): void {
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
  }
}
