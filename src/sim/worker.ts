/**
 * One server-hosted co-op session, in its own worker thread (bundled to `server/sim/worker.mjs` by `vite.sim.config.ts`).
 * The room server (`server/rooms.mjs`) talks to it with plain messages:
 *   in:  {type:'players', list} | {type:'begin'} | {type:'msg', from, d, owner} | {type:'stats'}
 *   out: {type:'ready'} | {type:'relay', to, d} | {type:'stats', stats} | {type:'error', message}
 *        | {type:'load', ms, infected}   every few seconds: average CPU per tick, for the admin view
 * It ticks at 30 Hz; a slow tick never makes the simulation step by more than 0.1 s at once.
 */
import './stubs';
import { ServerHost } from './serverHost';

interface Port {
  postMessage(m: unknown): void;
  on(ev: 'message', fn: (m: Record<string, unknown>) => void): void;
}

const TICK_HZ = 30;

async function main(): Promise<void> {
  // typed loosely on purpose: the browser build's type settings know nothing about Node
  const wt = (await import('node:worker_threads' as string)) as { parentPort: Port; workerData: { map?: 'district' | 'forge' } };
  const port = wt.parentPort;
  const host = new ServerHost({ map: wt.workerData?.map ?? 'district', send: (to, d) => port.postMessage({ type: 'relay', to, d }) });
  port.on('message', (m) => {
    try {
      if (m.type === 'players') host.players(m.list as { id: string; name: string }[]);
      else if (m.type === 'begin') host.begin();
      else if (m.type === 'msg') host.message(String(m.from), (m.d ?? {}) as Record<string, unknown>, m.owner === true);
      else if (m.type === 'stats') port.postMessage({ type: 'stats', stats: host.stats() });
    } catch (err) {
      port.postMessage({ type: 'error', message: err instanceof Error ? err.stack ?? err.message : String(err) });
    }
  });
  let last = performance.now();
  let cost = 0;
  let ticks = 0;
  setInterval(() => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    try {
      host.tick(dt);
    } catch (err) {
      port.postMessage({ type: 'error', message: err instanceof Error ? err.stack ?? err.message : String(err) });
    }
    cost += performance.now() - now;
    if (++ticks >= TICK_HZ * 5) {
      port.postMessage({ type: 'load', ms: Math.round((cost / ticks) * 100) / 100, infected: host.stats().infected });
      cost = 0;
      ticks = 0;
    }
  }, 1000 / TICK_HZ);
  port.postMessage({ type: 'ready' });
}

void main();
