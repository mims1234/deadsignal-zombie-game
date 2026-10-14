/**
 * Co-op lobby and scoreboard. The lobby is a panel over the title screen: create or join a session, see who is in
 * it, and (for the host) manage it. The scoreboard shows while Tab is held during play.
 */
import { COOP } from '../config';
import { el } from '../ui/dom';
import type { CoopSession } from './coop';

export interface LobbyHost {
  /** Signed-in account id, or null (co-op needs an account). */
  userId(): string | null;
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
  private readonly panel: HTMLElement;
  private readonly board: HTMLElement;
  private wanted = false;
  private visibility: 'public' | 'private' = 'public';
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

  private render(): void {
    const show = this.wanted && this.host.canShow();
    this.panel.hidden = !show;
    if (!show) return;
    const p = this.panel;
    p.replaceChildren();
    const head = el('div', 'ds-panel-head big', p);
    el('span', '', head, 'CO-OP SESSION');
    el('span', 'aux', head, `${COOP.maxPlayers} PLAYERS  //  ${COOP.waves} WAVES`);
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
      el('p', 'msg', body, 'Survive ten waves together. Anyone who goes down returns when the wave is cleared. Start a session and share the link, or join one with its code.');
      // the session runs on its creator's device: a phone host carries everyone
      if (document.documentElement.classList.contains('ds-touch')) el('p', 'msg', body, 'Tip: the session runs on the device of whoever creates it. On a phone, joining works best - let someone on a computer host, and keep the game on screen while you play.');
      const make = el('div', 'row', body);
      this.button(make, 'CREATE SESSION', 'primary', () => {
        this.notice = '';
        void this.coop.room.create(this.visibility);
      });
      const vis = this.button(make, this.visibility === 'public' ? 'ANYONE WITH THE LINK' : 'INVITE-ONLY', '', () => {
        this.visibility = this.visibility === 'public' ? 'private' : 'public';
        this.render();
      });
      vis.title = 'Who can join';
      const join = el('div', 'row', body);
      const input = el('input', 'code', join);
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
    const isHost = this.coop.room.isHost;
    const hidden = this.coop.room.you?.hidden === true;
    const top = el('div', 'row', body);
    el('span', 'codebig', top, room.code);
    this.button(top, 'COPY INVITE LINK', '', () => {
      void navigator.clipboard?.writeText(this.link(room.code));
      this.notice = 'Invite link copied.';
      this.render();
    });
    el('span', 'tag', top, room.visibility === 'private' ? 'INVITE-ONLY' : 'OPEN TO ANYONE WITH THE LINK');
    if (hidden) el('div', 'problem ok', body, 'You are watching unseen. Nobody in this session can tell.');

    const list = (title: string, people: { id: string; name: string }[], max: number): void => {
      el('div', 'lbl', body, `${title}  ${people.length} / ${max}`);
      const ul = el('div', 'people', body);
      for (const person of people) {
        const row = el('div', 'person', ul);
        el('span', 'name', row, person.name + (person.id === room.hostId ? '  (host)' : '') + (person.id === me ? '  (you)' : ''));
        if (person.id !== me) {
          this.button(row, 'REPORT', 'mini', () => {
            const reason = window.prompt(`Report ${person.name} to the admins. What happened?`);
            if (!reason) return;
            void this.host.report(person.id, reason, `co-op session ${room.code}`).then((ok) => {
              this.notice = ok ? 'Report sent to the admins.' : 'The report could not be sent.';
              this.render();
            });
          });
          if (isHost) this.button(row, 'KICK', 'mini', () => this.coop.room.manage('kick', { id: person.id }));
        }
      }
      if (people.length === 0) el('div', 'person empty', ul, 'Nobody yet');
    };
    list('PLAYERS', room.players, room.maxPlayers);
    list('SPECTATORS', room.spectators, room.maxSpectators);

    el('div', 'lbl', body, 'MODE');
    const variant = el('div', 'row', body);
    if (isHost) {
      for (const [on, label] of [[false, 'STANDARD'], [true, 'STANDARD MAZOKU']] as const) {
        this.button(variant, label, this.coop.mazoku === on ? 'on' : '', () => this.coop.setMazoku(on));
      }
    } else {
      el('span', 'name', variant, this.coop.mazoku ? 'STANDARD MAZOKU' : 'STANDARD');
    }
    el('div', 'tag', body, this.coop.mazoku ? 'Mazoku card carriers join on waves 2, 4, 6, 8 and 9.' : 'Waves and squad objectives only.');

    if (isHost) {
      el('div', 'lbl', body, 'MANAGE SESSION');
      const manage = el('div', 'row', body);
      this.button(manage, room.visibility === 'public' ? 'MAKE INVITE-ONLY' : 'OPEN TO ANYONE WITH THE LINK', '', () => this.coop.room.manage('visibility', { value: room.visibility === 'public' ? 'private' : 'public' }));
      if (room.visibility === 'private') {
        const inv = el('div', 'row', body);
        const input = el('input', '', inv);
        input.placeholder = 'DISCORD ID TO INVITE';
        input.inputMode = 'numeric';
        this.button(inv, 'INVITE', '', () => {
          if (/^\d{5,20}$/.test(input.value.trim())) this.coop.room.manage('invite', { id: input.value.trim() });
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
    if (room.state === 'playing') {
      this.button(actions, spectator ? 'START WATCHING' : 'DEPLOY INTO SESSION', 'primary', () => this.host.deploy());
    } else if (isHost) {
      this.button(actions, 'START SESSION', 'primary', () => {
        this.coop.start();
        this.host.deploy();
      });
    } else {
      el('span', 'wait', actions, 'Waiting for the host to start...');
    }
    this.button(actions, isHost ? 'END SESSION' : 'LEAVE', '', () => {
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
    el('div', 'ttl', b, `WAVE ${this.coop.waves.n} / ${COOP.waves}`);
    const table = el('div', 'grid', b);
    for (const h of ['PLAYER', 'KILLS', 'DOWNS', 'STATUS']) el('span', 'h', table, h);
    for (const r of rows) {
      el('span', r.you ? 'you' : '', table, r.name + (r.host ? '  (host)' : ''));
      el('span', 'n', table, String(r.kills));
      el('span', 'n', table, String(r.downs));
      el('span', r.alive ? 'up' : 'down', table, r.alive ? 'UP' : 'DOWN');
    }
    el('div', 'spec', b, spectators.length > 0 ? `WATCHING:  ${spectators.join(',  ')}` : 'NOBODY IS WATCHING');
    b.hidden = false;
  }
}
