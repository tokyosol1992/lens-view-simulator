// WGSL for the optical and sensor stages. Each pass works in physical units:
// positions on the sensor in millimetres, blur sizes from the lens geometry,
// noise from electron counts.

const VIEW = /* wgsl */`
struct View {
  inRect: vec4f,   // undistorted render rect on the sensor (mm): x0, y0, x1, y1
  outRect: vec4f,  // output rect on the sensor (mm)
  sizes: vec4f,    // in w, in h, out w, out h (px)
  cam: vec4f,      // focal (mm), N, entrance pupil (mm), image distance of focus plane (mm)
  geo: vec4f,      // mm per input px, mm per output px, image-circle radius (mm), framing focal (mm)
  blade: vec4f,    // blades, roundness, rotation, cat-eye
  cat: vec4f,      // N / Nmax, field curvature (mm), coma, astigmatism
  ca: vec4f,       // longitudinal CA, lateral CA, distortion k1, k2
  bokeh: vec4f,    // spherical aberration, apodization, onion rings, samples
  soft: vec4f,     // aberration blur centre (mm), corner (mm), diffraction sigma (mm), low-pass filter (px)
  flare: vec4f,    // glow, ghosts, veiling glare, star strength
  vig: vec4f,      // natural fall-off exponent, off-axis glare, star length (px), bloom levels
  expo: vec4f,     // exposure multiplier, raw clip, electrons at clip per output px, read noise per output px
  sensor: vec4f,   // cfa (0 none, 1 bayer, 2 6x6), ISO gain, seed, is loupe
  frame: vec4f,    // frame index, max blur radius (px), dilation tiles, pixel pitch (mm)
  dev: vec4f,      // white balance r, g, b, zebra
  dev2: vec4f,     // contrast, saturation, sharpening, pixel grid
  map: vec4f,      // main view input rect (mm)
  map2: vec4f,     // main view output rect (mm)
  ab: vec4f,       // split position (-1 off), zoom, sensor half width, sensor half height (mm)
}
@group(0) @binding(0) var<uniform> V: View;
const PI = 3.14159265;

fn inPxToMM(p: vec2f) -> vec2f {
  let t = p / V.sizes.xy;
  return vec2f(mix(V.inRect.x, V.inRect.z, t.x), mix(V.inRect.w, V.inRect.y, t.y));
}
fn outPxToMM(p: vec2f) -> vec2f {
  let t = p / V.sizes.zw;
  return vec2f(mix(V.outRect.x, V.outRect.z, t.x), mix(V.outRect.w, V.outRect.y, t.y));
}
fn mmToUV(m: vec2f, r: vec4f) -> vec2f {
  return vec2f((m.x - r.x) / (r.z - r.x), (r.w - m.y) / (r.w - r.y));
}
fn pcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
fn rnd3(a: u32, b: u32, c: u32) -> f32 {
  return f32(pcg(a ^ pcg(b ^ pcg(c))) >> 8u) / 16777216.0;
}

// Signed blur radius (input px) for one colour channel; + behind focus, - in front.
fn cocChan(zM: f32, rn2: f32, k: f32) -> f32 {
  let f = V.cam.x * (1.0 + k * V.ca.x);
  let d = max(zM * 1000.0, f * 1.01);
  let sp = f * d / (d - f);
  let sS = V.cam.w + V.cat.y * rn2;
  return 0.5 * V.cam.z * (sS - sp) / sp / V.geo.x;
}
fn coc3(zM: f32, pos: vec2f) -> vec3f {
  let rn2 = dot(pos, pos) / (V.geo.z * V.geo.z);
  return vec3f(cocChan(zM, rn2, 1.0), cocChan(zM, rn2, 0.0), cocChan(zM, rn2, -1.0));
}

// Aperture shape: <= 1 inside. v is in units of the blur radius, image axes.
fn shapeMetric(v: vec2f, pos: vec2f) -> f32 {
  let r = length(v);
  var m = r;
  let nb = V.blade.x;
  if (nb >= 3.0) {
    let seg = 2.0 * PI / nb;
    let th = atan2(v.y, v.x) - V.blade.z;
    let a = th - seg * floor(th / seg) - seg * 0.5;
    let poly = r * cos(a) / cos(seg * 0.5);
    m = mix(poly, r, V.blade.y);
  }
  let pr = length(pos);
  if (V.blade.w > 0.0 && pr > 1e-4) {
    // Cat-eye: the pupil clipped by a rim offset toward the image edge.
    let s = V.cat.x;
    let rn = pr / V.geo.z;
    let c = (pos / pr) * V.blade.w * rn * s;
    m = max(m, length(v - c) / s);
  }
  return m;
}
// Brightness across a blur disc: spherical aberration, apodization, aspheric rings.
fn profile(m: f32, sgn: f32) -> f32 {
  let sa = V.bokeh.x * sgn;
  var w = 1.0;
  if (sa > 0.0) { w = mix(1.0, 1.1 - 0.85 * m * m, sa); }
  else { w = mix(1.0, 0.35 + 1.05 * pow(m, 5.0), -sa); }
  w *= exp(-V.bokeh.y * 2.8 * m * m);
  w *= 1.0 + V.bokeh.z * 0.45 * sin(m * 34.0) * smoothstep(0.1, 0.45, m);
  return max(w, 0.0);
}
`;

