// Unit meshes. Every mesh fits the box [-0.5, 0.5]³ so an instance's scale is
// its size in metres. Vertex layout: position.xyz, normal.xyz (float32).

function build(pos, nrm, idx) {
  const v = new Float32Array((pos.length / 3) * 6);
  for (let i = 0; i < pos.length / 3; i++) {
    v.set(pos.slice(i * 3, i * 3 + 3), i * 6);
    v.set(nrm.slice(i * 3, i * 3 + 3), i * 6 + 3);
  }
  return { vertices: v, indices: new Uint32Array(idx) };
}

function cube() {
  const pos = [], nrm = [], idx = [];
  const faces = [
    [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 1, 0], [0, 0, -1]],
    [[0, 1, 0], [0, 0, 1], [1, 0, 0]], [[0, -1, 0], [0, 0, -1], [1, 0, 0]],
    [[0, 0, 1], [-1, 0, 0], [0, 1, 0]], [[0, 0, -1], [1, 0, 0], [0, 1, 0]],
  ];
  for (const [n, u, w] of faces) {
    const b = pos.length / 3;
    for (const [su, sw] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      pos.push(0.5 * (n[0] + su * u[0] + sw * w[0]), 0.5 * (n[1] + su * u[1] + sw * w[1]), 0.5 * (n[2] + su * u[2] + sw * w[2]));
      nrm.push(...n);
    }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  return build(pos, nrm, idx);
}

function sphere(seg = 48, rings = 24) {
  const pos = [], nrm = [], idx = [];
  for (let j = 0; j <= rings; j++) {
    const th = (j / rings) * Math.PI;
    for (let i = 0; i <= seg; i++) {
      const ph = (i / seg) * Math.PI * 2;
      const n = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
      pos.push(n[0] * 0.5, n[1] * 0.5, n[2] * 0.5);
      nrm.push(...n);
    }
  }
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i, b = a + seg + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return build(pos, nrm, idx);
}

function cylinder(seg = 32, cone = false) {
  const pos = [], nrm = [], idx = [];
  const slope = cone ? 0.5 : 0; // normal tilt for a cone of radius 0.5 and height 1
  for (let j = 0; j <= 1; j++) {
    for (let i = 0; i <= seg; i++) {
      const ph = (i / seg) * Math.PI * 2;
      const c = Math.cos(ph), s = Math.sin(ph);
      const r = cone ? 0.5 * (1 - j) : 0.5;
      pos.push(c * r, j - 0.5, s * r);
      const l = Math.hypot(1, slope);
      nrm.push(c / l, slope / l, s / l);
    }
  }
  for (let i = 0; i < seg; i++) idx.push(i, i + seg + 1, i + 1, i + 1, i + seg + 1, i + seg + 2);
  const caps = cone ? [-0.5] : [-0.5, 0.5];
  for (const y of caps) {
    const c0 = pos.length / 3;
    pos.push(0, y, 0); nrm.push(0, Math.sign(y), 0);
    for (let i = 0; i <= seg; i++) {
      const ph = (i / seg) * Math.PI * 2;
      pos.push(Math.cos(ph) * 0.5, y, Math.sin(ph) * 0.5); nrm.push(0, Math.sign(y), 0);
    }
    for (let i = 0; i < seg; i++) idx.push(c0, c0 + 1 + i, c0 + 2 + i);
  }
  return build(pos, nrm, idx);
}

function plane() {
  return build([-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5], [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], [0, 2, 1, 0, 3, 2]);
}

// Terrain grid with vertices packed toward the centre; heights come from the shader.
function grid(n = 300) {
  const pos = [], nrm = [], idx = [];
  const warp = (t) => { const u = t * 2 - 1; return 0.5 * Math.sign(u) * Math.abs(u) ** 2.2; };
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) { pos.push(warp(i / n), 0, warp(j / n)); nrm.push(0, 1, 0); }
  }
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i, b = a + n + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return build(pos, nrm, idx);
}

export const MESH_NAMES = ['cube', 'sphere', 'cylinder', 'cone', 'plane', 'grid'];
export function buildMeshes() {
  return { cube: cube(), sphere: sphere(), cylinder: cylinder(), cone: cylinder(24, true), plane: plane(), grid: grid() };
}
