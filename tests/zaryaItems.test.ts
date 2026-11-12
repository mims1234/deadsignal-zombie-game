import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ITEM_Y, ItemMarks, MOD_ICON, TOOL_IDS, iconUrl, itemGeometry, ornamentIcon, partIcon, townItems } from '../src/zarya/items';
import { MOD_PARTS, ORNAMENTS, TOOLS } from '../src/zarya/story';
import { TOWN } from '../src/zarya/unlock';

const onDisk = (url: string): boolean => existsSync(join(__dirname, '..', 'public', url.replace(/^.*?zarya\//, 'zarya/')));

describe('ZARYA items: a picture and a model for every collectable', () => {
  it('every part, tool, ornament and the mod part has an icon file', () => {
    TOWN.parts.forEach((_, i) => expect(onDisk(partIcon(i)), TOWN.parts[i]!.id).toBe(true));
    for (const t of TOOL_IDS) expect(onDisk(iconUrl(t)), t).toBe(true);
    ORNAMENTS.forEach((_, i) => expect(onDisk(ornamentIcon(i)), `orn${i}`).toBe(true));
    expect(onDisk(MOD_ICON)).toBe(true);
  });

  it('lists every collectable once, each lying on a known surface', () => {
    const { spots, at } = townItems();
    expect(spots.length).toBe(TOWN.parts.length + TOWN.finds.length + TOOLS.length + MOD_PARTS.length + ORNAMENTS.length);
    expect(at.ornament + ORNAMENTS.length).toBe(spots.length);
    TOWN.parts.forEach((p, i) => {
      expect(spots[at.part + i]!.model).toBe(p.id);
      expect(spots[at.part + i]!.y).toBe(ITEM_Y[p.id]);
    });
    for (const s of spots) expect(s.y).toBeGreaterThanOrEqual(0);
  });

  it('builds a real model for each (more than a single box)', () => {
    for (const s of townItems().spots) expect(itemGeometry(s.model).attributes.position!.count, s.model).toBeGreaterThan(36);
  });

  it('draws all of them as one mesh, each switched on and off on its own', () => {
    const { spots } = townItems();
    const m = new ItemMarks(spots);
    expect(m.mesh.isMesh).toBe(true);
    m.update(0);
    expect(m.mesh.visible).toBe(false);
    m.set(3, true);
    m.update(1);
    expect(m.mesh.visible).toBe(true);
    m.set(3, false);
    m.update(2);
    expect(m.mesh.visible).toBe(false);
    m.dispose();
  });
});