// Max blur per 16x16 tile -------------------------------------------------------------
export const TILE_WGSL = VIEW + /* wgsl */`
@group(0) @binding(1) var depTex: texture_2d<f32>;
@group(0) @binding(2) var tileOut: texture_storage_2d<r32float, write>;
var<workgroup> wmax: atomic<u32>;
@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u, @builtin(workgroup_id) wid: vec3u, @builtin(local_invocation_index) li: u32) {
  let size = vec2u(V.sizes.xy);
  var v = 0.0;
  if (gid.x < size.x && gid.y < size.y) {
    let z = textureLoad(depTex, vec2i(gid.xy), 0).r;
    let c = abs(coc3(z, inPxToMM(vec2f(gid.xy) + 0.5)));
    v = max(c.x, max(c.y, c.z));
  }
  atomicMax(&wmax, bitcast<u32>(v));
  workgroupBarrier();
  if (li == 0u) {
    textureStore(tileOut, vec2i(wid.xy), vec4f(bitcast<f32>(atomicLoad(&wmax)), 0.0, 0.0, 0.0));
  }
}
`;

export const DILATE_WGSL = VIEW + /* wgsl */`
@group(0) @binding(1) var tileIn: texture_2d<f32>;
@group(0) @binding(2) var tileOut: texture_storage_2d<r32float, write>;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let n = vec2i(textureDimensions(tileIn));
  let p = vec2i(gid.xy);
  if (p.x >= n.x || p.y >= n.y) { return; }
  let r = i32(V.frame.z);
  var m = 0.0;
  for (var y = -r; y <= r; y++) {
    for (var x = -r; x <= r; x++) {
      let q = p + vec2i(x, y);
      if (q.x < 0 || q.y < 0 || q.x >= n.x || q.y >= n.y) { continue; }
      let v = textureLoad(tileIn, q, 0).r;
      // A tile only matters if its blur can reach this tile.
      let d = max(0.0, length(vec2f(f32(abs(x)), f32(abs(y)))) - 1.5) * 16.0;
      if (v >= d) { m = max(m, v); }
    }
  }
  textureStore(tileOut, p, vec4f(m, 0.0, 0.0, 0.0));
}
`;

