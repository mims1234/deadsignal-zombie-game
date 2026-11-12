/**
 * ZARYA's kiosk shutters, weapon mods and repair booth on screen (`mods.ts` has the rules): the prompts (BUY THE
 * SHUTTER, FIT A DRUM, the booth's refusal), the mod parts picked up in passing, what a shutter going up gives whoever
 * stands by it, the mod's word on the HUD's weapon panel, and this player's own mods plugged into the weapon system.
 *
 * `runtime.ts` owns it and calls it in a few places (each marked "kiosks and mods"). Like the rest of the story, the
 * shutters and the parts change on whoever runs the story (the solo game, or the co-op host) and this reacts to the
 * state changing; a fitted mod is this player's alone, put on their gun once the story says the parts were spent.
 */
import type { Game } from '../game/game';
import type { InteractionTarget } from '../game/interaction';
import { spendCash } from '../logic/economy';
import type { HudState } from '../ui/hudTypes';
import { MODS, WeaponMods, benchOffer, boothRefusal, modNames, modWord } from './mods';
import { BENCHES, CH, KBIT, MOD_COST, MOD_PARTS, SHUTTERS, STORY, ZaryaStory, type StoryAct, type StoryView } from './story';
import { TOWN } from './unlock';
// (items, round 3: the mod part's picture with its feed line)
import { MOD_ICON } from './items';
import type { Spot } from './places';

/** How near a lying mod part has to be to be picked up in passing; how near a kiosk a player must be to share in it. */
const PICKUP = 2.4;
const SHARE = 12;
/** Seconds a fit waits for the story to say the parts were spent (co-op: the host's answer). */
const FIT_WAIT = 3;

export class KiosksAndMods {
  readonly mods = new WeaponMods();
  private prevK = 0;
  private askT = 0;
  private t = 0;
  private pending: { c: NonNullable<Game['session']['inv']['slots'][0]>; i: number; until: number; spent: number } | null = null;

  constructor(
    private readonly g: Game,
    private readonly act: (a: StoryAct, i: number) => void,
    private readonly view: () => StoryView,
    private readonly live: () => boolean,
  ) {
    g.weapons.mods = this.mods;
    this.mods.onFrost = (z) => g.fx.sparkle({ x: z.x, y: z.y + 1.2, z: z.z }, 0x9fd8ff, 5);
    // the repair booth upgrades nothing until the sleeping repairman's three tools are back on his counter
    g.interaction.stationGate = (def) => (this.live() && def.kind === 'upgrade' && /repair/i.test(def.name) ? boothRefusal(this.view()) : null);
  }

  reset(coop: boolean): void {
    this.mods.reset();
    // (in co-op the infected walk on the host: a frost coat glints but cannot slow one)
    this.mods.slows = !coop;
    this.prevK = 0;
    this.askT = 0;
    this.t = 0;
    this.pending = null;
  }

  /** Every frame of a run: the mods in hand, the parts lying about, and what changed in the shared state. */
  update(dt: number, v: StoryView, alive: boolean, remote: boolean): void {
    const g = this.g;
    const inv = g.session.inv;
    this.t += dt;
    this.askT = Math.max(0, this.askT - dt);
    const held = inv.slots[inv.activeSlot] ?? null;
    if (this.mods.update(dt, inv.slots, g.weapons.holstered || g.weapons.hidden ? null : held, g.weapons.adsAmount)) g.audio.play('pistol_slide', { priority: 2, volume: 0.7, rate: 1.4 });

    // a mod part lying about, picked up in passing
    if (alive && this.askT <= 0) {
      const p = g.player;
      MOD_PARTS.forEach((at, i) => {
        if (this.askT > 0 || Math.hypot(at.x - p.x, at.z - p.z) > PICKUP || !ZaryaStory.can(v, 'modPart', i)) return;
        this.act('modPart', i);
        if (remote) this.askT = 0.4;
      });
    }

    // what changed, whoever changed it
    const k = v.k;
    const was = this.prevK;
    this.prevK = k;
    if (k !== was) this.react(was, k, v);
    // the fit this player asked for: the parts are spent, so the mod goes on their gun
    const pend = this.pending;
    if (pend) {
      const spent = k >> KBIT.spent;
      if (spent >= pend.spent + MOD_COST[pend.i]!) {
        this.pending = null;
        this.mods.fit(pend.c, pend.i);
        g.audio.play('upgrade_ok', { priority: 2 });
        g.feed(`${MODS[pend.i]!.word} FITTED  -  ${MODS[pend.i]!.what.toUpperCase()}`, 'good');
      } else if (this.t > pend.until) this.pending = null;
    }
  }

  private react(was: number, k: number, v: StoryView): void {
    const g = this.g;
    const p = g.player;
    SHUTTERS.forEach((s, i) => {
      const bit = 1 << (KBIT.shutter + i);
      if (!(k & bit) || was & bit) return;
      g.audio.play('station_open', { priority: 2, volume: 0.9 });
      // everyone standing by it shares what is inside: the guns in their hands filled
      if (Math.hypot(s.at.x - p.x, s.at.z - p.z) <= SHARE && g.playerAlive()) {
        for (const c of g.session.inv.slots) {
          if (!c) continue;
          c.ammo.reserve = c.ammo.reserveMax;
          c.ammo.mag = c.ammo.magSize;
          c.ammo.reload = null;
        }
        g.weapons.cancelActions();
        g.audio.play('pickup_ammo', { priority: 2 });
        g.hudEvent({ type: 'feed', text: 'THE SHUTTER ROLLS UP  -  AMMUNITION, AND A MOD PART', tone: 'good', icon: MOD_ICON });
      } else g.hudEvent({ type: 'feed', text: `A KIOSK SHUTTER ROLLS UP ${s.name.toUpperCase()}  -  A MOD PART`, tone: 'good', icon: MOD_ICON });
    });
    const found = (n: number): number => ZaryaStory.count(n & ((1 << KBIT.spent) - 1));
    const parts = ZaryaStory.modParts(v);
    MOD_PARTS.forEach((_, i) => {
      const bit = 1 << (KBIT.part + i);
      if (!(k & bit) || was & bit) return;
      g.audio.play('pickup_ammo', { priority: 2, volume: 0.8 });
      g.hudEvent({ type: 'feed', text: `A MOD PART  -  ${parts} TO FIT`, tone: 'good', icon: MOD_ICON });
    });
    // someone else's fit (or this player's, said once it lands): how many are left for the squad
    if (k >> KBIT.spent !== was >> KBIT.spent && !this.pending && found(k) > 0) g.feed(`MOD PARTS LEFT  -  ${parts}`, 'normal');
  }

