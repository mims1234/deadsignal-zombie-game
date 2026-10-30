/**
 * Who wears what at the station (VRoid models in `public/anime/`, loaded with the anime cast): the passengers who wait,
 * the figure in your clothes, Ren. A missing file falls back to any loaded one, then the stock figure.
 */
export const ANIMEOPS = {
  passengers: ['student-m.vrm', 'student-f.vrm', 'hoodie.vrm', 'shino.vrm'],
  /** The figure wearing your clothes (the first co-op seat's look). */
  you: 'fumiriya.vrm',
  ren: 'yuzu.vrm',
  fallback: ['student-f.vrm', 'student-m.vrm', 'shino.vrm', 'fumiriya.vrm'],
} as const;