// Depth of field: scatter-as-gather with the real aperture shape -----------------------
export const DOF_WGSL = VIEW + /* wgsl */`
@group(0) @binding(1) var colTex: texture_2d<f32>;
@group(0) @binding(2) var depTex: texture_2d<f32>;
@group(0) @binding(3) var tileTex: texture_2d<f32>;
@group(0) @binding(4) var outTex: texture_storage_2d<rgba16float, write>;
@group(0) @binding(5) var samp: sampler;
@group(0) @binding(6) var mainTex: texture_2d<f32>;

const GA = 2.39996323;

fn gather(p: vec2f, zC: f32, aC: vec3f, r: f32, th: f32, area: f32, lod: f32,
          acc: ptr<function, vec3f>, tot: ptr<function, f32>, size: vec2i, invSize: vec2f) {
  let off = vec2f(cos(th), sin(th)) * r;
  let q = p + off;
  let qi = clamp(vec2i(floor(q)), vec2i(0), size - 1);
  let zq = textureLoad(depTex, qi, 0).r;
  let posQ = inPxToMM(q);
  var cq = coc3(zq, posQ);
  var aq = abs(cq);
  // Background blur cannot spill over something nearer that is sharper.
  if (zq > zC * 1.02) { aq = min(aq, aC * 2.0 + 1.0); }
  let dimg = vec2f(-off.x, off.y);
  let s = textureSampleLevel(colTex, samp, q * invSize, lod).rgb;
  var w: vec3f;
  if (V.ca.x == 0.0) {
    let rr = max(aq.y, 0.5);
    let m = shapeMetric(dimg / rr, posQ);
    w = vec3f(clamp((1.0 - m) * rr + 0.5, 0.0, 1.0) * profile(m, sign(cq.y)));
  } else {
    for (var c = 0; c < 3; c++) {
      let rr = max(aq[c], 0.5);
      let m = shapeMetric(dimg / rr, posQ);
      w[c] = clamp((1.0 - m) * rr + 0.5, 0.0, 1.0) * profile(m, sign(cq[c]));
    }
  }
  let avg = *acc / *tot;
  *acc += area * (avg + w * (s - avg));
  *tot += area;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let size = vec2i(V.sizes.xy);
  let ip = vec2i(gid.xy);
  if (ip.x >= size.x || ip.y >= size.y) { return; }
  let p = vec2f(ip) + 0.5;
  let pos = inPxToMM(p);
  let zC = textureLoad(depTex, ip, 0).r;
  let cC = coc3(zC, pos);
  let aC = abs(cC);
  let cap = V.frame.y;
  let ownRaw = max(aC.x, max(aC.y, aC.z));
  let own = min(ownRaw, cap);
  let tile = textureLoad(tileTex, ip / 16, 0).r;
  let R = min(max(tile, own), cap);
  var col = textureLoad(colTex, ip, 0).rgb;
  if (R >= 0.7) {
    let fi = u32(V.frame.x);
    let r0 = rnd3(gid.x, gid.y, fi * 7u + 1u);
    let r1 = rnd3(gid.x, gid.y, fi * 7u + 2u);
    let rot = r0 * 6.2831853;
    var acc = col;
    var tot = 1.0;
    let ri = clamp(own, 0.5, R);
    let nTot = i32(V.bokeh.w);
    var n1 = nTot;
    if (R > ri + 1.0) { n1 = clamp(i32(ri * ri * 1.5) + 8, 8, nTot / 2); }
    let n2 = nTot - n1;
    let invSize = 1.0 / V.sizes.xy;
    let a1 = PI * ri * ri / f32(n1);
    let lod1 = max(0.0, log2(sqrt(a1)) - 0.7);
    for (var i = 0; i < n1; i++) {
      let t = (f32(i) + r1) / f32(n1);
      gather(p, zC, aC, ri * sqrt(t), f32(i) * GA + rot, a1, lod1, &acc, &tot, size, invSize);
    }
    if (n2 > 0) {
      let a2 = PI * (R * R - ri * ri) / f32(n2);
      let lod2 = max(0.0, log2(sqrt(a2)) - 0.7);
      for (var i = 0; i < n2; i++) {
        let t = (f32(i) + r1) / f32(n2);
        gather(p, zC, aC, sqrt(ri * ri + (R * R - ri * ri) * t), f32(i) * GA + rot + 1.3, a2, lod2, &acc, &tot, size, invSize);
      }
    }
    col = max(acc / tot, vec3f(0.0));
  }
  if (V.sensor.w > 0.5) {
    // Loupe: blur wider than the gather radius is taken from the full view.
    let big = smoothstep(cap * 0.45, cap * 0.9, ownRaw);
    if (big > 0.0) {
      col = mix(col, textureSampleLevel(mainTex, samp, mmToUV(pos, V.map), 0.0).rgb, big);
    }
  }
  textureStore(outTex, ip, vec4f(col, 1.0));
}
`;

