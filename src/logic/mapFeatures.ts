/**
 * Per-map feature switches (pure: the client and the co-op host both read it). ZARYA brought a set of systems that were
 * switched on by `mapId === 'zarya'` checks; each is a switch here instead, so another map can take them up without
 * changing how ZARYA or any other map plays. A map not listed has every switch off (as every map did before ZARYA).
 *
 *   melee        `Game` builds a `MeleeSystem` (something to swing: key 3 / the wheel / the arsenal cycle).
 *   arsenal      a player keeps every gun and every weapon to swing taken (`Inventory.arsenal`, `logic/arsenal.ts`):
 *                set by `Game.startRun` for the run, before the map's runtime resets (ZARYA's runtime sets it too).
 *   compactPhone phones get the compact touch layout: a stick, one fire button and a menu dot whose mini menu holds the
 *                JOURNAL (the pause menu) and, with `arsenal`, the WEAPONS list.
 *   noClock      no deadline, no surge, no escalation by the minute (`logic/mission.ts` `NO_CLOCK`); the HUD clock is
 *                hidden before the map decorates the HUD (a map may still show a timer of its own). The only way to
 *                lose is to die. A map's runtime may still scale the infected with progress (`Game.escalation`).
 *   squadRegroup in co-op, a player going through a stairwell / doorway asks the host to bring the squadmates keeping
 *                up with them (`squad.regroupAt` -> `rg`).
 *   nearTags     the squad's name tags show only within 5 m (a crowded town, or a squad of characters, not soldiers).
 *   start        the loadout a run starts with, set by `Game.startRun` (guns in slot order; `melee` taken but not
 *                drawn). Left out: the stock loadout (ZARYA's runtime hands out its own pistol, the knife later).
 *
 * The squad's switches live with the squad (`SQUADS[map].equals`: squadmates who never die; `fillsSeats`: co-op
 * players take their places). Item icons and speakers' faces need no switch: they show only where a map hands the HUD
 * an `icon` / `icons` / `itemCard` (`ui/hudItems.ts`) or registers faces (`Game.radioFace`).
 *
 * ---- The map runtime API (what a map's runtime, e.g. `hirasaka/runtime.ts`, calls on `g: Game`) ----
 *
 *   Switched on here, nothing to call: the melee system, the arsenal for the run, the start loadout, the compact phone
 *   layout (JOURNAL opens the pause menu, WEAPONS lists the arsenal), no clock (timer hidden), squadmates (`SQUADS`).
 *
 *   g.melee                  `MeleeSystem | null`. `equip(id)` takes a weapon to swing into the pack and makes it the
 *                            one that comes out; `select(id)`, `setOut(bool)`, `pack` (everything carried),
 *                            `carried` (the one that comes out), `out`, `hidden`. Defs: `logic/melee.ts` `MELEE`.
 *   g.session.inv.arsenal    true for the run (set before the runtime's `reset`); guns taken join the rest
 *                            (`logic/economy.ts` `addGun`), and the station/box/pickup code already honours it.
 *   g.radioFace = (speaker, text) => RadioFace | null
 *                            a portrait, name and colour on each caption (`ui/hudTypes.ts` `RadioFace`: name, short,
 *                            color, portrait url). Set it in the runtime's constructor, null it in `dispose`. For a
 *                            first-meeting card / PEOPLE journal page as ZARYA does, a runtime may instead take every
 *                            line itself with `g.radioHook` (see `zarya/people.ts` `ZaryaPeople`, the model to copy).
 *   g.hudEvent({ type: 'feed' | 'banner', ..., icon })   item pictures on a feed line / banner (`icon`: image url);
 *                            `HudState.objectives[i].icons`, `HudState.itemCard` in `decorateHud`;
 *                            `journalIcons(icons)`, `journalBuilds(list)` from `ui/hudItems.ts` for journal pages.
 *   g.escalation = () => 0..3   the director's phase now, by story progress (solo; null = none under no clock).
 *   g.entities.mover = BoxMover   a mystery box that moves between the map's places (solo; `game/entities.ts`).
 *                            (Co-op hosts move only ZARYA's sack so far: `sim/serverHost.ts` `moveSack`.)
 *   g.squad.figures()        the squadmates' `Avatar`s, in `SQUADS[map].names` order (HIRASAKA: Natsuki, Daigo).
 *   g.squad.regroupAt(x, z, yaw, area)   bring the squadmates keeping up through a stairwell / cage with the player.
 */
import type { WeaponId } from '../types';
import type { MapId } from '../world/layout/data';
import type { MeleeId } from './melee';

export interface MapFeatures {
  readonly melee: boolean;
  readonly arsenal: boolean;
  readonly compactPhone: boolean;
  readonly noClock: boolean;
  readonly squadRegroup: boolean;
  readonly nearTags: boolean;
  readonly start?: { readonly guns: readonly WeaponId[]; readonly melee?: MeleeId };
}

const OFF: MapFeatures = { melee: false, arsenal: false, compactPhone: false, noClock: false, squadRegroup: false, nearTags: false };

export const MAP_FEATURES: Partial<Record<MapId, MapFeatures>> = {
  zarya: { melee: true, arsenal: true, compactPhone: true, noClock: true, squadRegroup: true, nearTags: true },
  // HIRASAKA reborn (2026-11-22): ZARYA's systems; a Nambu-pattern pistol and a knife to start (the tools come later)
  hirasaka: { melee: true, arsenal: true, compactPhone: true, noClock: true, squadRegroup: true, nearTags: true, start: { guns: ['pistol'], melee: 'knife' } },
};

/** The switches for `map` (all off for a map not listed). */
export function mapFeatures(map: MapId | string | undefined): MapFeatures {
  return (map && MAP_FEATURES[map as MapId]) || OFF;
}
