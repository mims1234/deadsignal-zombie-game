/**
 * The scene's sound: the score, the two voices and every effect, all hung off the scene clock so they stay in step
 * through slow motion, replays and film mode.
 *
 * The score (`music.mp3`: three Lyria 3 cues, one per act, cut together to the 88 s scene) and the voices
 * (`voice/*.mp3`: ElevenLabs v4 and Fish Audio Drama 3, the best of several takes each) were made for this scene; the
 * effects are synthesised here with Web Audio (no files): filtered-noise whooshes, inharmonic metal for the sword
 * strikes, grinding blades, a heartbeat, a long rising hum for the charge, a swelling beam and sub-bass booms.
 */
import type * as THREE from 'three';
import { VERSION } from '../version';
import type { Cue } from './scene';

const BASE = './freeroam/';
/** The score is cut to the scene: it plays in step with it. */
const MUSIC_SHIFT = 0;
/**
 * Held in the ruins (not looping), the score keeps going: only its gentle, sorrowful last passage (the steady quiet
 * stretch just before its fade) plays on round, each pass crossfading into the next.
 */
const HOLD_FROM = 76;
const HOLD_TO = 83;
const HOLD_FADE = 2;

const VOICES = [
  'still', 'roar', 'war', 'dash', 'kiai', 'kiai2', 'kiai3', 'taunt', 'grunt', 'notyet', 'push', 'strain', 'berserk',
  'dark1', 'dark2', 'end', 'ex', 'calibur', 'struck', 'after',
] as const;
type Voice = (typeof VOICES)[number];
const GIANT: Voice[] = ['roar', 'war', 'grunt', 'push', 'berserk', 'struck'];
/** Her quiet lines (whispers, under a full score) lifted so they still carry. */
const HUSHED: Voice[] = ['still', 'dark1', 'end', 'after'];

