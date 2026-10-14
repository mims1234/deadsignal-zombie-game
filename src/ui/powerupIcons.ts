/**
 * The power-up emblems, drawn once on canvases: a dark disc in a coloured ring with the kind's glyph (bullets, a skull,
 * "x2", a trefoil, a hammer). The floating drops in the world and the HUD row both use them.
 */
import type { PowerupKind } from '../logic/powerups';

export const POWERUP_STYLE: Record<PowerupKind, { name: string; color: string; hex: number; line: string }> = {
  maxAmmo: { name: 'MAX AMMO', color: '#a6f07a', hex: 0xa6f07a, line: 'Every reserve and grenade pouch full. Make it count.' },
  instaKill: { name: 'INSTA-KILL', color: '#ff5a48', hex: 0xff5a48, line: 'One hit, one body. For thirty seconds.' },
  doublePoints: { name: 'DOUBLE POINTS', color: '#ffd35a', hex: 0xffd35a, line: 'Every dollar counts twice for thirty seconds.' },
  nuke: { name: 'NUKE', color: '#ff9a3a', hex: 0xff9a3a, line: 'Every infected still standing drops where it is.' },
  carpenter: { name: 'CARPENTER', color: '#6ff0ff', hex: 0x6ff0ff, line: 'Every window on Blackwood Hill boarded up again.' },
};

const cache = new Map<PowerupKind, HTMLCanvasElement>();

/** The emblem for `kind` (128 x 128, transparent outside the disc). */
export function powerupIcon(kind: PowerupKind): HTMLCanvasElement {
  const hit = cache.get(kind);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const col = POWERUP_STYLE[kind].color;
  // disc and ring
  g.beginPath();
  g.arc(64, 64, 56, 0, Math.PI * 2);
  g.fillStyle = 'rgba(10, 14, 12, 0.88)';
  g.fill();
  g.lineWidth = 7;
  g.strokeStyle = col;
  g.stroke();
  g.beginPath();
  g.arc(64, 64, 47, 0, Math.PI * 2);
  g.lineWidth = 2;
  g.strokeStyle = 'rgba(255,255,255,0.25)';
  g.stroke();
  g.fillStyle = col;
  g.strokeStyle = col;
  switch (kind) {
    case 'maxAmmo':
      for (const x of [42, 64, 86]) {
        g.fillRect(x - 7, 56, 14, 34);
        g.beginPath();
        g.moveTo(x - 7, 56);
        g.quadraticCurveTo(x, 30, x + 7, 56);
        g.fill();
        g.fillStyle = 'rgba(10,14,12,0.9)';
        g.fillRect(x - 7, 80, 14, 3);
        g.fillStyle = col;
      }
      break;
    case 'instaKill': {
      g.beginPath();
      g.arc(64, 56, 26, 0, Math.PI * 2);
      g.fill();
      g.fillRect(48, 70, 32, 20);
      g.fillStyle = 'rgba(10,14,12,0.95)';
      g.beginPath();
      g.arc(54, 56, 8, 0, Math.PI * 2);
      g.arc(74, 56, 8, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(64, 64);
      g.lineTo(59, 73);
      g.lineTo(69, 73);
      g.fill();
      for (const x of [55, 64, 73]) g.fillRect(x - 1.5, 80, 3, 10);
      break;
    }
    case 'doublePoints':
      g.font = '800 54px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('x2', 64, 68);
      break;
    case 'nuke':
      g.beginPath();
      g.arc(64, 64, 7, 0, Math.PI * 2);
      g.fill();
      for (let k = 0; k < 3; k++) {
        const a = -Math.PI / 2 + (k * Math.PI * 2) / 3;
        g.beginPath();
        g.moveTo(64 + Math.cos(a - 0.5) * 12, 64 + Math.sin(a - 0.5) * 12);
        g.arc(64, 64, 38, a - 0.5, a + 0.5);
        g.arc(64, 64, 12, a + 0.5, a - 0.5, true);
        g.fill();
      }
      break;
    case 'carpenter':
      g.save();
      g.translate(64, 64);
      g.rotate(-0.7);
      g.fillRect(-5, -12, 10, 48); // handle
      g.fillRect(-24, -30, 40, 18); // head
      g.beginPath(); // claw
      g.moveTo(16, -30);
      g.lineTo(30, -36);
      g.lineTo(28, -24);
      g.lineTo(16, -12);
      g.fill();
      g.restore();
      break;
  }
  cache.set(kind, c);
  return c;
}

/** A soft white radial glow (tinted by the material that uses it). */
export function glowCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
}
