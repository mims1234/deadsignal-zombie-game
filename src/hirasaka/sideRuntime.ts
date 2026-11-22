/**
 * HIRASAKA's side stories on this screen (`sides.ts`): the prompts at their places, the things drawn there (one mesh,
 * `sideModels.ts`), what is said when a step is done, the payoff, and the HUD's one quiet line. Solo and co-op alike it
 * follows the story's shared state (`StoryView.sides`); a step is asked for through the story's act `'sidep'` (solo: the
 * story here; co-op: the simulation). The reward is each player's own (points, ammunition), paid on every screen when
 * the shared state says the story is finished, as ZARYA's are.
 *
 * Lines are said one after another (a caption each until its voice is made), never over each other.
 */
import type { Game } from '../game/game';
import type { InteractionTarget } from '../game/interaction';
import { addReserve } from '../logic/ammo';
import { addCash } from '../logic/economy';
import type { HudState } from '../ui/hudTypes';
import { LINE } from './lines';
import { inDeep, type Spot } from './places';
import { sideIcon, sideMarks } from './sideModels';
import { SIDE, SIDE_THINGS, sideChanges, sideEmpty, sidePrompts, sideRewardWords, sideRow, sideShown, type SideChange } from './sides';
import type { HirasakaSound } from './sound';
import type { StoryView } from './story';

type Act = (a: string, i: number) => void;

export class HirasakaSides {
  private readonly marks: ReturnType<typeof sideMarks>;
  private prev: number[] | null = null;
  private readonly queue: string[] = [];
  private lineT = 0;
  private t = 0;
  private active = false;

  constructor(
    private readonly g: Game,
    private readonly view: () => StoryView,
    private readonly act: Act,
    private readonly sound: HirasakaSound,
  ) {
    this.marks = sideMarks();
    g.worldRoot.add(this.marks.mesh);
    g.interaction.sources.push((out) => this.targets(out));
  }

  /** A new run. */
  reset(): void {
    this.active = true;
    this.prev = null;
    this.queue.length = 0;
    this.lineT = 0;
    this.show(sideEmpty());
  }

  /** The run is over: nothing more is said. */
  end(): void {
    this.active = false;
    this.queue.length = 0;
  }

  private sides(): number[] {
    return this.view().sides ?? sideEmpty();
  }

  private show(sides: readonly number[]): void {
    const on = sideShown(sides, true);
    SIDE_THINGS.forEach((t, j) => this.marks.set(t.key, on[j]!));
  }

  update(dt: number): void {
    this.t += dt;
    const sides = this.sides();
    if (this.prev && this.active) for (const c of sideChanges(this.prev, sides)) this.changed(c);
    this.prev = [...sides];
    this.show(sides);
    this.marks.update(this.t);
    // the lines, one after another
    this.lineT -= dt;
    if (this.lineT <= 0 && this.queue.length) {
      const id = this.queue.shift()!;
      const l = LINE[id];
      const d = this.sound.say(id, { chain: l?.chain ?? 'dry', story: true });
      this.lineT = Math.max(d, Math.min(14, 2.5 + (l?.text.length ?? 0) / 18)) + 0.3;
    }
  }

  /** Lines still to be said (the QA reads it). */
  get pending(): number {
    return this.queue.length;
  }

  private changed(c: SideChange): void {
    const g = this.g;
    const q = SIDE[c.s]!;
    this.queue.push(...c.lines);
    for (const piece of c.pieces) g.feed(piece, 'good');
    if (c.found && !c.finished) g.hudEvent({ type: 'feed', text: `${q.title}  -  IN THE JOURNAL`, tone: 'normal', icon: sideIcon(q.id) });
    if (!c.finished) {
      g.audio.play('pickup_ammo', { priority: 2, volume: 0.6 });
      return;
    }
    const r = q.reward;
    const inv = g.session.inv;
    if (r.cash) addCash(inv, r.cash);
    if (r.ammo) for (const w of inv.slots) if (w) addReserve(w.ammo, w.ammo.reserveMax);
    g.banner(q.title, `${q.done}  ${sideRewardWords(r)}`, 'good', 6);
    g.audio.play(r.cash ? 'buy_ok' : 'upgrade_ok', { priority: 3 });
  }

  private targets(out: InteractionTarget[]): void {
    const g = this.g;
    if (!this.active || !g.playerAlive()) return;
    const v = this.view();
    if (v.act >= 3) return;
    const p = g.player;
    for (const s of sidePrompts(this.sides(), p.x, p.y, p.z)) {
      const i = s.i;
      out.push({ id: `hs:${s.id}`, dist: s.d, text: s.text, sub: s.sub ?? '', tone: 'normal', hold: s.hold, enabled: i >= 0, onUse: i >= 0 ? () => this.act('sidep', i) : () => {} });
    }
  }

  /** The HUD's one quiet line for the nearest found, unfinished story (never in the middle of the screen). */
  objectives(list: HudState['objectives'], underground: boolean): void {
    const p = this.g.player;
    const here = (at: Spot): boolean => inDeep(at.x) === underground;
    const row = sideRow(this.sides(), p.x, p.z, here);
    if (!row) return;
    list.push({ id: `hs-${row.id}`, title: row.title, detail: row.detail, state: 'active', progress: row.progress, tracked: false, distance: here(row.at) ? Math.hypot(row.at.x - p.x, row.at.z - p.z) : -1 });
  }

  dispose(): void {
    this.marks.dispose();
  }
}
