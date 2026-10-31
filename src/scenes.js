// Sample locations. Each scene is a set of instanced primitives with procedural
// materials, lights and a sky. Coordinates in metres, Y up; the camera looks
// roughly toward +Z with +X to the right of the frame.

export const MAT = {
  DIFFUSE: 0, BRICK: 1, GRASS: 2, FOLIAGE: 3, WOOD: 4, FABRIC: 5, SIEMENS: 6, ZONE: 7, CHECKER: 8,
  METAL: 9, EMIT: 10, WATER: 11, TERRAIN: 12, ASPHALT: 13, TEXT: 14, FUR: 15, FACADE: 16, RULER: 17,
  TILES: 18, PAINT: 19, GLASS: 20, GRAVEL: 21, CONCRETE: 22,
};
export const FLAG = { DOUBLE: 1, TERRAIN: 2, STRETCH: 4, CUTOUT: 8 };
export const INSTANCE_FLOATS = 48;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];

// Rotation matrix (rows) for Euler angles applied Z, then X, then Y.
function rotEuler([rx, ry, rz]) {
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  const Rx = [[1, 0, 0], [0, cx, -sx], [0, sx, cx]];
  const Ry = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]];
  const Rz = [[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]];
  const mul = (A, B) => A.map((r) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
  return mul(Ry, mul(Rx, Rz));
}
// Rotation that maps local +Y onto dir.
function basisY(dir) {
  const y = norm(dir);
  const ref = Math.abs(y[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const x = norm(cross(ref, y));
  const z = cross(x, y);
  return [[x[0], y[0], z[0]], [x[1], y[1], z[1]], [x[2], y[2], z[2]]];
}
// Yaw that turns a card's local -Z face toward a point.
const yawToward = (from, to) => Math.atan2(-(to[0] - from[0]), -(to[2] - from[2]));

function instance({
  mesh, pos = [0, 0, 0], size = [1, 1, 1], rot = [0, 0, 0], R = null, mat = MAT.DIFFUSE, color = [0.5, 0.5, 0.5],
  p1 = [0, 0, 0, 0], p2 = [0, 0, 0, 0], vel = [0, 0, 0], spinRate = 0, spinAxis = [0, 0, 1], pivot = null, flags = 0,
}) {
  const M = R || rotEuler(rot);
  const d = new Float32Array(INSTANCE_FLOATS);
  for (let i = 0; i < 3; i++) {
    d.set([M[i][0] * size[0], M[i][1] * size[1], M[i][2] * size[2], pos[i]], i * 4);
    d.set([M[i][0] / size[0], M[i][1] / size[1], M[i][2] / size[2], 0], 12 + i * 4);
  }
  d.set([...color, mat], 24);
  d.set(p1, 28);
  d.set(p2, 32);
  d.set([...vel, spinRate], 36);
  d.set([...norm(spinAxis), flags], 40);
  const pv = pivot || pos;
  d.set([pv[0], pv[1], pv[2], Math.max(...size)], 44);
  return { mesh, flags, data: d };
}

class Builder {
  constructor() { this.items = []; this.lights = []; }
  add(o) { this.items.push(instance(o)); return this; }
  box(pos, size, mat, color, o = {}) { return this.add({ mesh: 'cube', pos, size, mat, color, ...o }); }
  ball(pos, size, mat, color, o = {}) { return this.add({ mesh: 'sphere', pos, size: Array.isArray(size) ? size : [size, size, size], mat, color, ...o }); }
  cyl(pos, size, mat, color, o = {}) { return this.add({ mesh: 'cylinder', pos, size, mat, color, ...o }); }
  cone(pos, size, mat, color, o = {}) { return this.add({ mesh: 'cone', pos, size, mat, color, ...o }); }
  plane(pos, size, mat, color, o = {}) { return this.add({ mesh: 'plane', pos, size: [size[0], 1, size[1]], mat, color, ...o }); }
  // A thin rod between two points.
  rod(a, b, radius, mat, color, o = {}) {
    const d = sub(b, a);
    const len = Math.hypot(...d);
    return this.add({ mesh: 'cylinder', pos: scale(add(a, b), 0.5), size: [radius * 2, len, radius * 2], R: basisY(d), mat, color, ...o });
  }
  light(pos, color, intensity, o = {}) { this.lights.push({ pos, color, intensity, radius: o.radius ?? 0.1, vel: o.vel ?? [0, 0, 0] }); return this; }
  // Catenary string of bulbs between two posts; returns bulb positions.
  stringLights(a, b, sag, count, color, intensity, o = {}) {
    const pts = [];
    const segs = 18;
    let prev = a;
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t];
      this.rod(prev, p, 0.004, MAT.DIFFUSE, [0.02, 0.02, 0.02]);
      prev = p;
    }
    const r = rng(o.seed ?? 7);
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t) - 0.07, a[2] + (b[2] - a[2]) * t];
      const k = 0.8 + 0.4 * r();
      this.ball(p, [0.045, 0.06, 0.045], MAT.EMIT, color, { p1: [intensity * k, 0, 0, 0] });
      pts.push(p);
    }
    return pts;
  }
  pack() {
    // Group by mesh so each mesh is drawn with one instanced call.
    const order = ['cube', 'sphere', 'cylinder', 'cone', 'plane', 'grid'];
    const groups = [];
    const sorted = [];
    for (const mesh of order) {
      const list = this.items.filter((it) => it.mesh === mesh);
      if (!list.length) continue;
      groups.push({ mesh, first: sorted.length, count: list.length });
      sorted.push(...list);
    }
    const data = new Float32Array(Math.max(1, sorted.length) * INSTANCE_FLOATS);
    sorted.forEach((it, i) => data.set(it.data, i * INSTANCE_FLOATS));
    return { data, groups, count: sorted.length };
  }
}