// Residual aberrations + diffraction, then progressive accumulation ------------------
export const PSF_WGSL = VIEW + /* wgsl */`
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var<storage, read_write> acc: array<vec4f>;
@group(0) @binding(3) var avgOut: texture_storage_2d<rgba16float, write>;
@group(0) @binding(4) var samp: sampler;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let size = vec2i(V.sizes.xy);
  let ip = vec2i(gid.xy);
  if (ip.x >= size.x || ip.y >= size.y) { return; }
  let p = vec2f(ip) + 0.5;
  let pos = inPxToMM(p);
  let pr = length(pos);
  let rn = pr / V.geo.z;
  let dir = select(vec2f(1.0, 0.0), pos / pr, pr > 1e-5);
  let tdir = vec2f(-dir.y, dir.x);
  let stopRatio = 1.0 / V.cat.x;   // 1 wide open, smaller when stopped down
  let sigA = mix(V.soft.x, V.soft.y, min(rn * rn, 1.6)) * pow(stopRatio, 1.7);
  let sig = sqrt(sigA * sigA + V.soft.z * V.soft.z) / V.geo.x;
  let astig = 1.0 + V.cat.w * rn * rn * stopRatio;
  let comaLen = V.cat.z * rn * rn * stopRatio * stopRatio * V.soft.y * 3.0 / V.geo.x;
  var c: vec3f;
  if (sig < 0.18 && comaLen < 0.25) {
    c = textureLoad(src, ip, 0).rgb;
  } else {
    let fi = u32(V.frame.x);
    c = vec3f(0.0);
    for (var k = 0u; k < 8u; k++) {
      let u1 = max(rnd3(gid.x, gid.y, fi * 64u + k * 3u + 11u), 1e-6);
      let u2 = rnd3(gid.x, gid.y, fi * 64u + k * 3u + 12u);
      let u3 = rnd3(gid.x, gid.y, fi * 64u + k * 3u + 13u);
      let g = sqrt(-2.0 * log(u1)) * vec2f(cos(6.2831853 * u2), sin(6.2831853 * u2));
      // Image axes (y up) -> pixel axes (y down).
      var o = dir * g.x * sig / sqrt(astig) + tdir * g.y * sig * astig;
      o += dir * comaLen * u3 * u3;
      c += textureSampleLevel(src, samp, (p + vec2f(o.x, -o.y)) / V.sizes.xy, 0.0).rgb;
    }
    c /= 8.0;
  }
  let idx = u32(ip.y) * u32(size.x) + u32(ip.x);
  var a = vec4f(c, 1.0);
  if (V.frame.x > 0.5) { a += acc[idx]; }
  acc[idx] = a;
  textureStore(avgOut, ip, vec4f(a.rgb / a.w, 1.0));
}
`;

// Distortion, lateral colour, vignetting, image circle -----------------------------------
export const DISTORT_WGSL = VIEW + /* wgsl */`
@group(0) @binding(1) var avgTex: texture_2d<f32>;
@group(0) @binding(2) var outTex: texture_storage_2d<rgba16float, write>;
@group(0) @binding(3) var samp: sampler;

fn overlap(d: f32, r2: f32) -> f32 {
  if (d >= 1.0 + r2) { return 0.0; }
  if (d <= abs(1.0 - r2)) { let m = min(1.0, r2); return m * m; }
  let a = acos(clamp((d * d + 1.0 - r2 * r2) / (2.0 * d), -1.0, 1.0));
  let b = r2 * r2 * acos(clamp((d * d + r2 * r2 - 1.0) / (2.0 * d * r2), -1.0, 1.0));
  let c = 0.5 * sqrt(max(0.0, (-d + 1.0 + r2) * (d + 1.0 - r2) * (d - 1.0 + r2) * (d + 1.0 + r2)));
  return (a + b - c) / PI;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let size = vec2i(V.sizes.zw);
  let ip = vec2i(gid.xy);
  if (ip.x >= size.x || ip.y >= size.y) { return; }
  let mmD = outPxToMM(vec2f(ip) + 0.5);
  let rd = length(mmD) / V.geo.z;
  let sc = 1.0 + V.ca.z * rd * rd + V.ca.w * rd * rd * rd * rd;
  let base = mmD * sc;
  let r = textureSampleLevel(avgTex, samp, mmToUV(base * (1.0 + V.ca.y), V.inRect), 0.0).r;
  let g = textureSampleLevel(avgTex, samp, mmToUV(base, V.inRect), 0.0).g;
  let b = textureSampleLevel(avgTex, samp, mmToUV(base * (1.0 - V.ca.y), V.inRect), 0.0).b;
  let ru = length(base);
  let cosT = V.geo.w / sqrt(V.geo.w * V.geo.w + ru * ru);
  let nat = pow(cosT, 4.0 * V.vig.x);
  let s = V.cat.x;
  let mech = overlap(V.blade.w * (ru / V.geo.z) * s, s);
  let ic = 1.0 - smoothstep(V.geo.z * 0.96, V.geo.z * 1.08, ru);
  textureStore(outTex, ip, vec4f(vec3f(r, g, b) * nat * mech * ic, 1.0));
}
`;

