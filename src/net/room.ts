/** Client side of a co-op room: one WebSocket to the game server (see `server/rooms.mjs` for the protocol). */

export interface RoomPerson {
  id: string;
  name: string;
  avatar: string | null;
}

export interface RoomView {
  code: string;
  hostId: string;
  visibility: 'public' | 'private';
  state: 'lobby' | 'playing';
  players: RoomPerson[];
  spectators: RoomPerson[];
  maxPlayers: number;
  maxSpectators: number;
  /** Host only. */
  invites?: string[];
}

export type RoomRole = 'player' | 'spectator';

export interface RoomHandlers {
  /** Room membership or settings changed (null: no longer in a room). */
  onRoom(room: RoomView | null, you: { id: string; role: RoomRole; hidden: boolean } | null): void;
  /** A game message from another member (`from` is their id, or 'server'). */
  onRelay(from: string, d: Record<string, unknown>): void;
  /** Kicked, ended, or the host left. */
  onClosed(reason: string): void;
  onError(message: string): void;
}

export class RoomClient {
  private ws: WebSocket | null = null;
  private opening: Promise<void> | null = null;
  room: RoomView | null = null;
  you: { id: string; role: RoomRole; hidden: boolean } | null = null;

  constructor(private readonly handlers: RoomHandlers) {}

  get isHost(): boolean {
    return !!this.room && !!this.you && this.room.hostId === this.you.id;
  }

  private open(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return Promise.resolve();
    if (this.opening) return this.opening;
    this.opening = new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
      ws.onopen = () => {
        this.ws = ws;
        this.opening = null;
        resolve();
      };
      ws.onerror = () => {
        this.opening = null;
        reject(new Error('Could not reach the game server'));
      };
      ws.onclose = () => {
        const was = this.room;
        this.ws = null;
        this.room = null;
        this.you = null;
        if (was) this.handlers.onClosed('Connection to the server was lost');
      };
      ws.onmessage = (ev) => {
        let m: { t: string; [k: string]: unknown };
        try {
          m = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        if (m.t === 'room') {
          this.room = m.room as RoomView;
          this.you = m.you as RoomClient['you'];
          this.handlers.onRoom(this.room, this.you);
        } else if (m.t === 'relay') {
          this.handlers.onRelay(String(m.from), (m.d ?? {}) as Record<string, unknown>);
        } else if (m.t === 'closed') {
          this.room = null;
          this.you = null;
          this.handlers.onRoom(null, null);
          this.handlers.onClosed(String(m.reason));
        } else if (m.t === 'error') {
          this.handlers.onError(String(m.msg));
        }
      };
    });
    return this.opening;
  }

  private async command(msg: Record<string, unknown>): Promise<void> {
    try {
      await this.open();
      this.ws?.send(JSON.stringify(msg));
    } catch (err) {
      this.handlers.onError(err instanceof Error ? err.message : String(err));
    }
  }

  create(visibility: 'public' | 'private'): Promise<void> {
    return this.command({ t: 'create', visibility });
  }

  join(code: string, as: RoomRole, hidden = false): Promise<void> {
    return this.command({ t: 'join', code, as, hidden });
  }

  leave(): void {
    if (!this.room) return;
    void this.command({ t: 'leave' });
    this.room = null;
    this.you = null;
    this.handlers.onRoom(null, null);
  }

  manage(op: 'kick' | 'end' | 'visibility' | 'invite' | 'uninvite' | 'state', arg: { id?: string; value?: string } = {}): void {
    void this.command({ t: 'manage', op, ...arg });
  }

  /** Send a game message. Dropped silently when the socket is not open: the next one supersedes it. */
  send(to: 'all' | 'host' | string, d: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.room) this.ws.send(JSON.stringify({ t: 'relay', to, d }));
  }
}
