/**
 * Co-op lobby and scoreboard. The lobby is a panel over the title screen: create or join a session (hosted by the game
 * server, or self-hosted on the creator's device), see who is in it and everyone's ping, and (for its owner) manage
 * it. The scoreboard shows while Tab is held during play.
 */
import type { MapId } from '../world/layout/data';
import { COOP, TEAM_SKILL, TEAM_SKILLS, type TeamSkill, ZOMBIE_DIFFICULTIES, ZOMBIE_DIFFICULTY, type ZombieDifficulty } from '../config';
import type { Hosting } from '../net/room';
import { el } from '../ui/dom';
import type { CoopSession } from './coop';

const MAP_NAME: Record<MapId, string> = { district: 'THE DISTRICT', forge: 'THE FORGE', asylum: 'THE ASYLUM' };
const KIND_NOTE: Record<'mission' | 'mazoku' | 'roam', string> = {
  mission: 'The map\'s operation: both contracts, then extract together. The relay, the squad and the survivors are shared.',
  mazoku: 'The operation with the five Mazoku card carriers on the map. A recovered card goes to everyone.',
  roam: 'No infected and no clock: fly anywhere together.',
};

/** A ping readout, coloured: good under 80 ms, fair under 160, poor above. */
function pingTag(parent: HTMLElement, ms: number | null, prefix = ''): HTMLElement {
  const cls = ms === null ? '' : ms < 80 ? 'good' : ms < 160 ? 'ok' : 'bad';
  return el('span', `ping ${cls}`.trim(), parent, ms === null ? `${prefix}-- ms` : `${prefix}${ms} ms`);
}

export interface LobbyHost {
  /** Signed-in account id, or null (co-op needs an account). */
  userId(): string | null;
  /** The map this page is on: a session created here plays it. */
  mapId(): MapId;
  /** The player's own difficulty picks: a session created here starts with them. */
  difficulty(): { zombies: ZombieDifficulty; team: TeamSkill };
  isAdmin(): boolean;
  /** The game is in a state where the lobby may show (title or results). */
  canShow(): boolean;
  /** Deploy into the started session. Called from a click, so pointer lock is allowed. */
  deploy(): void;
  /** True while a co-op run is being played (the scoreboard may show). */
  playing(): boolean;
  report(targetId: string, reason: string, context: string): Promise<boolean>;
}

export class CoopUi {
  /** Free roam is a switch on a mode: the one it returns to when switched off. */
  private roamBase: 'mission' | 'mazoku' = 'mission';
  private readonly panel: HTMLElement;
  private readonly board: HTMLElement;
  private wanted = false;
  private visibility: 'public' | 'private' = 'public';
  private hosting: Hosting = 'server';
  private codeDraft = '';
  private notice = '';