// Glow pyramid ---------------------------------------------------------------------------
export const DOWN_WGSL = /* wgsl */`
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var dst: texture_storage_2d<rgba16float, write>;
@group(0) @binding(2) var samp: sampler;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let ds = vec2i(textureDimensions(dst));
  let ip = vec2i(gid.xy);
  if (ip.x >= ds.x || ip.y >= ds.y) { return; }
  let uv = (vec2f(ip) + 0.5) / vec2f(ds);
  let t = 1.0 / vec2f(textureDimensions(src));
  let a = textureSampleLevel(src, samp, uv + t * vec2f(-2.0, -2.0), 0.0).rgb;
  let b = textureSampleLevel(src, samp, uv + t * vec2f(0.0, -2.0), 0.0).rgb;
  let c = textureSampleLevel(src, samp, uv + t * vec2f(2.0, -2.0), 0.0).rgb;
  let d = textureSampleLevel(src, samp, uv + t * vec2f(-2.0, 0.0), 0.0).rgb;
  let e = textureSampleLevel(src, samp, uv, 0.0).rgb;
  let f = textureSampleLevel(src, samp, uv + t * vec2f(2.0, 0.0), 0.0).rgb;
  let g = textureSampleLevel(src, samp, uv + t * vec2f(-2.0, 2.0), 0.0).rgb;
  let h = textureSampleLevel(src, samp, uv + t * vec2f(0.0, 2.0), 0.0).rgb;
  let i = textureSampleLevel(src, samp, uv + t * vec2f(2.0, 2.0), 0.0).rgb;
  let j = textureSampleLevel(src, samp, uv + t * vec2f(-1.0, -1.0), 0.0).rgb;
  let k = textureSampleLevel(src, samp, uv + t * vec2f(1.0, -1.0), 0.0).rgb;
  let l = textureSampleLevel(src, samp, uv + t * vec2f(-1.0, 1.0), 0.0).rgb;
  let m = textureSampleLevel(src, samp, uv + t * vec2f(1.0, 1.0), 0.0).rgb;
  var o = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  textureStore(dst, ip, vec4f(min(o, vec3f(60000.0)), 1.0));
}
`;

export const UP_WGSL = /* wgsl */`
@group(0) @binding(0) var low: texture_2d<f32>;
@group(0) @binding(1) var same: texture_2d<f32>;
@group(0) @binding(2) var dst: texture_storage_2d<rgba16float, write>;
@group(0) @binding(3) var samp: sampler;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let ds = vec2i(textureDimensions(dst));
  let ip = vec2i(gid.xy);
  if (ip.x >= ds.x || ip.y >= ds.y) { return; }
  let uv = (vec2f(ip) + 0.5) / vec2f(ds);
  let t = 1.0 / vec2f(textureDimensions(low));
  var s = textureSampleLevel(low, samp, uv, 0.0).rgb * 4.0;
  s += (textureSampleLevel(low, samp, uv + vec2f(t.x, 0.0), 0.0).rgb + textureSampleLevel(low, samp, uv - vec2f(t.x, 0.0), 0.0).rgb
      + textureSampleLevel(low, samp, uv + vec2f(0.0, t.y), 0.0).rgb + textureSampleLevel(low, samp, uv - vec2f(0.0, t.y), 0.0).rgb) * 2.0;
  s += textureSampleLevel(low, samp, uv + t, 0.0).rgb + textureSampleLevel(low, samp, uv - t, 0.0).rgb
     + textureSampleLevel(low, samp, uv + vec2f(t.x, -t.y), 0.0).rgb + textureSampleLevel(low, samp, uv + vec2f(-t.x, t.y), 0.0).rgb;
  let o = textureLoad(same, ip, 0).rgb + s / 16.0;
  textureStore(dst, ip, vec4f(min(o, vec3f(60000.0)), 1.0));
}
`;

