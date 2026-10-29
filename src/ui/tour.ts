/**
 * The first-run tour: a few short cards over the title screen, each pointing at a part of it (the zones, the PLAY
 * button, the sign-in). It lives outside the title's screen node, so a redraw of the title keeps it; it finds its target
 * again each time it places itself. On a phone each step is one line in a strip along the bottom edge.
 */
import { el } from './dom';
import type { TourStep } from './hudTypes';

type TourEvent = 'tour_shown' | 'tour_step' | 'tour_done' | 'tour_skip';

const PHONE = '(max-height: 500px), (max-width: 600px)';

export function runTour(layer: HTMLElement, steps: TourStep[], report: (event: TourEvent, detail: string | null) => void): void {
  layer.querySelector('.ds-tour')?.remove();
  const root = el('div', 'ds-tour', layer);
  const card = el('div', 'ds-tour-card ds-panel ds-brk', root);
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-live', 'polite');
  let i = 0;
  let lit: HTMLElement | null = null;

  const light = (t: HTMLElement | null): void => {
    if (lit === t) return;
    lit?.classList.remove('ds-tour-hl');
    lit = t;
    lit?.classList.add('ds-tour-hl');
  };

  /** Next to the step's target (below it when there is room, else above), or in the middle; a phone: the CSS strip. */
  const place = (): void => {
    // the title is gone (a run started): the tour goes with it
    if (!layer.querySelector('.ds-launch')) {
      finish(false);
      return;
    }
    const step = steps[i]!;
    const t = step.target ? document.querySelector<HTMLElement>(step.target) : null;
    light(t);
    if (window.matchMedia(PHONE).matches || !t) {
      card.style.left = '';
      card.style.top = '';
      card.classList.toggle('mid', !t);
      return;
    }
    card.classList.remove('mid');
    const r = t.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    const gap = 12;
    const below = r.bottom + gap + c.height < window.innerHeight;
    const top = below ? r.bottom + gap : Math.max(gap, r.top - gap - c.height);
    const left = Math.max(gap, Math.min(window.innerWidth - c.width - gap, r.left));
    card.style.left = `${Math.round(left)}px`;
    card.style.top = `${Math.round(top)}px`;
  };

  let timer = 0;
  let over = false;
  function finish(done: boolean): void {
    if (over) return;
    over = true;
    window.clearInterval(timer);
    window.removeEventListener('resize', place);
    light(null);
    root.remove();
    report(done ? 'tour_done' : 'tour_skip', steps[i]?.id ?? null);
    // back on the title: the big button, ready for Enter
    document.querySelector<HTMLElement>('.ds-l-cta .ds-btn')?.focus({ preventScroll: true });
  }
  timer = window.setInterval(place, 400);

  const draw = (): void => {
    const step = steps[i]!;
    card.replaceChildren();
    el('span', 'n', card, `${i + 1} / ${steps.length}`);
    el('b', '', card, step.title);
    el('p', '', card, step.text);
    const acts = el('div', 'acts', card);
    const last = i === steps.length - 1;
    const next = el('button', 'ds-btn primary', acts, last ? "LET'S GO" : 'NEXT');
    next.type = 'button';
    next.addEventListener('click', () => {
      if (last) {
        finish(true);
        return;
      }
      i += 1;
      report('tour_step', steps[i]!.id);
      draw();
    });
    if (!last) {
      const skip = el('button', 'ds-btn ghost', acts, 'SKIP');
      skip.type = 'button';
      skip.addEventListener('click', () => finish(false));
    }
    place();
    next.focus({ preventScroll: true });
  };

  card.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      finish(false);
    }
  });
  window.addEventListener('resize', place);
  report('tour_shown', null);
  draw();
}