// Terrain height used for tree placement; mirrors terrainHeight() in the shader.
function hash12(x, y) {
  let p3x = (x * 0.1031) % 1, p3y = (y * 0.1031) % 1, p3z = (x * 0.1031) % 1;
  p3x = p3x < 0 ? p3x + 1 : p3x; p3y = p3y < 0 ? p3y + 1 : p3y; p3z = p3z < 0 ? p3z + 1 : p3z;
  const d = p3x * (p3y + 33.33) + p3y * (p3z + 33.33) + p3z * (p3x + 33.33);
  p3x += d; p3y += d; p3z += d;
  const v = (p3x + p3y) * p3z;
  return v - Math.floor(v);
}
function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash12(ix, iy), b = hash12(ix + 1, iy), c = hash12(ix, iy + 1), d = hash12(ix + 1, iy + 1);
  return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy;
}
export function terrainHeight(x, z) {
  const qx = x / 1500, qz = (z - 1100) / 1300;
  const d = Math.hypot(qx, qz);
  let h = (d - 1) * 140;
  let n = 0, a = 0.5, px = x / 2200 + 3.1, pz = z / 2200 + 1.7;
  for (let i = 0; i < 6; i++) {
    const r = 1 - Math.abs(vnoise(px, pz) * 2 - 1);
    n += a * r * r;
    px = px * 2.03 + 17.1; pz = pz * 2.03 + 9.2; a *= 0.5;
  }
  const far = Math.min(1, Math.max(0, (qz - 1.2) / 2.6));
  const mtn = far * far * (3 - 2 * far);
  h += mtn * (250 + 1700 * n * n);
  h += (vnoise(x / 300, z / 300) - 0.5) * 50 * Math.min(1, Math.max(0, (d - 0.95) * 4));
  return h;
}

// --- Scenes ------------------------------------------------------------------------