// Diffraction spikes from the blade edges ---------------------------------------------------
export const STAR_WGSL = VIEW + /* wgsl */`
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var dst: texture_storage_2d<rgba16float, write>;
@group(0) @binding(3) var samp: sampler;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let ds = vec2i(textureDimensions(dst));
  let ip = vec2i(gid.xy);
  if (ip.x >= ds.x || ip.y >= ds.y) { return; }
  let uv = (vec2f(ip) + 0.5) / vec2f(ds);
  let nb = i32(V.blade.x);
  var acc = vec3f(0.0);
  if (nb >= 3 && V.flare.w > 0.0) {
    let steps = 28;
    let len = V.vig.z;   // spike length in px of this texture
    let inv = 1.0 / vec2f(ds);
    for (var k = 0; k < nb; k++) {
      let ang = V.blade.z + (f32(k) + 0.5) * 2.0 * PI / f32(nb);
      let d = vec2f(cos(ang), -sin(ang));
      for (var j = 1; j <= steps; j++) {
        let t = f32(j) / f32(steps);
        let w = exp(-t * 4.0) / (0.15 + t);
        let o = d * t * len * inv;
        acc += (textureSampleLevel(src, samp, uv + o, 0.0).rgb + textureSampleLevel(src, samp, uv - o, 0.0).rgb) * w;
      }
    }
    acc *= V.flare.w / f32(steps);
  }
  textureStore(dst, ip, vec4f(min(acc, vec3f(60000.0)), 1.0));
}
`;

