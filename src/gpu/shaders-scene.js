// WGSL for the scene pass: instanced primitives, procedural materials, lights,
// sky and haze. Output is linear scene radiance (HDR) plus linear depth in metres.
import { MAT } from '../scenes.js';

const matConsts = Object.entries(MAT).map(([k, v]) => `const M_${k}: u32 = ${v}u;`).join('\n');

export const NOISE_WGSL = /* wgsl */`
const PI = 3.14159265;
fn hash12(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.x, p.y, p.x) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
fn hash13(p: vec3f) -> f32 {
  var p3 = fract(p * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
fn hash33(p: vec3f) -> vec3f {
  var p3 = fract(p * vec3f(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}
fn vnoise2(p: vec2f) -> f32 {
  let i = floor(p); let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = hash12(i); let b = hash12(i + vec2f(1.0, 0.0));
  let c = hash12(i + vec2f(0.0, 1.0)); let d = hash12(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
fn vnoise3(p: vec3f) -> f32 {
  let i = floor(p); let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let n000 = hash13(i); let n100 = hash13(i + vec3f(1, 0, 0));
  let n010 = hash13(i + vec3f(0, 1, 0)); let n110 = hash13(i + vec3f(1, 1, 0));
  let n001 = hash13(i + vec3f(0, 0, 1)); let n101 = hash13(i + vec3f(1, 0, 1));
  let n011 = hash13(i + vec3f(0, 1, 1)); let n111 = hash13(i + vec3f(1, 1, 1));
  return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
             mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
}
// fbm whose octaves fade out as they approach the pixel footprint (fp, in noise units).
fn fbmF(p: vec2f, fp: f32, oct: i32) -> f32 {
  var s = 0.0; var a = 0.5; var q = p; var w = fp;
  for (var i = 0; i < oct; i++) {
    let k = 1.0 - smoothstep(0.3, 0.9, w);
    s += a * mix(0.5, vnoise2(q), k);
    q = q * 2.03 + vec2f(17.1, 9.2); w *= 2.03; a *= 0.5;
  }
  return s;
}
fn fbmF3(p: vec3f, fp: f32, oct: i32) -> f32 {
  var s = 0.0; var a = 0.5; var q = p; var w = fp;
  for (var i = 0; i < oct; i++) {
    let k = 1.0 - smoothstep(0.3, 0.9, w);
    s += a * mix(0.5, vnoise3(q), k);
    q = q * 2.03 + vec3f(17.1, 9.2, 4.7); w *= 2.03; a *= 0.5;
  }
  return s;
}
// Terrain heightfield (mirrors terrainHeight() in scenes.js).
fn terrainHeight(p: vec2f) -> f32 {
  let q = vec2f(p.x / 1500.0, (p.y - 1100.0) / 1300.0);
  let d = length(q);
  var h = (d - 1.0) * 140.0;
  var n = 0.0; var a = 0.5; var pp = p / 2200.0 + vec2f(3.1, 1.7);
  for (var i = 0; i < 6; i++) {
    let r = 1.0 - abs(vnoise2(pp) * 2.0 - 1.0);
    n += a * r * r;
    pp = pp * 2.03 + vec2f(17.1, 9.2); a *= 0.5;
  }
  let far = clamp((q.y - 1.2) / 2.6, 0.0, 1.0);
  let mtn = far * far * (3.0 - 2.0 * far);
  h += mtn * (250.0 + 1700.0 * n * n);
  h += (vnoise2(p / 300.0) - 0.5) * 50.0 * clamp((d - 0.95) * 4.0, 0.0, 1.0);
  return h;
}
`;

