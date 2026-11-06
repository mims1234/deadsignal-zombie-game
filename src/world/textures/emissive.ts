/**
 * Emissive material painters: lamp lenses, contamination / cryo glows, monitor screens, lit windows.
 * Emissive intensities are > 1 so the (restrained) bloom pass picks them up without washing out the scene.
 */
import * as THREE from 'three';
import { type PaintCtx, SM, SS, TexBuilder, finishMaterial, sstep } from './core';
import { canvasTexture, makeCanvas } from './stencil';

export type EmissiveName = 'lampWarm' | 'lampCool' | 'lampRed' | 'emGreen' | 'emBlue' | 'emAmber' | 'screen' | 'windowLit';

function plain(color: number, emissive: number, intensity: number, rough = 0.4): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: intensity, roughness: rough, metalness: 0 });
}

/** Swirling glow (liquid / gas): dark tinted albedo + noisy emissive map. */
function glowNoise(ctx: PaintCtx, base: [number, number, number], hot: [number, number, number], intensity: number): THREE.MeshStandardMaterial {
  const n = 256;
  const tb = new TexBuilder(n, { emissive: true });
  const { bank } = ctx;
  const em = tb.emissive!;
  for (let y = 0; y < n; y++) {
    const rowB = ((y * 2) & SM) << SS;
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const bi = rowB | ((x * 2) & SM);
      const swirl = bank.macro[bi]! * 0.55 + bank.mid[(bi + 300) & 262143]! * 0.45;
      const fine = bank.fine[bi]!;
      const k = 0.55 + 0.6 * sstep(0.25, 0.85, swirl) + (fine - 0.5) * 0.2;
      const o = i * 4;
      tb.albedo[o] = base[0] * 0.2;
      tb.albedo[o + 1] = base[1] * 0.2;
      tb.albedo[o + 2] = base[2] * 0.2;
      em[o] = Math.min(255, hot[0] * k);
      em[o + 1] = Math.min(255, hot[1] * k);
      em[o + 2] = Math.min(255, hot[2] * k);
      em[o + 3] = 255;
      tb.orm[o + 1] = 70;
      tb.height[i] = swirl * 0.5;
    }
  }
  const m = finishMaterial(ctx, tb, { tile: 2, normalStrength: 1.5, roughness: 1 });
  m.emissiveIntensity = intensity;
  return m;
}

function paintScreen(ctx: PaintCtx): THREE.MeshStandardMaterial {
  const w = 256;
  const h = 256;
  const { canvas, g } = makeCanvas(w, h);
  g.fillStyle = 'rgb(5,13,22)';
  g.fillRect(0, 0, w, h);
  // header bar
  g.fillStyle = 'rgb(20,110,140)';
  g.fillRect(8, 8, w - 16, 16);
  g.fillStyle = 'rgb(140,230,255)';
  g.fillRect(12, 12, 60, 8);
  g.fillRect(w - 52, 12, 36, 8);
  // text rows
  g.fillStyle = 'rgb(60,190,210)';
  const lens = [180, 140, 200, 90, 160, 120, 176, 70];
  for (let i = 0; i < lens.length; i++) g.fillRect(12, 34 + i * 11, lens[i]!, 5);
  // waveform graph
  g.strokeStyle = 'rgb(90,255,150)';
  g.lineWidth = 2;
  g.strokeRect(12, 132, w - 24, 70);
  g.beginPath();
  for (let x = 0; x <= w - 26; x += 4) {
    const y = 167 + Math.sin(x * 0.09) * 18 + Math.sin(x * 0.31) * 8 + Math.sin(x * 0.021) * 6;
    if (x === 0) g.moveTo(14 + x, y);
    else g.lineTo(14 + x, y);
  }
  g.stroke();
  // amber status tiles
  for (let i = 0; i < 6; i++) {
    g.fillStyle = i === 2 ? 'rgb(255,150,40)' : 'rgb(40,150,170)';
    g.fillRect(12 + i * 40, 212, 32, 24);
  }
  // scanlines
  g.fillStyle = 'rgba(0,0,0,0.28)';
  for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
  const tex = ctx.track(canvasTexture(canvas));
  const m = new THREE.MeshStandardMaterial({
    map: tex,
    emissiveMap: tex,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 1.7,
    roughness: 0.25,
    metalness: 0.1,
  });
  return m;
}