// Optics composite + sensor: exposure, photon and read noise, colour filter array -----------
export const SENSOR_WGSL = VIEW + /* wgsl */`
@group(0) @binding(1) var lensTex: texture_2d<f32>;
@group(0) @binding(2) var glowTex: texture_2d<f32>;
@group(0) @binding(3) var starTex: texture_2d<f32>;
@group(0) @binding(4) var ghostTex: texture_2d<f32>;
@group(0) @binding(5) var rawOut: texture_storage_2d<rgba16float, write>;
@group(0) @binding(6) var samp: sampler;

fn cfaChannel(sx: i32, sy: i32) -> i32 {
  if (V.sensor.x < 1.5) {
    let x = sx & 1; let y = sy & 1;
    if (x == 0 && y == 0) { return 0; }
    if (x == 1 && y == 1) { return 2; }
    return 1;
  }
  // 6x6 pattern: G G R G G B / G G B G G R / B R G R B G / G G B G G R / G G R G G B / R B G B R G
  var pat = array<i32, 36>(1,1,0,1,1,2, 1,1,2,1,1,0, 2,0,1,0,2,1, 1,1,2,1,1,0, 1,1,0,1,1,2, 0,2,1,2,0,1);
  let x = ((sx % 6) + 6) % 6; let y = ((sy % 6) + 6) % 6;
  return pat[y * 6 + x];
}

fn gauss(a: u32, b: u32, c: u32) -> f32 {
  let u1 = max(rnd3(a, b, c), 1e-7);
  let u2 = rnd3(a ^ 0x9e3779b9u, b, c + 17u);
  return sqrt(-2.0 * log(u1)) * cos(6.2831853 * u2);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let size = vec2i(V.sizes.zw);
  let ip = vec2i(gid.xy);
  if (ip.x >= size.x || ip.y >= size.y) { return; }
  let p = vec2f(ip) + 0.5;
  let uv = p / V.sizes.zw;
  let mm = outPxToMM(p);
  var o: vec3f;
  if (V.soft.w > 0.0) {
    // Optical low-pass filter: four-spot split of about one pixel.
    let d = V.soft.w * 0.5 / V.sizes.zw;
    o = (textureSampleLevel(lensTex, samp, uv + vec2f(d.x, d.y), 0.0).rgb + textureSampleLevel(lensTex, samp, uv + vec2f(-d.x, d.y), 0.0).rgb
       + textureSampleLevel(lensTex, samp, uv + vec2f(d.x, -d.y), 0.0).rgb + textureSampleLevel(lensTex, samp, uv + vec2f(-d.x, -d.y), 0.0).rgb) * 0.25;
  } else {
    o = textureLoad(lensTex, ip, 0).rgb;
  }
  let uvM = mmToUV(mm, V.map2);
  let glow = textureSampleLevel(glowTex, samp, uvM, 0.0).rgb / V.vig.w;
  o = o * (1.0 - V.flare.x) + glow * V.flare.x;
  o += textureSampleLevel(starTex, samp, uvM, 0.0).rgb;
  // Ghost reflections mirrored through the optical centre, and veiling glare.
  let c = uvM - 0.5;
  var gh = vec3f(0.0);
  gh += textureSampleLevel(ghostTex, samp, 0.5 - c * 0.55, 2.0).rgb * vec3f(0.25, 0.7, 1.0);
  gh += textureSampleLevel(ghostTex, samp, 0.5 - c * 1.25, 3.0).rgb * vec3f(1.0, 0.6, 0.2);
  gh += textureSampleLevel(ghostTex, samp, 0.5 + c * 0.4, 2.0).rgb * vec3f(0.6, 1.0, 0.4);
  gh += textureSampleLevel(ghostTex, samp, 0.5 - c * 0.22, 1.0).rgb * vec3f(1.0, 0.3, 0.8);
  gh += textureSampleLevel(ghostTex, samp, 0.5 - c * 1.8, 4.0).rgb * vec3f(0.4, 0.5, 1.0);
  o += gh * V.flare.y;
  var mean = vec3f(0.0);
  for (var j = 0; j < 4; j++) { for (var i = 0; i < 4; i++) {
    mean += textureSampleLevel(ghostTex, samp, (vec2f(f32(i), f32(j)) + 0.5) / 4.0, V.vig.w - 1.0).rgb;
  }}
  o += mean / 16.0 * V.flare.z + vec3f(V.vig.y);

  // Sensor: electrons, shot noise, read noise, clipping.
  var v = o * V.expo.x;
  let sx = i32(floor((mm.x + V.ab.z) / V.frame.w));
  let sy = i32(floor((V.ab.w - mm.y) / V.frame.w));
  var kx = u32(ip.x); var ky = u32(ip.y);
  if (V.sensor.w > 0.5) { kx = u32(sx + 100000); ky = u32(sy + 100000); }
  let seed = u32(V.sensor.z);
  let gain = V.expo.z / (V.expo.y * V.sensor.y);
  let rn = V.expo.w;
  var outc = vec3f(0.0);
  let ch = select(-1, cfaChannel(sx, sy), V.sensor.x > 0.5);
  for (var k = 0; k < 3; k++) {
    if (ch >= 0 && ch != k) { continue; }
    let e = max(v[k], 0.0) * gain;
    let sigma = sqrt(e + rn * rn);
    let noisy = e + sigma * gauss(kx, ky, seed * 3u + u32(k));
    // Below base ISO the pixel fills before the output reaches white.
    outc[k] = min(noisy / gain, V.expo.y * min(1.0, V.sensor.y));
  }
  textureStore(rawOut, ip, vec4f(outc, f32(ch)));
}
`;

// Demosaic for the 100% view: per channel, weighted mean of same-colour neighbours.
export const DEMOSAIC_WGSL = VIEW + /* wgsl */`
@group(0) @binding(1) var raw: texture_2d<f32>;
@group(0) @binding(2) var outTex: texture_storage_2d<rgba16float, write>;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let size = vec2i(V.sizes.zw);
  let ip = vec2i(gid.xy);
  if (ip.x >= size.x || ip.y >= size.y) { return; }
  var c0 = textureLoad(raw, ip, 0);
  if (c0.w < -0.5) { textureStore(outTex, ip, vec4f(c0.rgb, 1.0)); return; }
  var sum = vec3f(0.0); var wsum = vec3f(0.0);
  for (var y = -2; y <= 2; y++) {
    for (var x = -2; x <= 2; x++) {
      let q = clamp(ip + vec2i(x, y), vec2i(0), size - 1);
      var s = textureLoad(raw, q, 0);
      let ch = i32(s.w + 0.5);
      let w = exp(-f32(x * x + y * y) * 0.45);
      sum[ch] += s[ch] * w; wsum[ch] += w;
    }
  }
  var o = sum / max(wsum, vec3f(1e-6));
  let own = i32(c0.w + 0.5);
  o[own] = c0[own];
  textureStore(outTex, ip, vec4f(o, 1.0));
}
`;