function garden() {
  const b = new Builder();
  const R = rng(11);
  b.plane([0, 0, 20], [320, 320], MAT.GRASS, [0.1, 0.15, 0.04]);
  b.plane([0.35, 0.004, -3.2], [1.3, 8], MAT.GRAVEL, [0.33, 0.29, 0.24], { rot: [0, 0.12, 0] });

  // Bench
  const wood = [0.36, 0.2, 0.1], iron = [0.05, 0.05, 0.05];
  for (let k = 0; k < 4; k++) b.box([0, 0.45, -0.17 + k * 0.115], [1.7, 0.035, 0.1], MAT.WOOD, wood, { p1: [0.1, 0, 0, 0] });
  for (let k = 0; k < 3; k++) b.box([0, 0.62 + k * 0.13, 0.27 + k * 0.02], [1.7, 0.09, 0.03], MAT.WOOD, wood, { rot: [-0.18, 0, 0], p1: [0.1, 0, 0, 0] });
  for (const x of [-0.78, 0.78]) {
    b.box([x, 0.225, -0.17], [0.05, 0.45, 0.05], MAT.METAL, iron, { p1: [0.45, 0, 0, 0] });
    b.box([x, 0.45, 0.28], [0.05, 0.9, 0.05], MAT.METAL, iron, { p1: [0.45, 0, 0, 0] });
    b.box([x, 0.67, 0.04], [0.06, 0.035, 0.52], MAT.METAL, iron, { p1: [0.45, 0, 0, 0] });
  }

  // Teddy bear
  const fur = [0.42, 0.24, 0.1], tx = -0.18;
  b.ball([tx, 0.66, 0.03], [0.34, 0.4, 0.3], MAT.FUR, fur);
  b.ball([tx, 0.95, -0.0], [0.28, 0.26, 0.26], MAT.FUR, fur);
  for (const s of [-1, 1]) {
    b.ball([tx + s * 0.11, 1.065, 0.01], [0.1, 0.1, 0.06], MAT.FUR, fur);
    b.ball([tx + s * 0.18, 0.68, -0.05], [0.11, 0.24, 0.11], MAT.FUR, fur, { rot: [0.25, 0, s * 0.35] });
    b.ball([tx + s * 0.09, 0.51, -0.17], [0.13, 0.13, 0.27], MAT.FUR, fur);
    b.ball([tx + s * 0.055, 0.985, -0.115], 0.034, MAT.DIFFUSE, [0.01, 0.01, 0.01], { p1: [0.06, 0, 0.6, 0] });
    b.ball([tx + s * 0.04, 0.835, -0.125], [0.07, 0.05, 0.03], MAT.FABRIC, [0.45, 0.02, 0.03], { p1: [0.0006, 0, 0, 0], p2: [0.3, 0.01, 0.02, 0] });
  }
  b.ball([tx, 0.915, -0.115], [0.12, 0.09, 0.09], MAT.FUR, [0.62, 0.45, 0.28]);
  b.ball([tx, 0.94, -0.16], [0.045, 0.032, 0.03], MAT.DIFFUSE, [0.015, 0.01, 0.008], { p1: [0.15, 0, 0.6, 0] });

  // Blanket and book
  b.box([0.42, 0.49, -0.01], [0.56, 0.05, 0.36], MAT.FABRIC, [0.55, 0.05, 0.04], { p1: [0.0016, 1, 0.025, 0], p2: [0.82, 0.78, 0.68, 0] });
  b.box([0.66, 0.53, -0.05], [0.2, 0.03, 0.15], MAT.TEXT, [0.78, 0.76, 0.7], { rot: [0, 0.3, 0], p1: [0.003, 0, 0, 1], p2: [0.03, 0.03, 0.03, 0] });

  // Flower pot with a pinwheel
  const pot = [-1.12, 0, -0.38];
  b.cyl([pot[0], 0.17, pot[2]], [0.32, 0.34, 0.32], MAT.DIFFUSE, [0.42, 0.13, 0.06], { p1: [0.7, 0, 0, 0] });
  b.ball([pot[0], 0.47, pot[2]], [0.44, 0.3, 0.44], MAT.FOLIAGE, [0.06, 0.14, 0.03], { p1: [0.025, 0, 0, 0] });
  const petals = [[0.8, 0.15, 0.3], [0.9, 0.75, 0.1], [0.85, 0.82, 0.8], [0.7, 0.1, 0.45]];
  for (let i = 0; i < 11; i++) {
    const a = R() * Math.PI * 2, r = 0.05 + R() * 0.14;
    b.ball([pot[0] + Math.cos(a) * r, 0.56 + R() * 0.08, pot[2] + Math.sin(a) * r], 0.05 + R() * 0.02, MAT.DIFFUSE, petals[i % 4], { p1: [0.55, 0, 0, 0] });
  }
  const hub = [pot[0] + 0.05, 0.98, pot[2] - 0.02];
  b.cyl([hub[0], 0.72, hub[2] + 0.02], [0.012, 0.56, 0.012], MAT.WOOD, [0.5, 0.35, 0.2]);
  const bladeCols = [[0.8, 0.06, 0.05], [0.95, 0.75, 0.05], [0.05, 0.25, 0.75], [0.1, 0.55, 0.15]];
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2;
    b.box([hub[0] + Math.cos(a) * 0.065, hub[1] + Math.sin(a) * 0.065, hub[2]], [0.12, 0.055, 0.004], MAT.PAINT, bladeCols[k],
      { rot: [0, 0, a + 0.4], spinRate: 9, spinAxis: [0, 0, 1], pivot: hub, p1: [0.25, 0, 0, 0] });
  }

  // Hedge, lamp post, string lights
  b.box([0, 0.65, 5.6], [16, 1.3, 1.0], MAT.FOLIAGE, [0.045, 0.09, 0.025], { p1: [0.03, 0, 0, 0] });
  b.cyl([2.5, 1.6, 3.2], [0.09, 3.2, 0.09], MAT.METAL, iron, { p1: [0.4, 0, 0, 0] });
  b.ball([2.5, 3.3, 3.2], 0.32, MAT.EMIT, [1.0, 0.8, 0.55], { p1: [14, 0, 0, 0] });
  b.cyl([-3.3, 1.4, 3.9], [0.08, 2.8, 0.08], MAT.METAL, iron);
  b.cyl([3.7, 1.4, 6.6], [0.08, 2.8, 0.08], MAT.METAL, iron);
  b.cyl([-6.2, 1.5, 9.2], [0.08, 3.0, 0.08], MAT.METAL, iron);
  b.cyl([7.2, 1.5, 11.8], [0.08, 3.0, 0.08], MAT.METAL, iron);
  const warm = [1.0, 0.6, 0.28];
  b.stringLights([-3.3, 2.78, 3.9], [3.7, 2.78, 6.6], 0.55, 22, warm, 160, { seed: 3 });
  b.stringLights([-6.2, 2.98, 9.2], [7.2, 2.98, 11.8], 0.8, 30, warm, 160, { seed: 4 });

  // Trees with see-through canopies
  const trees = [[-6.5, 10, 6.5, 3.0], [-2.4, 14.5, 7.5, 3.4], [3.2, 13, 6.2, 2.9], [7.8, 9.8, 7.0, 3.1],
    [11.5, 17, 8, 3.6], [-11.5, 15, 7, 3.3], [0.8, 23, 9, 4.2], [-7.5, 27, 8.5, 3.9], [6.5, 29, 9, 4.1], [-16, 22, 9, 4.2]];
  for (const [x, z, h, r] of trees) {
    b.cyl([x, h * 0.32, z], [0.36, h * 0.64, 0.36], MAT.WOOD, [0.12, 0.08, 0.05], { p1: [0.36, 2, 0, 0] });
    b.ball([x, h * 0.72, z], [r * 2, r * 1.7, r * 2], MAT.FOLIAGE, [0.07, 0.12, 0.03], { p1: [0.06, 0.3, 0, 0], flags: FLAG.CUTOUT | FLAG.DOUBLE });
    b.ball([x + r * 0.6, h * 0.62, z - 0.4], [r * 1.2, r * 1.1, r * 1.2], MAT.FOLIAGE, [0.08, 0.13, 0.03], { p1: [0.06, 0.32, 0, 0], flags: FLAG.CUTOUT | FLAG.DOUBLE });
    b.ball([x - r * 0.5, h * 0.86, z + 0.5], [r * 1.3, r * 1.0, r * 1.3], MAT.FOLIAGE, [0.06, 0.11, 0.03], { p1: [0.06, 0.35, 0, 0], flags: FLAG.CUTOUT | FLAG.DOUBLE });
  }
  for (let i = 0; i < 16; i++) {
    const x = -90 + i * 12 + R() * 6, z = 70 + R() * 30;
    b.ball([x, 5, z], [18 + R() * 8, 14 + R() * 8, 10], MAT.FOLIAGE, [0.05, 0.09, 0.025], { p1: [0.12, 0, 0, 0] });
  }

  const subject = [tx - 0.055, 0.985, -0.115];
  return {
    id: 'garden', name: 'Garden bench, golden hour', ev100: 12.5,
    blurb: 'Backlit teddy on a bench. String lights, leaf gaps and a low sun test bokeh, flare and sun stars.',
    ko: { name: '정원 벤치, 골든아워', blurb: '벤치 위 역광 테디베어. 줄 조명, 나뭇잎 사이 빛, 낮은 해로 보케·플레어·빛갈라짐을 확인합니다.' },
    built: b.pack(), lights: b.lights, illuminant: [1.0, 0.93, 0.84],
    sun: { dir: norm([0.33, 0.13, 1.0]), color: [1.0, 0.68, 0.4], irradiance: 2.0, disc: 18000, size: 0.0047, shadow: true },
    sky: { zenith: [0.26, 0.38, 0.72], horizon: [1.5, 1.08, 0.72], ground: [0.12, 0.1, 0.06], ambient: 0.95, clouds: 0.25, stars: 0 },
    fog: { density: 1 / 450, color: [1.3, 0.95, 0.66] },
    shadow: { center: [0, 0, 6], half: 18, depth: 80 },
    camera: { subject, dir: norm([0.2, 0.14, -1]), frame: [-0.28, -0.2], distance: 2.4, min: 0.5, max: 14 },
    maxSpeed: 1.0, sceneIndex: 0,
  };
}

