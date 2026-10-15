/**
 * Contextual interactions: crates, stations (number-key panels), the transmitter console, the extraction terminal and the
 * helicopter door. Produces the HUD prompt / station panel each frame and executes actions exactly once.
 */
import { RADIO_REACH } from '../logic/extraction';
import { CARD_MODE, COOP, ECONOMY, MISSION, PLAYER, SURVIVORS, WEAPONS } from '../config';
import { buyMenu, purchaseBuy, purchaseUpgrade, upgradeMenu, type BuyItemId, type StationItem } from '../logic/economy';
import type { Edges } from '../player/input';
import type { HudPrompt, StationPanel } from '../ui/hudTypes';
import type { GameCtx } from './ctx';
import type { Entities, StationRuntime } from './entities';

/** What the interaction layer needs from the mission runtime. */
export interface MissionApi {
  transmitterPos(): { x: number; z: number };
  canActivateTransmitter(): boolean;
  activateTransmitter(): void;
  terminalPos(): { x: number; z: number };
  terminalState(): 'locked' | 'available' | 'busy';
  callExtraction(): boolean;
  heliDoorPos(): { x: number; z: number } | null;
  canBoard(): boolean;
  board(): boolean;
}

/** Trapped survivors: opening a cage. Co-op: picking up a downed teammate. */
export interface RescueApi {
  rescueTarget(): { id: string; name: string; dist: number } | null;
  rescue(id: string): void;
  reviveTarget(): { id: string; name: string; dist: number } | null;
  revive(id: string): void;
}

/** Card recovery: purging a downed carrier. */
export interface CureApi {
  cureTarget(): { id: string; name: string; dist: number } | null;
  cure(id: string): void;
}

/** One thing the player could use right now. Map features add their own through `Interaction.sources`. */
export interface InteractionTarget {
  id: string;
  dist: number;
  text: string;
  sub?: string;
  tone: HudPrompt['tone'];
  hold: number;
  enabled: boolean;
  /** Hold interactions: keep completing while E stays held (repairing a barricade board after board). */
  repeat?: boolean;
  onUse(): void;
}

/** Something another module offers to interact with (see `Interaction.providers`). */
export type InteractTarget = Target;

export interface InteractionOutput {
  prompt: HudPrompt | null;
  panel: StationPanel | null;
  /** True while a station panel is open (weapon slot keys are then item keys). */
  panelOpen: boolean;
}

type Target = InteractionTarget;

export class Interaction {
  /** Extra interactables (the Asylum's doors, perk machines, wall chalks...): each pushes its targets in reach. */
  readonly sources: ((targets: InteractionTarget[]) => void)[] = [];
  private holdT = 0;
  private holdId = '';
  private holdLocked = false;
  private panelStation: StationRuntime | null = null;
  private readonly out: InteractionOutput = { prompt: null, panel: null, panelOpen: false };
  /** Extra interaction targets from other modules (the Asylum's barricades), asked every frame. */
  readonly providers: (() => InteractTarget | null)[] = [];
  /** Co-op revive holds are multiplied by this (the Asylum's SECOND WIND perk picks teammates up faster). */
  reviveMul: () => number = () => 1;

  constructor(
    private readonly ctx: GameCtx,
    private readonly entities: Entities,
    private readonly mission: MissionApi,
    private readonly cards: CureApi,
    private readonly squad: RescueApi,
  ) {}

  reset(): void {
    this.holdT = 0;
    this.holdId = '';
    this.holdLocked = false;
    this.closePanel(false);
  }

  get panelOpen(): boolean {
    return this.panelStation !== null;
  }

  closePanel(sound = true): void {
    if (this.panelStation && sound) this.ctx.audio.play('station_close', { priority: 1, volume: 0.6 });
    this.panelStation = null;
  }

  update(dt: number, edges: Edges, eHeld: boolean): InteractionOutput {
    const ctx = this.ctx;
    const out = this.out;
    out.prompt = null;
    out.panel = null;
    out.panelOpen = false;
    if (!ctx.playerAlive()) {
      this.closePanel(false);
      return out;
    }
    const px = ctx.player.x;
    const pz = ctx.player.z;

    // ---- open station panel ----
    if (this.panelStation) {
      const s = this.panelStation;
      const d = Math.hypot(s.def.x - px, s.def.z - pz);
      if (d > ECONOMY.stationRange + 1.2 || edges.interactPressed) {
        const byPress = edges.interactPressed;
        this.closePanel();
        // The press that closed the menu must not fall through and reopen the same station this frame.
        if (byPress) return out;
      } else {
        for (const digit of edges.digits) this.handleDigit(s, digit);
        out.panel = this.buildPanel(s);
        out.panelOpen = true;
        this.holdT = 0;
        return out;
      }
    }

    const target = this.findTarget();
    if (!target) {
      this.holdT = 0;
      this.holdId = '';
      if (!eHeld) this.holdLocked = false;
      return out;
    }
    if (!target.enabled) {
      out.prompt = { key: '', text: target.text, sub: target.sub, hold: -1, tone: target.tone };
      return out;
    }

    if (target.hold <= 0) {
      out.prompt = { key: 'E', text: target.text, sub: target.sub, hold: -1, tone: target.tone };
      if (edges.interactPressed) target.onUse();
      return out;
    }

    // hold interaction
    if (this.holdId !== target.id) {
      this.holdId = target.id;
      this.holdT = 0;
    }
    if (!eHeld) this.holdLocked = false;
    if (eHeld && !this.holdLocked) {
      this.holdT += dt;
      if (this.holdT >= target.hold) {
        this.holdT = 0;
        this.holdLocked = !target.repeat; // must release E before another hold can complete (unless it repeats)
        target.onUse();
      }
    } else {
      this.holdT = Math.max(0, this.holdT - dt * 2);
    }
    out.prompt = { key: 'E', text: target.text, sub: target.sub, hold: Math.min(1, this.holdT / target.hold), tone: target.tone };
    return out;
  }