// Development (white balance, tone curve, colour) into an 8-bit frame -----------------------
export const DEVELOP_WGSL = VIEW + /* wgsl */`
@group(0) @binding(1) var img: texture_2d<f32>;
struct VO { @builtin(position) pos: vec4f }
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VO {
  let p = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
  var o: VO; o.pos = vec4f(p * 2.0 - 1.0, 0.0, 1.0); return o;
}
fn aces(x: vec3f) -> vec3f {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), vec3f(0.0), vec3f(1.0));
}
fn toSRGB(c: vec3f) -> vec3f {
  let lo = c * 12.92;
  let hi = 1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055;
  return select(hi, lo, c <= vec3f(0.0031308));
}
fn load(ip: vec2i) -> vec3f {
  let size = vec2i(V.sizes.zw);
  return textureLoad(img, clamp(ip, vec2i(0), size - 1), 0).rgb;
}
@fragment fn fs(in: VO) -> @location(0) vec4f {
  let zoom = V.ab.y;
  let ip = vec2i(floor(in.pos.xy / zoom));
  var raw = load(ip);
  let blur = (load(ip + vec2i(1, 0)) + load(ip - vec2i(1, 0)) + load(ip + vec2i(0, 1)) + load(ip - vec2i(0, 1))) * 0.25;
  raw = raw + V.dev2.z * (raw - blur);
  let clip = V.expo.y;
  var x = min(max(raw, vec3f(0.0)) * V.dev.rgb, vec3f(clip));
  let k = 0.7;
  var y = aces(x * k) / aces(vec3f(clip * k)).x;
  y = clamp(0.19 * pow(max(y, vec3f(0.0)) / 0.19, vec3f(V.dev2.x)), vec3f(0.0), vec3f(1.0));
  let luma = dot(y, vec3f(0.2126, 0.7152, 0.0722));
  y = clamp(mix(vec3f(luma), y, V.dev2.y), vec3f(0.0), vec3f(1.0));
  var res = toSRGB(y);
  if (V.dev.w > 0.5 && max(raw.r, max(raw.g, raw.b)) >= clip * min(1.0, V.sensor.y) * 0.985) {
    let stripe = step(0.5, fract((in.pos.x + in.pos.y) / 8.0));
    res = mix(res, vec3f(1.0, 0.1, 0.35), stripe * 0.85);
  }
  if (V.dev2.w > 0.5 && zoom >= 4.0) {
    let f = fract(in.pos.xy / zoom);
    let edge = step(f.x, 1.0 / zoom) + step(f.y, 1.0 / zoom);
    res = mix(res, res * 0.75, min(edge, 1.0) * 0.6);
  }
  return vec4f(res, 1.0);
}
`;

// Present: A/B split between a held frame and the live frame ---------------------------------
export const PRESENT_WGSL = VIEW + /* wgsl */`
@group(0) @binding(1) var live: texture_2d<f32>;
@group(0) @binding(2) var held: texture_2d<f32>;
struct VO { @builtin(position) pos: vec4f }
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VO {
  let p = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
  var o: VO; o.pos = vec4f(p * 2.0 - 1.0, 0.0, 1.0); return o;
}
@fragment fn fs(in: VO) -> @location(0) vec4f {
  let ip = vec2i(in.pos.xy);
  var c = textureLoad(live, ip, 0).rgb;
  let w = f32(textureDimensions(live).x);
  let split = V.ab.x * w;
  if (V.ab.x >= 0.0) {
    if (in.pos.x < split) { c = textureLoad(held, ip, 0).rgb; }
    let d = abs(in.pos.x - split);
    c = mix(c, vec3f(1.0), smoothstep(1.6, 0.6, d));
  }
  return vec4f(c, 1.0);
}
`;
