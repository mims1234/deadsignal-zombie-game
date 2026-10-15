/** Client side of a co-op room: one WebSocket to the game server (see `server/rooms.mjs` for the protocol). */
import type { MapId } from '../world/layout/data';
import type { TeamSkill, ZombieDifficulty } from '../config';

export interface RoomPerson {
  id: string;
  name: string;
  avatar: string | null;
  /** Their round trip to the game server in ms (null until measured). */
  ping: number | null;
  /** Pressed ready in the lobby (the owner is always ready: they start the session). */
  ready?: boolean;
  /** Playing on a phone / tablet or a computer. */
  device?: 'phone' | 'pc';
}

/** 'server': the game server runs the session (everyone is an equal client). 'self': the owner's browser runs it. */
export type Hosting = 'server' | 'self';

export interface RoomView {
  code: string;
  /** Who runs the simulation: the owner (self-hosted) or the server ('sim'). Game messages come from here. */
  hostId: string;
  /** Who created and manages the session (kick, invites, start, end). */
  ownerId: string;
  hosting: Hosting;
  /** What it plays: the story operation (Standard), with the Mazoku carriers, or free roam. */
  kind: 'mission' | 'mazoku' | 'roam';
  /** The map; fixed when the session is created (players on another map reload onto it). */
  map: MapId;
  /** Difficulty: the infected's and the AI squad's (the owner sets both in the lobby). */
  zombies?: ZombieDifficulty;
  team?: TeamSkill;
  visibility: 'public' | 'private';
  /** 'starting': the owner pressed start and the countdown runs; then 'playing'. */
  state: 'lobby' | 'starting' | 'playing';
  /** The countdown left when this view was sent (ms), and when it ends on this machine's clock. */
  startIn?: number;
  startsAtLocal?: number;
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
  /** A new ping measurement. */
  onPing?(ms: number): void;
}

const PING_EVERY = 2000;
const REPORT_EVERY = 5000;

export class RoomClient {
  private ws: WebSocket | null = null;
  private opening: Promise<void> | null = null;
  room: RoomView | null = null;
  you: { id: string; role: RoomRole; hidden: boolean } | null = null;
  /** Smoothed round trip to the game server (ms), or null before the first answer. */
  ping: number | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reportedAt = 0;

  constructor(private readonly handlers: RoomHandlers) {}

  /** This browser runs the session's simulation (a self-hosted session's owner). */
  get isHost(): boolean {
    return !!this.room && !!this.you && this.room.hostId === this.you.id;
  }

  /** This player created the session and manages it. */
  get isOwner(): boolean {
    return !!this.room && !!this.you && this.room.ownerId === this.you.id;
  }

  /** Connect without joining anything, so the ping is known before a session is created or joined. */
  connect(): void {
    void this.open().catch(() => {});
  }

  private startPing(ws: WebSocket): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    const ping = (): void => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'ping', n: performance.now() }));
    };
    ping();
    this.pingTimer = setInterval(ping, PING_EVERY);
  }

  private onPong(sent: number): void {
    const rtt = Math.max(0, performance.now() - sent);
    this.ping = this.ping === null ? rtt : this.ping * 0.7 + rtt * 0.3;
    const ms = Math.round(this.ping);
    this.handlers.onPing?.(ms);
    if (performance.now() - this.reportedAt > REPORT_EVERY && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.reportedAt = performance.now();
      this.ws.send(JSON.stringify({ t: 'rtt', ms }));
    }
  }

  private open(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return Promise.resolve();
    if (this.opening) return this.opening;
    this.opening = new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
      ws.onopen = () => {
        this.ws = ws;
        this.opening = null;
        this.startPing(ws);
        resolve();
      };
      ws.onerror = () => {
        this.opening = null;
        reject(new Error('Could not reach the game server'));
      };
      ws.onclose = () => {
        const was = this.room;
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = null;
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
          if (this.room.startIn !== undefined) this.room.startsAtLocal = performance.now() + this.room.startIn;
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
        } else if (m.t === 'pong') {
          this.onPong(Number(m.n) || 0);
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

  create(visibility: 'public' | 'private', hosting: Hosting = 'server', map: RoomView['map'] = 'district', kind: RoomView['kind'] = 'mission', difficulty: { zombies: ZombieDifficulty; team: TeamSkill } = { zombies: 'normal', team: 'regular' }): Promise<void> {
    return this.command({ t: 'create', visibility, hosting, map, kind, zombies: difficulty.zombies, team: difficulty.team, device: this.device });
  }

  join(code: string, as: RoomRole, hidden = false): Promise<void> {
    return this.command({ t: 'join', code, as, hidden, device: this.device });
  }

  leave(): void {
    if (!this.room) return;
    void this.command({ t: 'leave' });
    this.room = null;
    this.you = null;
    this.handlers.onRoom(null, null);
  }

  /** What this player plays on (set by the game at start-up), shown to the others. */
  device: 'phone' | 'pc' = 'pc';

  /** A player in the lobby: ready (or not) to start. */
  setReady(value: boolean): void {
    void this.command({ t: 'ready', value });
  }

  manage(op: 'kick' | 'end' | 'visibility' | 'invite' | 'uninvite' | 'state' | 'config' | 'start' | 'cancel', arg: { id?: string; value?: string; zombies?: ZombieDifficulty; team?: TeamSkill } = {}): void {
    void this.command({ t: 'manage', op, ...arg });
  }

  /** Send a game message. Dropped silently when the socket is not open: the next one supersedes it. */
  send(to: 'all' | 'host' | string, d: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.room) this.ws.send(JSON.stringify({ t: 'relay', to, d }));
  }
}