function street() {
  const b = new Builder();
  const R = rng(23);
  b.plane([0, 0, 180], [9, 420], MAT.ASPHALT, [0.06, 0.06, 0.065], { p1: [0.8, 1, 0, 0] });
  for (const s of [-1, 1]) {
    b.box([s * 6.1, 0.075, 180], [3.2, 0.15, 420], MAT.CONCRETE, [0.2, 0.19, 0.18], { p1: [0.6, 0, 0, 0] });
    b.box([s * 4.55, 0.08, 180], [0.18, 0.16, 420], MAT.CONCRETE, [0.25, 0.24, 0.22], { p1: [0, 0, 0, 0] });
  }
  // Buildings with lit windows and shop fronts
  const walls = [[0.32, 0.12, 0.08], [0.25, 0.23, 0.21], [0.4, 0.32, 0.22], [0.18, 0.16, 0.15], [0.3, 0.18, 0.12]];
  for (const s of [-1, 1]) {
    let z = -8;
    while (z < 280) {
      const w = 9 + R() * 7, h = 9 + R() * 18;
      b.box([s * 11.35, h / 2, z + w / 2], [7.3, h, w - 0.3], MAT.FACADE, walls[Math.floor(R() * walls.length)],
        { p1: [3.3, 0.35 + R() * 0.3, 1, Math.floor(R() * 4)] });
      if (R() < 0.75) {
        const warmth = R() < 0.7 ? [1.0, 0.72, 0.45] : [0.75, 0.85, 1.0];
        b.box([s * 7.69, 1.5, z + w / 2], [0.04, 2.4, w * 0.62], MAT.EMIT, warmth, { p1: [4 + R() * 8, 1, 0, 0] });
      }
      z += w;
    }
  }
  b.box([0, 15, 285], [40, 30, 4], MAT.FACADE, [0.22, 0.2, 0.19], { p1: [3.3, 0.5, 1, 2] });

  // Neon signs
  const neonPink = [1.0, 0.12, 0.55], neonCyan = [0.1, 0.85, 1.0];
  b.box([-7.35, 4.3, 9.5], [0.1, 2.2, 0.7], MAT.TEXT, [0.03, 0.02, 0.03], { rot: [0, Math.PI / 2, 0], p1: [0.11, 1, 40, 1], p2: [...neonPink, 0] });
  b.box([-7.3, 5.45, 9.5], [0.04, 0.05, 0.8], MAT.EMIT, neonPink, { p1: [90, 2, 0, 0] });
  b.box([-7.3, 3.15, 9.5], [0.04, 0.05, 0.8], MAT.EMIT, neonPink, { p1: [90, 2, 0, 0] });
  b.box([7.6, 3.7, 17], [0.1, 0.7, 3.2], MAT.TEXT, [0.02, 0.03, 0.04], { rot: [0, -Math.PI / 2, 0], p1: [0.2, 1, 35, 1], p2: [...neonCyan, 0] });
  b.box([7.55, 4.1, 17], [0.04, 0.04, 3.4], MAT.EMIT, neonCyan, { p1: [80, 2, 0, 0] });
  b.box([7.55, 3.3, 17], [0.04, 0.04, 3.4], MAT.EMIT, neonCyan, { p1: [80, 2, 0, 0] });
  b.cyl([-7.4, 4.8, 36], [0.9, 0.08, 0.9], MAT.EMIT, [1.0, 0.25, 0.1], { rot: [0, 0, Math.PI / 2], p1: [50, 2, 0, 0] });
  b.box([7.5, 6.5, 52], [0.1, 3.5, 0.8], MAT.TEXT, [0.02, 0.02, 0.02], { rot: [0, -Math.PI / 2, 0], p1: [0.14, 1, 30, 1], p2: [1.0, 0.7, 0.2, 0] });

  // Street lamps
  const lampCol = [1.0, 0.82, 0.62];
  let li = 0;
  for (let z = 5; z < 200; z += 18) {
    for (const s of [-1, 1]) {
      const x = s * 4.85;
      b.cyl([x, 2.75, z], [0.14, 5.5, 0.14], MAT.METAL, [0.04, 0.04, 0.045], { p1: [0.4, 0, 0, 0] });
      b.box([x - s * 0.55, 5.45, z], [1.2, 0.08, 0.08], MAT.METAL, [0.04, 0.04, 0.045]);
      b.box([x - s * 1.0, 5.39, z], [0.5, 0.05, 0.22], MAT.EMIT, lampCol, { p1: [700, 0, 0, 0] });
      if (li < 14) b.light([x - s * 1.0, 5.2, z], lampCol, 8, { radius: 0.3 });
      li++;
    }
  }
  // Café string lights
  const warm = [1.0, 0.6, 0.28];
  for (const [z, seed] of [[9, 1], [12, 2], [15, 3]]) {
    b.stringLights([-7.6, 5.0, z], [7.6, 5.2, z + 1.2], 0.9, 26, warm, 320, { seed });
    b.light([0, 4.4, z + 0.6], warm, 0.7, { radius: 2 });
  }
  // Café tables
  for (const z of [8, 11.5, 15]) {
    b.cyl([-6.3, 0.9, z], [0.7, 0.03, 0.7], MAT.METAL, [0.5, 0.5, 0.52], { p1: [0.25, 0, 0, 0] });
    b.cyl([-6.3, 0.52, z], [0.05, 0.75, 0.05], MAT.METAL, [0.1, 0.1, 0.1]);
    for (const dz of [-0.55, 0.55]) {
      b.box([-6.3, 0.62, z + dz], [0.42, 0.04, 0.4], MAT.WOOD, [0.3, 0.17, 0.08]);
      b.box([-6.3, 0.85, z + dz * 1.4], [0.42, 0.45, 0.03], MAT.WOOD, [0.3, 0.17, 0.08]);
    }
  }

  // Cars
  const car = (x, z, color, dir, vel, lightsOn) => {
    const v = vel || [0, 0, 0];
    const f = dir; // +1 faces +z
    b.box([x, 0.62, z], [1.8, 0.62, 4.3], MAT.PAINT, color, { vel: v, p1: [0.3, 0, 0, 0] });
    b.box([x, 1.17, z - f * 0.2], [1.62, 0.5, 2.1], MAT.GLASS, [0.02, 0.02, 0.025], { vel: v });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      b.cyl([x + sx * 0.84, 0.31, z + sz * 1.35], [0.62, 0.24, 0.62], MAT.DIFFUSE, [0.015, 0.015, 0.015], { rot: [0, 0, Math.PI / 2], vel: v, p1: [0.6, 0, 0, 0] });
    }
    for (const sx of [-1, 1]) {
      const head = [x + sx * 0.62, 0.7, z + f * 2.16], tail = [x + sx * 0.66, 0.78, z - f * 2.16];
      if (lightsOn) {
        b.ball(head, [0.22, 0.13, 0.06], MAT.EMIT, [1.0, 0.95, 0.85], { vel: v, p1: [2600, 0, 0, 0], flags: FLAG.STRETCH });
        b.box(tail, [0.34, 0.1, 0.04], MAT.EMIT, [1.0, 0.04, 0.02], { vel: v, p1: [260, 0, 0, 0], flags: FLAG.STRETCH });
      } else {
        b.box(tail, [0.34, 0.1, 0.04], MAT.PAINT, [0.3, 0.01, 0.01], { vel: v });
      }
    }
  };
  const paints = [[0.5, 0.5, 0.52], [0.03, 0.05, 0.12], [0.35, 0.02, 0.02], [0.02, 0.02, 0.02], [0.6, 0.55, 0.45]];
  [12, 21.5, 33, 47, 62].forEach((z, i) => car(3.3, z, paints[i % paints.length], 1, null, false));
  car(-2.0, 45, [0.6, 0.6, 0.62], -1, [0, 0, -11], true);
  car(1.3, 22, [0.05, 0.08, 0.2], 1, [0, 0, 8], true);
  b.light([-1.4, 0.7, 42.6], [1.0, 0.95, 0.85], 30, { vel: [0, 0, -11], radius: 0.4 });
  b.light([-2.6, 0.7, 42.6], [1.0, 0.95, 0.85], 30, { vel: [0, 0, -11], radius: 0.4 });
  // Coloured spill from the neon signs
  b.light([-6.6, 4.3, 9.5], neonPink, 2.5, { radius: 0.6 });
  b.light([6.9, 3.7, 17], neonCyan, 2.5, { radius: 0.8 });

  // Traffic light far down the road
  b.cyl([4.6, 2.5, 118], [0.16, 5, 0.16], MAT.METAL, [0.03, 0.03, 0.03]);
  b.box([4.6, 5.2, 118], [0.35, 1.0, 0.3], MAT.PAINT, [0.02, 0.02, 0.02]);
  b.ball([4.6, 5.5, 117.84], 0.2, MAT.EMIT, [1.0, 0.05, 0.02], { p1: [900, 0, 0, 0] });
  b.ball([4.6, 5.2, 117.84], 0.2, MAT.EMIT, [1.0, 0.6, 0.05], { p1: [8, 0, 0, 0] });
  b.ball([4.6, 4.9, 117.84], 0.2, MAT.EMIT, [0.1, 1.0, 0.4], { p1: [8, 0, 0, 0] });

  // Red post box (subject)
  const mb = [-5.0, 0.15, 2.2];
  const red = [0.5, 0.02, 0.015];
  b.cyl([mb[0], mb[1] + 0.48, mb[2]], [0.44, 0.96, 0.44], MAT.PAINT, red, { p1: [0.35, 0, 0, 0] });
  b.ball([mb[0], mb[1] + 0.96, mb[2]], [0.44, 0.3, 0.44], MAT.PAINT, red, { p1: [0.35, 0, 0, 0] });
  b.cyl([mb[0], mb[1] + 0.05, mb[2]], [0.5, 0.1, 0.5], MAT.PAINT, [0.02, 0.02, 0.02]);
  const camApprox = [-4.7, 1.5, -0.1];
  // Warm spill from a shop window behind the camera lights the post box.
  b.light([-6.4, 2.0, -0.6], [1.0, 0.72, 0.45], 0.9, { radius: 0.8 });
  const yaw = yawToward(mb, camApprox);
  const fwd = [Math.sin(yaw) * -0.225, 0, Math.cos(yaw) * -0.225];
  const plaque = [mb[0] + fwd[0], mb[1] + 0.72, mb[2] + fwd[2]];
  b.box(plaque, [0.24, 0.14, 0.012], MAT.TEXT, [0.75, 0.72, 0.62], { rot: [0, yaw, 0], p1: [0.011, 0, 0, 1], p2: [0.02, 0.02, 0.02, 0] });
  b.box([mb[0] + fwd[0] * 1.02, mb[1] + 0.9, mb[2] + fwd[2] * 1.02], [0.22, 0.028, 0.02], MAT.DIFFUSE, [0.005, 0.005, 0.005], { rot: [0, yaw, 0] });

  return {
    id: 'street', name: 'City street at night', ev100: 4.5,
    blurb: 'Street lamps, neon and moving cars. Shows noise at high ISO, light trails and point-light bokeh.',
    ko: { name: '밤의 도시 거리', blurb: '가로등, 네온, 지나가는 차. 고감도 노이즈, 빛 궤적, 점광원 보케를 확인합니다.' },
    built: b.pack(), lights: b.lights, illuminant: [1.0, 0.86, 0.68],
    sun: { dir: norm([-0.32, 0.4, 1.0]), color: [0.75, 0.82, 1.0], irradiance: 0.004, disc: 140, size: 0.0046, shadow: false },
    sky: { zenith: [0.003, 0.005, 0.012], horizon: [0.035, 0.025, 0.02], ground: [0.01, 0.01, 0.01], ambient: 0.6, clouds: 0, stars: 1 },
    fog: { density: 1 / 240, color: [0.03, 0.022, 0.018] },
    shadow: { center: [0, 0, 10], half: 20, depth: 60 },
    camera: { subject: plaque, dir: norm([0.12, 0.16, -1]), frame: [-0.55, -0.15], distance: 2.2, min: 0.6, max: 9 },
    maxSpeed: 11, sceneIndex: 1,
  };
}

