// WebGPU renderer: a scene pass with procedural materials, followed by a physical
// lens stage (depth of field, aberrations, diffraction, distortion, vignetting,
// flare) and a sensor stage (exposure, photon/read noise, colour filter array,
// development). The main view shows the full frame; the loupe re-renders a small
// region at the camera's real pixel pitch so resolution, moiré and noise show at 100%.
import { SCENE_WGSL } from './shaders-scene.js';
import * as P from './shaders-post.js';
import { buildMeshes, MESH_NAMES } from './meshes.js';

const HDR = 'rgba16float';
const BLOOM_LEVELS = 6;
const MAX_LIGHTS = 48;
const SHADOW_SIZE = 2048;
const NEAR = 0.02;
const U = GPUBufferUsage, T = GPUTextureUsage;

const halton = (i, b) => { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const addS = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];

export function cameraBasis(f) {
  const r = norm(cross([0, 1, 0], f));
  return { f, r, u: cross(f, r) };
}

// Perspective for a tangent window, reversed-Z with infinite far plane (column-major).
function viewProj(eye, B, win) {
  const [tx0, ty0, tx1, ty1] = win;
  const ax = 2 / (tx1 - tx0), bx = -(tx1 + tx0) / (tx1 - tx0);
  const ay = 2 / (ty1 - ty0), by = -(ty1 + ty0) / (ty1 - ty0);
  const re = dot(B.r, eye), ue = dot(B.u, eye), fe = dot(B.f, eye);
  const rows = [
    [ax * B.r[0] + bx * B.f[0], ax * B.r[1] + bx * B.f[1], ax * B.r[2] + bx * B.f[2], -(ax * re + bx * fe)],
    [ay * B.u[0] + by * B.f[0], ay * B.u[1] + by * B.f[1], ay * B.u[2] + by * B.f[2], -(ay * ue + by * fe)],
    [0, 0, 0, NEAR],
    [B.f[0], B.f[1], B.f[2], -fe],
  ];
  const m = new Float32Array(16);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) m[c * 4 + r] = rows[r][c];
  return m;
}