/** When each line is spoken (scene seconds). "Exxx..." builds right up to the swing; "CALIBUR!" rides the beam. */
const LINES: [number, Voice][] = [
  [3.0, 'still'],
  [7.3, 'roar'],
  [9.0, 'war'],
  [9.5, 'dash'],
  [10.6, 'kiai'],
  [11.8, 'kiai2'],
  [13.0, 'kiai3'],
  [18.2, 'taunt'],
  [19.65, 'roar'],
  [22.4, 'grunt'],
  [24.3, 'kiai'],
  [25.0, 'grunt'],
  [26.2, 'kiai3'],
  [26.7, 'war'],
  [29.3, 'notyet'],
  [31.5, 'push'],
  [32.6, 'strain'],
  [35.0, 'kiai3'],
  [36.8, 'berserk'],
  [41.6, 'dark1'],
  [47.5, 'war'],
  [50.8, 'dark2'],
  [54.6, 'end'],
  [56.3, 'ex'],
  [59.8, 'calibur'],
  [62.2, 'struck'],
  [74.5, 'after'],
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
  private holding = false;
  private holdNext = 0;
  private holdSrcs: AudioBufferSourceNode[] = [];
  private lastCtx = 0;
  private wind: GainNode | null = null;
  /** the ruins burning: a low roar of fire under the crackle */
  private fire: GainNode | null = null;
  private prevT = 0;
  private crackle = 0;
  muted = false;
  /** the listener's levels, 0..1 each */
  /** The starting levels (until someone sets their own): a little headroom, the voices just above the rest. */
  readonly volume = { master: 0.8, music: 0.7, sfx: 0.7, voice: 0.85 };

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
    this.master.gain.value = this.muted ? 0 : 0.9 * this.volume.master;
    this.master.connect(comp).connect(ctx.destination);

    this.verb = ctx.createConvolver();
    this.verb.buffer = this.impulse(2.8);
    const verbOut = ctx.createGain();
    verbOut.gain.value = 0.35;
    this.verb.connect(verbOut).connect(this.master);

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

    this.startWind();
    void this.load();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) void ctx.suspend();
      else if (!this.muted) void ctx.resume();
    });
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9 * this.volume.master, this.ctx.currentTime, 0.05);
  }

  /** Set one of the listener's levels (0..1). */
  setVolume(which: keyof SceneAudio['volume'], v: number): void {
    this.volume[which] = Math.min(1, Math.max(0, v));
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    if (which === 'master') this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9 * this.volume.master, now, 0.05);
    else if (which === 'sfx') this.sfx.gain.setTargetAtTime(this.volume.sfx, now, 0.05);
    else if (which === 'voice') this.voiceBus.gain.setTargetAtTime(1.1 * this.volume.voice, now, 0.05);
    // the music level is applied every frame in update()
  }

  private async load(): Promise<void> {
    const ctx = this.ctx!;
    const get = async (path: string): Promise<AudioBuffer | null> => {
      try {
        // (versioned, so an update's new score and lines replace the cached ones at once)
        const res = await fetch(`${BASE}${path}?${VERSION}`);
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

  /**
   * Where the score is (scene seconds), while it is playing: the page runs the scene on this clock, so a slow frame
   * can never put the picture and the music out of step. Null when there is no score to follow.
   */
  position(): number | null {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || !this.music || !this.musicSrc || this.holding) return null;
    return this.musicAnchor.pos + (ctx.currentTime - this.musicAnchor.ctx) * this.musicAnchor.rate - MUSIC_SHIFT;
  }

  /** `t`: scene seconds; `rate`: slow motion; `ear`: the camera; `held`: the scene is resting in the ruins. */
  update(t: number, rate: number, ear: THREE.Vector3, held = false): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') {
      this.prevT = t;
      return;
    }
    const looped = t < this.prevT;
    if (looped) this.prevT = 0;
    const real = Math.max(0, Math.min(0.25, ctx.currentTime - this.lastCtx));
    this.lastCtx = ctx.currentTime;

    if (this.music && held) {
      // the scene clock has stopped: the score carries on by itself
      if (!this.holding) this.startHold();
      if (ctx.currentTime > this.holdNext - 1) this.holdPass(this.holdNext);
      this.musicBus.gain.setTargetAtTime(0.6 * this.volume.music, ctx.currentTime, 0.3);
    } else if (this.music) {
      if (this.holding) this.stopHold();
      // the score follows the scene clock (re-seeking only when it has really drifted, so slow frames don't stutter it)
      const want = t + MUSIC_SHIFT;
      const now = ctx.currentTime;
      const pos = this.musicAnchor.pos + (now - this.musicAnchor.ctx) * this.musicAnchor.rate;
      if (!this.musicSrc || looped || Math.abs(pos - want) > 0.45 || Math.abs(this.musicAnchor.rate - rate) > 0.02) this.playMusic(want, rate);
      // a held breath of silence just before the blast
      const duck = t > 63.55 && t < 64 ? 0.03 : 1;
      this.musicBus.gain.setTargetAtTime(0.6 * duck * this.volume.music, now, t > 63.5 && t < 64.1 ? 0.01 : 0.08);
    }

    // voices - never once the scene has come to rest (the ruins are only the world itself), and never all at once
    // when the clock jumps (a replay, a skip)
    if (!held && t - this.prevT < 4)
      for (const [at, v] of LINES) {
        const buf = this.voices.get(v);
        if (this.prevT < at && t >= at && buf) this.voice(v, buf, rate);
      }

    // embers crackle and the wind breathes (on the real clock: they go on in the ruins too)
    this.crackle -= real;
    const burning = held || (t > 64.5 && t < 84);
    if (this.crackle <= 0) {
      // after the blast the whole courtyard is burning: more, lower, louder pops
      this.crackle = burning ? 0.03 + Math.random() * 0.14 : 0.08 + Math.random() * 0.35;
      if (burning) this.tick(0.06 + Math.random() * 0.1, 700 + Math.random() * 2200);
      else this.tick(0.04 + Math.random() * 0.05);
    }
    if (this.fire) this.fire.gain.setTargetAtTime(burning ? 0.09 : 0, ctx.currentTime, 1.2);
    if (this.wind) this.wind.gain.setTargetAtTime(0.05 + (t > 44 && t < 59.8 ? 0.06 + (t - 44) * 0.008 : 0) + (t > 66 ? 0.04 : 0), ctx.currentTime, 0.5);
    void ear;
    this.prevT = t;
  }

  /** The ruins: the score's last act on round. */
  private startHold(): void {
    const ctx = this.ctx!;
    this.holding = true;
    // let what was playing ring out under the first pass
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

  /** One pass of the held music starting at `at` (context time), fading in and out so passes overlap smoothly. */
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
    this.musicSrc = null; // the scene's score picks up again where the scene is
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
    } else if (HUSHED.includes(v)) {
      const g = ctx.createGain();
      g.gain.value = 1.6;
      node = node.connect(g);
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
      case 'roar':
        this.boom(0, 1.8, 42, 0.7 * Math.max(near, 0.5));
        this.riser(1.4, 40, 110, 0.25);
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
      case 'slam':
        this.boom(0, 2.2, 48, 1.1 * Math.max(near, 0.5));
        this.debris(1.2);
        break;
      case 'flung':
        this.clang(1.0);
        this.boom(0, 1.0, 70, 0.7);
        this.whoosh(0.05, 0.9, 1800, 300, 0.5);
        break;
      case 'lock':
        this.clang(1.1);
        this.grind(3.6);
        break;
      case 'break':
        this.clang(1.2);
        this.boom(0, 1.6, 60, 0.9);
        this.whoosh(0, 0.5, 400, 3000, 0.5);
        break;
      case 'berserk':
        this.boom(0, 2.5, 40, 0.8);
        this.riser(2.0, 30, 90, 0.35);
        break;
      case 'gather':
        this.riser(9.5, 35, 140, 0.3);
        break;
      case 'barrier':
        this.boom(0, 1.8, 55, 1.0);
        this.whoosh(0, 1.0, 3000, 200, 0.6);
        break;
      case 'charge':
        this.chargeHum(9.8);
        break;
      case 'heartbeat':
        this.boom(0, 0.35, 34, 1.0);
        this.boom(0.27, 0.32, 30, 0.7);
        break;
      case 'release':
        this.beamRoar(4.1);
        break;
      case 'shatter':
        this.clang(1.3);
        this.boom(0, 1.2, 80, 0.9);
        this.debris(1.5);
        break;
      case 'impact':
        this.boom(0, 7, 36, 1.6);
        this.boom(0.05, 3, 70, 1.0);
        this.ringing(2.2);
        this.debris(5);
        break;
      case 'ring':
        this.chime(0.35);
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

  /** Two blades ground together: a trembling metallic scrape that rises. */
  private grind(dur: number): void {
    const ctx = this.ctx!;
    const at = ctx.currentTime;
    const n = this.noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 9;
    bp.frequency.setValueAtTime(1400, at);
    bp.frequency.linearRampToValueAtTime(2600, at + dur);
    const trem = ctx.createGain();
    trem.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 31;
    const depth = ctx.createGain();
    depth.gain.value = 0.5;
    lfo.connect(depth).connect(trem.gain);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.5, at + 0.2);
    g.gain.linearRampToValueAtTime(0.8, at + dur * 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    n.connect(bp).connect(trem).connect(g).connect(this.sfx);
    n.start(at);
    lfo.start(at);
    n.stop(at + dur + 0.05);
    lfo.stop(at + dur + 0.05);
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
    g.gain.exponentialRampToValueAtTime(0.45, at + 0.06);
    g.gain.linearRampToValueAtTime(0.95, at + dur * 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    shaper.connect(g).connect(this.sfx);
    const n = this.noiseSrc();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1200, at);
    lp.frequency.exponentialRampToValueAtTime(7000, at + dur * 0.9);
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

    // the fire bed: a low, breathing roar
    const fn = this.noiseSrc();
    const fbp = ctx.createBiquadFilter();
    fbp.type = 'bandpass';
    fbp.frequency.value = 320;
    fbp.Q.value = 0.6;
    const flfo = ctx.createOscillator();
    flfo.frequency.value = 0.4;
    const flg = ctx.createGain();
    flg.gain.value = 120;
    flfo.connect(flg).connect(fbp.frequency);
    this.fire = ctx.createGain();
    this.fire.gain.value = 0;
    fn.connect(fbp).connect(this.fire).connect(this.master);
    fn.start();
    flfo.start();
  }
}