function lake() {
  const b = new Builder();
  const R = rng(5);
  b.plane([0, 0, 8000], [32000, 32000], MAT.WATER, [0.02, 0.05, 0.06]);
  b.add({ mesh: 'grid', pos: [0, 0, 1500], size: [26000, 1, 26000], mat: MAT.TERRAIN, color: [0.3, 0.3, 0.3], flags: FLAG.TERRAIN });

  // Islet and shoreline forest
  const isle = [-230, -6, 460];
  b.ball(isle, [150, 28, 105], MAT.TERRAIN, [0.3, 0.3, 0.3]);
  const pine = [0.035, 0.06, 0.03];
  for (let i = 0; i < 34; i++) {
    const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 0.82;
    const dx = Math.cos(a) * r * 70, dz = Math.sin(a) * r * 48;
    const top = isle[1] + 14 * Math.sqrt(Math.max(0, 1 - (dx / 75) ** 2 - (dz / 52) ** 2));
    const h = 11 + R() * 9;
    b.cone([isle[0] + dx, top + h / 2 - 1, isle[2] + dz], [h * 0.36, h, h * 0.36], MAT.FOLIAGE, pine, { p1: [0.25, 0, 0, 0] });
  }
  let placed = 0;
  for (let i = 0; i < 2000 && placed < 320; i++) {
    const a = -0.2 + R() * (Math.PI + 0.4);
    const ring = 0.98 + R() * 0.4;
    const x = Math.cos(a) * 1500 * ring, z = 1100 + Math.sin(a) * 1300 * ring;
    const h = terrainHeight(x, z);
    if (h < 2 || h > 260) continue;
    const t = 16 + R() * 14;
    b.cone([x, h + t / 2 - 3, z], [t * 0.38, t, t * 0.38], MAT.FOLIAGE, pine, { p1: [0.4, 0, 0, 0] });
    placed++;
  }

  // Pier
  const plankWood = [0.3, 0.2, 0.12];
  b.box([0, 0.42, 9], [2.4, 0.12, 22], MAT.WOOD, plankWood, { p1: [0.14, 1, 0, 0] });
  for (let z = -1; z <= 19; z += 4) for (const x of [-1.15, 1.15]) {
    b.cyl([x, -0.35, z], [0.22, 1.9, 0.22], MAT.WOOD, [0.16, 0.11, 0.07], { p1: [0.22, 2, 0, 0] });
  }
  for (const x of [-1.05, 1.05]) b.cyl([x, 0.65, 19.8], [0.18, 0.5, 0.18], MAT.WOOD, [0.18, 0.12, 0.07], { p1: [0.18, 2, 0, 0] });

  // Lantern (subject), rope and rowboat
  const ln = [0.55, 0.48, 3.4];
  const brass = [0.55, 0.38, 0.16];
  b.box([ln[0], ln[1] + 0.02, ln[2]], [0.2, 0.04, 0.2], MAT.METAL, brass, { p1: [0.3, 0, 0, 0] });
  for (const [dx, dz] of [[-0.085, -0.085], [0.085, -0.085], [-0.085, 0.085], [0.085, 0.085]]) {
    b.box([ln[0] + dx, ln[1] + 0.16, ln[2] + dz], [0.014, 0.25, 0.014], MAT.METAL, brass, { p1: [0.3, 0, 0, 0] });
  }
  b.cyl([ln[0], ln[1] + 0.08, ln[2]], [0.05, 0.09, 0.05], MAT.DIFFUSE, [0.8, 0.76, 0.66], { p1: [0.5, 0, 0, 0] });
  b.ball([ln[0], ln[1] + 0.165, ln[2]], [0.03, 0.065, 0.03], MAT.EMIT, [1.0, 0.62, 0.25], { p1: [80, 0, 0, 0] });
  b.cone([ln[0], ln[1] + 0.33, ln[2]], [0.25, 0.1, 0.25], MAT.METAL, brass, { p1: [0.3, 0, 0, 0] });
  b.ball([ln[0], ln[1] + 0.4, ln[2]], 0.04, MAT.METAL, brass, { p1: [0.3, 0, 0, 0] });
  b.cyl([-0.55, 0.52, 5.2], [0.46, 0.09, 0.46], MAT.FABRIC, [0.55, 0.47, 0.32], { p1: [0.004, 2, 0, 0], p2: [0.4, 0.33, 0.22, 0] });
  b.ball([2.5, 0.08, 8.0], [1.3, 0.7, 3.9], MAT.PAINT, [0.7, 0.68, 0.62], { p1: [0.4, 0, 0, 0] });
  b.ball([2.5, 0.25, 8.0], [1.12, 0.5, 3.5], MAT.WOOD, [0.28, 0.16, 0.08], { p1: [0.12, 0, 0, 0] });

  // Sailboat drifting far out
  const sv = [-2.5, 0, 0];
  b.box([140, 0.4, 380], [2.4, 0.8, 7], MAT.PAINT, [0.75, 0.75, 0.72], { vel: sv });
  b.cyl([140, 5.6, 380.5], [0.15, 10, 0.15], MAT.METAL, [0.4, 0.4, 0.4], { vel: sv });
  b.box([140, 5.5, 379], [0.05, 8, 3.6], MAT.FABRIC, [0.8, 0.78, 0.74], { vel: sv, p1: [0.002, 0, 0, 0], p2: [0.75, 0.73, 0.7, 0] });

  return {
    id: 'lake', name: 'Mountain lake, afternoon', ev100: 14.5,
    blurb: 'Pier, lantern and a lake running to snowy peaks. Shows distortion, haze, hyperfocal depth and diffraction at f/16.',
    ko: { name: '산정 호수, 오후', blurb: '부두와 랜턴, 눈 덮인 봉우리까지 이어지는 호수. 왜곡, 대기 원근, 과초점, f/16 회절을 확인합니다.' },
    built: b.pack(), lights: b.lights, illuminant: [1.0, 0.98, 0.95],
    sun: { dir: norm([-0.55, 0.5, 0.68]), color: [1.0, 0.94, 0.84], irradiance: 1.6, disc: 30000, size: 0.0047, shadow: true },
    sky: { zenith: [0.14, 0.3, 0.78], horizon: [0.85, 0.95, 1.1], ground: [0.1, 0.12, 0.1], ambient: 0.55, clouds: 0.55, stars: 0 },
    fog: { density: 1 / 15000, color: [0.85, 0.95, 1.1] },
    shadow: { center: [0, 0, 7], half: 14, depth: 60 },
    camera: { subject: [ln[0], ln[1] + 0.16, ln[2]], dir: norm([-0.25, 0.24, -1]), frame: [0.22, -0.62], distance: 3.0, min: 0.6, max: 12 },
    maxSpeed: 2.5, sceneIndex: 2,
  };
}