function shadowMatrix(sunDir, center, half, depth) {
  const lf = norm([-sunDir[0], -sunDir[1], -sunDir[2]]);
  const ref = Math.abs(lf[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
  const lr = norm(cross(ref, lf));
  const lu = cross(lf, lr);
  const rows = [
    [lr[0] / half, lr[1] / half, lr[2] / half, -dot(lr, center) / half],
    [lu[0] / half, lu[1] / half, lu[2] / half, -dot(lu, center) / half],
    [lf[0] / (2 * depth), lf[1] / (2 * depth), lf[2] / (2 * depth), (-dot(lf, center) + depth) / (2 * depth)],
    [0, 0, 0, 1],
  ];
  const m = new Float32Array(16);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) m[c * 4 + r] = rows[r][c];
  return m;
}

export class Renderer {
  static async create(mainCanvas, loupeCanvas) {
    if (!('gpu' in navigator)) throw new Error('webgpu-missing');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('webgpu-adapter');
    const device = await adapter.requestDevice();
    const r = new Renderer(device, mainCanvas, loupeCanvas);
    r.adapter = adapter; // keep the adapter alive for the device's lifetime
    await r.init();
    return r;
  }

  constructor(device, mainCanvas, loupeCanvas) {
    this.device = device;
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.canvases = { main: mainCanvas, loupe: loupeCanvas };
    this.contexts = {};
    for (const [k, c] of Object.entries(this.canvases)) {
      const ctx = c.getContext('webgpu');
      ctx.configure({ device, format: this.format, alphaMode: 'opaque', usage: T.RENDER_ATTACHMENT | T.COPY_SRC });
      this.contexts[k] = ctx;
    }
    this.views = { main: null, loupe: null };
    this.samplesPerFrame = 1;
    // Debug: ?skip=dof,psf,... disables passes when isolating GPU problems.
    this.skip = new Set((new URLSearchParams(globalThis.location?.search || '').get('skip') || '').split(',').filter(Boolean));
    this.errors = [];
    device.lost.then((info) => { if (info.reason !== 'destroyed') this.errors.push('Device lost: ' + info.message); });
    device.addEventListener('uncapturederror', (e) => { this.errors.push(e.error.message); });
  }

  async module(code, label) {
    const m = this.device.createShaderModule({ code, label });
    const info = await m.getCompilationInfo();
    const errs = info.messages.filter((x) => x.type === 'error');
    if (errs.length) {
      const msg = errs.map((e) => `${label}:${e.lineNum}:${e.linePos} ${e.message}`).join('\n');
      this.errors.push(msg);
      throw new Error(msg);
    }
    return m;
  }

  async init() {
    const d = this.device;
    // Geometry
    const meshes = buildMeshes();
    this.meshes = {};
    for (const name of MESH_NAMES) {
      const m = meshes[name];
      const vb = d.createBuffer({ size: m.vertices.byteLength, usage: U.VERTEX | U.COPY_DST });
      d.queue.writeBuffer(vb, 0, m.vertices);
      const ib = d.createBuffer({ size: m.indices.byteLength, usage: U.INDEX | U.COPY_DST });
      d.queue.writeBuffer(ib, 0, m.indices);
      this.meshes[name] = { vb, ib, count: m.indices.length };
    }
    this.linear = d.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
    this.shadowSampler = d.createSampler({ compare: 'less', magFilter: 'linear', minFilter: 'linear' });
    this.shadowTex = d.createTexture({ size: [SHADOW_SIZE, SHADOW_SIZE], format: 'depth32float', usage: T.RENDER_ATTACHMENT | T.TEXTURE_BINDING });
    this.dummyHDR = d.createTexture({ size: [1, 1], format: HDR, usage: T.TEXTURE_BINDING | T.STORAGE_BINDING });
    this.lightBuf = d.createBuffer({ size: MAX_LIGHTS * 32, usage: U.STORAGE | U.COPY_DST });
    this.lightData = new Float32Array(MAX_LIGHTS * 8);
    this.readBuf = d.createBuffer({ size: 256, usage: U.MAP_READ | U.COPY_DST });

    // Pipelines
    const sceneMod = await this.module(SCENE_WGSL, 'scene');
    const vbuf = [{ arrayStride: 24, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' }] }];
    const targets = [{ format: HDR }, { format: 'r32float' }];
    this.pScene = d.createRenderPipeline({
      layout: 'auto', vertex: { module: sceneMod, entryPoint: 'vs', buffers: vbuf },
      fragment: { module: sceneMod, entryPoint: 'fs', targets }, primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'greater' },
    });
    this.pSky = d.createRenderPipeline({
      layout: 'auto', vertex: { module: sceneMod, entryPoint: 'vsSky' },
      fragment: { module: sceneMod, entryPoint: 'fsSky', targets }, primitive: { topology: 'triangle-list' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'equal' },
    });
    this.pShadow = d.createRenderPipeline({
      layout: 'auto', vertex: { module: sceneMod, entryPoint: 'vsShadow', buffers: vbuf },
      fragment: { module: sceneMod, entryPoint: 'fsShadow', targets: [] }, primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less', depthBias: 3, depthBiasSlopeScale: 2.5 },
    });
    const comp = async (code, label) => d.createComputePipeline({ layout: 'auto', compute: { module: await this.module(code, label), entryPoint: 'main' } });
    this.pTile = await comp(P.TILE_WGSL, 'tile');
    this.pDilate = await comp(P.DILATE_WGSL, 'dilate');
    this.pDof = await comp(P.DOF_WGSL, 'dof');
    this.pPsf = await comp(P.PSF_WGSL, 'psf');
    this.pDistort = await comp(P.DISTORT_WGSL, 'distort');
    this.pDown = await comp(P.DOWN_WGSL, 'down');
    this.pUp = await comp(P.UP_WGSL, 'up');
    this.pStar = await comp(P.STAR_WGSL, 'star');
    this.pSensor = await comp(P.SENSOR_WGSL, 'sensor');
    this.pDemosaic = await comp(P.DEMOSAIC_WGSL, 'demosaic');
    const devMod = await this.module(P.DEVELOP_WGSL, 'develop');
    this.pDevelop = d.createRenderPipeline({ layout: 'auto', vertex: { module: devMod, entryPoint: 'vs' }, fragment: { module: devMod, entryPoint: 'fs', targets: [{ format: 'rgba8unorm' }] } });
    const preMod = await this.module(P.PRESENT_WGSL, 'present');
    this.pPresent = d.createRenderPipeline({ layout: 'auto', vertex: { module: preMod, entryPoint: 'vs' }, fragment: { module: preMod, entryPoint: 'fs', targets: [{ format: this.format }] } });
  }

  // ---- Scene ---------------------------------------------------------------------------
  setScene(scene) {
    const d = this.device;
    this.scene = scene;
    const b = scene.built;
    this.instBuf?.destroy();
    this.instBuf = d.createBuffer({ size: Math.max(b.data.byteLength, 256), usage: U.STORAGE | U.COPY_DST });
    d.queue.writeBuffer(this.instBuf, 0, b.data);
    this.groups = b.groups;
    this.lights = scene.lights.slice(0, MAX_LIGHTS);
    this.shadowDirty = true;
    this.sceneBindDirty = true;
    this.resetAll();
  }

  // ---- View allocation -------------------------------------------------------------------
  makeView(kind, inW, inH, outW, outH, canvasW, canvasH) {
    const d = this.device;
    const tex = (w, h, format, usage, mips = 1) => d.createTexture({ size: [w, h], format, usage, mipLevelCount: mips });
    const mipCount = Math.max(1, Math.min(6, Math.floor(Math.log2(Math.min(inW, inH))) - 2));
    const v = {
      kind, inW, inH, outW, outH, canvasW, canvasH, mipCount,
      sceneUB: d.createBuffer({ size: 336, usage: U.UNIFORM | U.COPY_DST }),
      viewUB: d.createBuffer({ size: 320, usage: U.UNIFORM | U.COPY_DST }),
      color: tex(inW, inH, HDR, T.RENDER_ATTACHMENT | T.TEXTURE_BINDING | T.STORAGE_BINDING, mipCount),
      depthLin: tex(inW, inH, 'r32float', T.RENDER_ATTACHMENT | T.TEXTURE_BINDING | T.COPY_SRC),
      depthBuf: tex(inW, inH, 'depth32float', T.RENDER_ATTACHMENT),
      tile: tex(Math.ceil(inW / 16), Math.ceil(inH / 16), 'r32float', T.STORAGE_BINDING | T.TEXTURE_BINDING),
      tileDil: tex(Math.ceil(inW / 16), Math.ceil(inH / 16), 'r32float', T.STORAGE_BINDING | T.TEXTURE_BINDING),
      dof: tex(inW, inH, HDR, T.STORAGE_BINDING | T.TEXTURE_BINDING),
      acc: d.createBuffer({ size: inW * inH * 16, usage: U.STORAGE }),
      avg: tex(inW, inH, HDR, T.STORAGE_BINDING | T.TEXTURE_BINDING),
      lens: tex(outW, outH, HDR, T.STORAGE_BINDING | T.TEXTURE_BINDING),
      raw: tex(outW, outH, HDR, T.STORAGE_BINDING | T.TEXTURE_BINDING),
      frameTex: tex(canvasW, canvasH, 'rgba8unorm', T.RENDER_ATTACHMENT | T.TEXTURE_BINDING | T.COPY_SRC),
      snapTex: tex(canvasW, canvasH, 'rgba8unorm', T.TEXTURE_BINDING | T.COPY_DST),
      frame: 0, target: 24, hasSnap: false,
    };
    v.dem = kind === 'loupe' ? tex(outW, outH, HDR, T.STORAGE_BINDING | T.TEXTURE_BINDING) : v.raw;
    if (kind === 'main') {
      const bw = Math.max(1, outW >> 1), bh = Math.max(1, outH >> 1);
      v.bloomLevels = Math.max(1, Math.min(BLOOM_LEVELS, Math.floor(Math.log2(Math.min(bw, bh))) - 1));
      v.bloomDown = tex(bw, bh, HDR, T.STORAGE_BINDING | T.TEXTURE_BINDING, v.bloomLevels);
      v.bloomUp = tex(bw, bh, HDR, T.STORAGE_BINDING | T.TEXTURE_BINDING, v.bloomLevels);
      v.star = tex(bw, bh, HDR, T.STORAGE_BINDING | T.TEXTURE_BINDING);
    }
    return v;
  }

  destroyView(v) {
    if (!v) return;
    for (const k of ['color', 'depthLin', 'depthBuf', 'tile', 'tileDil', 'dof', 'avg', 'lens', 'raw', 'frameTex', 'snapTex', 'bloomDown', 'bloomUp', 'star']) v[k]?.destroy();
    if (v.dem !== v.raw) v.dem?.destroy();
    v.acc.destroy(); v.sceneUB.destroy(); v.viewUB.destroy();
  }

  ensureView(kind, inW, inH, outW, outH, canvasW, canvasH) {
    const v = this.views[kind];
    if (v && v.inW === inW && v.inH === inH && v.outW === outW && v.outH === outH && v.canvasW === canvasW && v.canvasH === canvasH) return false;
    this.destroyView(v);
    this.views[kind] = this.makeView(kind, inW, inH, outW, outH, canvasW, canvasH);
    this.sceneBindDirty = true;
    this.postBindDirty = true;
    return true;
  }

  bindAll() {
    const d = this.device;
    const main = this.views.main;
    for (const v of [this.views.main, this.views.loupe]) {
      if (!v) continue;
      const bg = (p, entries) => d.createBindGroup({ layout: p.getBindGroupLayout(0), entries: entries.map((r, i) => ({ binding: r[0], resource: r[1] })) });
      const view = (t, o) => t.createView(o);
      if (this.sceneBindDirty || !v.bgScene) {
        v.bgScene = bg(this.pScene, [[0, { buffer: v.sceneUB }], [1, { buffer: this.instBuf }], [2, { buffer: this.lightBuf }], [3, this.shadowTex.createView()], [4, this.shadowSampler]]);
        v.bgSky = bg(this.pSky, [[0, { buffer: v.sceneUB }]]);
        v.bgShadow = bg(this.pShadow, [[0, { buffer: v.sceneUB }], [1, { buffer: this.instBuf }]]);
      }
      if (this.postBindDirty || !v.bgDof) {
        v.bgMips = [];
        for (let i = 1; i < v.mipCount; i++) {
          v.bgMips.push(bg(this.pDown, [[0, view(v.color, { baseMipLevel: i - 1, mipLevelCount: 1 })], [1, view(v.color, { baseMipLevel: i, mipLevelCount: 1 })], [2, this.linear]]));
        }
        v.bgTile = bg(this.pTile, [[0, { buffer: v.viewUB }], [1, v.depthLin.createView()], [2, v.tile.createView()]]);
        v.bgDilate = bg(this.pDilate, [[0, { buffer: v.viewUB }], [1, v.tile.createView()], [2, v.tileDil.createView()]]);
        const mainAvg = v.kind === 'loupe' && main ? main.avg : this.dummyHDR;
        v.bgDof = bg(this.pDof, [[0, { buffer: v.viewUB }], [1, v.color.createView()], [2, v.depthLin.createView()], [3, v.tileDil.createView()], [4, v.dof.createView()], [5, this.linear], [6, mainAvg.createView()]]);
        v.bgPsf = bg(this.pPsf, [[0, { buffer: v.viewUB }], [1, v.dof.createView()], [2, { buffer: v.acc }], [3, v.avg.createView()], [4, this.linear]]);
        v.bgDistort = bg(this.pDistort, [[0, { buffer: v.viewUB }], [1, v.avg.createView()], [2, v.lens.createView()], [3, this.linear]]);
        if (v.kind === 'main') {
          v.bgDown = [];
          for (let i = 0; i < v.bloomLevels; i++) {
            const src = i === 0 ? v.lens.createView() : view(v.bloomDown, { baseMipLevel: i - 1, mipLevelCount: 1 });
            v.bgDown.push(bg(this.pDown, [[0, src], [1, view(v.bloomDown, { baseMipLevel: i, mipLevelCount: 1 })], [2, this.linear]]));
          }
          v.bgUp = [];
          for (let i = v.bloomLevels - 2; i >= 0; i--) {
            const low = i === v.bloomLevels - 2 ? view(v.bloomDown, { baseMipLevel: i + 1, mipLevelCount: 1 }) : view(v.bloomUp, { baseMipLevel: i + 1, mipLevelCount: 1 });
            v.bgUp.push(bg(this.pUp, [[0, low], [1, view(v.bloomDown, { baseMipLevel: i, mipLevelCount: 1 })], [2, view(v.bloomUp, { baseMipLevel: i, mipLevelCount: 1 })], [3, this.linear]]));
          }
          v.bgStar = bg(this.pStar, [[0, { buffer: v.viewUB }], [1, view(v.bloomDown, { baseMipLevel: 0, mipLevelCount: 1 })], [2, v.star.createView()], [3, this.linear]]);
        }
        if (main) {
          const glowSrc = main.bloomLevels > 1 ? view(main.bloomUp, { baseMipLevel: 0, mipLevelCount: 1 }) : view(main.bloomDown, { baseMipLevel: 0, mipLevelCount: 1 });
          v.bgSensor = bg(this.pSensor, [[0, { buffer: v.viewUB }], [1, v.lens.createView()], [2, glowSrc], [3, main.star.createView()], [4, main.bloomDown.createView()], [5, v.raw.createView()], [6, this.linear]]);
        }
        if (v.kind === 'loupe') v.bgDemosaic = bg(this.pDemosaic, [[0, { buffer: v.viewUB }], [1, v.raw.createView()], [2, v.dem.createView()]]);
        v.bgDevelop = bg(this.pDevelop, [[0, { buffer: v.viewUB }], [1, v.dem.createView()]]);
        v.bgPresent = bg(this.pPresent, [[0, { buffer: v.viewUB }], [1, v.frameTex.createView()], [2, v.snapTex.createView()]]);
      }
    }
    this.sceneBindDirty = false;
    this.postBindDirty = false;
  }

  // ---- Parameters ----------------------------------------------------------------------
  // params: { cam, eye, basis, fEff, viewParams: { main: {inRect,outRect,...}, loupe }, ... } built by main.js
  setShot(shot) {
    this.shot = shot;
    this.resetAll();
  }
  resetAll() {
    for (const v of Object.values(this.views)) if (v) { v.frame = 0; }
    this.dirtyPost = true;
  }
  resetLoupe() { if (this.views.loupe) this.views.loupe.frame = 0; this.dirtyPost = true; }

  writeLights(tau) {
    const L = this.lightData;
    L.fill(0);
    this.lights.forEach((l, i) => {
      L.set([l.pos[0] + l.vel[0] * tau, l.pos[1] + l.vel[1] * tau, l.pos[2] + l.vel[2] * tau, l.radius, ...l.color, l.intensity], i * 8);
    });
    this.device.queue.writeBuffer(this.lightBuf, 0, L);
  }

  sceneUniforms(v, vp, k) {
    const s = this.shot, sc = this.scene;
    const T = s.exposureTime;
    const tau = (halton(k + 1, 5) - 0.5) * T;
    const jx = halton(k + 1, 2) - 0.5, jy = halton(k + 1, 3) - 0.5;
    // Hand tremor: two sinusoids per axis, zero at mid-exposure.
    const A = s.shakeAmp, sh = s.shakePhase, w1 = 2 * Math.PI * s.tremorHz[0], w2 = 2 * Math.PI * s.tremorHz[1];
    const yaw = A * (Math.sin(w1 * tau + sh[0]) - Math.sin(sh[0])) + 0.5 * A * (Math.sin(w2 * tau + sh[1]) - Math.sin(sh[1]));
    const pitch = A * (Math.sin(w1 * tau + sh[2]) - Math.sin(sh[2])) + 0.5 * A * (Math.sin(w2 * tau + sh[3]) - Math.sin(sh[3]));
    const B0 = s.basis;
    const f = norm(addS(addS(B0.f, B0.r, yaw), B0.u, pitch));
    const B = cameraBasis(f);
    const fEff = s.fEff;
    const px = vp.pxIn / fEff;
    const win = [vp.inRect[0] / fEff + jx * px, vp.inRect[1] / fEff + jy * px, vp.inRect[2] / fEff + jx * px, vp.inRect[3] / fEff + jy * px];
    const d = new Float32Array(84);
    d.set(viewProj(s.eye, B, win), 0);
    d.set(this.shadowVP, 16);
    d.set([...s.eye, tau], 32);
    d.set([...B.r, T / Math.max(v.target, 1)], 36);
    d.set([...B.u, k], 40);
    d.set([...B.f, vp.filterScale], 44);
    d.set(win, 48);
    const sun = sc.sun, sky = sc.sky;
    d.set([...sun.dir, sun.irradiance], 52);
    d.set([...sun.color, sun.disc], 56);
    d.set([...sky.zenith, sky.ambient], 60);
    d.set([...sky.horizon, sky.clouds], 64);
    d.set([...sky.ground, sky.stars], 68);
    d.set([...sc.fog.color, sc.fog.density], 72);
    d.set([this.lights.length, sc.sceneIndex, sun.size, sun.shadow ? 1 : 0], 76);
    d.set([sky.indoor ? 1 : 0, 0, 0, (2 * sc.shadow.half) / SHADOW_SIZE], 80);
    this.device.queue.writeBuffer(v.sceneUB, 0, d);
    return tau;
  }

  viewUniforms(v, vp) {
    const d = new Float32Array(80);
    const put = (i, a) => d.set(a, i * 4);
    const s = this.shot;
    put(0, vp.inRect); put(1, vp.outRect);
    put(2, [v.inW, v.inH, v.outW, v.outH]);
    put(3, [s.f, s.N, s.f / s.N, s.imageDist]);
    put(4, [vp.pxIn, vp.pxOut, s.icR, s.fEff]);
    put(5, [s.blades, s.roundness, s.bladeRot, s.catEye]);
    put(6, [s.nRatio, s.fieldCurv, s.coma, s.astig]);
    put(7, [s.longCA, s.latCA, s.k1, s.k2]);
    put(8, [s.sa, s.apod, s.onion, vp.samples]);
    put(9, [s.softCenter, s.softCorner, s.diffSigma, vp.olpf]);
    put(10, [s.glow, s.ghost, s.veil, s.star]);
    put(11, [s.vigExp, s.offAxisGlare, vp.starLen, this.views.main?.bloomLevels ?? 1]);
    put(12, [s.m, s.vClip, vp.fwcOut, vp.readOut]);
    put(13, [vp.cfa, s.isoGain, 1234, v.kind === 'loupe' ? 1 : 0]);
    put(14, [v.frame, vp.cocCap, Math.ceil(vp.cocCap / 16) + 1, s.pitch]);
    put(15, [...s.wb, s.zebra ? 1 : 0]);
    put(16, [s.contrast, s.saturation, vp.sharpen, vp.grid ? 1 : 0]);
    put(17, this.viewParams.main.inRect);
    put(18, this.viewParams.main.outRect);
    put(19, [vp.split, vp.zoom, s.sensorW / 2, s.sensorH / 2]);
    this.device.queue.writeBuffer(v.viewUB, 0, d);
  }

  // ---- Frame ---------------------------------------------------------------------------------
  setViewParams(vps) { this.viewParams = vps; }

  frame() {
    if (!this.shot || !this.scene || !this.views.main || !this.viewParams) return { busy: false };
    const d = this.device;
    this.bindAll();
    const views = [this.views.main, this.views.loupe].filter(Boolean);
    for (const v of views) v.target = this.viewParams[v.kind].target;
    const pending = views.some((v) => v.frame < v.target);
    if (!pending && !this.dirtyPost && !this.forcePresent) return { busy: false };
    const t0 = performance.now();

    if (this.shadowDirty) {
      this.shadowVP = shadowMatrix(this.scene.sun.dir, this.scene.shadow.center, this.scene.shadow.half, this.scene.shadow.depth);
      const v = this.views.main;
      this.sceneUniforms(v, this.viewParams.main, 0);
      this.writeLights(0);
      const enc = d.createCommandEncoder();
      const pass = enc.beginRenderPass({ colorAttachments: [], depthStencilAttachment: { view: this.shadowTex.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' } });
      if (this.scene.sun.shadow && !this.skip.has('shadow')) {
        pass.setPipeline(this.pShadow);
        pass.setBindGroup(0, v.bgShadow);
        this.drawMeshes(pass);
      }
      pass.end();
      d.queue.submit([enc.finish()]);
      this.shadowDirty = false;
    }

    const spf = this.samplesPerFrame;
    for (let n = 0; n < spf; n++) {
      for (const v of views) {
        if (v.frame >= v.target) continue;
        const vp = this.viewParams[v.kind];
        const tau = this.sceneUniforms(v, vp, v.frame);
        this.writeLights(tau);
        this.viewUniforms(v, vp);
        const enc = d.createCommandEncoder();
        this.encodeSample(enc, v);
        d.queue.submit([enc.finish()]);
        v.frame++;
      }
    }

    // Post: lens image -> glow -> sensor -> develop -> present
    const enc = d.createCommandEncoder();
    for (const v of views) this.viewUniforms(v, this.viewParams[v.kind]);
    const main = this.views.main;
    {
      const cp = enc.beginComputePass();
      for (const v of views) {
        if (!this.skip.has('distort')) { cp.setPipeline(this.pDistort); cp.setBindGroup(0, v.bgDistort);
        cp.dispatchWorkgroups(Math.ceil(v.outW / 8), Math.ceil(v.outH / 8)); }
        if (v.kind === 'main' && !this.skip.has('bloom')) {
          cp.setPipeline(this.pDown);
          for (let i = 0; i < v.bloomLevels; i++) {
            const w = Math.max(1, v.bloomDown.width >> i), h = Math.max(1, v.bloomDown.height >> i);
            cp.setBindGroup(0, v.bgDown[i]); cp.dispatchWorkgroups(Math.ceil(w / 8), Math.ceil(h / 8));
          }
          cp.setPipeline(this.pUp);
          let k = 0;
          for (let i = v.bloomLevels - 2; i >= 0; i--) {
            const w = Math.max(1, v.bloomUp.width >> i), h = Math.max(1, v.bloomUp.height >> i);
            cp.setBindGroup(0, v.bgUp[k++]); cp.dispatchWorkgroups(Math.ceil(w / 8), Math.ceil(h / 8));
          }
          if (!this.skip.has('star')) { cp.setPipeline(this.pStar); cp.setBindGroup(0, v.bgStar);
          cp.dispatchWorkgroups(Math.ceil(v.star.width / 8), Math.ceil(v.star.height / 8)); }
        }
      }
      for (const v of views) {
        if (!this.skip.has('sensor')) { cp.setPipeline(this.pSensor); cp.setBindGroup(0, v.bgSensor);
        cp.dispatchWorkgroups(Math.ceil(v.outW / 8), Math.ceil(v.outH / 8)); }
        if (v.kind === 'loupe' && !this.skip.has('demosaic')) {
          cp.setPipeline(this.pDemosaic); cp.setBindGroup(0, v.bgDemosaic);
          cp.dispatchWorkgroups(Math.ceil(v.outW / 8), Math.ceil(v.outH / 8));
        }
      }
      cp.end();
    }
    for (const v of views) {
      const rp = enc.beginRenderPass({ colorAttachments: [{ view: v.frameTex.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
      if (!this.skip.has('develop')) { rp.setPipeline(this.pDevelop); rp.setBindGroup(0, v.bgDevelop); rp.draw(3); }
      rp.end();
      if (this.captureNext) { enc.copyTextureToTexture({ texture: v.frameTex }, { texture: v.snapTex }, [v.canvasW, v.canvasH]); v.hasSnap = true; }
      if (this.skip.has('present')) continue; // test harnesses without canvas presentation
      const out = this.contexts[v.kind].getCurrentTexture();
      const pp = enc.beginRenderPass({ colorAttachments: [{ view: out.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
      pp.setPipeline(this.pPresent); pp.setBindGroup(0, v.bgPresent); pp.draw(3);
      pp.end();
    }
    if (this.captureNext) { this.captureNext = false; this.forcePresent = true; } else { this.forcePresent = false; }
    d.queue.submit([enc.finish()]);
    this.dirtyPost = false;

    // Adapt how many samples we take per animation frame.
    if (pending && !this.timing) {
      this.timing = true;
      d.queue.onSubmittedWorkDone().then(() => {
        const dt = (performance.now() - t0) / spf;
        if (dt < 14 && this.samplesPerFrame < 6) this.samplesPerFrame++;
        else if (dt > 34 && this.samplesPerFrame > 1) this.samplesPerFrame--;
        this.timing = false;
      });
    }
    return { busy: views.some((v) => v.frame < v.target), progress: views.map((v) => Math.min(1, v.frame / v.target)) };
  }

  drawMeshes(pass) {
    for (const g of this.groups) {
      const m = this.meshes[g.mesh];
      pass.setVertexBuffer(0, m.vb);
      pass.setIndexBuffer(m.ib, 'uint32');
      pass.drawIndexed(m.count, g.count, 0, 0, g.first);
    }
  }

  encodeSample(enc, v) {
    const rp = enc.beginRenderPass({
      colorAttachments: [
        { view: v.color.createView({ baseMipLevel: 0, mipLevelCount: 1 }), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] },
        { view: v.depthLin.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [100000, 0, 0, 0] },
      ],
      depthStencilAttachment: { view: v.depthBuf.createView(), depthClearValue: 0, depthLoadOp: 'clear', depthStoreOp: 'store' },
    });
    if (!this.skip.has('scene')) { rp.setPipeline(this.pScene); rp.setBindGroup(0, v.bgScene); this.drawMeshes(rp); }
    if (!this.skip.has('sky')) { rp.setPipeline(this.pSky); rp.setBindGroup(0, v.bgSky); rp.draw(3); }
    rp.end();
    const cp = enc.beginComputePass();
    cp.setPipeline(this.pDown);
    for (let i = 1; i < (this.skip.has('mips') ? 0 : v.mipCount); i++) {
      cp.setBindGroup(0, v.bgMips[i - 1]);
      cp.dispatchWorkgroups(Math.ceil(Math.max(1, v.inW >> i) / 8), Math.ceil(Math.max(1, v.inH >> i) / 8));
    }
    const tx = Math.ceil(v.inW / 16), ty = Math.ceil(v.inH / 16);
    if (!this.skip.has('tile')) { cp.setPipeline(this.pTile); cp.setBindGroup(0, v.bgTile); cp.dispatchWorkgroups(tx, ty); }
    if (!this.skip.has('dilate')) { cp.setPipeline(this.pDilate); cp.setBindGroup(0, v.bgDilate); cp.dispatchWorkgroups(Math.ceil(tx / 8), Math.ceil(ty / 8)); }
    if (!this.skip.has('dof')) { cp.setPipeline(this.pDof); cp.setBindGroup(0, v.bgDof); cp.dispatchWorkgroups(Math.ceil(v.inW / 8), Math.ceil(v.inH / 8)); }
    if (!this.skip.has('psf')) { cp.setPipeline(this.pPsf); cp.setBindGroup(0, v.bgPsf); cp.dispatchWorkgroups(Math.ceil(v.inW / 8), Math.ceil(v.inH / 8)); }
    cp.end();
  }

  capture() { this.captureNext = true; this.forcePresent = true; }
  clearCapture() { for (const v of Object.values(this.views)) if (v) v.hasSnap = false; this.forcePresent = true; }
  present() { this.forcePresent = true; }

  // Developed 8-bit frame of a view, for tests and image export.
  async readFrame(kind) {
    const v = this.views[kind];
    const w = v.canvasW, h = v.canvasH, bpr = Math.ceil(w * 4 / 256) * 256;
    const buf = this.device.createBuffer({ size: bpr * h, usage: U.MAP_READ | U.COPY_DST });
    const enc = this.device.createCommandEncoder();
    enc.copyTextureToBuffer({ texture: v.frameTex }, { buffer: buf, bytesPerRow: bpr }, [w, h]);
    this.device.queue.submit([enc.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const src = new Uint8Array(buf.getMappedRange());
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) rgba.set(src.subarray(y * bpr, y * bpr + w * 4), y * w * 4);
    buf.unmap(); buf.destroy();
    return { w, h, rgba };
  }

  // Linear depth (m) at a main-view input pixel.
  async depthAt(ix, iy) {
    const v = this.views.main;
    if (!v || this.reading) return null;
    this.reading = true;
    const enc = this.device.createCommandEncoder();
    enc.copyTextureToBuffer({ texture: v.depthLin, origin: [Math.max(0, Math.min(v.inW - 1, ix)), Math.max(0, Math.min(v.inH - 1, iy))] }, { buffer: this.readBuf, bytesPerRow: 256 }, [1, 1]);
    this.device.queue.submit([enc.finish()]);
    try {
      await this.readBuf.mapAsync(GPUMapMode.READ);
      const z = new Float32Array(this.readBuf.getMappedRange().slice(0, 4))[0];
      this.readBuf.unmap();
      return z;
    } finally { this.reading = false; }
  }
}