  /** The prompts: a kiosk's shutter, and a mod at a bench. */
  targets(out: InteractionTarget[], v: StoryView): void {
    const g = this.g;
    const p = g.player;
    const R = STORY.reach;
    const dist = (o: Spot): number => Math.hypot(o.x - p.x, o.z - p.z);

    // ---- the kiosk shutters ----
    SHUTTERS.forEach((s, i) => {
      const d = dist(s.at);
      if (d > R || !ZaryaStory.can(v, 'shutter', i)) return;
      const cash = g.session.inv.cash;
      const ok = cash >= STORY.shutter;
      out.push({
        id: `zy-shutter-${i}`,
        dist: d,
        text: `BUY THE SHUTTER  $${STORY.shutter}`,
        sub: ok ? 'Ammunition and a mod part inside. One pays for the squad' : `You have $${cash}`,
        tone: ok ? 'good' : 'warn',
        hold: 0.8,
        enabled: ok,
        onUse: () => {
          // the buyer's own points, then the act (as the pageant tickets)
          if (!ZaryaStory.can(this.view(), 'shutter', i) || !spendCash(g.session.inv, STORY.shutter)) return;
          g.hudEvent({ type: 'cash', amount: -STORY.shutter });
          this.act('shutter', i);
        },
      });
    });

    // ---- a mod at a bench, for the gun in hand ----
    if (v.ch < CH.ground || g.weapons.holstered || g.weapons.hidden) return;
    const inv = g.session.inv;
    const held = inv.slots[inv.activeSlot];
    if (!held) return;
    const parts = ZaryaStory.modParts(v);
    const found = ZaryaStory.count(v.k & ((1 << KBIT.spent) - 1));
    for (const bench of BENCHES) {
      const d = dist(bench.at);
      if (d > R) continue;
      // the story's own building comes first at a bench; a mod comes before taking what was built
      const first = TOWN.recipes.some((_, r) => ZaryaStory.can(v, 'build', r)) ? d + 0.05 : d - 0.05;
      const offer = benchOffer(held.id, this.mods.mask(held), parts, bench.main);
      if (offer.i >= 0) {
        const m = MODS[offer.i]!;
        const busy = this.pending !== null;
        out.push({
          id: `zy-mod-${offer.i}`,
          dist: first,
          text: `FIT ${m.name}`,
          sub: busy ? 'Fitting...' : `${m.what}. ${MOD_COST[offer.i]} of the squad's ${parts} mod part${parts === 1 ? '' : 's'}`,
          tone: 'good',
          hold: 1.2,
          enabled: !busy,
          onUse: () => {
            const now = this.view();
            if (this.pending || !ZaryaStory.can(now, 'mod', offer.i)) return;
            this.pending = { c: held, i: offer.i, until: this.t + FIT_WAIT, spent: now.k >> KBIT.spent };
            this.act('mod', offer.i);
          },
        });
      } else if (offer.short === 'bench' && parts >= MOD_COST[0]) {
        out.push({ id: 'zy-mod-bench', dist: first + 0.1, text: 'WORKBENCH', sub: "The Charge mod wants a proper bench: Timur's, in the garages", tone: 'warn', hold: 0, enabled: false, onUse: () => {} });
      } else if (offer.short === 'parts' && found > 0 && d <= R * 0.7) {
        out.push({ id: 'zy-mod-parts', dist: first + 0.1, text: 'WORKBENCH', sub: parts ? `A mod wants more parts: the squad has ${parts}` : 'No mod parts left. The kiosks each hold one', tone: 'warn', hold: 0, enabled: false, onUse: () => {} });
      }
      return;
    }
  }

  /** The mods on the gun in hand, as a word on the HUD's weapon panel (with the Charge's state). */
  decorate(st: HudState): void {
    const w = st.weapon;
    if (!w || w.melee) return;
    const inv = this.g.session.inv;
    const held = inv.slots[inv.activeSlot] ?? null;
    const mask = this.mods.mask(held);
    if (!mask) return;
    const word = modWord(mask, this.mods.isCharged(held));
    st.weapon = { ...w, tierLabel: w.tierLabel ? `${w.tierLabel} · ${word}` : word };
  }

  /** The mods' line in the journal: what the squad holds, what is fitted to the gun in hand. */
  journalLine(v: StoryView): string | null {
    const found = ZaryaStory.count(v.k & ((1 << KBIT.spent) - 1));
    if (!found) return null;
    const inv = this.g.session.inv;
    const names = modNames(this.mods.mask(inv.slots[inv.activeSlot] ?? null));
    return `Mod parts: ${ZaryaStory.modParts(v)} to fit (${found} of ${SHUTTERS.length + MOD_PARTS.length} found).${names ? ` The gun in your hands wears: ${names}.` : ''}`;
  }
}

