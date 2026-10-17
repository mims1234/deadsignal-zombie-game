/**
 * Where the Thousand Lanterns' pieces are on the built map (from the level's Sakura handles): the five omamori, the
 * sacred tree, the five great lanterns and the bell tower. The simulation and every screen use the same.
 */
import type { SakuraHandles } from '../world/layout/sakura';
import type { QuestSpots } from './quest';

export function questSpots(h: SakuraHandles): QuestSpots {
  const music = h.school.musicRoom;
  const vip = h.shotengai.vipRoom;
  const boat = h.canal.boat;
  const fridge = h.under.fridge;
  return {
    charms: [
      { x: -80, y: 1.0, z: 156.5 }, // the metro's lost and found
      { x: music.x, y: music.y + 1.0, z: music.z }, // the music room piano
      { x: vip.x, y: vip.y + 1.7, z: vip.z }, // the karaoke's mirror ball
      { x: boat.x + 2.3, y: -0.4, z: boat.z - 0.8 }, // the sunken boat's bow
      { x: fridge.x - 0.6, y: 1.5, z: fridge.z }, // the lab's sample fridge
    ],
    fuses: h.under.metro.fuses.map((f) => ({ ...f })),
    tree: { x: h.canal.sacredTree.x, z: h.canal.sacredTree.z },
    lanterns: h.canal.lanterns.map((l) => ({ x: l.x, z: l.z })),
    bell: { x: 122, z: 39 },
  };
}
