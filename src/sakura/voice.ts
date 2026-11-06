/**
 * The Sakura District's voice director: every line anyone says - Aoi on the relay, the squad, Command, the pilot, the
 * station's speakers, Sayo - goes through one channel, one line at a time, so nothing is said over anything else and
 * nothing the story needs is lost when the player does two things at once.
 *
 * Each request has a kind, and the kind decides what happens when the channel is busy:
 *   system     the mission's calls (Command, the pilot): never dropped, first in line
 *   story      what happened and why (a charm's story, the bloom, Sayo): never dropped, in the order it happened
 *   direction  where to go next: dropped only if it no longer applies when its turn comes (`valid`)
 *   place      the squad's word on a place, the first time in: only while it is still news (20 s)
 *   bark       a cry in the fight, a first sight: only if it can be said at once (4 s)
 * Lines are scheduled on the run's clock (`update(t)`), so a paused game holds them and the headless QA can step it.
 *
 * Every line is a file made for it (`lines.ts`, `scripts/sakura-audio.mjs`), each loaded before the run; a line with no
 * file is shown as a caption for as long as it would take to say. The score (Lyria cues) dips under every line.
 */
import type { AudioEngineApi } from '../audio/ids';
import { VERSION } from '../version';
import { type Chain, CUES, LINES, type Speaker } from './lines';

/**
 * What a director plays: its lines (by id), its cues and the caption names, and the folder their files are in. The
 * Sakura District's is the default; Blackwood Hill brings its own (`asylum/lines.ts`).
 */
export interface VoiceBank {
  base: string;
  lines: readonly { id: string; who: string; text: string; chain: Chain }[];
  cues: readonly { id: string; loop: boolean }[];
  label: Readonly<Record<string, string>>;
}

export type LineKind = 'system' | 'story' | 'direction' | 'place' | 'bark';
const RANK: Record<LineKind, number> = { system: 0, story: 1, direction: 2, place: 3, bark: 4 };
const TTL: Record<LineKind, number> = { system: Infinity, story: Infinity, direction: 90, place: 20, bark: 4 };

/** What the caption calls each speaker. */
export const LABEL: Record<Speaker, string> = {
  AOI: 'AOI  //  SHRINE RELAY',
  HANA: 'HANA',
  YUZU: 'YUZU',
  COMMAND: 'COMMAND',
  PILOT: 'PILOT',
  PA: 'STATION PA',
  SAYO: 'SAYO KURENAI',
  MEI: '???',
  MASK: '???',
};

const SAKURA_BANK: VoiceBank = { base: './sakura/', lines: LINES, cues: CUES, label: LABEL };

type Vec = { x: number; y: number; z: number };

interface Request {
  id: string | null;
  who: string;
  text: string;
  kind: LineKind;
  at: number;
  until: number;
  valid?: () => boolean;
  pos?: Vec;
  seq: number;
}

export interface SayOpts {
  kind?: LineKind;
  /** Seconds before it may be said. */
  delay?: number;
  /** Checked when its turn comes: false drops it (a direction already done). */
  valid?: () => boolean;
  /** Said from a place in the world (Sayo on her stage, the masked woman behind you). */
  pos?: Vec;
}

export class SakuraVoice {
  private ctx: BaseAudioContext | null = null;
  private master: GainNode | null = null;
  private voiceBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private verbIn: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private readonly buffers = new Map<string, AudioBuffer>();
  private loading: Promise<void> | null = null;
  private queue: Request[] = [];
  private seq = 0;
  /** The run's clock (seconds) and when the channel is free again. */
  private t = 0;
  private busyUntil = 0;
  private music: { id: string; src: AudioBufferSourceNode; gain: GainNode } | null = null;
  /** The caption for whatever is being said (the game shows it). */
  onCaption: ((label: string, text: string, dur: number) => void) | null = null;
  /** Can this speaker still talk (the squad's dead do not)? Checked when a line's turn comes. */
  canSpeak: ((who: string) => boolean) | null = null;
  /** Ids said this run (lines that are said once a run check it). */
  readonly said = new Set<string>();
  volume = { voice: 1, music: 0.55 };

  private readonly line: Record<string, VoiceBank['lines'][number]>;

  constructor(
    private readonly audio: AudioEngineApi,
    private readonly bank: VoiceBank = SAKURA_BANK,
  ) {
    this.line = Object.fromEntries(bank.lines.map((l) => [l.id, l]));
  }

