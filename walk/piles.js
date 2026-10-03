// Piles of stuff, each found in one room only: tins pushed into the dead ends of the
// grocery maze, sodden boxes and photographs in the flooded corridor, towers of good china
// in the dining room. Every pile is solid (an AABB collider) and goes through the scene's
// builder, so a pile costs one draw call per material however many pieces it has. The
// placement is seeded: a pile looks the same on every visit and in every test.
//
// An item is a list of parts, [[geometry, material, localMatrix | null], ...], drawn at the
// item's matrix. A mini game's item (the one red tin, a photograph) can be held out of the
// merge: it comes back in `held` as a matrix, and the scene draws it on its own so it can be
// taken away while the pile and its collider stay where they are.
import * as THREE from 'three';
import { place } from './build.js';

// The same LCG as the grocery maze, so a seed means the same thing everywhere.
export function rng(seed) {
  let s = (seed | 0) || 1;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

function addItem(B, item, m) {
  for (const [g, mat, local] of item) B.add(g, mat, local ? m.clone().multiply(local) : m);
}

// A transform in a pile's own frame: centred on (x, z), turned by ry.
function frame(x, z, ry) {
  const c = Math.cos(ry), s = Math.sin(ry);
  return (lx, ly, lz, ry2 = 0, rx = 0, rz = 0) => place(x + lx * c + lz * s, ly, z - lx * s + lz * c, ry + ry2, rx, rz);
}

// The world AABB of a w x d footprint centred on (x, z), turned by ry.
function footprint(x, z, w, d, ry) {
  const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry));
  const hx = (w * c + d * s) / 2, hz = (w * s + d * c) / 2;
  return { minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz };
}

function solid(B, box) {
  B.colliders.push(box);
  return box;
}

// Stacked like a supermarket display: `cols` x `rows` on the floor, each layer up one fewer
// each way, sitting in the hollows of the one below. `hold` keeps that many items off the
// top layer (from its middle) out of the merge.
export function pyramid(B, item, {
  x, z, ry = 0, y = 0, cols = 6, rows = 3, layers = 3, w = 0.1, h = 0.12, d = 0.1, gap = 0.004,
  jitter = 0.006, seed = 1, hold = 0, collide = true,
} = {}) {
  const r = rng(seed);
  const at = frame(x, z, ry);
  const sx = w + gap, sz = d + gap;
  const layerItems = [];
  for (let k = 0; k < layers; k++) {
    const nc = cols - k, nr = rows - k;
    if (nc < 1 || nr < 1) break;
    const list = [];
    for (let i = 0; i < nc; i++) {
      for (let j = 0; j < nr; j++) {
        const lx = (i - (nc - 1) / 2) * sx + (r() - 0.5) * jitter;
        const lz = (j - (nr - 1) / 2) * sz + (r() - 0.5) * jitter;
        list.push(at(lx, y + k * h + h / 2, lz, (r() - 0.5) * 0.6));
      }
    }
    layerItems.push(list);
  }
  const top = layerItems[layerItems.length - 1];
  // the held items come off the middle of the top layer
  const order = top.map((_, i) => i).sort((a, b) => Math.abs(a - (top.length - 1) / 2) - Math.abs(b - (top.length - 1) / 2));
  const heldIdx = new Set(order.slice(0, Math.min(hold, top.length)));
  const held = [];
  const items = [];
  layerItems.forEach((list, k) => list.forEach((m, i) => {
    if (k === layerItems.length - 1 && heldIdx.has(i)) { held.push(m); return; }
    addItem(B, item, m);
    items.push(m);
  }));
  const W = cols * sx, D = rows * sz;
  const collider = collide ? solid(B, footprint(x, z, W, D, ry)) : null;
  return { collider, items, held, height: layerItems.length * h + y, top: new THREE.Vector3(x, y + layerItems.length * h, z) };
}

// A tower: plates, folded linen, trays. Each piece sits `h` above the last, drifting `lean`
// metres sideways by the top (a slow curve, so the tower bows rather than shears) with a
// little twist and jitter.
export function stack(B, item, {
  x, z, ry = 0, y = 0, count = 10, h = 0.02, lean = 0, twist = 0.08, jitter = 0.004, seed = 1,
  w = 0.25, d = 0.25, collide = false,
} = {}) {
  const r = rng(seed);
  const at = frame(x, z, ry);
  const items = [];
  let lx = 0, lz = 0;
  for (let i = 0; i < count; i++) {
    const t = count > 1 ? i / (count - 1) : 0;
    lx = lean * t * t + (r() - 0.5) * jitter;
    lz = (r() - 0.5) * jitter;
    const m = at(lx, y + i * h, lz, (r() - 0.5) * twist * 2);
    addItem(B, item, m);
    items.push(m);
  }
  const collider = collide ? solid(B, footprint(x, z, w + Math.abs(lean), d, ry)) : null;
  return { collider, items, height: y + count * h, top: new THREE.Vector3(x + lx, y + count * h, z + lz) };
}

// A heap: an irregular mound of mixed pieces (boxes, paper), each dropped at a random point
// of an ellipse rx x rz and settled onto a dome `height` tall, turned at random and tipped
// down the slope. `parts` is a list of { item, h } (h: the piece's own height) with an
// optional `weight` for how often it is picked.
export function heap(B, parts, {
  x, z, ry = 0, rx = 0.6, rz = 0.4, height = 0.6, count = 16, seed = 1, tilt = 0.5, collide = true,
} = {}) {
  const r = rng(seed);
  const at = frame(x, z, ry);
  const total = parts.reduce((s, p) => s + (p.weight || 1), 0);
  const items = [];
  for (let i = 0; i < count; i++) {
    let pick = r() * total, part = parts[0];
    for (const p of parts) { pick -= p.weight || 1; if (pick <= 0) { part = p; break; } }
    // fill from the outside in, so the late pieces land on top
    const a = r() * Math.PI * 2;
    const s = Math.sqrt(1 - i / count) * (0.35 + 0.65 * r());
    const u = Math.cos(a) * s, v = Math.sin(a) * s;
    const surface = height * (1 - s * s);
    const yy = Math.max(part.h / 2, surface - part.h / 2);
    const m = at(u * rx, yy, v * rz, r() * Math.PI * 2, -v * tilt + (r() - 0.5) * 0.2, u * tilt + (r() - 0.5) * 0.2);
    addItem(B, part.item, m);
    items.push(m);
  }
  const collider = collide ? solid(B, footprint(x, z, rx * 1.8, rz * 1.8, ry)) : null;
  return { collider, items, height, top: new THREE.Vector3(x, height, z) };
}

// A cardboard box whose lid has sagged with the damp (the top's middle row of vertices
// drops by `sag`).
export function saggingBox(w, h, d, sag = 0.03) {
  const g = new THREE.BoxGeometry(w, h, d, 2, 1, 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) < h / 2 - 1e-6) continue;
    const fx = 1 - Math.abs(pos.getX(i)) / (w / 2), fz = 1 - Math.abs(pos.getZ(i)) / (d / 2);
    pos.setY(i, pos.getY(i) - sag * fx * fz);
  }
  g.computeVertexNormals();
  return g;
}