  constructor(
    root: HTMLElement,
    private readonly coop: CoopSession,
    private readonly host: LobbyHost,
  ) {
    // its own menu layer: it shares the menus' styling and stacks above the title screen
    const layer = el('div', 'ds-menus', root);
    this.panel = el('div', 'ds-lobby ds-panel ds-brk', layer);
    this.panel.hidden = true;
    this.board = el('div', 'ds-scoreboard ds-panel', layer);
    this.board.hidden = true;
    coop.onChange = () => this.render();
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Tab' || !this.host.playing()) return;
      e.preventDefault();
      if (!e.repeat) this.showBoard(true);
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Tab') this.showBoard(false);
    });
    window.addEventListener('blur', () => this.showBoard(false));
  }

  open(code = ''): void {
    this.wanted = true;
    if (code) this.codeDraft = code.toUpperCase();
    // measure the ping right away, before anyone creates or joins anything
    if (this.host.userId()) this.coop.room.connect();
    this.render();
  }

  close(): void {
    this.wanted = false;
    this.render();
  }

  /** Re-evaluate visibility (the game calls this when its state changes). */
  refresh(): void {
    this.render();
  }

  private button(parent: HTMLElement, label: string, cls: string, onClick: () => void): HTMLButtonElement {
    const b = el('button', `ds-btn ${cls}`.trim(), parent, label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  private link(code: string): string {
    return `${location.origin}/?room=${code}`;
  }

  /** Ticks the start countdown while it shows. */
  private countdownTimer: number | null = null;
  /** What is typed in the owner's invite field (kept across redraws). */
  private inviteDraft = '';

  private render(): void {
    if (this.countdownTimer !== null) {
      window.clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    const show = this.wanted && this.host.canShow();
    this.panel.hidden = !show;
    // the lobby takes the title screen's side column: the brief and controls step aside while it is open
    document.documentElement.classList.toggle('ds-lobby-open', show);
    if (!show) return;
    const p = this.panel;
    // the panel is rebuilt on every change (pings arrive every few seconds): keep where the reader had scrolled to,
    // and the field they were typing in, so neither jumps back
    const prevBody = p.querySelector<HTMLElement>('.body');
    const scroll = prevBody?.scrollTop ?? 0;
    const focused = document.activeElement instanceof HTMLInputElement && p.contains(document.activeElement) ? document.activeElement : null;
    const field = focused ? { name: focused.name, start: focused.selectionStart, end: focused.selectionEnd } : null;
    p.replaceChildren();
    queueMicrotask(() => {
      const body = p.querySelector<HTMLElement>('.body');
      if (body) body.scrollTop = scroll;
      if (!field) return;
      const again = p.querySelector<HTMLInputElement>(`input[name="${field.name}"]`);
      if (!again) return;
      again.focus({ preventScroll: true });
      try {
        if (field.start !== null && field.end !== null) again.setSelectionRange(field.start, field.end);
      } catch {
        /* inputs without a selection (numeric on some browsers) */
      }
    });
    const head = el('div', 'ds-panel-head big', p);
    el('span', '', head, 'CO-OP SESSION');
    el('span', 'aux', head, `UP TO ${COOP.maxPlayers} PLAYERS`);
    const body = el('div', 'body', p);
    const room = this.coop.room.room;
    const me = this.host.userId();

    if (!me) {
      el('p', 'msg', body, 'Sign in with Discord on the title screen to play co-op.');
      return;
    }
    const problem = this.coop.lastError || this.coop.closedReason || this.notice;
    if (problem) el('div', 'problem', body, problem);

    if (!room) {
      el('p', 'msg', body, `Run the operation together on ${MAP_NAME[this.host.mapId()]}: the contracts, the extraction, and anyone who goes down can be revived by a teammate. Start a session and share the link, or join one with its code.`);
      const net = el('div', 'row', body);
      el('span', 'lbl inline', net, 'YOUR PING');
      pingTag(net, this.coop.room.ping === null ? null : Math.round(this.coop.room.ping));
      el('div', 'lbl', body, 'HOSTING');
      const hostRow = el('div', 'row', body);
      this.button(hostRow, 'SERVER HOSTED', this.hosting === 'server' ? 'on' : '', () => {
        this.hosting = 'server';
        this.render();
      });
      this.button(hostRow, 'SELF HOST', this.hosting === 'self' ? 'on' : '', () => {
        this.hosting = 'self';
        this.render();
      });
      el(
        'div',
        'tag',
        body,
        this.hosting === 'server'
          ? 'The game server runs the session: fair for everyone, nobody needs a strong device, and it carries on if you leave.'
          : 'Your device runs the session for everyone: the others play at your ping plus theirs, and it ends if you leave or put the game in the background.' +
              (document.documentElement.classList.contains('ds-touch') ? ' On a phone, server hosting is the better choice.' : ''),
      );
      const make = el('div', 'row', body);
      this.button(make, 'CREATE SESSION', 'primary', () => {
        this.notice = '';
        void this.coop.room.create(this.visibility, this.hosting, this.host.mapId(), 'mission', this.host.difficulty());
      });
      const vis = this.button(make, this.visibility === 'public' ? 'ANYONE WITH THE LINK' : 'INVITE-ONLY', '', () => {
        this.visibility = this.visibility === 'public' ? 'private' : 'public';
        this.render();
      });
      vis.title = 'Who can join';
      const join = el('div', 'row', body);
      const input = el('input', 'code', join);
      input.name = 'code';
      input.placeholder = 'SESSION CODE';
      input.maxLength = 6;
      input.value = this.codeDraft;
      input.addEventListener('input', () => (this.codeDraft = input.value.toUpperCase()));
      const go = (as: 'player' | 'spectator'): void => {
        this.notice = '';
        if (this.codeDraft.length < 4) return;
        void this.coop.room.join(this.codeDraft, as);
      };
      this.button(join, 'JOIN', '', () => go('player'));
      this.button(join, 'WATCH', '', () => go('spectator'));
      return;
    }

    // ---- in a session ----
    const isOwner = this.coop.room.isOwner;
    const server = room.hosting === 'server';
    const owner = room.players.find((q) => q.id === room.ownerId);
    const hidden = this.coop.room.you?.hidden === true;
    const top = el('div', 'row', body);
    el('span', 'codebig', top, room.code);
    this.button(top, 'COPY INVITE LINK', '', () => {
      void navigator.clipboard?.writeText(this.link(room.code));
      this.notice = 'Invite link copied.';
      this.render();
    });
    el('span', 'tag', top, room.visibility === 'private' ? 'INVITE-ONLY' : 'OPEN TO ANYONE WITH THE LINK');
    el('div', 'tag', body, server ? 'SERVER HOSTED  -  the game server runs this session for everyone' : `SELF HOSTED  -  runs on ${owner ? owner.name : 'the owner'}'s device`);
    if (hidden) el('div', 'problem ok', body, 'You are watching unseen. Nobody in this session can tell.');

    const list = (title: string, people: { id: string; name: string; ping: number | null; ready?: boolean }[], max: number, readiness = false): void => {
      el('div', 'lbl', body, `${title}  ${people.length} / ${max}`);
      const ul = el('div', 'people', body);
      for (const person of people) {
        const row = el('div', 'person', ul);
        el('span', 'name', row, person.name + (person.id === room.ownerId ? (server ? '  (owner)' : '  (host)') : '') + (person.id === me ? '  (you)' : ''));
        // the ready check: who the owner is waiting for
        if (readiness && person.id !== room.ownerId) el('span', person.ready ? 'rdy on' : 'rdy', row, person.ready ? 'READY' : 'NOT READY');
        // the ping that matters: to the server, or (self-hosted) through the server to the host's device
        const own = person.id === me && this.coop.room.ping !== null ? Math.round(this.coop.room.ping) : person.ping;
        const hostPing = owner?.id === me && this.coop.room.ping !== null ? Math.round(this.coop.room.ping) : (owner?.ping ?? null);
        if (!server && person.id !== room.ownerId && own !== null && hostPing !== null) pingTag(row, own + hostPing, 'to host ');
        else pingTag(row, own);
        if (person.id !== me) {
          this.button(row, 'REPORT', 'mini', () => {
            const reason = window.prompt(`Report ${person.name} to the admins. What happened?`);
            if (!reason) return;
            void this.host.report(person.id, reason, `co-op session ${room.code}`).then((ok) => {
              this.notice = ok ? 'Report sent to the admins.' : 'The report could not be sent.';
              this.render();
            });
          });
          if (isOwner) this.button(row, 'KICK', 'mini', () => this.coop.room.manage('kick', { id: person.id }));
        }
      }
      if (people.length === 0) el('div', 'person empty', ul, 'Nobody yet');
    };
    list('PLAYERS', room.players, room.maxPlayers, room.state !== 'playing');
    list('SPECTATORS', room.spectators, room.maxSpectators);

    el('div', 'lbl', body, `MODE  //  ${MAP_NAME[room.map]}`);
    const variant = el('div', 'row choice', body);
    // Standard or Standard Mazoku, and free roam as a switch on top (the session's kind is 'roam' while it is on)
    const kinds = [['mission', 'STANDARD'], ['mazoku', 'STANDARD MAZOKU']] as const;
    const roam = room.kind === 'roam';
    if (!roam) this.roamBase = room.kind === 'mazoku' ? 'mazoku' : 'mission';
    const active = roam ? this.roamBase : room.kind;
    if (isOwner && room.state !== 'playing') {
      for (const [kind, label] of kinds) {
        this.button(variant, label, active === kind ? 'on' : '', () => {
          if (roam) {
            this.roamBase = kind; // free roam stays on; this is what it returns to
            this.render();
          } else this.coop.setKind(kind);
        });
      }
      const t = this.button(variant, roam ? 'FREE ROAM  ON' : 'FREE ROAM  OFF', roam ? 'toggle on' : 'toggle', () => this.coop.setKind(roam ? this.roamBase : 'roam'));
      t.setAttribute('aria-pressed', roam ? 'true' : 'false');
    } else {
      el('span', 'name', variant, `${kinds.find((k) => k[0] === active)?.[1] ?? 'STANDARD'}${roam ? '  +  FREE ROAM' : ''}`);
    }
    el('div', 'tag', body, KIND_NOTE[room.kind]);

    // ---- difficulty: the infected and the AI squad ----
    const zd = room.zombies ?? 'normal';
    const ts = room.team ?? 'regular';
    const editable = isOwner && room.state !== 'playing' && room.kind !== 'roam';
    if (room.kind !== 'roam') {
      el('div', 'lbl', body, 'INFECTED');
      const zr = el('div', 'row choice', body);
      if (editable) for (const id of ZOMBIE_DIFFICULTIES) this.button(zr, ZOMBIE_DIFFICULTY[id].label, zd === id ? 'on' : '', () => this.coop.setDifficulty({ zombies: id })).title = ZOMBIE_DIFFICULTY[id].note;
      else el('span', 'name', zr, ZOMBIE_DIFFICULTY[zd].label);
      el('div', 'lbl', body, 'SQUAD AI');
      const tr = el('div', 'row choice', body);
      if (editable) for (const id of TEAM_SKILLS) this.button(tr, TEAM_SKILL[id].label, ts === id ? 'on' : '', () => this.coop.setDifficulty({ team: id })).title = TEAM_SKILL[id].note;
      else el('span', 'name', tr, TEAM_SKILL[ts].label);
      el('div', 'tag', body, `${ZOMBIE_DIFFICULTY[zd].note} ${TEAM_SKILL[ts].note}`);
    }

    if (isOwner) {
      el('div', 'lbl', body, 'MANAGE SESSION');
      const manage = el('div', 'row', body);
      this.button(manage, room.visibility === 'public' ? 'MAKE INVITE-ONLY' : 'OPEN TO ANYONE WITH THE LINK', '', () => this.coop.room.manage('visibility', { value: room.visibility === 'public' ? 'private' : 'public' }));
      if (room.visibility === 'private') {
        const inv = el('div', 'row', body);
        const input = el('input', '', inv);
        input.name = 'invite';
        input.placeholder = 'DISCORD ID TO INVITE';
        input.inputMode = 'numeric';
        input.value = this.inviteDraft;
        input.addEventListener('input', () => (this.inviteDraft = input.value));
        this.button(inv, 'INVITE', '', () => {
          if (/^\d{5,20}$/.test(input.value.trim())) {
            this.coop.room.manage('invite', { id: input.value.trim() });
            this.inviteDraft = '';
          }
        });
        const chips = el('div', 'people', body);
        for (const id of room.invites ?? []) {
          const row = el('div', 'person', chips);
          el('span', 'name', row, id);
          this.button(row, 'REMOVE', 'mini', () => this.coop.room.manage('uninvite', { id }));
        }
      }
    }

    const actions = el('div', 'row actions', body);
    const spectator = this.coop.role === 'spectator';
    const waiting = room.players.filter((p) => p.id !== room.ownerId && p.ready !== true);
    if (room.state === 'playing') {
      this.button(actions, spectator ? 'START WATCHING' : 'DEPLOY INTO SESSION', 'primary', () => this.host.deploy());
    } else if (room.state === 'starting') {
      // everyone sees the same countdown; at zero the session goes live and everyone is brought in
      const cd = el('div', 'countdown', actions);
      el('span', 'lbl', cd, 'STARTING IN');
      const n = el('b', 'n', cd, '5');
      const end = room.startsAtLocal ?? performance.now() + (room.startIn ?? 0);
      const tick = (): void => {
        const left = Math.ceil((end - performance.now()) / 1000);
        n.textContent = left > 0 ? String(left) : 'GO';
      };
      tick();
      this.countdownTimer = window.setInterval(tick, 200);
      if (isOwner) this.button(actions, 'CANCEL', '', () => this.coop.cancelStart());
    } else if (isOwner) {
      const start = this.button(actions, 'START SESSION', 'primary', () => this.coop.requestStart());
      start.disabled = waiting.length > 0;
      el('span', 'wait', actions, waiting.length > 0 ? `Waiting for ${waiting.map((p) => p.name).join(', ')} to be ready` : room.players.length > 1 ? 'Everyone is ready' : 'Start whenever you like - others can still join');
    } else if (!spectator) {
      const ready = room.players.find((p) => p.id === me)?.ready === true;
      this.button(actions, ready ? 'READY  \u2713' : 'READY UP', ready ? 'primary readybtn on' : 'primary readybtn', () => this.coop.setReady(!ready));
      el('span', 'wait', actions, ready ? `Waiting for ${owner ? owner.name : 'the owner'} to start...` : 'Press ready when you are set');
    } else {
      el('span', 'wait', actions, `Waiting for ${owner ? owner.name : 'the owner'} to start...`);
    }
    // a server-hosted session carries on without its owner: they may leave it to the others, or end it for all
    if (isOwner && server) {
      this.button(actions, 'END SESSION', '', () => {
        this.notice = '';
        this.coop.room.manage('end');
      });
    }
    this.button(actions, isOwner && !server ? 'END SESSION' : 'LEAVE', '', () => {
      this.notice = '';
      this.coop.leave();
      this.render();
    });
  }

  private showBoard(on: boolean): void {
    if (!on || !this.host.playing()) {
      this.board.hidden = true;
      return;
    }
    const { rows, spectators } = this.coop.scoreboard();
    const b = this.board;
    b.replaceChildren();
    el('div', 'ttl', b, this.coop.kind === 'roam' ? 'FREE ROAM' : this.coop.kind === 'mazoku' ? 'STANDARD MAZOKU' : 'STANDARD');
    const table = el('div', 'grid', b);
    for (const h of ['PLAYER', 'KILLS', 'DOWNS', 'PING', 'STATUS']) el('span', 'h', table, h);
    for (const r of rows) {
      el('span', r.you ? 'you' : '', table, r.name + (r.host ? (this.coop.serverHosted ? '  (owner)' : '  (host)') : ''));
      el('span', 'n', table, String(r.kills));
      el('span', 'n', table, String(r.downs));
      pingTag(table, r.ping);
      el('span', r.status === 'up' || r.status === 'aboard' ? 'up' : 'down', table, r.status.toUpperCase());
    }
    if (this.coop.serverHosted) el('div', 'spec', b, 'SERVER HOSTED');
    el('div', 'spec', b, spectators.length > 0 ? `WATCHING:  ${spectators.join(',  ')}` : 'NOBODY IS WATCHING');
    b.hidden = false;
  }
}
