/**
 * Keeps a page that stays open (or that a phone restores from its own cache) on the live version: when the page opens
 * and whenever it comes back into view, it asks the server which version is live (`/api/version`) and reloads itself if
 * it is behind. Only once per version, so a page that still comes back old can never reload in a loop.
 */
import { VERSION } from './version';

const KEY = 'ds-reloaded-for';
const EVERY = 30_000;
let lastCheck = -Infinity;

async function check(): Promise<void> {
  if (performance.now() - lastCheck < EVERY) return;
  lastCheck = performance.now();
  try {
    const res = await fetch('/api/version', { cache: 'no-store' });
    if (!res.ok) return; // (the dev server has no API: nothing to compare)
    const live = `v${((await res.json()) as { version?: string }).version ?? ''}`;
    if (live === 'v' || live === VERSION) return;
    if (sessionStorage.getItem(KEY) === live) return;
    sessionStorage.setItem(KEY, live);
    location.reload();
  } catch {
    /* offline, or storage blocked: stay as we are */
  }
}

export function stayFresh(): void {
  void check();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check();
  });
  // a page restored whole from the back/forward cache never ran its scripts again
  addEventListener('pageshow', (e) => {
    if (e.persisted) {
      lastCheck = -Infinity;
      void check();
    }
  });
}