  // ---------------------------------------------------------------------------------------------

  private findTarget(): Target | null {
    const ctx = this.ctx;
    const px = ctx.player.x;
    const pz = ctx.player.z;
    const fx = -Math.sin(ctx.player.yaw);
    const fz = -Math.cos(ctx.player.yaw);
    const targets: Target[] = [];
    const facing = (x: number, z: number, dist: number): boolean => {
      if (dist < 1.6) return true;
      return ((x - px) * fx + (z - pz) * fz) / dist > 0.25;
    };

    for (const c of this.entities.crates) {
      if (c.phase === 'gone') continue;
      const d = Math.hypot(c.def.x - px, c.def.z - pz);
      if (d > PLAYER.interactReach + (c.phase === 'offer' ? 0.6 : 0) || !facing(c.def.x, c.def.z, d)) continue;
      if (c.phase === 'closed') {
        targets.push({
          id: `crate:${c.def.id}`,
          dist: d,
          text: 'OPEN MYSTERY BOX',
          sub: 'Ammunition, grenades or a gun - and a little cash',
          tone: 'normal',
          hold: ECONOMY.crateOpenTime,
          enabled: true,
          onUse: () => this.entities.openCrate(c),
        });
      } else if (c.phase === 'spin') {
        targets.push({ id: `crate-spin:${c.def.id}`, dist: d, text: 'MYSTERY BOX', sub: 'The reel is spinning...', tone: 'normal', hold: 0, enabled: false, onUse: () => {} });
      } else {
        const t = this.entities.offerText(c);
        targets.push({ id: `crate-take:${c.def.id}`, dist: d, text: t.text, sub: t.sub, tone: 'good', hold: 0, enabled: true, onUse: () => this.entities.takeBoxPrize(c) });
      }
    }
    for (const s of this.entities.stations) {
      const d = Math.hypot(s.def.x - px, s.def.z - pz);
      if (d > ECONOMY.stationRange || !facing(s.def.x, s.def.z, d)) continue;
      targets.push({
        id: `station:${s.def.id}`,
        dist: d,
        text: s.def.kind === 'buy' ? 'USE SUPPLY CAGE' : 'USE ARMORY BENCH',
        sub: s.def.kind === 'buy' ? 'Ammo, armor, grenades, weapons' : 'Upgrade your weapons',
        tone: 'normal',
        hold: 0,
        enabled: true,
        onUse: () => {
          this.panelStation = s;
          ctx.audio.play('station_open', { priority: 1, volume: 0.7 });
          s.model.setState('near');
        },
      });
    }
    // transmitter console
    if (this.mission.canActivateTransmitter()) {
      const t = this.mission.transmitterPos();
      const d = Math.hypot(t.x - px, t.z - pz);
      if (d < 3.4) {
        targets.push({
          id: 'transmitter',
          dist: d,
          text: this.ctx.level.data.text.defensePrompt,
          sub: `Hold the marked area for ${MISSION.defense.duration}s while the uplink completes`,
          tone: 'warn',
          hold: MISSION.defense.activateHold,
          enabled: true,
          onUse: () => this.mission.activateTransmitter(),
        });
      }
    }
    // extraction terminal
    {
      const t = this.mission.terminalPos();
      const d = Math.hypot(t.x - px, t.z - pz);
      const st = this.mission.terminalState();
      if (d < RADIO_REACH && st !== 'busy') {
        if (st === 'locked') {
          targets.push({ id: 'terminal-locked', dist: d, text: 'RADIO BEACON LOCKED', sub: 'Complete both contracts to call extraction', tone: 'warn', hold: 0, enabled: false, onUse: () => {} });
        } else {
          targets.push({
            id: 'terminal',
            dist: d,
            text: 'CALL EXTRACTION',
            sub: 'Hold position - the final horde will converge',
            tone: 'danger',
            hold: MISSION.extraction.callHold,
            enabled: true,
            onUse: () => this.mission.callExtraction(),
          });
        }
      }
    }
    // downed card carrier
    const down = this.cards.cureTarget();
    if (down) {
      targets.push({
        id: `cure:${down.id}`,
        dist: down.dist,
        text: 'PURGE THE SIGNAL',
        sub: `${down.name} - administer the counter-agent`,
        tone: 'good',
        hold: CARD_MODE.cureHold,
        enabled: true,
        onUse: () => this.cards.cure(down.id),
      });
    }
    // a downed teammate (co-op)
    const mate = this.squad.reviveTarget();
    if (mate) {
      targets.push({
        id: `revive:${mate.id}`,
        dist: mate.dist - 1, // before anything else in reach
        text: `REVIVE ${mate.name.toUpperCase()}`,
        sub: this.reviveMul() < 1 ? 'Hold to pick them up - SECOND WIND: faster' : 'Hold to pick them up',
        tone: 'good',
        hold: COOP.reviveHold * this.reviveMul(),
        enabled: true,
        onUse: () => this.squad.revive(mate.id),
      });
    }
    // a trapped survivor
    const cage = this.squad.rescueTarget();
    if (cage) {
      targets.push({
        id: `rescue:${cage.id}`,
        dist: cage.dist,
        text: `FREE ${cage.name.toUpperCase()}`,
        sub: 'Break the lock - they will fight with you',
        tone: 'good',
        hold: SURVIVORS.rescueHold,
        enabled: true,
        onUse: () => this.squad.rescue(cage.id),
      });
    }
    // helicopter door
    const door = this.mission.heliDoorPos();
    if (door && this.mission.canBoard()) {
      const d = Math.hypot(door.x - px, door.z - pz);
      targets.push({ id: 'board', dist: d, text: 'BOARD HELICOPTER', sub: 'Extract now', tone: 'good', hold: 0, enabled: true, onUse: () => this.mission.board() });
    }
    for (const provide of this.providers) {
      const t = provide();
      if (t) targets.push(t);
    }
    for (const src of this.sources) src(targets);
    if (targets.length === 0) return null;
    // prefer actionable targets, then nearest
    targets.sort((a, b) => (a.enabled === b.enabled ? a.dist - b.dist : a.enabled ? -1 : 1));
    return targets[0]!;
  }