  /** Fetch and decode every line and cue (decoding needs no gesture: an offline context does it). */
  load(progress?: (done: number, total: number) => void): Promise<void> {
    if (this.loading) return this.loading;
    const files = [...this.bank.lines.map((l) => `voice/${l.id}.mp3`), ...this.bank.cues.map((c) => `music/${c.id}.mp3`)];
    let done = 0;
    const off = typeof OfflineAudioContext !== 'undefined' ? new OfflineAudioContext(1, 1, 44100) : null;
    this.loading = (async () => {
      if (!off) return;
      await Promise.all(
        files.map(async (f) => {
          try {
            const r = await fetch(`${this.bank.base}${f}?v=${VERSION}`);
            if (r.ok) this.buffers.set(f.replace(/^(voice|music)\//, '').replace(/\.mp3$/, ''), await off.decodeAudioData(await r.arrayBuffer()));
          } catch {
            /* a missing file is a caption */
          }
          progress?.(++done, files.length);
        }),
      );
    })();
    return this.loading;
  }

  /** Lines waiting their turn. */
  get pending(): number {
    return this.queue.length;
  }

  /** Is anything being said now. */
  get busy(): boolean {
    return this.t < this.busyUntil;
  }

  /** A line from `lines.ts` (once a run if `once`). */
  say(id: string, o: SayOpts & { once?: boolean } = {}): void {
    const l = this.line[id];
    if (!l) return;
    if (o.once && this.said.has(id)) return;
    if (this.queue.some((q) => q.id === id)) return;
    this.said.add(id);
    this.push(id, this.bank.label[l.who] ?? l.who, l.text, o);
  }

  /** Several lines, in order (a conversation). */
  sayAll(ids: readonly string[], o: SayOpts & { once?: boolean } = {}): void {
    ids.forEach((id, i) => this.say(id, { ...o, delay: (o.delay ?? 0) + i * 0.01 }));
  }

  /** Words with no recording (the mission's own calls that have none): a caption through the same channel. */
  caption(who: string, text: string, o: SayOpts = {}): void {
    if (this.queue.some((q) => q.text === text)) return;
    this.push(null, who, text, o);
  }

  private push(id: string | null, who: string, text: string, o: SayOpts): void {
    const kind = o.kind ?? 'story';
    const at = this.t + (o.delay ?? 0);
    this.queue.push({ id, who, text, kind, at, until: at + TTL[kind], valid: o.valid, pos: o.pos, seq: this.seq++ });
  }

  /** The next line when the channel is free: the most important waiting, the oldest first among equals. */
  update(t: number): void {
    this.t = t;
    this.follow();
    if (t < this.busyUntil) return;
    this.queue = this.queue.filter((q) => t <= q.until && (q.kind !== 'bark' || t - q.at <= TTL.bark));
    let best: Request | null = null;
    for (const q of this.queue) {
      if (q.at > t) continue;
      if (!best || RANK[q.kind] < RANK[best.kind] || (RANK[q.kind] === RANK[best.kind] && q.seq < best.seq)) best = q;
    }
    if (!best) return;
    this.queue.splice(this.queue.indexOf(best), 1);
    const speaker = best.id ? this.line[best.id]?.who : undefined;
    if ((best.valid && !best.valid()) || (speaker && this.canSpeak && !this.canSpeak(speaker))) {
      this.update(t);
      return;
    }
    const dur = this.play(best);
    this.busyUntil = t + dur + (best.kind === 'system' ? 0.6 : 0.4);
    this.onCaption?.(best.who, best.text, dur + 0.6);
  }

  /** A new run: nothing waiting, nothing said. */
  reset(): void {
    this.queue.length = 0;
    this.said.clear();
    this.busyUntil = 0;
  }

  // ---------------------------------------------------------------------------------------------
  // the sound
  // ---------------------------------------------------------------------------------------------

  private graph(): boolean {
    if (this.ctx) return true;
    const ctx = this.audio.context;
    const out = this.audio.input;
    if (!ctx || !out) return false;
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(out);
    this.voiceBus = ctx.createGain();
    this.voiceBus.gain.value = this.volume.voice;
    this.voiceBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.volume.music;
    this.musicBus.connect(this.master);
    // a soft hall (synthesised impulse): the relay's shimmer, the station's speakers, the theatre
    const len = Math.floor(ctx.sampleRate * 2.2);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    const verb = ctx.createConvolver();
    verb.buffer = ir;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3600;
    this.verbIn = ctx.createGain();
    this.verbIn.connect(verb).connect(lp).connect(this.master);
    const nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noise = nb;
    return true;
  }

  /** Say it now; its length in seconds (a line with no file: as long as it would take to read). */
  private play(r: Request): number {
    const words = r.text.split(/\s+/).length;
    const guess = Math.min(12, 1.4 + words * 0.36);
    const buf = r.id ? this.buffers.get(r.id) : undefined;
    if (!buf || !this.graph()) {
      if (r.kind === 'system' || this.line[r.id ?? '']?.chain === 'radio') this.audio.play('radio_chirp', { priority: 1, volume: 0.5 });
      return buf ? buf.duration : guess;
    }
    const chain: Chain = this.line[r.id!]?.chain ?? 'radio';
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    let node: AudioNode = src;
    const g = ctx.createGain();
    const band = (lo: number, hi: number): void => {
      const h = ctx.createBiquadFilter();
      h.type = 'highpass';
      h.frequency.value = lo;
      const l = ctx.createBiquadFilter();
      l.type = 'lowpass';
      l.frequency.value = hi;
      node.connect(h).connect(l);
      node = l;
    };
    const grit = (k: number): void => {
      const ws = ctx.createWaveShaper();
      const curve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) {
        const x = (i / 1023) * 2 - 1;
        curve[i] = Math.tanh(x * k) / Math.tanh(k);
      }
      ws.curve = curve;
      node.connect(ws);
      node = ws;
    };
    let wet = 0.08;
    switch (chain) {
      case 'relay':
        // an old shrine transmitter: narrow, a breath of static, a little shimmer
        band(260, 4200);
        grit(1.4);
        wet = 0.28;
        g.gain.value = 1.15;
        this.hiss(now, buf.duration + 0.4, 0.014);
        break;
      case 'radio':
        band(380, 3400);
        grit(2.2);
        wet = 0.02;
        g.gain.value = 1.2;
        this.squelch(now);
        this.squelch(now + buf.duration);
        this.hiss(now, buf.duration, 0.008);
        break;
      case 'pa': {
        band(380, 3600);
        grit(1.8);
        wet = 0.65;
        g.gain.value = 1.1;
        const d = ctx.createDelay(1);
        d.delayTime.value = 0.29;
        const dg = ctx.createGain();
        dg.gain.value = 0.3;
        node.connect(d).connect(dg).connect(g);
        break;
      }
      case 'stage':
        wet = 0.6;
        g.gain.value = 1.3;
        break;
      case 'far':
        band(160, 2800);
        wet = 0.75;
        g.gain.value = 0.9;
        break;
      case 'close':
        wet = 0.05;
        g.gain.value = 1.4;
        break;
    }
    node.connect(g);
    let out: AudioNode = g;
    if (r.pos) {
      const p = ctx.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = 6;
      p.rolloffFactor = 0.8;
      p.positionX.value = r.pos.x;
      p.positionY.value = r.pos.y;
      p.positionZ.value = r.pos.z;
      g.connect(p);
      out = p;
    }
    out.connect(this.voiceBus!);
    if (wet > 0 && this.verbIn) {
      const s = ctx.createGain();
      s.gain.value = wet;
      out.connect(s).connect(this.verbIn);
    }
    src.start(now);
    this.duck(buf.duration);
    return buf.duration;
  }

  private squelch(at: number): void {
    const ctx = this.ctx!;
    if (!this.noise) return;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.09, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
    s.connect(f).connect(g).connect(this.voiceBus!);
    s.start(at);
    s.stop(at + 0.15);
  }

  private hiss(at: number, dur: number, level: number): void {
    const ctx = this.ctx!;
    if (!this.noise) return;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 3000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(level, at + 0.08);
    g.gain.setValueAtTime(level, at + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.15);
    s.connect(f).connect(g).connect(this.voiceBus!);
    s.start(at);
    s.stop(at + dur + 0.2);
  }

  /** The score dips under every line, then comes back. */
  private duck(dur: number): void {
    const m = this.musicBus;
    if (!m || !this.ctx) return;
    const t = this.ctx.currentTime;
    m.gain.cancelScheduledValues(t);
    m.gain.setTargetAtTime(this.volume.music * 0.35, t, 0.1);
    m.gain.setTargetAtTime(this.volume.music, t + dur + 0.3, 0.6);
  }

  /** The listener follows the camera (Sayo and the masked woman are placed round you). */
  private follow(): void {
    const ctx = this.ctx;
    const li = this.audio.listener;
    if (!ctx || !li) return;
    const L = ctx.listener;
    if (!L.positionX) return;
    L.positionX.value = li.x;
    L.positionY.value = li.y;
    L.positionZ.value = li.z;
    L.forwardX.value = li.fx;
    L.forwardY.value = 0;
    L.forwardZ.value = li.fz;
    L.upX.value = 0;
    L.upY.value = 1;
    L.upZ.value = 0;
  }

  // ---------------------------------------------------------------------------------------------
  // the score
  // ---------------------------------------------------------------------------------------------

  /** Play a cue (crossfading out the one playing); the same cue already playing is left alone. */
  cue(id: string | null, fade = 2.5): void {
    if ((this.music?.id ?? null) === id) return;
    if (!this.graph()) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const old = this.music;
    if (old) {
      old.gain.gain.cancelScheduledValues(t);
      old.gain.gain.setTargetAtTime(0.0001, t, fade / 3);
      old.src.stop(t + fade + 0.2);
      this.music = null;
    }
    const buf = id ? this.buffers.get(id) : undefined;
    if (!id || !buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = this.bank.cues.find((c) => c.id === id)?.loop ?? false;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(1, t + fade);
    src.connect(gain).connect(this.musicBus!);
    src.start(t);
    this.music = { id, src, gain };
  }

  get cueId(): string | null {
    return this.music?.id ?? null;
  }

  /** Everything quiet (a new run, the results). */
  stopAll(): void {
    this.cue(null, 0.6);
    this.reset();
  }
}
