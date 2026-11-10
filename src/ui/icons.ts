/** Small inline SVG icon set (24x24 grid) and weapon silhouettes. All drawn with `currentColor`. */
import type { WeaponId } from '../types';
import { svgEl } from './dom';

export type IconName =
  | 'cross'
  | 'shield'
  | 'plate'
  | 'grenade'
  | 'lock'
  | 'check'
  | 'x'
  | 'diamond'
  | 'diamondHollow'
  | 'hazard'
  | 'target'
  | 'signal';

interface IconPart {
  d: string;
  mode: 'fill' | 'stroke';
}

const ICONS: Record<IconName, IconPart[]> = {
  cross: [{ d: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z', mode: 'fill' }],
  shield: [{ d: 'M12 2 4 5v6c0 5.2 3.4 9.3 8 11 4.6-1.7 8-5.8 8-11V5z', mode: 'fill' }],
  plate: [{ d: 'M7.5 3h9L20 7v11l-3 3H7l-3-3V7z', mode: 'fill' }],
  grenade: [
    { d: 'M12 8.6a6.4 6.4 0 1 0 .001 0z', mode: 'fill' },
    { d: 'M10.4 3h3.2v4h-3.2z', mode: 'fill' },
    { d: 'M14 4.4 19.6 3l.6 1.7-5.6 1.7z', mode: 'fill' },
  ],
  lock: [{ d: 'M7 10V7a5 5 0 0 1 10 0v3h1.5v11h-13V10zm2.2 0h5.6V7a2.8 2.8 0 0 0-5.6 0z', mode: 'fill' }],
  check: [{ d: 'M4.5 12.5l5 5L20 6.5', mode: 'stroke' }],
  x: [{ d: 'M5.5 5.5l13 13M18.5 5.5l-13 13', mode: 'stroke' }],
  diamond: [{ d: 'M12 2.5l9.5 9.5-9.5 9.5L2.5 12z', mode: 'fill' }],
  diamondHollow: [{ d: 'M12 3.5l8.5 8.5-8.5 8.5L3.5 12z', mode: 'stroke' }],
  hazard: [
    { d: 'M12 3.2 21.6 20H2.4z', mode: 'stroke' },
    { d: 'M12 9.5v5.2M12 17.2v.1', mode: 'stroke' },
  ],
  target: [
    { d: 'M12 4.5a7.5 7.5 0 1 0 .001 0z', mode: 'stroke' },
    { d: 'M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4', mode: 'stroke' },
    { d: 'M12 10.6a1.4 1.4 0 1 0 .001 0z', mode: 'fill' },
  ],
  signal: [
    { d: 'M4 20V15M9 20V11M14 20V7M19 20V3', mode: 'stroke' },
  ],
};

export function icon(name: IconName, cls = ''): SVGSVGElement {
  const svg = svgEl('svg', { viewBox: '0 0 24 24', class: `ds-ic ${cls}`.trim(), 'aria-hidden': 'true', focusable: 'false' });
  for (const part of ICONS[name]) {
    const p = svgEl('path', { d: part.d }, svg);
    if (part.mode === 'fill') {
      p.setAttribute('fill', 'currentColor');
    } else {
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', 'currentColor');
      p.setAttribute('stroke-width', '2');
      p.setAttribute('stroke-linecap', 'round');
      p.setAttribute('stroke-linejoin', 'round');
    }
  }
  return svg;
}

/** Simple side-on weapon silhouettes (muzzle to the right), viewBox 0 0 160 50. */
const WEAPON_PATHS: Record<WeaponId, string[]> = {
  rifle: [
    // stock + buffer tube
    'M4 21 30 19 34 30 9 36z',
    // receiver
    'M30 17h50v13H30z',
    // rail + optic
    'M42 11h26v5H42zM46 8h18v3H46z',
    // handguard
    'M80 19h44v9H80z',
    // barrel + muzzle device
    'M124 21h20v5h-20zM144 19h12v9h-12z',
    // pistol grip
    'M50 30h11l-4 15H46z',
    // magazine
    'M64 30h11l-1 17H61z',
    // front sight
    'M112 14h3v5h-3z',
  ],
  pistol: [
    // slide
    'M14 10h70v13H14z',
    // barrel tip / muzzle
    'M84 12h8v9h-8z',
    // sights
    'M18 7h5v3h-5zM78 7h4v3h-4z',
    // frame and trigger guard
    'M14 23h50l-6 8H34v-8z',
    // grip
    'M14 23h22l-7 24H8z',
  ],
  shotgun: [
    // stock
    'M3 20 34 18 38 30 8 38z',
    // receiver
    'M34 16h42v14H34z',
    // barrel
    'M76 17h78v5H76z',
    // magazine tube
    'M76 24h68v4H76z',
    // pump forend
    'M96 23h30v9H96z',
    // trigger guard + grip
    'M44 30h14l-2 6H46zM38 30h8l-4 12h-8z',
    // bead sight
    'M148 13h4v4h-4z',
  ],
  rpg: [
    // launch tube with the flared venturi at the back
    'M14 18h104v12H14z',
    'M2 14 14 18v12L2 34z',
    // warhead
    'M118 16h14l22 8-22 8h-14z',
    // pistol grip, forward grip
    'M44 30h10l-3 15h-10zM78 30h9l-2 11h-9z',
    // sight
    'M56 10h4v8h-4zM96 12h3v6h-3z',
  ],
  hanafubuki: [
    // the drum (the belt's box) and the stock
    'M4 20 26 18 28 34 8 36z',
    'M26 14h40v24H26z',
    // the rotor housing and six barrels
    'M66 17h26v18H66z',
    'M92 18h56v4H92zM92 24h60v4H92zM92 30h56v4H92z',
    // the carry handle and the grips
    'M40 8h30v4H40zM44 38h10l-3 10h-10zM74 35h9l-2 9h-9z',
  ],
  raijin: [
    // the drum itself, with its rings of tomoe
    'M40 6a20 20 0 1 1 0 40a20 20 0 1 1 0-40z',
    // the barrel the bolt leaves through
    'M60 20h70v12H60zM130 16h14v20h-14z',
    // the grips and the stock
    'M4 20h22v12H4zM62 32h10l-3 14h-10z',
  ],
  // ---- ZARYA's guns ----
  signalka: [
    // the fat barrel, the signal band at its muzzle
    'M52 11h60v17H52z',
    'M112 9h11v21h-11z',
    // breech, hinge block, hammer
    'M38 13h14v22H38zM52 28h36v8H52zM32 7h8v8h-8z',
    // grip with its lanyard ring, trigger guard
    'M38 33h19l-7 15H30zM60 36h20v3H60zM78 30h3v9h-3z',
  ],
  arbalet: [
    // butt and tiller
    'M4 19 30 21v11L4 37z',
    'M28 22h100v7H28z',
    // the bolt in its groove
    'M40 18h84v2H40zM124 16l8 3-8 3z',
    // the prod (the bow) across the front, its string, the stirrup
    'M122 3c11 6 14 16 14 22s-3 16-14 22l-2.5-3c8-5 11-12 11-19s-3-14-11-19z',
    'M119 6h1.5v38H119z',
    'M138 18h10v14h-10zM141 21v8h4v-8z',
    // grip
    'M46 29h10l-3 14H43z',
  ],
  gvozdomyot: [
    // the air tank behind, the housing
    'M4 15h26v16H4z',
    'M30 11h60v24H30z',
    // the driver's nose and its tip
    'M90 19h40v7H90zM130 15h8v15h-8z',
    // the nail strip, slanting back from under the nose
    'M64 43l60-15 1.5 6-60 15z',
    // grip, and the gas canister
    'M40 35h12l-4 13H36zM56 4h26v6H56z',
  ],
  salyut: [
    // three of the five tubes, their rockets' noses
    'M22 5h104v7H22zM126 5l12 3.5-12 3.5z',
    'M22 14h104v7H22zM126 14l12 3.5-12 3.5z',
    'M22 23h104v7H22zM126 23l12 3.5-12 3.5z',
    // the board, the fuse, the two grips
    'M18 31h116v4H18zM8 16h14v2H8z',
    'M42 35h10l-3 12H39zM92 35h9l-2 10h-9z',
  ],
  ottepel: [
    // the samovar's belly, the gauge on top of it
    'M20 13q14-11 28 0v20q-14 11-28 0z',
    'M54 2a6 6 0 1 1 0 12a6 6 0 1 1 0-12z',
    // the lance through its coil, the bell
    'M48 20h80v5H48zM82 15h4v15h-4zM90 15h4v15h-4zM98 15h4v15h-4zM106 15h4v15h-4z',
    'M126 19h4l18-8v23l-18-8h-4z',
    // the grips, the hose down to the pack
    'M36 36h10l-3 12H33zM92 25h9l-2 14h-9z',
    'M20 28q-12 4-14 20h4q2-12 11-15z',
  ],
  zenit: [
    // the body, the lens let into it
    'M36 15h78v30H36zM75 18a12 12 0 1 0 0 24a12 12 0 1 0 0-24z',
    'M75 23a7 7 0 1 1 0 14a7 7 0 1 1 0-14z',
    // the prism's hump, the knobs
    'M64 6h22l4 9H60zM42 10h12v5H42zM98 11h10v4H98z',
    // the flash on its handle
    'M124 20h6v26h-6zM122 10h6l14-7v24l-14-7h-6z',
  ],
};

export function weaponSilhouette(id: WeaponId, cls = ''): SVGSVGElement {
  const svg = svgEl('svg', { viewBox: '0 0 160 50', class: `ds-wsil ${cls}`.trim(), 'aria-hidden': 'true', focusable: 'false' });
  for (const d of WEAPON_PATHS[id]) svgEl('path', { d, fill: 'currentColor' }, svg);
  return svg;
}