  // ---------------------------------------------------------------------------------------------
  // station panels
  // ---------------------------------------------------------------------------------------------

  private items(s: StationRuntime): StationItem[] {
    const inv = this.ctx.session.inv;
    return s.def.kind === 'buy' ? buyMenu(inv) : upgradeMenu(inv);
  }

  private buildPanel(s: StationRuntime): StationPanel {
    const items = this.items(s);
    const inv = this.ctx.session.inv;
    const buy = s.def.kind === 'buy';
    return {
      title: s.def.name,
      subtitle: `FUNDS  $${inv.cash.toLocaleString('en-US')}`,
      items: items.map((i) => ({ key: i.key, label: i.label, detail: i.detail, cost: i.cost, state: i.state, note: i.note })),
      hint: buy ? 'PRESS NUMBER TO BUY   E / WALK AWAY TO CLOSE   WEAPON BUYS REPLACE THE EQUIPPED WEAPON' : 'PRESS 1 / 2 TO UPGRADE   E / WALK AWAY TO CLOSE',
    };
  }

  private handleDigit(s: StationRuntime, digit: number): void {
    const ctx = this.ctx;
    const inv = ctx.session.inv;
    const items = this.items(s);
    const item = items.find((i) => i.key === String(digit));
    if (!item) return;
    // any in-progress reload of a weapon that is about to be swapped must not survive the purchase
    const result = s.def.kind === 'buy' ? purchaseBuy(inv, item.id as BuyItemId) : purchaseUpgrade(inv, (digit - 1) as 0 | 1);
    if (result.ok) {
      const equipped = inv.slots[inv.activeSlot];
      if (s.def.kind === 'buy' && (item.id === 'shotgun' || item.id === 'rearm')) ctx.weapons.cancelActions();
      if (s.def.kind === 'upgrade') ctx.weapons.cancelActions();
      void equipped;
      ctx.audio.play(s.def.kind === 'upgrade' ? 'upgrade_ok' : 'buy_ok', { priority: 2 });
      s.model.setState(s.def.kind === 'upgrade' ? 'used' : 'used');
      ctx.hudEvent({ type: 'cash', amount: -result.cost });
      ctx.feed(`${result.message.toUpperCase()}  -$${result.cost}`, 'good');
      ctx.fx.sparkle({ x: s.def.x, y: 1.6, z: s.def.z }, s.def.kind === 'upgrade' ? 0x6ff0ff : 0x9be07a, 16);
    } else {
      ctx.audio.play('buy_denied', { priority: 2, volume: 0.8 });
      s.model.setState('denied');
      ctx.feed(result.message.toUpperCase(), 'warn');
    }
    void WEAPONS;
  }
}
