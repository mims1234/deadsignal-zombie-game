/**
 * Just enough of a browser for the level builder to run in Node: canvases that accept every 2D call and draw nothing,
 * and images that never load. The server only wants the colliders, the nav grid and the gameplay data; no texture it
 * "paints" is ever looked at. Import this before anything that builds a level.
 */
const ctx2d: unknown = new Proxy(
  {},
  {
    get(_t, k) {
      if (k === 'getImageData' || k === 'createImageData') {
        return (_x: number, _y: number, w = 1, h = 1) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(4, Math.abs(w * h) * 4)) });
      }
      if (k === 'measureText') return () => ({ width: 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern' || k === 'createConicGradient') return () => ({ addColorStop() {} });
      if (k === 'canvas') return undefined;
      return () => {};
    },
    set() {
      return true;
    },
  },
);

class FakeCanvas {
  width = 1;
  height = 1;
  style: Record<string, string> = {};
  getContext(): unknown {
    return ctx2d;
  }
  toDataURL(): string {
    return '';
  }
  addEventListener(): void {}
  removeEventListener(): void {}
}

class FakeImage {
  width = 0;
  height = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_v: string) {}
}

const g = globalThis as Record<string, unknown>;
if (typeof g.document === 'undefined') {
  g.HTMLCanvasElement = FakeCanvas;
  g.HTMLImageElement = FakeImage;
  g.Image = FakeImage;
  g.document = {
    createElement: () => new FakeCanvas(),
    createElementNS: () => new FakeCanvas(),
    documentElement: { classList: { contains: () => false, add() {}, remove() {} } },
    addEventListener() {},
  };
  g.window ??= g;
}