function bench() {
  const b = new Builder();
  const R = rng(31);
  b.plane([0, 0, 2], [12, 12], MAT.WOOD, [0.28, 0.17, 0.09], { p1: [0.12, 0, 0, 0] });
  b.box([0, 2, 4.35], [8, 4, 0.1], MAT.TILES, [0.74, 0.73, 0.69], { p1: [0.15, 0.004, 0, 0] });
  b.box([-2.6, 2, 1.5], [0.1, 4, 8], MAT.BRICK, [0.55, 0.53, 0.5], { p1: [0.215, 0.065, 0.01, 1] });
  b.box([3.4, 2, 1.5], [0.1, 4, 8], MAT.DIFFUSE, [0.05, 0.05, 0.05]);
  b.box([0, 3.2, 1.5], [8, 0.1, 8], MAT.DIFFUSE, [0.2, 0.2, 0.2]);

  // Table
  b.box([0, 0.725, 1.65], [2.0, 0.05, 2.8], MAT.WOOD, [0.42, 0.26, 0.13], { p1: [0.18, 0, 0, 0] });
  for (const [x, z] of [[-0.95, 0.3], [0.95, 0.3], [-0.95, 3.0], [0.95, 3.0]]) b.box([x, 0.35, z], [0.06, 0.7, 0.06], MAT.WOOD, [0.2, 0.12, 0.06]);

  const cam = [0.06, 1.2, 0.35];
  const card = (pos, size, mat, color, o = {}) => b.box(pos, size, mat, color, { rot: [0, yawToward(pos, cam), 0], ...o });
  const star = [0, 0.92, 1.6];
  card(star, [0.28, 0.28, 0.006], MAT.SIEMENS, [0.8, 0.8, 0.8], { p1: [36, 0, 0, 0] });
  b.box([0, 0.765, 1.62], [0.1, 0.03, 0.06], MAT.DIFFUSE, [0.05, 0.05, 0.05]);
  card([-0.37, 0.85, 1.45], [0.18, 0.18, 0.005], MAT.ZONE, [0.8, 0.8, 0.8], { p1: [9000, 0, 0, 0] });
  card([0.35, 0.84, 1.42], [0.26, 0.18, 0.006], MAT.CHECKER, [0.03, 0.03, 0.03]);
  card([0.64, 0.89, 2.05], [0.2, 0.27, 0.005], MAT.TEXT, [0.8, 0.79, 0.75], { p1: [0.0032, 0, 0, 0], p2: [0.02, 0.02, 0.02, 0] });
  card([-0.62, 0.9, 1.95], [0.24, 0.3, 0.02], MAT.FABRIC, [0.04, 0.06, 0.16], { p1: [0.00045, 0, 0, 0], p2: [0.12, 0.15, 0.3, 0] });
  b.box([0.78, 0.81, 0.95], [0.3, 0.12, 0.3], MAT.FABRIC, [0.6, 0.05, 0.04], { rot: [0, 0.4, 0], p1: [0.0008, 1, 0.012, 0], p2: [0.85, 0.82, 0.76, 0] });
  b.box([0.14, 0.752, 1.35], [0.035, 0.004, 1.2], MAT.RULER, [0.62, 0.46, 0.05], { rot: [0, 0.16, 0] });
  for (const p of [[-0.27, 0.795, 0.95], [0.5, 0.795, 2.35], [-0.55, 0.795, 2.75]]) b.ball(p, 0.09, MAT.METAL, [0.92, 0.92, 0.94], { p1: [0.03, 0, 0, 0] });
  b.cyl([-0.12, 0.8, 1.08], [0.09, 0.1, 0.09], MAT.DIFFUSE, [0.08, 0.25, 0.4], { p1: [0.15, 0, 0.5, 0] });

  // Desk fan with spinning blades
  const hub = [0.82, 1.0, 1.3];
  b.cyl([hub[0], 0.765, hub[2]], [0.16, 0.03, 0.16], MAT.PAINT, [0.85, 0.85, 0.82], { p1: [0.3, 0, 0, 0] });
  b.cyl([hub[0], 0.875, hub[2]], [0.025, 0.21, 0.025], MAT.METAL, [0.7, 0.7, 0.7], { p1: [0.25, 0, 0, 0] });
  b.ball([hub[0], hub[1], hub[2] + 0.02], [0.06, 0.06, 0.07], MAT.PAINT, [0.85, 0.85, 0.82], { p1: [0.3, 0, 0, 0] });
  for (let k = 0; k < 3; k++) {
    const a = k * Math.PI * 2 / 3;
    b.box([hub[0] + Math.cos(a) * 0.08, hub[1] + Math.sin(a) * 0.08, hub[2] - 0.02], [0.13, 0.05, 0.004], MAT.PAINT, [0.15, 0.45, 0.65],
      { rot: [0, 0, a + 0.3], spinRate: 113, spinAxis: [0, 0, 1], pivot: hub, p1: [0.3, 0, 0, 0] });
  }

  // LED string on the back wall and a practical lamp
  const pts = [];
  for (let i = 0; i < 40; i++) {
    const x = -1.7 + i * 0.087;
    pts.push([x, 1.55 + 0.22 * Math.sin(x * 3.7) + 0.08 * R(), 4.27]);
  }
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) b.rod(pts[i - 1], pts[i], 0.002, MAT.DIFFUSE, [0.02, 0.02, 0.02]);
    b.ball(pts[i], [0.025, 0.035, 0.025], MAT.EMIT, [1.0, 0.78, 0.5], { p1: [240, 0, 0, 0] });
  }
  b.ball([1.6, 1.6, 3.6], 0.25, MAT.EMIT, [1.0, 0.68, 0.38], { p1: [26, 0, 0, 0] });
  b.light([1.6, 1.6, 3.4], [1.0, 0.68, 0.38], 1.2, { radius: 0.3 });

  return {
    id: 'bench', name: 'Studio test bench', ev100: 9,
    blurb: 'Resolution star, zone plate, fine fabric, colour chart and a ruler running through focus.',
    ko: { name: '스튜디오 테스트 벤치', blurb: '해상도 차트, 존 플레이트, 촘촘한 직물, 컬러 차트, 초점 범위를 가로지르는 자.' },
    built: b.pack(), lights: b.lights, illuminant: [1.0, 0.97, 0.93],
    sun: { dir: norm([-0.7, 0.75, -0.35]), color: [1.0, 0.98, 0.95], irradiance: 1.35, disc: 0, size: 0.0, shadow: true },
    sky: { zenith: [0.32, 0.32, 0.33], horizon: [0.25, 0.24, 0.23], ground: [0.1, 0.08, 0.06], ambient: 0.75, clouds: 0, stars: 0, indoor: 1 },
    fog: { density: 0, color: [0, 0, 0] },
    shadow: { center: [0, 0.9, 1.8], half: 2.8, depth: 14 },
    camera: { subject: star, dir: norm([0.08, 0.26, -1]), frame: [-0.12, -0.18], distance: 1.75, min: 0.3, max: 3.6 },
    maxSpeed: 16, sceneIndex: 3,
  };
}

const BUILDERS = { garden, street, lake, bench };
export const SCENE_LIST = [
  { id: 'garden', name: 'Garden bench, golden hour', ko: { name: '정원 벤치, 골든아워' } },
  { id: 'street', name: 'City street at night', ko: { name: '밤의 도시 거리' } },
  { id: 'lake', name: 'Mountain lake, afternoon', ko: { name: '산정 호수, 오후' } },
  { id: 'bench', name: 'Studio test bench', ko: { name: '스튜디오 테스트 벤치' } },
];
const cache = new Map();
export function getScene(id) {
  if (!cache.has(id)) cache.set(id, BUILDERS[id]());
  return cache.get(id);
}