export const SCENE_WGSL = /* wgsl */`
${matConsts}
${NOISE_WGSL}

struct Scene {
  viewProj: mat4x4f,
  shadowVP: mat4x4f,
  camPos: vec4f,   // eye, w = time offset within the exposure (s)
  camR: vec4f,     // right, w = duration represented by this sample (s)
  camU: vec4f,     // up, w = sample seed
  camF: vec4f,     // forward, w = texture filter scale
  win: vec4f,      // tangent window x0, y0, x1, y1
  sunDir: vec4f,   // toward sun, w = irradiance
  sunCol: vec4f,   // rgb, w = disc radiance
  skyZen: vec4f,   // rgb, w = ambient scale
  skyHor: vec4f,   // rgb, w = cloud cover
  skyGnd: vec4f,   // rgb, w = stars
  fog: vec4f,      // rgb, w = density
  misc: vec4f,     // light count, scene index, sun angular radius, shadows on
  misc2: vec4f,    // indoor, 0, 0, shadow texel (m)
}
struct Inst {
  m0: vec4f, m1: vec4f, m2: vec4f,
  n0: vec4f, n1: vec4f, n2: vec4f,
  col: vec4f, p1: vec4f, p2: vec4f,
  mot: vec4f, spin: vec4f, piv: vec4f,
}
struct Light { pos: vec4f, col: vec4f }

@group(0) @binding(0) var<uniform> S: Scene;
@group(0) @binding(1) var<storage, read> insts: array<Inst>;
@group(0) @binding(2) var<storage, read> lights: array<Light>;
@group(0) @binding(3) var shadowMap: texture_depth_2d;
@group(0) @binding(4) var shadowSamp: sampler_comparison;

struct VOut {
  @builtin(position) clip: vec4f,
  @location(0) wpos: vec3f,
  @location(1) nrm: vec3f,
  @location(2) lpos: vec3f,
  @location(3) @interpolate(flat) iid: u32,
  @location(4) emis: f32,
}

fn rotAxis(v: vec3f, axis: vec3f, ang: f32) -> vec3f {
  let c = cos(ang); let s = sin(ang);
  return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
}

fn transformVertex(pos: vec3f, nrm: vec3f, ii: u32, tau: f32) -> VOut {
  let I = insts[ii];
  var wp = vec3f(dot(I.m0.xyz, pos) + I.m0.w, dot(I.m1.xyz, pos) + I.m1.w, dot(I.m2.xyz, pos) + I.m2.w);
  var wn = normalize(vec3f(dot(I.n0.xyz, nrm), dot(I.n1.xyz, nrm), dot(I.n2.xyz, nrm)));
  let size = vec3f(length(vec3f(I.m0.x, I.m1.x, I.m2.x)), length(vec3f(I.m0.y, I.m1.y, I.m2.y)), length(vec3f(I.m0.z, I.m1.z, I.m2.z)));
  let flags = u32(I.spin.w);
  var emis = 1.0;
  if ((flags & 2u) != 0u) {
    let h = terrainHeight(wp.xz);
    let e = 3.0 + 0.004 * length(wp.xz - S.camPos.xz);
    let hx = terrainHeight(wp.xz + vec2f(e, 0.0));
    let hz = terrainHeight(wp.xz + vec2f(0.0, e));
    wp.y = h;
    wn = normalize(vec3f(h - hx, e, h - hz));
  }
  if (I.mot.w != 0.0) {
    let ang = I.mot.w * tau;
    wp = I.piv.xyz + rotAxis(wp - I.piv.xyz, I.spin.xyz, ang);
    wn = rotAxis(wn, I.spin.xyz, ang);
  }
  let vel = I.mot.xyz;
  wp += vel * tau;
  if ((flags & 4u) != 0u) {
    // Moving lights are stretched over the slice of time this sample stands for.
    let sp = length(vel);
    if (sp > 0.0) {
      let vd = vel / sp;
      let ctr = vec3f(I.m0.w, I.m1.w, I.m2.w) + vel * tau;
      let halfLen = 0.5 * sp * S.camR.w;
      wp += vd * halfLen * sign(dot(wp - ctr, vd));
      emis = I.piv.w / (I.piv.w + sp * S.camR.w);
    }
  }
  var o: VOut;
  o.clip = S.viewProj * vec4f(wp, 1.0);
  o.wpos = wp;
  o.nrm = wn;
  o.lpos = pos * size;
  o.iid = ii;
  o.emis = emis;
  return o;
}

@vertex fn vs(@location(0) pos: vec3f, @location(1) nrm: vec3f, @builtin(instance_index) ii: u32) -> VOut {
  return transformVertex(pos, nrm, ii, S.camPos.w);
}

// ---- Materials ---------------------------------------------------------------
struct Surf {
  alb: vec3f, rough: f32,
  emis: vec3f, metal: f32,
  n: vec3f, f0: f32,
  trans: f32, occ: f32, cover: f32, sheen: f32,
}
fn surf(alb: vec3f, rough: f32, n: vec3f) -> Surf {
  return Surf(alb, rough, vec3f(0.0), 0.0, n, 0.04, 0.0, 1.0, 1.0, 0.0);
}
fn srgb2lin(c: vec3f) -> vec3f { return pow(c, vec3f(2.2)); }

// In-plane coordinates (metres) of a box face chosen by the local normal.
fn faceUV(lp: vec3f, nl: vec3f) -> vec2f {
  let a = abs(nl);
  if (a.x > a.y && a.x > a.z) { return vec2f(-lp.z * sign(nl.x), lp.y); }
  if (a.y > a.z) { return vec2f(lp.x, lp.z * sign(nl.y)); }
  return vec2f(lp.x * sign(nl.z), lp.y);
}
fn localNormal(I: Inst, n: vec3f) -> vec3f {
  let sz = vec3f(length(vec3f(I.m0.x, I.m1.x, I.m2.x)), length(vec3f(I.m0.y, I.m1.y, I.m2.y)), length(vec3f(I.m0.z, I.m1.z, I.m2.z)));
  let t = vec3f(I.m0.x * n.x + I.m1.x * n.y + I.m2.x * n.z, I.m0.y * n.x + I.m1.y * n.y + I.m2.y * n.z, I.m0.z * n.x + I.m1.z * n.y + I.m2.z * n.z);
  return normalize(t / sz);
}
// Box-filtered pulse: 1 inside |x| < w/2, softened by footprint fp.
fn band(x: f32, w: f32, fp: f32) -> f32 {
  let e = max(fp, 1e-6);
  return clamp((w * 0.5 - abs(x)) / e + 0.5, 0.0, 1.0);
}

fn cell3(p: vec3f) -> vec4f {
  let i = floor(p); let f = fract(p);
  var d1 = 8.0; var d2 = 8.0; var id = 0.0;
  for (var z = -1; z <= 1; z++) { for (var y = -1; y <= 1; y++) { for (var x = -1; x <= 1; x++) {
    let o = vec3f(f32(x), f32(y), f32(z));
    let r = o + hash33(i + o) - f;
    let d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = hash13(i + o + vec3f(7.7)); } else if (d < d2) { d2 = d; }
  }}}
  return vec4f(sqrt(d1), id, sqrt(d2), 0.0);
}
fn cell2(p: vec2f) -> vec3f {
  let i = floor(p); let f = fract(p);
  var d1 = 8.0; var d2 = 8.0; var id = 0.0;
  for (var y = -1; y <= 1; y++) { for (var x = -1; x <= 1; x++) {
    let o = vec2f(f32(x), f32(y));
    let h = vec2f(hash12(i + o), hash12(i + o + vec2f(3.7, 1.9)));
    let r = o + h - f;
    let d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = hash12(i + o + vec2f(9.1)); } else if (d < d2) { d2 = d; }
  }}
  return vec3f(sqrt(d1), id, sqrt(d2));
}

const CHECKER = array<vec3f, 24>(
  vec3f(115.0, 82.0, 68.0), vec3f(194.0, 150.0, 130.0), vec3f(98.0, 122.0, 157.0), vec3f(87.0, 108.0, 67.0),
  vec3f(133.0, 128.0, 177.0), vec3f(103.0, 189.0, 170.0), vec3f(214.0, 126.0, 44.0), vec3f(80.0, 91.0, 166.0),
  vec3f(193.0, 90.0, 99.0), vec3f(94.0, 60.0, 108.0), vec3f(157.0, 188.0, 64.0), vec3f(224.0, 163.0, 46.0),
  vec3f(56.0, 61.0, 150.0), vec3f(70.0, 148.0, 73.0), vec3f(175.0, 54.0, 60.0), vec3f(231.0, 199.0, 31.0),
  vec3f(187.0, 86.0, 149.0), vec3f(8.0, 133.0, 161.0), vec3f(243.0, 243.0, 242.0), vec3f(200.0, 200.0, 200.0),
  vec3f(160.0, 160.0, 160.0), vec3f(122.0, 122.0, 121.0), vec3f(85.0, 85.0, 85.0), vec3f(52.0, 52.0, 52.0));

// Pseudo-text: glyphs built from strokes so it reads as type at any magnification.
fn glyphInk(uv: vec2f, h: f32, fp: f32, isSign: bool) -> f32 {
  let cw = h * 0.62;
  let lh = select(h * 1.5, h * 1.25, isSign);
  let line = floor(-uv.y / lh);
  let col = floor(uv.x / cw);
  let gx = fract(uv.x / cw);
  let gy = fract(-uv.y / lh) * lh / h;
  let lineLen = 0.55 + 0.45 * hash12(vec2f(line, 3.1));
  let wordGap = hash12(vec2f(floor(col / 1.0), line + 0.5));
  let px = gx * 6.0 - 0.5;   // 0..5 across, 5 columns
  let py = gy * 8.0 - 0.6;   // 0..7 down
  let g = u32(hash12(vec2f(col, line) * 1.37 + 0.11) * 255.0) | 1u;
  let sw = 0.55;
  var ink = 0.0;
  let inX = px > -0.3 && px < 4.3; let inY = py > -0.3 && py < 6.3;
  if (inX && inY) {
    let low = (g & 128u) != 0u;
    let top = select(0.0, 2.0, low);
    if ((g & 1u) != 0u && abs(px - 0.0) < sw && py > top) { ink = 1.0; }
    if ((g & 2u) != 0u && abs(px - 4.0) < sw && py > top) { ink = 1.0; }
    if ((g & 4u) != 0u && abs(py - top) < sw) { ink = 1.0; }
    if ((g & 8u) != 0u && abs(py - 4.0) < sw) { ink = 1.0; }
    if ((g & 16u) != 0u && abs(py - 6.0) < sw) { ink = 1.0; }
    if ((g & 32u) != 0u && abs(px - 2.0) < sw && py > top) { ink = 1.0; }
    if ((g & 64u) != 0u && abs((px - 0.2) - (6.0 - py) * 0.62) < sw * 1.1 && py > top) { ink = 1.0; }
  }
  if (wordGap < 0.16 || col < 0.0 || col > 60.0 * lineLen) { ink = 0.0; }
  // Strokes far below a pixel average out to a grey of the same mean ink.
  let detail = 1.0 - smoothstep(0.5, 1.5, fp / (h / 8.0));
  return mix(0.22 * step(0.16, wordGap), ink, detail);
}

fn material(mat: u32, I: Inst, wp: vec3f, lp: vec3f, n: vec3f, v: vec3f, fpL: f32, fpW: f32, fc: vec2f, emisScale: f32) -> Surf {
  let col = I.col.rgb;
  let nl = localNormal(I, n);
  var s = surf(col, 0.6, n);
  switch mat {
    case M_DIFFUSE: {
      s.rough = select(0.6, I.p1.x, I.p1.x > 0.0);
      s.f0 = 0.04;
    }
    case M_METAL: {
      s.metal = 1.0;
      s.rough = select(0.25, I.p1.x, I.p1.x > 0.0);
    }
    case M_PAINT: {
      let fl = fbmF3(wp * 800.0, fpW * 800.0, 2);
      s.alb = col * (0.92 + 0.16 * fl);
      s.rough = select(0.1, I.p1.x, I.p1.x > 0.0) * 0.5;
      s.f0 = 0.05;
    }
    case M_GLASS: { s.alb = col; s.rough = 0.03; s.f0 = 0.08; }
    case M_EMIT: {
      var e = col * I.p1.x * emisScale;
      if (I.p1.y > 1.5) { e *= 0.55 + 0.45 * pow(max(dot(n, v), 0.0), 1.5); }
      if (I.p1.y > 0.5 && I.p1.y < 1.5) {
        let uv = faceUV(lp, nl);
        let shelves = 0.55 + 0.45 * fbmF(uv * vec2f(2.5, 4.0), fpL * 4.0, 3);
        let mull = band(fract(uv.x / 1.6 + 0.5) * 1.6 - 0.8, 1.52, fpL);
        e *= shelves * mix(0.08, 1.0, mull);
      }
      s.emis = e; s.alb = vec3f(0.0); s.rough = 0.4;
    }
    case M_BRICK: {
      let uv = faceUV(lp, nl);
      let bw = I.p1.x; let bh = I.p1.y; let mo = I.p1.z;
      let row = floor(uv.y / bh);
      let x = uv.x / bw + 0.5 * (row - 2.0 * floor(row * 0.5));
      let cell = vec2f(floor(x), row);
      let fx = fract(x) * bw; let fy = fract(uv.y / bh) * bh;
      let edge = min(min(fx, bw - fx), min(fy, bh - fy));
      let m = smoothstep(mo * 0.5 - fpL, mo * 0.5 + fpL, edge);
      let var1 = 0.75 + 0.5 * hash12(cell);
      let grain = 0.8 + 0.4 * fbmF(uv * 60.0, fpL * 60.0, 3);
      let bc = select(col * var1 * grain, col * (0.9 + 0.1 * var1) * grain, I.p1.w > 0.5);
      s.alb = mix(vec3f(0.42, 0.4, 0.37) * select(1.0, 1.4, I.p1.w > 0.5), bc, m);
      s.rough = 0.88; s.occ = mix(0.65, 1.0, m);
    }
    case M_GRASS: {
      let p = wp.xz;
      let patchN = fbmF(p * 0.6, fpW * 0.6, 3);
      let mid = fbmF(p * 9.0, fpW * 9.0, 3);
      let fine = fbmF(vec2f(p.x * 140.0, p.y * 140.0), fpW * 140.0, 3);
      var c = col * (0.55 + 0.9 * patchN) * (0.7 + 0.6 * mid) * (0.55 + 0.9 * fine);
      c = mix(c, c * vec3f(1.7, 1.35, 0.55), smoothstep(0.5, 0.75, patchN) * 0.6);
      s.alb = c; s.rough = 0.92; s.trans = 0.25; s.occ = 0.75 + 0.25 * fine;
    }
    case M_GRAVEL: {
      let c2 = cell2(wp.xz / 0.018);
      let w = fpW / 0.018;
      let stone = smoothstep(0.05, 0.25 + w, c2.z - c2.x);
      let tint = mix(vec3f(0.85, 0.8, 0.75), vec3f(1.15, 1.05, 0.9), c2.y);
      let c = col * mix(vec3f(1.0), tint * (0.7 + 0.6 * hash12(vec2f(c2.y * 91.0, 1.0))) * mix(0.45, 1.0, stone), 1.0 - smoothstep(0.6, 1.4, w));
      s.alb = c; s.rough = 0.85; s.occ = mix(1.0, mix(0.7, 1.0, stone), 1.0 - smoothstep(0.6, 1.4, w));
    }
    case M_CONCRETE: {
      let uv = wp.xz;
      let t = fbmF(uv * 30.0, fpW * 30.0, 4);
      var c = col * (0.75 + 0.5 * t);
      if (I.p1.x > 0.0) {
        let j = fract(uv / I.p1.x) * I.p1.x;
        let e = min(min(j.x, I.p1.x - j.x), min(j.y, I.p1.x - j.y));
        c *= mix(0.55, 1.0, smoothstep(0.004 - fpW, 0.004 + fpW, e));
      }
      s.alb = c; s.rough = 0.55;
    }
    case M_FOLIAGE: {
      let ls = I.p1.x;
      let c = cell3(wp / ls);
      let w = fpW / ls;
      let present = step(I.p1.y, c.y);
      let blob = smoothstep(0.66 + w, 0.58 - w, c.x);
      let fine = 1.0 - smoothstep(0.4, 1.2, w);
      let avgCover = (1.0 - I.p1.y) * 0.85;
      s.cover = mix(avgCover, present * blob, fine);
      if (I.p1.y <= 0.0) { s.cover = 1.0; }
      else { s.cover *= smoothstep(0.05, 0.45, abs(dot(n, v))); } // feathered canopy silhouette
      let tilt = (hash33(vec3f(c.y * 113.0, c.y * 7.0, 3.0)) - 0.5) * 1.1 * fine;
      s.n = normalize(n + tilt);
      let leafVar = 0.55 + 0.9 * hash12(vec2f(c.y * 51.0, 2.0));
      s.alb = col * leafVar * mix(vec3f(1.0), vec3f(1.5, 1.25, 0.6), step(0.85, c.y) * fine * 0.7);
      s.rough = 0.58; s.f0 = 0.03; s.trans = 0.5; s.occ = mix(0.75, mix(0.45, 1.0, blob), fine);
    }
    case M_WOOD: {
      let mode = I.p1.y;
      if (mode > 1.5) {
        let ang = atan2(lp.z, lp.x);
        let g = fbmF(vec2f(ang * 6.0, lp.y * 2.5), fpL * 6.0, 4);
        let gr = fbmF(vec2f(ang * 30.0, lp.y * 0.8), fpL * 30.0, 3);
        s.alb = col * (0.55 + 0.7 * g) * (0.7 + 0.5 * gr); s.rough = 0.95;
      } else {
        let along = select(lp.x, lp.z, mode > 0.5);
        let across = select(lp.z + lp.y, lp.x + lp.y, mode > 0.5);
        let pw = max(I.p1.x, 0.01);
        let plank = floor(across / pw);
        let seg = floor((along + hash12(vec2f(plank, 1.0)) * 3.0) / 1.9);
        let id = hash12(vec2f(plank, seg));
        let fa = fract(across / pw) * pw;
        let seam = smoothstep(0.0, 0.0025 + fpL, min(fa, pw - fa));
        let endA = fract((along + hash12(vec2f(plank, 1.0)) * 3.0) / 1.9) * 1.9;
        let seamE = smoothstep(0.0, 0.0025 + fpL, min(endA, 1.9 - endA));
        let warp = fbmF(vec2f(along * 1.5, across * 9.0 + id * 10.0), fpL * 9.0, 3);
        let rings = 0.5 + 0.5 * sin((across * 140.0 + warp * 9.0 + id * 20.0) * 6.2831);
        let ringF = mix(0.5, rings, 1.0 - smoothstep(0.3, 1.0, fpL * 140.0));
        let fibre = fbmF(vec2f(along * 6.0, across * 900.0), fpL * 900.0, 2);
        s.alb = col * (0.7 + 0.6 * id) * (0.78 + 0.3 * ringF) * (0.85 + 0.3 * fibre) * mix(0.25, 1.0, seam * seamE);
        s.rough = 0.62 - 0.2 * ringF; s.occ = mix(0.4, 1.0, seam * seamE);
      }
    }
    case M_FABRIC: {
      let uv = faceUV(lp, nl) + vec2f(0.5, 0.25);
      let P = max(I.p1.x, 1e-5);
      let a = uv / P;
      let w = fpL / P;
      let warpTop = (i32(floor(a.x)) + i32(floor(a.y))) % 2 == 0;
      let fx = fract(a.x); let fy = fract(a.y);
      let shadeWarp = 0.55 + 0.45 * sin(PI * fx);
      let shadeWeft = 0.55 + 0.45 * sin(PI * fy);
      var c1 = col; var c2 = I.p2.rgb;
      if (I.p1.y > 0.5 && I.p1.y < 1.5) {
        // Gingham: woven bands of the two colours.
        let C = I.p1.z;
        let wb = fpL / C;
        let bx = mix(step(0.5, fract(uv.x / (2.0 * C))), 0.5, smoothstep(0.3, 0.8, wb));
        let by = mix(step(0.5, fract(uv.y / (2.0 * C))), 0.5, smoothstep(0.3, 0.8, wb));
        c1 = mix(I.p2.rgb, col, bx); c2 = mix(I.p2.rgb, col, by);
      }
      var v1 = select(c2 * shadeWeft, c1 * shadeWarp, warpTop);
      if (I.p1.y > 1.5) {
        let tw = fract((uv.x + uv.y) / P);
        v1 = mix(col, I.p2.rgb, step(0.5, fract(uv.y / (P * 6.0)))) * (0.5 + 0.5 * sin(PI * tw));
      }
      let mean = (c1 + c2) * 0.5 * 0.83;
      s.alb = mix(v1, mean, smoothstep(0.45, 1.2, w));
      s.rough = 0.85; s.sheen = 0.25;
    }
    case M_FUR: {
      let fib = fbmF3(wp * vec3f(700.0, 160.0, 700.0), fpW * 700.0, 3);
      let clump = fbmF3(wp * 45.0, fpW * 45.0, 3);
      // Individual hairs: thin streaks that fade once they shrink below a pixel.
      let hn = vnoise3(wp * vec3f(2600.0, 380.0, 2600.0));
      let hair = mix(0.5, smoothstep(0.38, 0.62, hn), 1.0 - smoothstep(0.3, 0.9, fpW * 2600.0));
      s.alb = col * (0.55 + 0.7 * clump) * (0.6 + 0.8 * fib) * (0.6 + 0.8 * hair);
      s.rough = 0.92; s.sheen = 0.5; s.occ = 0.75 + 0.25 * clump;
      s.n = normalize(n + (vec3f(fib, clump, fib * clump) - 0.4) * 0.35);
    }
    case M_SIEMENS: {
      let uv = faceUV(lp, nl);
      let r = length(uv);
      let R0 = 0.118;
      let N = I.p1.x;
      let th = atan2(uv.y, uv.x);
      let sp = sin(th * N);
      let w = max(fpL * N / max(r, 1e-4), 1e-4);
      var val = smoothstep(-w, w, sp);
      val = mix(val, 0.5, smoothstep(1.0, 2.5, w));
      val = select(val, 0.5, r < 0.004);
      let ring = band(r - R0 - 0.004, 0.003, fpL);
      var c = mix(0.035, 0.82, val);
      c = select(0.82, c, r < R0);
      c = mix(c, 0.035, ring);
      s.alb = vec3f(c); s.rough = 0.8;
    }
    case M_ZONE: {
      let uv = faceUV(lp, nl);
      let r = length(uv);
      let k = I.p1.x;
      let w = fpL * 2.0 * k * r;
      let amp = 1.0 - smoothstep(1.2, 3.0, w);
      var c = 0.43 + 0.39 * cos(k * r * r) * amp;
      c = select(0.82, c, r < 0.078);
      s.alb = vec3f(c); s.rough = 0.8;
    }
    case M_CHECKER: {
      let uv = faceUV(lp, nl);
      let g = (uv + vec2f(0.12, 0.08)) / 0.04;
      let ci = vec2i(floor(g));
      let f = fract(g) * 0.04;
      let inPatch = band(f.x - 0.02, 0.034, fpL) * band(f.y - 0.02, 0.034, fpL);
      var c = vec3f(0.03);
      if (ci.x >= 0 && ci.x < 6 && ci.y >= 0 && ci.y < 4) {
        let idx = (3 - ci.y) * 6 + ci.x;
        c = mix(vec3f(0.03), srgb2lin(CHECKER[idx] / 255.0), inPatch);
      }
      s.alb = c; s.rough = 0.85;
    }
    case M_TEXT: {
      let uv = faceUV(lp, nl);
      let sz = vec3f(length(vec3f(I.m0.x, I.m1.x, I.m2.x)), length(vec3f(I.m0.y, I.m1.y, I.m2.y)), length(vec3f(I.m0.z, I.m1.z, I.m2.z)));
      let isSign = I.p1.w > 0.5;
      let h = I.p1.x;
      let halfSz = vec2f(max(sz.x, sz.z), sz.y) * 0.5;
      let origin = select(vec2f(-halfSz.x + h * 0.6, halfSz.y - h * 0.8), vec2f(-halfSz.x + h * 0.5, h * 0.5), isSign);
      var ink = glyphInk(uv - origin, h, fpL, isSign);
      ink *= band(uv.x, halfSz.x * 2.0 - h, fpL) * band(uv.y, halfSz.y * 2.0 - h * 0.6, fpL);
      if (abs(nl.y) > 0.6) { ink = 0.0; }
      s.alb = mix(col, I.p2.rgb, ink);
      s.rough = 0.8;
      s.emis = I.p2.rgb * I.p1.z * ink;
    }
    case M_RULER: {
      let x = lp.x; let z = lp.z;
      let halfW = 0.0175;
      let mm = z * 1000.0;
      let d = abs(fract(mm + 0.5) - 0.5) * 0.001;
      let isCm = abs(fract(mm / 10.0 + 0.5) - 0.5) < 0.05;
      let isHalf = abs(fract(mm / 5.0 + 0.5) - 0.5) < 0.1;
      let len = select(select(0.0035, 0.006, isHalf), 0.009, isCm);
      let tick = band(d, 0.00025, fpL) * step(halfW - len, x);
      let digits = glyphInk(vec2f(z - floor(z * 100.0) / 100.0 - 0.0005, x - 0.002), 0.0035, fpL, true) * step(abs(x - 0.0), 0.004) * step(0.0015, fract(z * 100.0) * 0.01);
      let ink = max(tick, digits);
      s.alb = mix(col, vec3f(0.02), ink); s.rough = 0.45;
    }
    case M_TILES: {
      let uv = faceUV(lp, nl);
      let T = I.p1.x; let g = I.p1.y;
      let f = fract(uv / T) * T;
      let e = min(min(f.x, T - f.x), min(f.y, T - f.y));
      let m = smoothstep(g * 0.5 - fpL, g * 0.5 + fpL, e);
      let id = hash12(floor(uv / T));
      s.alb = mix(vec3f(0.3, 0.29, 0.27), col * (0.94 + 0.08 * id), m);
      s.rough = mix(0.9, 0.18, m); s.f0 = 0.04; s.occ = mix(0.6, 1.0, m);
    }
    case M_FACADE: {
      let uv = faceUV(lp, nl) + vec2f(0.0, lp.y * 0.0);
      let wy = lp.y + 0.5 * length(vec3f(I.m0.y, I.m1.y, I.m2.y));
      let fh = I.p1.x;
      let floorN = floor(wy / fh);
      let fy = fract(wy / fh) * fh;
      let bay = floor(uv.x / 3.0);
      let fx = fract(uv.x / 3.0) * 3.0;
      let isWin = band(fx - 1.5, 1.35, fpL) * band(fy - 1.75, 1.6, fpL) * step(1.0, floorN) * step(abs(nl.y), 0.5);
      let frame = band(fx - 1.5, 1.5, fpL) * band(fy - 1.75, 1.75, fpL) * step(1.0, floorN) * step(abs(nl.y), 0.5) - isWin;
      let wallT = fbmF(uv * vec2f(3.0, 3.0) + wy, fpL * 3.0, 4);
      var wall = col * (0.75 + 0.5 * wallT);
      if (I.p1.w < 1.5) {
        let row = floor(wy / 0.075);
        let bx = uv.x / 0.23 + 0.5 * (row - 2.0 * floor(row * 0.5));
        let e = min(min(fract(bx), 1.0 - fract(bx)) * 0.23, min(fract(wy / 0.075), 1.0 - fract(wy / 0.075)) * 0.075);
        let mortar = mix(0.6, 1.0, smoothstep(0.004 - fpL, 0.004 + fpL, e));
        wall *= mix(1.0, mortar * (0.85 + 0.3 * hash12(vec2f(floor(bx), row))), 1.0 - smoothstep(0.3, 1.0, fpL / 0.03));
      }
      let id = hash12(vec2f(bay + I.m2.w * 0.37, floorN + I.m0.w * 0.11));
      let lit = step(id, I.p1.y) * I.p1.z;
      let tint = select(vec3f(1.0, 0.68, 0.38), vec3f(0.7, 0.82, 1.0), hash12(vec2f(bay, floorN + 9.0)) > 0.72);
      let curtain = 0.35 + 0.65 * fbmF(vec2f(fx * 3.0, fy * 0.7 + id * 9.0), fpL * 3.0, 3);
      s.alb = mix(mix(wall, vec3f(0.06), frame), vec3f(0.015), isWin);
      s.rough = mix(0.85, 0.06, isWin); s.f0 = mix(0.04, 0.07, isWin);
      s.emis = tint * (1.2 + 5.0 * hash12(vec2f(id * 31.0, 4.0))) * curtain * lit * isWin;
    }
    case M_ASPHALT: {
      let p = wp.xz;
      let agg = fbmF(p * 220.0, fpW * 220.0, 3);
      let wet = I.p1.x;
      let puddle = smoothstep(0.5, 0.58, fbmF(p * 0.35 + vec2f(3.0, 1.0), fpW * 0.35, 4)) * wet;
      var base = col * (0.6 + 0.8 * agg);
      var mark = 0.0;
      if (I.p1.y > 0.5) {
        let dash = step(fract(p.y / 9.0), 0.45);
        mark = max(band(p.x, 0.14, fpW) * dash, band(abs(p.x) - 4.1, 0.14, fpW));
      }
      base = mix(base, vec3f(0.55, 0.54, 0.5), mark);
      s.alb = base * (1.0 - 0.35 * wet);
      s.rough = mix(mix(0.6, 0.28, wet), 0.04, puddle);
      s.f0 = 0.04;
    }
    case M_WATER: {
      let t = S.camPos.w;
      let p = wp.xz;
      var g = vec2f(0.0);
      var amp = 0.06; var freq = 0.6; var varLost = 0.0;
      for (var i = 0; i < 6; i++) {
        let q = p * freq + vec2f(t * 0.35 * freq + f32(i) * 3.1, t * 0.21 * freq);
        let e = 0.05;
        let h0 = vnoise2(q); let hx = vnoise2(q + vec2f(e, 0.0)); let hy = vnoise2(q + vec2f(0.0, e));
        let k = 1.0 - smoothstep(0.25, 0.8, fpW * freq);
        g += vec2f(hx - h0, hy - h0) / e * amp * freq * k;
        varLost += amp * freq * (1.0 - k);
        amp *= 0.55; freq *= 2.1;
      }
      s.n = normalize(vec3f(-g.x, 1.0, -g.y));
      s.alb = col; s.rough = clamp(0.025 + varLost * 0.9, 0.0, 0.35); s.f0 = 0.02;
    }
    case M_TERRAIN: {
      let h = wp.y;
      let slope = 1.0 - n.y;
      let p = wp.xz;
      let nz = fbmF(p / 120.0, fpW / 120.0, 4);
      let det = fbmF(p / 7.0, fpW / 7.0, 4);
      let snow = smoothstep(820.0, 1080.0, h + nz * 300.0) * (1.0 - smoothstep(0.3, 0.55, slope + det * 0.2));
      let rock = smoothstep(0.28, 0.5, slope + (nz - 0.5) * 0.3);
      let forest = (1.0 - smoothstep(320.0, 700.0, h + nz * 150.0)) * (1.0 - rock);
      let shore = 1.0 - smoothstep(1.5, 5.0, h);
      let strata = 0.75 + 0.5 * fbmF(vec2f(h / 18.0, p.x / 400.0), fpW / 18.0, 3);
      var c = vec3f(0.11, 0.13, 0.055) * (0.7 + 0.6 * det);
      c = mix(c, vec3f(0.028, 0.045, 0.022) * (0.5 + 1.0 * det), forest);
      c = mix(c, vec3f(0.16, 0.14, 0.12) * strata, rock);
      c = mix(c, vec3f(0.24, 0.21, 0.17), shore);
      c = mix(c, vec3f(0.82, 0.85, 0.9), snow);
      s.alb = c; s.rough = mix(0.92, 0.55, snow); s.occ = 0.8 + 0.2 * det;
    }
    default: {}
  }
  return s;
}

// ---- Lighting --------------------------------------------------------------------
fn ggx(n: vec3f, v: vec3f, l: vec3f, a: f32, f0: vec3f) -> vec3f {
  let h = normalize(v + l);
  let nh = max(dot(n, h), 0.0); let nl = max(dot(n, l), 1e-4); let nv = max(dot(n, v), 1e-4);
  let vh = max(dot(v, h), 0.0);
  let a2 = a * a;
  let d = nh * nh * (a2 - 1.0) + 1.0;
  let D = a2 / (PI * d * d);
  let k = a * 0.5;
  let G = nl / (nl * (1.0 - k) + k) * nv / (nv * (1.0 - k) + k);
  let F = f0 + (1.0 - f0) * pow(1.0 - vh, 5.0);
  return D * G * F / (4.0 * nl * nv);
}

fn skyColor(d: vec3f, withSun: bool) -> vec3f {
  let up = max(d.y, 0.0);
  var c = mix(S.skyHor.rgb, S.skyZen.rgb, pow(up, 0.45));
  if (d.y < 0.0) { c = mix(S.skyHor.rgb, S.skyGnd.rgb * 1.5, min(-d.y * 5.0, 1.0)); }
  let cs = dot(d, S.sunDir.xyz);
  c += S.sunCol.rgb * S.sunDir.w * (0.3 * pow(max(cs, 0.0), 10.0) + 1.5 * pow(max(cs, 0.0), 300.0));
  if (S.skyHor.w > 0.0 && d.y > 0.0) {
    let cp = d.xz / (d.y + 0.06) * 1.1 + vec2f(4.0, 1.0);
    let base = fbmF(cp, 0.0, 6);
    let cov = smoothstep(1.0 - S.skyHor.w * 0.75, 1.25 - S.skyHor.w * 0.6, base + 0.12);
    let thick = fbmF(cp * 2.3 + 7.0, 0.0, 4);
    let lit = S.sunCol.rgb * S.sunDir.w * (0.45 + 0.35 * thick) + S.skyZen.rgb * 0.6;
    let cshade = mix(lit, lit * 0.45, smoothstep(0.4, 0.9, base));
    let silver = S.sunCol.rgb * S.sunDir.w * 2.0 * pow(max(cs, 0.0), 24.0);
    c = mix(c, cshade + silver, cov * smoothstep(0.0, 0.08, d.y));
  }
  if (S.skyGnd.w > 0.0 && d.y > 0.02) {
    let sp = d * 700.0;
    let cell = floor(sp);
    let h = hash13(cell);
    if (h > 0.996) {
      let o = fract(sp) - 0.5 - (hash33(cell) - 0.5) * 0.6;
      let b = exp(-dot(o, o) * 40.0) * (0.3 + 3.0 * pow(hash13(cell + 1.7), 6.0));
      c += vec3f(0.9, 0.95, 1.0) * b * S.skyGnd.w;
    }
  }
  if (withSun && S.sunCol.w > 0.0) {
    let r = S.misc.z;
    let ang = acos(clamp(cs, -1.0, 1.0));
    if (ang < r) {
      let mu = sqrt(1.0 - (ang / r) * (ang / r));
      c = S.sunCol.rgb * S.sunCol.w * (0.45 + 0.55 * mu);
    }
  }
  return c;
}

fn hemi(n: vec3f) -> vec3f {
  return mix(S.skyGnd.rgb, mix(S.skyHor.rgb, S.skyZen.rgb, 0.55), 0.5 + 0.5 * n.y);
}

fn envColor(r: vec3f, rough: f32) -> vec3f {
  var sharp: vec3f;
  if (S.misc2.x > 0.5) {
    // Studio: grey room with a bright window behind the key light.
    sharp = hemi(r) * 0.6 + S.sunCol.rgb * S.sunDir.w * 3.5 * smoothstep(0.93, 0.97, dot(r, S.sunDir.xyz));
  } else {
    sharp = skyColor(r, false);
    if (r.y < 0.0) { sharp = mix(sharp, S.skyGnd.rgb, min(-r.y * 6.0, 1.0)); }
  }
  return mix(sharp, hemi(r), smoothstep(0.15, 0.65, rough));
}

fn shadowAt(wp: vec3f, n: vec3f) -> f32 {
  if (S.misc.w < 0.5) { return 1.0; }
  let p = S.shadowVP * vec4f(wp + n * S.misc2.w * 1.5, 1.0);
  let uv = vec2f(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0 || p.z > 1.0) { return 1.0; }
  var s = 0.0;
  let texel = 1.0 / 2048.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      s += textureSampleCompareLevel(shadowMap, shadowSamp, uv + vec2f(f32(x), f32(y)) * texel * 1.2, p.z - 0.0004);
    }
  }
  return s / 9.0;
}

fn shade(s: Surf, wp: vec3f, v: vec3f, ngeo: vec3f) -> vec3f {
  var L = s.emis;
  let n = s.n;
  let nv = clamp(dot(n, v), 1e-3, 1.0);
  let diffC = s.alb * (1.0 - s.metal);
  let f0 = mix(vec3f(s.f0), s.alb, s.metal);
  let a = max(s.rough * s.rough, 0.0012);
  if (S.sunDir.w > 0.0) {
    let l = S.sunDir.xyz;
    let nl = dot(n, l);
    let sh = shadowAt(wp, ngeo);
    let E = S.sunCol.rgb * S.sunDir.w * sh;
    if (nl > 0.0) { L += E * nl * (diffC + ggx(n, v, l, a, f0) * PI); }
    L += E * max(-dot(ngeo, l), 0.0) * s.trans * diffC;
  }
  L += diffC * hemi(n) * S.skyZen.w * s.occ;
  L += s.sheen * pow(1.0 - nv, 3.0) * hemi(n) * S.skyZen.w * s.alb * 2.0;
  let r = reflect(-v, n);
  let F = f0 + (max(vec3f(1.0 - s.rough), f0) - f0) * pow(1.0 - nv, 5.0);
  L += F * envColor(r, s.rough) * s.occ * select(1.0, 0.0, s.metal < 0.5 && s.rough > 0.8);
  let cnt = u32(S.misc.x);
  for (var i = 0u; i < cnt; i++) {
    let lt = lights[i];
    let d = lt.pos.xyz - wp;
    let d2 = dot(d, d);
    let l = d * inverseSqrt(d2);
    let nl = dot(n, l);
    let E = lt.col.rgb * lt.col.w / (d2 + lt.pos.w * lt.pos.w);
    if (nl > 0.0) { L += E * nl * (diffC + ggx(n, v, l, max(a, 0.004), f0) * PI); }
    L += E * max(-nl, 0.0) * s.trans * diffC;
  }
  return L;
}

fn applyFog(L: vec3f, dist: f32, dir: vec3f) -> vec3f {
  if (S.fog.w <= 0.0) { return L; }
  let T = exp(-dist * S.fog.w);
  let glow = S.sunCol.rgb * S.sunDir.w * 0.25 * pow(max(dot(dir, S.sunDir.xyz), 0.0), 8.0);
  return L * T + (S.fog.rgb + glow) * (1.0 - T);
}

struct FOut { @location(0) color: vec4f, @location(1) depth: vec4f }

@fragment fn fs(in: VOut) -> FOut {
  let fc = in.clip;
  // Pixel footprints first, in uniform control flow.
  let fpL = max(length(dpdx(in.lpos)), length(dpdy(in.lpos))) * S.camF.w + 1e-7;
  let fpW = max(length(dpdx(in.wpos)), length(dpdy(in.wpos))) * S.camF.w + 1e-7;
  let I = insts[in.iid];
  let flags = u32(I.spin.w);
  var n = normalize(in.nrm);
  let toCam = S.camPos.xyz - in.wpos;
  let dist = length(toCam);
  let v = toCam / dist;
  if ((flags & 1u) != 0u && dot(n, v) < 0.0) { n = -n; }
  let s = material(u32(I.col.w), I, in.wpos, in.lpos, n, v, fpL, fpW, fc.xy, in.emis);
  if ((flags & 8u) != 0u) {
    let rnd = hash12(fc.xy * 1.37 + vec2f(S.camU.w * 17.31, S.camU.w * 5.17));
    if (s.cover < rnd) { discard; }
  }
  var L = shade(s, in.wpos, v, n);
  L = applyFog(L, dist, -v);
  var o: FOut;
  o.color = vec4f(clamp(L, vec3f(0.0), vec3f(60000.0)), 1.0);
  o.depth = vec4f(dot(in.wpos - S.camPos.xyz, S.camF.xyz), 0.0, 0.0, 0.0);
  return o;
}

// ---- Sky ------------------------------------------------------------------------------
struct SkyOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f }
@vertex fn vsSky(@builtin(vertex_index) vi: u32) -> SkyOut {
  let p = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
  var o: SkyOut;
  o.pos = vec4f(p * 2.0 - 1.0, 0.0, 1.0);
  o.uv = vec2f(p.x, 1.0 - p.y);
  return o;
}
@fragment fn fsSky(in: SkyOut) -> FOut {
  let tx = mix(S.win.x, S.win.z, in.uv.x);
  let ty = mix(S.win.w, S.win.y, in.uv.y);
  let d = normalize(S.camF.xyz + S.camR.xyz * tx + S.camU.xyz * ty);
  var o: FOut;
  o.color = vec4f(clamp(skyColor(d, true), vec3f(0.0), vec3f(60000.0)), 1.0);
  o.depth = vec4f(100000.0, 0.0, 0.0, 0.0);
  return o;
}

// ---- Shadow map ---------------------------------------------------------------------------
struct ShOut { @builtin(position) clip: vec4f, @location(0) wpos: vec3f, @location(1) @interpolate(flat) iid: u32 }
@vertex fn vsShadow(@location(0) pos: vec3f, @location(1) nrm: vec3f, @builtin(instance_index) ii: u32) -> ShOut {
  let t = transformVertex(pos, nrm, ii, 0.0);
  var o: ShOut;
  o.clip = S.shadowVP * vec4f(t.wpos, 1.0);
  o.wpos = t.wpos;
  o.iid = ii;
  return o;
}
@fragment fn fsShadow(in: ShOut) {
  let I = insts[in.iid];
  if ((u32(I.spin.w) & 8u) != 0u) {
    let c = cell3(in.wpos / I.p1.x);
    let cover = step(I.p1.y, c.y) * step(c.x, 0.62);
    if (cover < 0.5) { discard; }
  }
}
`;
