/**
 * The film's colour, as one pass over the finished frame (before tone mapping, so the glow survives it):
 *
 * - drain: the colour leaves the world when Kael gives the order. Everything goes to ink black, white and grey,
 *   except cyan (the Hollow's own colour), which stays alive; with `warm` the crimson-gold of Raigen's lightning
 *   also survives. As the dawn comes the warm colours come back first, then the rest
 * - halftone: manga screentone dots in the mid-tones while drained
 * - impact: the impact frame, the picture flipped to its negative for an instant (CLINK, WHACK)
 * - speed: speed lines rushing in from the edges
 * - dawn: a warm gold lift over everything
 */
import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export class Grade {
  readonly pass: ShaderPass;
  readonly u: {
    uDrain: { value: number };
    uWarm: { value: number };
    uWarmFirst: { value: number };
    uHalftone: { value: number };
    uImpact: { value: number };
    uSpeed: { value: number };
    uDawn: { value: number };
    uTime: { value: number };
    uRes: { value: THREE.Vector2 };
    uFade: { value: number };
  };

  constructor() {
    this.pass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uDrain: { value: 0 },
        uWarm: { value: 0 },
        uWarmFirst: { value: 0 },
        uHalftone: { value: 0 },
        uImpact: { value: 0 },
        uSpeed: { value: 0 },
        uDawn: { value: 0 },
        uTime: { value: 0 },
        uRes: { value: new THREE.Vector2(1, 1) },
        uFade: { value: 0 },
      },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform float uDrain, uWarm, uWarmFirst, uHalftone, uImpact, uSpeed, uDawn, uTime, uFade;
        uniform vec2 uRes;
        varying vec2 vUv;

        vec3 rgb2hsv(vec3 c) {
          vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
          vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
          vec4 q = mix(vec4(p.xyw, K.x), vec4(c.r, p.yzx), step(p.x, c.r));
          float d = q.x - min(q.w, q.y);
          return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
        }
        float hueNear(float h, float c, float w) { float d = abs(h - c); d = min(d, 1.0 - d); return smoothstep(w, w * 0.4, d); }
        float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

        void main() {
          vec4 src = texture2D(tDiffuse, vUv);
          vec3 c = src.rgb;
          float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
          vec3 hsv = rgb2hsv(c / max(1.0, max(c.r, max(c.g, c.b))));
          // what survives the drain: cyan always, crimson-gold while Raigen's lightning is up
          float cyan = hueNear(hsv.x, 0.53, 0.09) * smoothstep(0.15, 0.4, hsv.y);
          float warmHue = max(hueNear(hsv.x, 0.0, 0.07), hueNear(hsv.x, 0.1, 0.07)) * smoothstep(0.2, 0.5, hsv.y);
          float keep = max(cyan, warmHue * uWarm);
          // the dawn gives the warm colours back first
          float drain = uDrain * (1.0 - warmHue * uWarmFirst);
          // drained: ink. The greys pushed apart, a little contrast, then the colour gone
          vec3 grey = vec3(lum);
          vec3 ink = pow(grey / (grey + 0.6), vec3(1.15)) * 1.6;
          vec3 drained = mix(ink, c, keep);
          c = mix(c, drained, drain);

          // screentone in the mid-tones
          if (uHalftone > 0.001) {
            float scale = uRes.y / 210.0;
            vec2 g = vUv * uRes / scale;
            vec2 rot = vec2(g.x * 0.7071 - g.y * 0.7071, g.x * 0.7071 + g.y * 0.7071);
            float dotR = length(fract(rot) - 0.5);
            float tone = smoothstep(0.08, 0.5, lum) * smoothstep(1.2, 0.35, lum);
            float dots = smoothstep(0.32 * tone, 0.32 * tone - 0.06, dotR);
            c = mix(c, c * (1.0 - dots * 0.55), uHalftone * tone * (1.0 - keep));
          }

          // speed lines: thin streaks from the edges toward the middle
          if (uSpeed > 0.001) {
            vec2 p = vUv - 0.5;
            float a = atan(p.y, p.x);
            float r = length(p);
            float line = step(0.82, h2(vec2(floor(a * 90.0), floor(uTime * 24.0))));
            float mask = smoothstep(0.22, 0.62, r);
            c = mix(c, vec3(1.0), line * mask * uSpeed * 0.75);
          }

          // the dawn's warmth
          c *= mix(vec3(1.0), vec3(1.12, 1.0, 0.86), uDawn);

          // the impact frame: the negative, hard
          if (uImpact > 0.001) {
            vec3 neg = vec3(1.0) - clamp(ink * 1.2, 0.0, 1.0);
            neg = mix(neg, neg * vec3(1.0, 0.25, 0.2) * 2.0, uWarm * 0.6);
            c = mix(c, neg * 1.4, uImpact);
          }

          // the vignette, and the fade to black
          vec2 q = vUv - 0.5;
          c *= 1.0 - dot(q, q) * (0.55 + uDrain * 0.5);
          c *= 1.0 - uFade;
          gl_FragColor = vec4(c, src.a);
        }`,
    });
    this.u = this.pass.uniforms as unknown as Grade['u'];
  }
}
