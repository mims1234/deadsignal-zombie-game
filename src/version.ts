/**
 * The build's version, from the changelog (`server/changelog.json`, newest first; the admin page lists it too), and the
 * faint tag in the bottom-right corner of every screen - so a screenshot or a video always says which build it is from.
 */
import changelog from '../server/changelog.json';

export const VERSION = `v${changelog.versions[0]?.version ?? '0.0.0'}`;

/** Put the version tag on the page (once). It never takes a click or a touch. */
export function showVersionTag(): void {
  if (document.getElementById('ds-version')) return;
  const tag = document.createElement('div');
  tag.id = 'ds-version';
  tag.textContent = VERSION;
  tag.setAttribute('aria-hidden', 'true');
  tag.style.cssText = [
    'position:fixed',
    'right:max(6px, env(safe-area-inset-right))',
    'bottom:max(3px, env(safe-area-inset-bottom))',
    'z-index:2147483000',
    'pointer-events:none',
    'user-select:none',
    'font:600 10px/1 ui-monospace, Menlo, Consolas, monospace',
    'letter-spacing:0.08em',
    'color:#fff',
    'opacity:0.32',
    'text-shadow:0 1px 2px rgba(0,0,0,0.9)',
  ].join(';');
  document.body.appendChild(tag);
}
