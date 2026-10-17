/**
 * The coarse device class the run report carries (`RunTracker`): phone, tablet or computer, and the GPU maker's name
 * when the browser reports one. Nothing finer is sent or kept: no renderer string, screen size or user agent.
 */

export type DeviceClass = 'phone' | 'tablet' | 'computer';

/** A touch screen with a short side under 600 CSS px is a phone, a larger one a tablet; no touch is a computer. */
export function deviceClass(touch: boolean, shortSide: number): DeviceClass {
  if (!touch) return 'computer';
  return shortSide > 0 && shortSide < 600 ? 'phone' : 'tablet';
}

/** The GPU makers a report may name (the server accepts only these). */
export const GPU_VENDORS = ['Apple', 'Adreno', 'Mali', 'PowerVR', 'Xclipse', 'NVIDIA', 'Intel', 'AMD', 'Software'] as const;
export type GpuVendor = (typeof GPU_VENDORS)[number];

const VENDOR_RULES: [RegExp, GpuVendor][] = [
  // a software rasteriser (no GPU, or a blocked one) first: its strings name other vendors too
  [/swiftshader|llvmpipe|softpipe|software|basic render/i, 'Software'],
  [/adreno/i, 'Adreno'],
  [/mali/i, 'Mali'],
  [/powervr|imagination/i, 'PowerVR'],
  [/xclipse|samsung/i, 'Xclipse'],
  [/nvidia|geforce|quadro|tegra/i, 'NVIDIA'],
  [/intel/i, 'Intel'],
  [/\bamd\b|radeon|\bati\b/i, 'AMD'],
  [/apple/i, 'Apple'],
];

/** The vendor word for a WebGL renderer string, or null when it names none of them. */
export function gpuVendor(renderer: string): GpuVendor | null {
  for (const [re, v] of VENDOR_RULES) if (re.test(renderer)) return v;
  return null;
}

/** Read the renderer once and keep only the vendor word. */
export function readGpuVendor(gl: WebGLRenderingContext | WebGL2RenderingContext): GpuVendor | null {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const s = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return typeof s === 'string' ? gpuVendor(s) : null;
  } catch {
    return null;
  }
}

/** This device, for a run report. */
export function deviceReport(touch: boolean, gl: WebGLRenderingContext | WebGL2RenderingContext | null): { device: DeviceClass; gpu: GpuVendor | null } {
  const short = typeof screen !== 'undefined' ? Math.min(screen.width || 0, screen.height || 0) : 0;
  return { device: deviceClass(touch, short), gpu: gl ? readGpuVendor(gl) : null };
}