function paintWindowLit(ctx: PaintCtx): THREE.MeshStandardMaterial {
  const w = 256;
  const h = 256;
  const { canvas, g } = makeCanvas(w, h);
  // the room behind: warm lamplight, brightest in the middle
  const room = g.createRadialGradient(w / 2, h * 0.55, 10, w / 2, h * 0.55, w * 0.7);
  room.addColorStop(0, 'rgb(255,222,150)');
  room.addColorStop(1, 'rgb(214,132,62)');
  g.fillStyle = room;
  g.fillRect(0, 0, w, h);
  // something in the room: a lampshade and the back of a chair against the far wall
  g.fillStyle = 'rgba(80,36,12,0.45)';
  g.fillRect(150, 168, 58, 88);
  g.beginPath();
  g.moveTo(96, 120);
  g.lineTo(124, 120);
  g.lineTo(130, 142);
  g.lineTo(90, 142);
  g.closePath();
  g.fill();
  // the curtains: two drapes drawn back to either side, gathered at a tie-back, hanging in vertical folds
  const drape = (left: boolean): void => {
    const top = 22;
    const tie = h * 0.62;
    const wTop = 74; // how far in each drape reaches at the rail
    const wTie = 40; // and where the tie-back gathers it
    const edge = (y: number): number => {
      // the inner edge: straight down from the rail, sweeping in to the tie-back, flaring out below it
      if (y < tie) {
        const k = (y - top) / (tie - top);
        return wTop + (wTie - wTop) * k * k;
      }
      const k = (y - tie) / (h - tie);
      return wTie + (wTop - 8 - wTie) * Math.sqrt(k);
    };
    g.save();
    g.beginPath();
    g.moveTo(left ? 0 : w, top);
    for (let y = top; y <= h; y += 4) g.lineTo(left ? edge(y) : w - edge(y), y);
    g.lineTo(left ? 0 : w, h);
    g.closePath();
    g.clip();
    // cloth lit from behind: deep red, with folds (lighter crowns, dark troughs)
    for (let x = 0; x < wTop + 4; x++) {
      const fold = 0.5 + 0.5 * Math.sin((x / (wTop + 4)) * Math.PI * 6.5);
      const r = Math.round(118 + 70 * fold);
      const gg = Math.round(34 + 26 * fold);
      const b = Math.round(22 + 14 * fold);
      g.fillStyle = `rgb(${r},${gg},${b})`;
      g.fillRect(left ? x : w - 1 - x, top, 1, h - top);
    }
    // shade toward the outer edge (thicker cloth), and a little at the hem
    const sh = g.createLinearGradient(left ? 0 : w, 0, left ? wTop : w - wTop, 0);
    sh.addColorStop(0, 'rgba(30,6,4,0.45)');
    sh.addColorStop(1, 'rgba(30,6,4,0)');
    g.fillStyle = sh;
    g.fillRect(0, top, w, h - top);
    g.restore();
    // the tie-back: a cord across the gathered cloth
    g.fillStyle = 'rgb(214,170,80)';
    g.fillRect(left ? 0 : w - wTie - 2, tie - 3, wTie + 2, 6);
  };
  drape(true);
  drape(false);
  // the valance along the rail: a pleated pelmet
  g.fillStyle = 'rgb(126,34,22)';
  g.fillRect(0, 10, w, 22);
  for (let x = 0; x < w; x += 16) {
    g.fillStyle = 'rgba(40,8,4,0.45)';
    g.fillRect(x, 10, 3, 22);
    g.beginPath();
    g.fillStyle = 'rgb(126,34,22)';
    g.arc(x + 8, 32, 8, 0, Math.PI);
    g.fill();
  }
  // the frame and the glazing bars
  g.fillStyle = 'rgb(22,18,14)';
  g.fillRect(0, 0, w, 10);
  g.fillRect(0, h - 10, w, 10);
  g.fillRect(0, 0, 10, h);
  g.fillRect(w - 10, 0, 10, h);
  g.fillRect(w / 2 - 4, 0, 8, h);
  g.fillRect(0, h / 2 - 4, w, 8);
  const tex = ctx.track(canvasTexture(canvas));
  return new THREE.MeshStandardMaterial({
    map: tex,
    emissiveMap: tex,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 1.3,
    roughness: 0.5,
    metalness: 0,
  });
}

export function paintEmissive(ctx: PaintCtx, name: EmissiveName): THREE.MeshStandardMaterial {
  switch (name) {
    case 'lampWarm':
      return plain(0x2a1a0c, 0xffa858, 2.4);
    case 'lampCool':
      return plain(0x1a1e26, 0xbcd8ff, 2.0);
    case 'lampRed':
      return plain(0x240604, 0xff2412, 2.6);
    case 'emAmber':
      return plain(0x2a1a04, 0xffa012, 2.2);
    case 'emGreen':
      return glowNoise(ctx, [40, 255, 120], [40, 255, 120], 1.7);
    case 'emBlue':
      return glowNoise(ctx, [60, 160, 255], [60, 160, 255], 1.7);
    case 'screen':
      return paintScreen(ctx);
    case 'windowLit':
      return paintWindowLit(ctx);
  }
}

