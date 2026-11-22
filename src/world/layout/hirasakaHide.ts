/**
 * HIRASAKA: a piece of the level that the story takes away (the rubble the pick clears, the rotten props the axe drops),
 * built with the zone kit's own helpers but kept out of the static batches: `hideable(b, name, draw)` hands `draw` a
 * stand-in builder that only collects meshes, then merges them into ONE named mesh with the colours baked into its
 * vertices (one draw call, whatever it is made of). `hirasaka/arms.ts` finds it by name and hides it once opened.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { LevelBuilder } from '../builder';

const MAT = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.92 });

/** Collect what `draw` adds and add it to the level as one named mesh (returned). */
export function hideable(b: LevelBuilder, name: string, draw: (collect: LevelBuilder) => void): THREE.Mesh {
  const meshes: THREE.Mesh[] = [];
  const collect = {
    add(obj: THREE.Object3D) {
      obj.updateMatrixWorld(true);
      obj.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
      });
    },
  } as unknown as LevelBuilder;
  draw(collect);
  const geos = meshes.map((m) => {
    let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    const n = g.attributes.position!.count;
    // the material's colour, times the vertices' own where it has them (the dress kit's crags)
    const mat = m.material as THREE.MeshStandardMaterial;
    const c = (mat.color ?? new THREE.Color(0x808080)) as THREE.Color;
    const own = mat.vertexColors && g.attributes.color ? (g.attributes.color as THREE.BufferAttribute) : null;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set(own ? [c.r * own.getX(i), c.g * own.getY(i), c.b * own.getZ(i)] : [c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', g.attributes.position!);
    if (!g.attributes.normal) g.computeVertexNormals();
    out.setAttribute('normal', g.attributes.normal!);
    out.setAttribute('color', g.attributes.color!);
    g = out;
    return g;
  });
  const mesh = new THREE.Mesh(mergeGeometries(geos, false)!, MAT);
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  b.addDynamic(mesh);
  return mesh;
}
