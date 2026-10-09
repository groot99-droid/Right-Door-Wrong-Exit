#!/usr/bin/env node
// Browser test for the walk phase, after the Chronicle Museum's walk_test.mjs.
//
//   node tools/walk_test.mjs [--out DIR] [--mobile] [--scene id[,id]]
//
// Serves the repo and opens the game in headless Chromium (software WebGL; there is no
// H.264 decoder, so every loading clip errors out and the loader moves on by itself).
// For each chapter that has a 3D scene it opens `index.html?chapter=<id>`, clicks through
// the gate and START, ends the caption, presses NEXT, and drives the room through
// `walk.debug.current` with deterministic steps: screenshots, the scene's own checks
// (collision, animation, the maze's solvability, the treadmill wrap), the scripted route
// to the exit, and then that the right loading clip (or the title card, after the last
// room) follows. In the rooms with a mini game it first walks out through the exit without
// playing (the exit is open before the game is played), then, on a second visit, walks into one
// pile in each room (and every stack of trays) to check it is solid, checks every pile is cleanly
// made, measured from what is on screen (no piece inside another, below what it stands on or
// outside its collider, and no heap piece or photograph standing out over a drop past what holds
// it), plays the game through with "use" as a player gives it (E, Space and Enter in turn,
// pressed on the keyboard; a tap on the prompt in --mobile), and checks the game left the exit as
// it was.
// Reports draw calls, triangles and console errors to tools/out/report.json.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  try { return require('playwright'); } catch (e) { /* fall through */ }
  for (const p of ['/opt/node22/lib/node_modules/playwright', '/usr/lib/node_modules/playwright']) {
    try { return require(p); } catch (e) { /* next */ }
  }
  throw new Error('playwright not found: npm i -g playwright');
}
const { chromium } = loadPlaywright();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = { out: path.join(ROOT, 'tools', 'out'), mobile: false, scenes: null, chromium: process.env.CHROMIUM || '/opt/pw-browsers/chromium' };
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out') opt.out = path.resolve(args[++i]);
  else if (args[i] === '--mobile') opt.mobile = true;
  else if (args[i] === '--scene') opt.scenes = args[++i].split(',');
}
if (!fs.existsSync(opt.chromium)) opt.chromium = undefined;
fs.mkdirSync(opt.out, { recursive: true });
const SFX = opt.mobile ? '_mobile' : '';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.mp4': 'video/mp4', '.MP4': 'video/mp4', '.mp3': 'audio/mpeg', '.png': 'image/png', '.PNG': 'image/png', '.jpg': 'image/jpeg' };
function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const file = path.normalize(path.join(ROOT, p === '/' ? '/index.html' : p));
      if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      fs.stat(file, (err, st) => {
        if (err || !st.isFile()) { res.writeHead(404); res.end('not found'); return; }
        const type = MIME[path.extname(file)] || 'application/octet-stream';
        const range = req.headers.range;
        if (range) {
          const m = /bytes=(\d*)-(\d*)/.exec(range);
          const start = m[1] ? parseInt(m[1], 10) : 0;
          const end = m[2] ? parseInt(m[2], 10) : st.size - 1;
          res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes' });
          fs.createReadStream(file, { start, end }).pipe(res);
          return;
        }
        res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' });
        fs.createReadStream(file).pipe(res);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const report = { ok: true, checks: [], errors: [] };
function check(name, cond, detail = '') {
  report.checks.push({ name, ok: !!cond, detail });
  if (!cond) report.ok = false;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
}

// ---- in-page helpers (run through page.evaluate) ---------------------------------------------
const W = {
  cur: async () => (await import('./walk/walk.js')).debug.current,
  info: async () => {
    const m = await import('./walk/walk.js');
    const r = m.debug.renderer;
    const c = m.debug.current;
    return { calls: r.info.render.calls, tris: r.info.render.triangles, textures: r.info.memory.textures, quality: m.debug.quality, pos: c.controls.position().toArray().map((v) => +v.toFixed(2)), objective: document.getElementById('walkObjective').textContent, readout: document.getElementById('walkReadout').textContent, state: c.state };
  },
  place: async ([x, z, yaw, pitch]) => { const c = (await import('./walk/walk.js')).debug.current; c.controls.setPosition(x, 1.62, z); c.controls.setLook(yaw, pitch || 0); c.step(1 / 60, 1); },
  walk: async ([key, n]) => { const c = (await import('./walk/walk.js')).debug.current; c.controls.setKeys({ [key]: true }); c.sim(1 / 60, n); c.controls.setKeys({}); c.step(1 / 60, 0); return c.controls.position().toArray().map((v) => +v.toFixed(2)); },
  // step forward in chunks until the walk state changes (the exit began) or the cap is hit
  forwardUntilExit: async ([cap]) => {
    const c = (await import('./walk/walk.js')).debug.current;
    c.controls.setKeys({ forward: true });
    let n = 0;
    while (c.state === 'walk' && n++ < cap) c.sim(1 / 60, 10);
    c.controls.setKeys({});
    c.step(1 / 60, 0);
    return { state: c.state, chunks: n, pos: c.controls.position().toArray().map((v) => +v.toFixed(2)), camY: +c.camera.position.y.toFixed(2) };
  },
  exitProgress: async ([n]) => { const c = (await import('./walk/walk.js')).debug.current; if (!c) return null; c.sim(1 / 60, n); c.step(1 / 60, 0); return { state: c.state, camY: +c.camera.position.y.toFixed(2), camX: +c.camera.position.x.toFixed(2), camZ: +c.camera.position.z.toFixed(2) }; },
  finishExit: async () => { const c = (await import('./walk/walk.js')).debug.current; if (c) c.sim(1 / 60, 600); },
  // stand at (sx, sz), look at (tx, ty, tz): what the prompt offers there
  aimAt: async ([tx, ty, tz, sx, sz]) => {
    const m = await import('./walk/walk.js');
    const c = m.debug.current;
    c.controls.setPosition(sx, 1.62, sz);
    c.controls.lookAt(new m.debug.THREE.Vector3(tx, ty, tz));
    c.step(1 / 60, 1);
    const btn = document.getElementById('walkUse');
    return { target: c.target, prompt: btn.classList.contains('visible') ? btn.textContent : '', tally: document.getElementById('walkTally').textContent };
  },
  // A synthetic keydown and keyup of `code` (KeyE, Space or Enter) on the focused element, bubbling
  // to the document where walk/controls.js listens, then one tick to handle it. Only the auto-repeat
  // check uses it (`repeat`: a held key's repeat, which uses nothing); every other "use" on a desktop
  // is a real key press (pressUse).
  use: async ([code = 'KeyE', repeat = false] = []) => {
    const c = (await import('./walk/walk.js')).debug.current;
    const key = { KeyE: 'e', Space: ' ', Enter: 'Enter' }[code];
    const at = document.activeElement || document.body;
    at.dispatchEvent(new KeyboardEvent('keydown', { code, key, repeat, bubbles: true, cancelable: true }));
    at.dispatchEvent(new KeyboardEvent('keyup', { code, key, bubbles: true, cancelable: true }));
    c.sim(1 / 60, 1);
    c.step(1 / 60, 0);
    return { target: c.target, tally: document.getElementById('walkTally').textContent, readout: document.getElementById('walkReadout').textContent };
  },
  // what the exit is: its trigger, the colliders and the walkable bounds (a game must change none)
  exitState: async () => { const c = (await import('./walk/walk.js')).debug.current; return JSON.stringify([c.built.trigger, c.built.colliders, c.built.bounds]); },
  // the HUD's score line
  tally: async () => { const t = document.getElementById('walkTally'); return { text: t.textContent, visible: t.classList.contains('visible'), flash: t.classList.contains('flash') }; },
  // dining: where Lights Out stands, and which prints are lit: the print the picture light is on,
  // while it is on (the one the prompt points at)
  lights: async () => {
    const d = (await import('./walk/walk.js')).debug.current.built.debug, g = d.game, L = d.pictureLight;
    const on = L.intensity > 0 ? g.photos.flatMap((p, i) => (L.target.position.distanceTo({ x: p.x, y: p.y, z: p.z }) < 1e-6 ? [i] : [])) : [];
    return { found: g.found, misses: g.misses, changed: g.changed, done: g.done, lit: on };
  },
  // dining: how much brighter print `i` is on screen with the prompt on it than without, from the
  // print's own pixels (its rectangle on the drawing buffer, read straight after a render, two
  // pixels in from its edges): its target's hover(false) and back, with the camera held still
  litLift: async ([i]) => {
    const m = await import('./walk/walk.js');
    const c = m.debug.current, R = m.debug.renderer, THREE = m.debug.THREE;
    const p = c.built.debug.game.photos[i], t = c.built.interact[i];
    if (typeof t.hover !== 'function') return { error: `print ${i} has no hover` };
    const gl = R.getContext(), size = R.getDrawingBufferSize(new THREE.Vector2()), v = new THREE.Vector3();
    p.mesh.geometry.computeBoundingBox();
    const bb = p.mesh.geometry.boundingBox;
    p.mesh.updateMatrixWorld(true);
    c.camera.updateMatrixWorld(true);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) {
      v.set(x, y, 0).applyMatrix4(p.mesh.matrixWorld).project(c.camera);
      const px = (v.x + 1) / 2 * size.x, py = (v.y + 1) / 2 * size.y;
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
    }
    const X = Math.max(0, Math.ceil(x0) + 2), Y = Math.max(0, Math.ceil(y0) + 2);
    const w = Math.min(size.x, Math.floor(x1) - 2) - X, h = Math.min(size.y, Math.floor(y1) - 2) - Y;
    if (w < 4 || h < 4) return { error: 'print off screen', rect: [X, Y, w, h] };
    const read = () => {
      c.step(1 / 60, 0);
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(X, Y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let s = 0;
      for (let k = 0; k < px.length; k += 4) s += 0.2126 * px[k] + 0.7152 * px[k + 1] + 0.0722 * px[k + 2];
      return s / (w * h);
    };
    const on = read();
    t.hover(false);
    const off = read();
    t.hover(true);
    c.step(1 / 60, 0);
    return { on: +on.toFixed(1), off: +off.toFixed(1), lift: +(on / off - 1).toFixed(3), px: w * h };
  },
  // The room's piles as drawn (debug.pileItems: { name, y, collider, pieces: [[matrix, item]],
  // sheets? }), measured from the pieces' own vertices: pairs that pass into each other by more than
  // a millimetre, pieces below the floor they stand on (or a pile that does not reach down to it),
  // and vertices past the pile's collider or the room's walls. A piece made only of round parts
  // standing upright (a tin, a plate) is the cylinder round its axis, anything else its box; the
  // plates of one tower nest by design, so they are compared with each other as the solids their
  // lathe profiles turn out, not as cylinders. First, that the
  // record is what is on screen: every vertex of every piece and sheet (each part through its own
  // matrix and the piece's) must be one the room draws, within 0.1 mm, in that part's material and
  // not in the floor's mirror image (`undrawn` lists the pieces with a vertex that is not).
  piles: async () => {
    const m = await import('./walk/walk.js');
    const b = m.debug.current.built, sets = b.debug.pileItems, TOL = 0.001;
    const v = new m.debug.THREE.Vector3();
    const ROUND = new Set(['CylinderGeometry', 'CircleGeometry', 'LatheGeometry']);
    const measured = new Map();
    const measure = (item) => {
      if (measured.has(item)) return measured.get(item);
      const verts = [], min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      let radius = 0;
      for (const [g, , local] of item) {
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) {
          v.fromBufferAttribute(p, i);
          if (local) v.applyMatrix4(local);
          verts.push(v.x, v.y, v.z);
          for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], v.getComponent(a)); max[a] = Math.max(max[a], v.getComponent(a)); }
          radius = Math.max(radius, Math.hypot(v.x, v.z));
        }
      }
      const it = { verts, min, max, radius, round: item.every(([g]) => ROUND.has(g.type)), nests: item.some(([g]) => g.type === 'LatheGeometry') };
      measured.set(item, it);
      return it;
    };
    // every vertex the room draws in a pile's materials, by material, in 1 mm cells
    const mats = new Set();
    for (const s of sets) for (const [, item] of [...s.pieces, ...(s.sheets || [])]) for (const [, mt] of item) mats.add(mt);
    const CELL = 0.001, NEAR = 1e-4, drawn = new Map([...mats].map((mt) => [mt, new Map()]));
    const cellOf = (x, y, z) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)},${Math.floor(z / CELL)}`;
    const mw = new m.debug.THREE.Matrix4(), mi = new m.debug.THREE.Matrix4();
    b.group.updateMatrixWorld(true);
    b.group.traverse((o) => {
      if (!o.isMesh) return;
      const into = (Array.isArray(o.material) ? o.material : [o.material]).filter((mt) => mats.has(mt)).map((mt) => drawn.get(mt));
      if (!into.length) return;
      const pos = o.geometry.attributes.position;
      for (let q = 0; q < (o.isInstancedMesh ? o.count : 1); q++) {
        mw.copy(o.matrixWorld);
        if (o.isInstancedMesh) { o.getMatrixAt(q, mi); mw.multiply(mi); if (mw.elements[13] < -10) continue; }   // parked
        if (mw.determinant() < 0) continue;   // the room in the floor
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(mw);
          const k = cellOf(v.x, v.y, v.z);
          for (const D of into) { if (!D.has(k)) D.set(k, []); D.get(k).push(v.x, v.y, v.z); }
        }
      }
    });
    const isDrawn = (D, x, y, z) => {
      for (const cx of new Set([Math.floor((x - NEAR) / CELL), Math.floor((x + NEAR) / CELL)])) {
        for (const cy of new Set([Math.floor((y - NEAR) / CELL), Math.floor((y + NEAR) / CELL)])) {
          for (const cz of new Set([Math.floor((z - NEAR) / CELL), Math.floor((z + NEAR) / CELL)])) {
            const l = D.get(`${cx},${cy},${cz}`);
            if (l) for (let j = 0; j < l.length; j += 3) if ((l[j] - x) ** 2 + (l[j + 1] - y) ** 2 + (l[j + 2] - z) ** 2 <= NEAR * NEAR) return true;
          }
        }
      }
      return false;
    };
    const out = { sets: sets.length, pieces: 0, pairs: 0, recorded: 0, undrawn: [], pen: [], sunk: [], floating: [], outside: [], walls: [] };
    for (const s of sets) {
      for (const [list, tag] of [[s.pieces, ''], [s.sheets || [], 'laid']]) {
        list.forEach(([mat, item], k) => {
          let miss = 0, all = 0;
          for (const [g, mt, local] of item) {
            const mm = local ? mat.clone().multiply(local) : mat, pos = g.attributes.position, D = drawn.get(mt);
            for (let i = 0; i < pos.count; i++) {
              v.fromBufferAttribute(pos, i).applyMatrix4(mm);
              all++;
              if (!isDrawn(D, v.x, v.y, v.z)) miss++;
            }
          }
          out.recorded += all;
          if (miss) out.undrawn.push([`${s.name}:${tag}${k}`, miss, all]);
        });
      }
    }
    const pieces = [];
    sets.forEach((s, si) => {
      let low = Infinity;
      s.pieces.forEach(([mat, item], k) => {
        const it = measure(item), e = mat.elements;
        const box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
        for (let i = 0; i < it.verts.length; i += 3) {
          const x = it.verts[i], y = it.verts[i + 1], z = it.verts[i + 2];
          const wx = e[0] * x + e[4] * y + e[8] * z + e[12], wy = e[1] * x + e[5] * y + e[9] * z + e[13], wz = e[2] * x + e[6] * y + e[10] * z + e[14];
          box.minX = Math.min(box.minX, wx); box.maxX = Math.max(box.maxX, wx); box.minY = Math.min(box.minY, wy);
          box.maxY = Math.max(box.maxY, wy); box.minZ = Math.min(box.minZ, wz); box.maxZ = Math.max(box.maxZ, wz);
        }
        const name = `${s.name}:${k}`;
        const upright = Math.abs(e[5] - 1) < 1e-6;
        pieces.push({ name, set: si, e, it, item, box, upright, round: it.round && upright });
        low = Math.min(low, box.minY);
        if (box.minY < s.y - 0.0005) out.sunk.push([name, +(s.y - box.minY).toFixed(4)]);
        const c = s.collider;
        if (c) {
          const past = Math.max(c.minX - box.minX, box.maxX - c.maxX, c.minZ - box.minZ, box.maxZ - c.maxZ);
          if (past > TOL) out.outside.push([name, +past.toFixed(4)]);
        }
        const B = b.bounds;
        const wall = Math.max(B.minX - box.minX, box.maxX - B.maxX, B.minZ - box.minZ, box.maxZ - B.maxZ);
        if (wall > TOL) out.walls.push([name, +wall.toFixed(4)]);
      });
      if (s.pieces.length && low > s.y + 0.0005) out.floating.push([s.name, +(low - s.y).toFixed(4)]);
    });
    out.pieces = pieces.length;
    // the box of a piece: centre, axes, half sizes
    const obb = (P) => {
      const e = P.e, lo = P.it.min, hi = P.it.max, l = [0, 1, 2].map((a) => (lo[a] + hi[a]) / 2);
      return {
        c: [0, 1, 2].map((a) => e[a] * l[0] + e[4 + a] * l[1] + e[8 + a] * l[2] + e[12 + a]),
        ax: [[e[0], e[1], e[2]], [e[4], e[5], e[6]], [e[8], e[9], e[10]]],
        h: [0, 1, 2].map((a) => (hi[a] - lo[a]) / 2),
      };
    };
    const dot = (a, c) => a[0] * c[0] + a[1] * c[1] + a[2] * c[2];
    // separating axes: how deep two boxes overlap (0: apart)
    const sat = (A, C) => {
      const T = [C.c[0] - A.c[0], C.c[1] - A.c[1], C.c[2] - A.c[2]];
      const axes = [...A.ax, ...C.ax];
      for (const a of A.ax) for (const q of C.ax) {
        const x = [a[1] * q[2] - a[2] * q[1], a[2] * q[0] - a[0] * q[2], a[0] * q[1] - a[1] * q[0]], L = Math.hypot(...x);
        if (L > 1e-6) axes.push(x.map((u) => u / L));
      }
      let depth = Infinity;
      for (const L of axes) {
        const r = (O) => O.h[0] * Math.abs(dot(O.ax[0], L)) + O.h[1] * Math.abs(dot(O.ax[1], L)) + O.h[2] * Math.abs(dot(O.ax[2], L));
        const o = r(A) + r(C) - Math.abs(dot(T, L));
        if (o <= 0) return 0;
        depth = Math.min(depth, o);
      }
      return depth;
    };
    const vertical = (P, Q) => Math.min(P.box.maxY, Q.box.maxY) - Math.max(P.box.minY, Q.box.minY);
    // an upright cylinder against a box turned only about y: the circle against the box's rectangle
    const cylBox = (C, Q) => {
      const vy = vertical(C, Q);
      if (vy <= 0) return 0;
      const e = Q.e, dx = C.e[12] - e[12], dz = C.e[14] - e[14];
      const u = e[0] * dx + e[2] * dz, w = e[8] * dx + e[10] * dz, lo = Q.it.min, hi = Q.it.max;
      const d = Math.hypot(u - Math.max(lo[0], Math.min(hi[0], u)), w - Math.max(lo[2], Math.min(hi[2], w)));
      const pen = d > 0 ? C.it.radius - d : C.it.radius + Math.min(u - lo[0], hi[0] - u, w - lo[2], hi[2] - w);
      return pen > 0 ? Math.min(pen, vy) : 0;
    };
    // plates of one tower, which nest: how deep any vertex of P lies inside Q's plate, taken as the
    // solid its lathe profile turns out (each vertex brought into Q's frame, then its radius and
    // height tested against the profile polygon; the depth is its distance to the profile's nearest
    // edge off the axis)
    const nestDepth = (P, Q) => {
      const lat = Q.item.find(([g]) => g.type === 'LatheGeometry');
      if (!lat) return 0;
      const [g, , local] = lat, pts = g.parameters.points.map((q) => [q.x, q.y]);
      const M = new m.debug.THREE.Matrix4().fromArray(Q.e);
      if (local) M.multiply(local);
      const me = M.invert().elements, pe = P.e, V = P.it.verts;
      const inside = (r, y) => {
        let c = false;
        for (let a = 0, z = pts.length - 1; a < pts.length; z = a++) {
          const [x1, y1] = pts[a], [x2, y2] = pts[z];
          if ((y1 > y) !== (y2 > y) && r < (x2 - x1) * (y - y1) / (y2 - y1) + x1) c = !c;
        }
        return c;
      };
      const edge = (r, y) => {
        let d = Infinity;
        for (let a = 0; a + 1 < pts.length; a++) {
          const [x1, y1] = pts[a], [x2, y2] = pts[a + 1];
          if (x1 === 0 && x2 === 0) continue;
          const dx = x2 - x1, dy = y2 - y1, t = Math.max(0, Math.min(1, ((r - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy || 1)));
          d = Math.min(d, Math.hypot(r - x1 - t * dx, y - y1 - t * dy));
        }
        return d;
      };
      let depth = 0;
      for (let i = 0; i < V.length; i += 3) {
        const x = V[i], y = V[i + 1], z = V[i + 2];
        const wx = pe[0] * x + pe[4] * y + pe[8] * z + pe[12], wy = pe[1] * x + pe[5] * y + pe[9] * z + pe[13], wz = pe[2] * x + pe[6] * y + pe[10] * z + pe[14];
        const qx = me[0] * wx + me[4] * wy + me[8] * wz + me[12], qy = me[1] * wx + me[5] * wy + me[9] * wz + me[13], qz = me[2] * wx + me[6] * wy + me[10] * wz + me[14];
        const r = Math.hypot(qx, qz);
        if (inside(r, qy)) depth = Math.max(depth, edge(r, qy));
      }
      return depth;
    };
    const depthOf = (P, Q) => {
      if (P.round && Q.round) {
        const vy = vertical(P, Q), pen = P.it.radius + Q.it.radius - Math.hypot(P.e[12] - Q.e[12], P.e[14] - Q.e[14]);
        return vy > 0 && pen > 0 ? Math.min(vy, pen) : 0;
      }
      if (P.round && Q.upright) return cylBox(P, Q);
      if (Q.round && P.upright) return cylBox(Q, P);
      return sat(obb(P), obb(Q));
    };
    for (let i = 0; i < pieces.length; i++) {
      const P = pieces[i];
      for (let j = i + 1; j < pieces.length; j++) {
        const Q = pieces[j];
        const a = P.box, c = Q.box;
        if (a.maxX - c.minX <= TOL || c.maxX - a.minX <= TOL || a.maxY - c.minY <= TOL || c.maxY - a.minY <= TOL || a.maxZ - c.minZ <= TOL || c.maxZ - a.minZ <= TOL) continue;
        // plates of one tower nest, so their boxes always overlap: they are compared as the plates
        // they are instead
        const nested = P.set === Q.set && (P.it.nests || Q.it.nests);
        if (nested && !(P.it.nests && Q.it.nests)) continue;
        out.pairs++;
        const d = nested ? Math.max(nestDepth(P, Q), nestDepth(Q, P)) : depthOf(P, Q);
        if (d > TOL) out.pen.push([P.name, Q.name, +d.toFixed(4)]);
      }
    }
    for (const k of ['pen', 'sunk', 'outside', 'walls']) out[k].sort((p, q) => q[q.length - 1] - p[p.length - 1]);
    out.undrawn.sort((p, q) => q[1] - p[1]);
    return out;
  },
  // How the pieces of a room's heaps are held (pile names starting 'heap'), from their own
  // triangles: each piece's bottom sampled 13 x 13, a ray straight down from each sample to the
  // first surface of another piece of the pile or to the floor; samples within 6 mm of it touch.
  // For each piece: how far it reaches out over a drop (more than 3 cm) past the outline of its
  // touching samples (seen from above), how far its middle lies inside that outline, and the share
  // of its samples that touch. A sheet (thinner than 2 mm), flattened cardboard (thinner than 5 cm)
  // and a box are told apart by their own height. What is laid on a heap (its `sheets`: the
  // photographs) is measured the same way, on the pieces and on the sheet before it.
  heapHold: async () => {
    const m = await import('./walk/walk.js');
    const THREE = m.debug.THREE, b = m.debug.current.built;
    const out = [];
    for (const s of b.debug.pileItems.filter((q) => /^heap/.test(q.name))) {
      const P = [...s.pieces.map((p) => [...p, false]), ...(s.sheets || []).map((p) => [...p, true])].map(([mat, item, laid], k) => {
        const tris = [], box = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }, lmin = [Infinity, Infinity, Infinity], lmax = [-Infinity, -Infinity, -Infinity];
        const v = new THREE.Vector3();
        for (const [g, , local] of item) {
          const mm = local ? mat.clone().multiply(local) : mat, pos = g.attributes.position, idx = g.index, n = idx ? idx.count : pos.count;
          const W = [];
          for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i);
            if (local) v.applyMatrix4(local);
            for (let a = 0; a < 3; a++) { lmin[a] = Math.min(lmin[a], v.getComponent(a)); lmax[a] = Math.max(lmax[a], v.getComponent(a)); }
            v.fromBufferAttribute(pos, i).applyMatrix4(mm);
            W.push([v.x, v.y, v.z]);
            for (let a = 0; a < 3; a++) { box.min[a] = Math.min(box.min[a], W[i][a]); box.max[a] = Math.max(box.max[a], W[i][a]); }
          }
          for (let t = 0; t < n; t += 3) tris.push([W[idx ? idx.getX(t) : t], W[idx ? idx.getX(t + 1) : t + 1], W[idx ? idx.getX(t + 2) : t + 2]]);
        }
        return { name: laid ? `${s.name}:laid${k - s.pieces.length}` : `${s.name}:${k}`, laid, e: mat.elements, tris, box, lmin, lmax };
      });
      const down = (x, y, z, self) => {
        let best = s.y;
        for (const Q of P) {
          if (Q === self || x < Q.box.min[0] || x > Q.box.max[0] || z < Q.box.min[2] || z > Q.box.max[2] || Q.box.min[1] > y) continue;
          for (const [a, c, d] of Q.tris) {
            const den = (c[0] - a[0]) * (d[2] - a[2]) - (d[0] - a[0]) * (c[2] - a[2]);
            if (Math.abs(den) < 1e-12) continue;
            const w1 = ((x - a[0]) * (d[2] - a[2]) - (d[0] - a[0]) * (z - a[2])) / den, w2 = ((c[0] - a[0]) * (z - a[2]) - (x - a[0]) * (c[2] - a[2])) / den;
            if (w1 < -1e-9 || w2 < -1e-9 || w1 + w2 > 1 + 1e-9) continue;
            const hy = a[1] + w1 * (c[1] - a[1]) + w2 * (d[1] - a[1]);
            if (hy <= y && hy > best) best = hy;
          }
        }
        return best;
      };
      const hullOf = (pts) => {
        const p = pts.slice().sort((a, c) => a[0] - c[0] || a[1] - c[1]);
        if (p.length < 3) return p;
        const cr = (o, a, c) => (a[0] - o[0]) * (c[1] - o[1]) - (a[1] - o[1]) * (c[0] - o[0]);
        const lo = [], up = [];
        for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
        for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
        lo.pop(); up.pop();
        return lo.concat(up);
      };
      const inside = (h, x, z) => {
        if (h.length < 3) return -Infinity;
        let d = Infinity;
        for (let i = 0; i < h.length; i++) { const a = h[i], c = h[(i + 1) % h.length], ex = c[0] - a[0], ez = c[1] - a[1], L = Math.hypot(ex, ez) || 1; d = Math.min(d, (ex * (z - a[1]) - ez * (x - a[0])) / L); }
        return d;
      };
      for (const Q of P) {
        const e = Q.e, ly = Q.lmin[1], N = 13, touch = [], over = [];
        for (let i = 0; i < N; i++) {
          for (let j = 0; j < N; j++) {
            const u = Q.lmin[0] + (Q.lmax[0] - Q.lmin[0]) * i / (N - 1), w = Q.lmin[2] + (Q.lmax[2] - Q.lmin[2]) * j / (N - 1);
            const x = e[0] * u + e[4] * ly + e[8] * w + e[12], y = e[1] * u + e[5] * ly + e[9] * w + e[13], z = e[2] * u + e[6] * ly + e[10] * w + e[14];
            const gap = y - down(x, y + 2e-4, z, Q);
            if (gap < 0.006) touch.push([x, z]);
            else if (gap > 0.03) over.push([x, z]);
          }
        }
        const h = hullOf(touch);
        let reach = 0;
        for (const [x, z] of over) reach = Math.max(reach, -inside(h, x, z));
        const cu = (Q.lmin[0] + Q.lmax[0]) / 2, cw = (Q.lmin[2] + Q.lmax[2]) / 2;
        const mid = inside(h, e[0] * cu + e[4] * ly + e[8] * cw + e[12], e[2] * cu + e[6] * ly + e[10] * cw + e[14]);
        const ht = Q.lmax[1] - Q.lmin[1], kind = ht < 0.002 ? 'sheet' : ht < 0.05 ? 'flat' : 'box';
        const limit = kind === 'sheet' ? 0.05 : kind === 'flat' ? 0.09 : 0.4 * Math.min(Q.lmax[0] - Q.lmin[0], Q.lmax[2] - Q.lmin[2]);
        out.push({ name: Q.name, kind, laid: Q.laid, reach: +reach.toFixed(3), limit: +limit.toFixed(3), mid: +mid.toFixed(3), touch: +(touch.length / (N * N)).toFixed(3) });
      }
    }
    return out;
  },
};

// The checks every room with piles makes on them (W.piles): what the author saw as "janky and
// smushed together" is pieces inside pieces, pieces through the floor and colliders short of what
// is drawn.
async function pileChecks(page, room) {
  const g = await page.evaluate(W.piles);
  const top = (list) => JSON.stringify(list.slice(0, 4));
  check(`${room}: the piles measured are the piles on screen`, g.recorded > 0 && g.undrawn.length === 0, `${g.recorded} vertices recorded, ${g.undrawn.length} pieces with one not drawn ${top(g.undrawn)}`);
  check(`${room}: no two pieces of its piles pass into each other`, g.pieces > 0 && g.pen.length === 0, `${g.pieces} pieces in ${g.sets} piles, ${g.pairs} close pairs, ${g.pen.length} overlapping ${top(g.pen)}`);
  check(`${room}: every pile rests on what it stands on, nothing sinks into it`, g.sunk.length === 0 && g.floating.length === 0, `sunk ${top(g.sunk)} floating ${top(g.floating)}`);
  check(`${room}: every piece lies inside its pile's collider and inside the room`, g.outside.length === 0 && g.walls.length === 0, `outside ${top(g.outside)} through a wall ${top(g.walls)}`);
  return g;
}

// How far from a collider box the player's centre ended up (0 = inside it). A walk through and out
// the far side also scores high, so where there is room beyond a pile, also check which side the
// player stopped on (the heaps and the dead-end piles have a wall or shelving behind them).
function gapTo(pos, b) {
  const dx = Math.max(b.minX - pos[0], 0, pos[0] - b.maxX);
  const dz = Math.max(b.minZ - pos[2], 0, pos[2] - b.maxZ);
  return Math.hypot(dx, dz);
}

// "use" as a player gives it: a tap on the prompt in --mobile (there the prompt is the button), and
// otherwise E, Space and Enter in turn, pressed on the real keyboard, so the browser handles the key
// as it would for a player (a focused button's own Space or Enter included). The tap is made with
// the render loop paused, as for a shot: Playwright waits on animation frames before it taps, and a
// software-GL frame of a big room takes seconds on a busy machine. With no prompt showing there is
// nothing to tap: the tick runs without it, and the room's own checks say what did not happen.
const USE_KEYS = ['KeyE', 'Space', 'Enter'];
let uses = 0;
async function pressUse(page) {
  if (!opt.mobile) {
    await page.keyboard.press(USE_KEYS[uses++ % USE_KEYS.length]);
    return page.evaluate(async () => {
      const c = (await import('./walk/walk.js')).debug.current;
      c.sim(1 / 60, 1);
      c.step(1 / 60, 0);
      return { target: c.target, tally: document.getElementById('walkTally').textContent, readout: document.getElementById('walkReadout').textContent };
    });
  }
  const shown = await page.evaluate(async () => {
    const c = (await import('./walk/walk.js')).debug.current;
    if (c) c.setLoop(false);
    return document.getElementById('walkUse').classList.contains('visible');
  });
  let err = null;
  if (shown) await page.tap('#walkUse', { timeout: 60000 }).catch((e) => { err = e; });
  const st = await page.evaluate(async () => {
    const c = (await import('./walk/walk.js')).debug.current;
    if (!c) return { target: null, tally: '', readout: '' };
    c.sim(1 / 60, 1);
    c.step(1 / 60, 0);
    c.setLoop(true);
    return { target: c.target, tally: document.getElementById('walkTally').textContent, readout: document.getElementById('walkReadout').textContent };
  });
  if (err) throw err;
  return { ...st, tapped: shown };
}

async function shot(page, name) {
  // pause the loop, draw one frame, capture, resume: software GL frames are slow
  await page.evaluate(async () => { const c = (await import('./walk/walk.js')).debug.current; if (c) { c.setLoop(false); c.step(1 / 60, 0); } });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(opt.out, `${name}${SFX}.png`), timeout: 120000 });
  await page.evaluate(async () => { const c = (await import('./walk/walk.js')).debug.current; if (c) c.setLoop(true); });
}

// Open the game on a chapter, get into its walk scene.
async function enterWalk(page, base, chapter) {
  await page.goto(`${base}/index.html?chapter=${chapter}`, { waitUntil: 'load' });
  await page.click('#gate');
  await page.waitForTimeout(300);
  await page.click('#startBtn');
  await page.waitForSelector(`body.chapter-${chapter.toLowerCase()}`, { timeout: 40000 });
  await page.waitForFunction(() => document.querySelector('#walkMount canvas') !== null, null, { timeout: 90000 });
  await page.click('#captionCard');
  await page.waitForSelector('#nextBtn.visible', { timeout: 15000 });
  await page.click('#nextBtn');
  await page.waitForSelector('body.phase-walk', { timeout: 15000 });
  // (waitForFunction does not await an async predicate: its promise counts as true at once, so the
  // wait runs in the page instead)
  await page.evaluate(async () => {
    const m = await import('./walk/walk.js'), t = performance.now();
    while (!(m.debug.current && m.debug.current.state === 'walk')) {
      if (performance.now() - t > 120000) throw new Error('the walk never started');
      await new Promise((r) => setTimeout(r, 50));
    }
  });
  await page.waitForTimeout(800);
}

// After the exit: the next loading clip, or the title card after the last room.
async function expectAfter(page, next) {
  await page.evaluate(W.finishExit);
  if (next === 'home') {
    await page.waitForSelector('body.phase-home', { timeout: 30000 });
    const home = await page.evaluate(() => ({ active: document.getElementById('screenHome').classList.contains('is-active'), audio: document.getElementById('sectionAudio').getAttribute('src') }));
    check('the last room returns to the title card', home.active && home.audio === '0.mp3', JSON.stringify(home));
  } else {
    await page.waitForFunction((n) => document.getElementById('loadVideo').getAttribute('src') === n, next, { timeout: 30000 });
    check(`loading clip ${next} follows`, true);
  }
}

// ---- per-chapter drives -------------------------------------------------------------------------
const CHAPTERS = {
  A: { scene: 'dining', next: 'b.MP4', async unplayed(page) {
    // the stairs without the game, the climb starting about a second before a lamp-off: the lamp
    // still clicks off, but no photograph may change (nor the score line) once the climb has begun
    const open = await page.evaluate(W.tally);
    const t = await page.evaluate(async () => {
      const c = (await import('./walk/walk.js')).debug.current, d = c.built.debug;
      c.setLoop(false);
      const lead = d.LAMP_OFF_AT * d.LAMP_PERIOD - d.elapsed - 2.0;
      c.sim(1 / 60, Math.max(0, Math.round(lead * 60)));
      return { elapsed: +d.elapsed.toFixed(2), lamp: d.lamp.intensity };
    });
    await page.evaluate(W.place, [-1.4, -2.9, Math.atan2(-1.35, 0.3), 0]);
    const e = await page.evaluate(W.forwardUntilExit, [60]);
    const g = await page.evaluate(W.lights);
    check('Lights Out is a bonus: the stairs start the climb before it is played', open.text === 'WATCH THE PHOTOGRAPHS  ·  0/3' && open.visible && e.state === 'exit' && g.found === 0 && !g.done, JSON.stringify({ tally: open.text, exit: e.state, found: g.found }));
    const late = await page.evaluate(async () => {
      const c = (await import('./walk/walk.js')).debug.current, d = c.built.debug, off = d.LAMP_OFF_AT * d.LAMP_PERIOD;
      const began = +d.elapsed.toFixed(2);
      while (c.state === 'exit' && d.elapsed < off + 0.25) c.sim(1 / 60, 5);
      return { began, off: +off.toFixed(2), state: c.state, elapsed: +d.elapsed.toFixed(2), lamp: d.lamp.intensity, changed: d.game.changed, tally: document.getElementById('walkTally').textContent };
    });
    check('the lamp clicks off during the climb, and no photograph changes', t.lamp > 0 && late.began < late.off && late.state === 'exit' && late.lamp === 0 && late.changed === -1 && late.tally === open.text, JSON.stringify({ before: t, late }));
  }, async drive(page) {
    const exit0 = await page.evaluate(W.exitState);
    const open = await page.evaluate(W.tally);
    const i = await page.evaluate(W.info);
    check('dining draw calls under 60', i.calls < 60, `${i.calls} calls, ${i.tris} tris`);
    check('dining objective', i.objective === 'FIND THE STAIRS', i.objective);
    await shot(page, 'dining_start');
    await page.evaluate(W.place, [0.15, 1.2, 0, 0]);
    const t = await page.evaluate(W.walk, ['forward', 120]);
    check('the table blocks the player', t[2] > 0.0, `z ${t[2]}`);
    // the clip's one event, stretched: once a cycle the lamp clicks off, and clicks back on
    const lamp = await page.evaluate(async () => { const c = (await import('./walk/walk.js')).debug.current; const d = c.built.debug; const before = d.lamp.intensity; let off = null, on = null; for (let k = 0; k < d.LAMP_PERIOD * 60 + 60; k += 10) { c.sim(1 / 60, 10); if (off === null && d.lamp.intensity === 0) off = k / 60; else if (off !== null && on === null && d.lamp.intensity > 0) on = k / 60; } return { before: +before.toFixed(1), off, on }; });
    check('the lamp clicks off once a cycle, and back on', lamp.before > 0 && lamp.off !== null && lamp.on !== null, JSON.stringify(lamp));
    // the good china, against the right wall between the curtains and the front wall: a solid pile.
    // Walking at it down the wall from the front, the player stops on the near side, a radius off it
    // (with no collider they walk through and out the far side)
    const pile = await page.evaluate(async () => (await import('./walk/walk.js')).debug.current.built.debug.pile);
    await page.evaluate(W.place, [2.18, 2.3, 0, 0]);
    const pb = await page.evaluate(W.walk, ['forward', 120]);
    check('the china against the right wall is solid', pb[0] > pile.minX && pb[0] < pile.maxX && pb[2] >= pile.maxZ + 0.26 && pb[2] < pile.maxZ + 0.4, `stopped at x ${pb[0]} z ${pb[2]}, pile x ${pile.minX.toFixed(2)}..${pile.maxX.toFixed(2)} ends at z ${pile.maxZ.toFixed(2)}`);
    // its pieces: each plate, cloth and collider where it should be, and the seams near them
    await pileChecks(page, 'dining');
    const dn = await page.evaluate(async () => {
      const c = (await import('./walk/walk.js')).debug.current, d = c.built.debug;
      const v = new (await import('./walk/walk.js')).debug.THREE.Vector3();
      c.built.group.updateMatrixWorld(true);
      const span = (name) => {
        const s = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, xs: [] };
        c.built.group.traverse((o) => {
          if (!o.isMesh || o.name !== name) return;
          const p = o.geometry.attributes.position;
          for (let i = 0; i < p.count; i++) {
            v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
            s.minX = Math.min(s.minX, v.x); s.maxX = Math.max(s.maxX, v.x); s.minZ = Math.min(s.minZ, v.z); s.maxZ = Math.max(s.maxZ, v.z);
            s.xs.push(v.x);
          }
        });
        return s;
      };
      const linen = span('linen'), damask = span('damask'), walls = span('stair_wall');
      const apart = Math.max(linen.minX - damask.maxX, damask.minX - linen.maxX, linen.minZ - damask.maxZ, damask.minZ - linen.maxZ);
      const flush = walls.xs.filter((x) => Math.abs(x - d.stair.x0) < 0.001 || Math.abs(x - d.stair.x1) < 0.001).length;
      return { real: c.built.colliders.includes(d.pile), apart: +apart.toFixed(4), flush, wallVerts: walls.xs.length };
    });
    check('the china\'s collider is one the player meets', dn.real);
    check('the linen and the damask stand apart, so their layers cannot meet', dn.apart > 0.002, `gap ${dn.apart}`);
    check('the stairwell walls stand back from the opening\'s reveals', dn.wallVerts > 0 && dn.flush === 0, `${dn.flush} of ${dn.wallVerts} vertices in a reveal`);
    await page.evaluate(W.place, [0.6, 2.6, -0.95, -0.35]);
    await shot(page, 'dining_china');
    // Lights Out: when the lamp clicks off a photograph changes, and stays changed until it is found
    const g0 = await page.evaluate(W.lights);
    check('Lights Out opens on its score line, nothing found yet', open.text === 'WATCH THE PHOTOGRAPHS  ·  0/3' && open.visible && !g0.done && g0.found === 0, JSON.stringify({ tally: open.text, found: g0.found }));
    const rounds = [];
    let repeat = null;
    for (let k = 0; k < 3; k++) {
      const ch = await page.evaluate(async () => {
        const m = await import('./walk/walk.js');
        const c = m.debug.current;
        const g = c.built.debug.game;
        let n = 0;
        while (g.changed < 0 && n++ < 400) c.sim(1 / 60, 10);
        c.step(1 / 60, 0);
        const p = g.photos[g.changed];
        const before = p ? { rot: p.mesh.rotation.z, mapSwapped: p.mat.map !== p.map, color: p.mat.color.getHexString() } : null;
        return { changed: g.changed, kind: g.kind, spots: g.photos.map((q) => [q.x, q.y, q.z]), tally: document.getElementById('walkTally').textContent, before, dark: new m.debug.THREE.Color('#1b1815').getHexString() };
      });
      if (ch.changed < 0) { rounds.push({ k, error: 'nothing changed' }); break; }
      const wi = (ch.changed + 1) % ch.spots.length, right = ch.spots[ch.changed], wrong = ch.spots[wi];
      const aw = await page.evaluate(W.aimAt, [wrong[0], wrong[1], wrong[2], wrong[0] + 0.3, -2.5]);
      const sw = await page.evaluate(W.lights);
      const lift = await page.evaluate(W.litLift, [wi]);
      if (k === 0) {
        // a held key's auto-repeat uses nothing
        await page.evaluate(W.use, ['KeyE', true]);
        const sr = await page.evaluate(W.lights);
        repeat = { misses: [sw.misses, sr.misses], found: [sw.found, sr.found] };
      }
      const uw = await pressUse(page);
      let flash = null;
      if (k === 0) {
        // a second miss in a row posts the same words: the line flashes so it still registers
        const f0 = (await page.evaluate(W.tally)).flash;
        await pressUse(page);
        flash = [f0, (await page.evaluate(W.tally)).flash];
      }
      const afterWrong = (await page.evaluate(W.lights)).found;
      if (k === 0) await shot(page, 'dining_photo_changed');
      const ar = await page.evaluate(W.aimAt, [right[0], right[1], right[2], right[0] + 0.3, -2.5]);
      const sr = await page.evaluate(W.lights);
      const ur = await pressUse(page);
      const after = await page.evaluate(async (i) => {
        const g = (await import('./walk/walk.js')).debug.current.built.debug.game, p = g.photos[i];
        return { found: g.found, changed: g.changed, done: g.done, rot: p.mesh.rotation.z, mapSwapped: p.mat.map !== p.map, color: p.mat.color.getHexString() };
      }, ch.changed);
      after.lit = (await page.evaluate(W.lights)).lit;
      rounds.push({ k, kind: ch.kind, tally: ch.tally, before: ch.before, dark: ch.dark, wi, ri: ch.changed, wrongTarget: aw.target, litWrong: sw.lit, lift, wrongTally: uw.tally, flash, afterWrong, rightTarget: ar.target, litRight: sr.lit, after, finalTally: ur.tally });
    }
    const changedAsSaid = (r) => (r.kind === 'upside down' ? r.before.rot === Math.PI : r.kind === 'grey lines' ? r.before.mapSwapped : r.before.color === r.dark);
    const putBack = (a) => a.rot === 0 && !a.mapSwapped && a.color === 'ffffff';
    const okRounds = rounds.length === 3 && rounds.every((r, k) => r.wrongTarget === 'THAT ONE?' && r.afterWrong === k && r.rightTarget === 'THAT ONE?' && r.after && r.after.found === k + 1 && r.after.changed === -1 && /SOMETHING ON THE WALL CHANGED/.test(r.tally) && r.before && changedAsSaid(r) && putBack(r.after));
    check('a photograph changes when the lamp goes off; a wrong guess counts nothing, the right one is put back', okRounds, JSON.stringify(rounds.map((r) => ({ kind: r.kind, before: r.before, wrong: r.afterWrong, found: r.after && r.after.found, after: r.after && { rot: r.after.rot, mapSwapped: r.after.mapSwapped, color: r.after.color }, err: r.error }))));
    check('the print the prompt points at is lit, only that one, and none once it is found', rounds.length === 3 && rounds.every((r) => JSON.stringify(r.litWrong) === JSON.stringify([r.wi]) && JSON.stringify(r.litRight) === JSON.stringify([r.ri]) && r.after.lit.length === 0), JSON.stringify(rounds.map((r) => [r.litWrong, r.litRight, r.after && r.after.lit])));
    // and it can be seen: on screen the lit print is a good deal brighter than it is unlit
    check('the lit print stands out: its own pixels at least 15% brighter', rounds.length === 3 && rounds.every((r) => r.lift && r.lift.lift >= 0.15), JSON.stringify(rounds.map((r) => r.lift)));
    check('the score line keeps the count after each guess, and a second miss in a row flashes it', rounds.length === 3 && rounds.every((r, k) => r.wrongTally === `NOT THAT ONE  ·  ${k}/3` && (k === 2 || r.finalTally === `FOUND ${k + 1}/3  ·  WAIT FOR THE LAMP`)) && rounds[0].flash && !rounds[0].flash[0] && rounds[0].flash[1], JSON.stringify(rounds.map((r) => [r.wrongTally, r.finalTally]).concat([rounds[0] && rounds[0].flash])));
    check('a held key\'s auto-repeat uses nothing', repeat && repeat.misses[0] === repeat.misses[1] && repeat.found[0] === repeat.found[1], JSON.stringify(repeat));
    check('three found ends the game', rounds[2] && rounds[2].after && rounds[2].after.done && /THE ROOM HOLDS STILL/.test(rounds[2].finalTally), rounds[2] ? rounds[2].finalTally : 'no third round');
    const held = await page.evaluate(async () => { const c = (await import('./walk/walk.js')).debug.current; const d = c.built.debug; let min = 99; for (let k = 0; k < d.LAMP_PERIOD * 60 + 60; k += 10) { c.sim(1 / 60, 10); min = Math.min(min, d.lamp.intensity); } return +min.toFixed(2); });
    check('and the lamp stays on after it', held > 0, `lowest lamp intensity over a cycle ${held}`);
    check('the game left the stairs as they were (trigger, colliders, bounds)', (await page.evaluate(W.exitState)) === exit0);
    await page.evaluate(W.place, [-1.4, -2.9, Math.atan2(-1.35, 0.3), 0]); // forward = (-sin yaw, -cos yaw): toward the stair foot
    await shot(page, 'dining_stairs');
    const e = await page.evaluate(W.forwardUntilExit, [60]);
    check('the stairs start the climb', e.state === 'exit', JSON.stringify(e));
    const p = await page.evaluate(W.exitProgress, [70]);
    check('the climb goes up', p && p.camY > 1.8, JSON.stringify(p));
    await shot(page, 'dining_climb');

  } },
  B: { scene: 'hallway', next: 'c.MP4', async drive(page) {
    const i = await page.evaluate(W.info);
    check('hallway draw calls under 40', i.calls < 40, `${i.calls} calls, ${i.tris} tris`);
    check('hallway objective', i.objective === 'WALK TO THE END', i.objective);
    await shot(page, 'hallway_start');
    const flight = await page.evaluate(async () => { const c = (await import('./walk/walk.js')).debug.current; const y0 = c.camera.position.y; c.controls.setKeys({ forward: true }); c.sim(1 / 60, 220); c.controls.setKeys({}); c.step(1 / 60, 0); return { y0: +y0.toFixed(2), y1: +c.camera.position.y.toFixed(2), x: +c.controls.position().x.toFixed(2) }; });
    check('the flight climbs from the landing into the corridor', flight.y0 < 0.8 && flight.y1 > 1.5 && flight.x > 3.4, JSON.stringify(flight));
    await shot(page, 'hallway_top');
    const tubes = await page.evaluate(async () => { const c = (await import('./walk/walk.js')).debug.current; const d = c.built.debug; let dips = 0, two = 0; for (let k = 0; k < 600; k++) { c.sim(1 / 60, 1); const low = d.levels.filter((l) => l < 1).length; if (low > 0) dips++; if (low > 1) two++; } return { dips, two }; });
    check('the tubes flicker one at a time', tubes.dips > 0 && tubes.two < tubes.dips, JSON.stringify(tubes));
    await page.evaluate(W.place, [31, 0, -Math.PI / 2, 0]);
    await shot(page, 'hallway_end');
    const e = await page.evaluate(W.forwardUntilExit, [80]);
    check('the stairwell starts the descent', e.state === 'exit' && e.pos[0] > 35.5, JSON.stringify(e));
    const p = await page.evaluate(W.exitProgress, [90]);
    check('the descent goes down', p && p.camY < 1.3, JSON.stringify(p));
    await shot(page, 'hallway_descent');
  } },
  C: { scene: 'teal', next: 'd.MP4', async drive(page) {
    const i = await page.evaluate(W.info);
    check('teal draw calls under 30', i.calls < 30, `${i.calls} calls, ${i.tris} tris`);
    check('teal objective', i.objective === 'FIND SOMEWHERE TO REST', i.objective);
    await shot(page, 'teal_start');
    await page.evaluate(W.walk, ['forward', 120]);
    const r = await page.evaluate(W.info);
    check('the watch runs backward on the HUD', /WATCH\s+27:7\d/.test(r.readout), r.readout);
    await page.evaluate(W.place, [1.35, -2.0, 0, 0]);
    const d = await page.evaluate(W.walk, ['forward', 150]);
    check('the black doorway swallows nothing: it blocks', d[2] > -3.45, `z ${d[2]}`);
    const door = await page.evaluate(async () => { const c = (await import('./walk/walk.js')).debug.current; const d = c.built.debug; let peak = 0; for (let k = 0; k < d.DOOR_PERIOD * 60; k += 6) { c.sim(1 / 60, 6); peak = Math.max(peak, d.doorLift); } return { peak, colour: d.voidFace.color.getHexString() }; });
    check('the dark in the doorway lifts once a cycle', door.peak > 0.9, JSON.stringify(door));
    await page.evaluate(W.place, [-0.9, -1.0, 0, 0]);
    await shot(page, 'teal_sofa');
    const e = await page.evaluate(W.forwardUntilExit, [60]);
    check('the couch starts the lie-down', e.state === 'exit', JSON.stringify(e));
    const p = await page.evaluate(W.exitProgress, [100]);
    check('the camera lowers onto the couch', p && p.camY < 1.3, JSON.stringify(p));
    await shot(page, 'teal_rest');
  } },
  D: { scene: 'teal2', next: 'e.MP4', async drive(page) {
    const i0 = await page.evaluate(W.info);
    check('teal2 draw calls under 30', i0.calls < 30, `${i0.calls} calls, ${i0.tris} tris`);
    const y0 = await page.evaluate(async () => (await import('./walk/walk.js')).debug.current.camera.position.y);
    check('you wake up low beside the sofa', y0 < 1.5, `camera y ${y0.toFixed(2)}`);
    await shot(page, 'teal2_wake');
    await page.evaluate(W.walk, ['forward', 100]);
    const y1 = await page.evaluate(async () => (await import('./walk/walk.js')).debug.current.camera.position.y);
    check('and stand up', y1 > 1.55, `camera y ${y1.toFixed(2)}`);
    const glow = await page.evaluate(async () => { const c = (await import('./walk/walk.js')).debug.current; const a = c.built.debug.grid.emissiveIntensity; c.sim(1 / 60, 25); return [a, c.built.debug.grid.emissiveIntensity]; });
    check('the grid pulses', Math.abs(glow[0] - glow[1]) > 0.01, glow.map((v) => v.toFixed(2)).join(' -> '));
    const mut = await page.evaluate(async () => { const c = (await import('./walk/walk.js')).debug.current; const d = c.built.debug; const r0 = d.leaves[0].rotation.z, s0 = d.arch.scale.y; c.sim(1 / 60, 10 * 60); return { leafDelta: +Math.abs(d.leaves[0].rotation.z - r0).toFixed(4), arch: [+s0.toFixed(3), +d.arch.scale.y.toFixed(3)] }; });
    check('the plant sways and the arch grows', mut.leafDelta > 0.001 && Math.abs(mut.arch[1] - mut.arch[0]) > 0.005, JSON.stringify(mut));
    await page.evaluate(W.place, [0.8, -1.2, 0, 0]);
    await shot(page, 'teal2_arch');
    const e = await page.evaluate(W.forwardUntilExit, [60]);
    check('the arch starts the exit', e.state === 'exit', JSON.stringify(e));
  } },
  E: { scene: 'flooded', next: 'f.MP4', async unplayed(page) {
    const open = await page.evaluate(W.tally);
    await page.evaluate(W.place, [28.6, 0.4, -Math.PI / 2, -0.35]);
    const e = await page.evaluate(W.forwardUntilExit, [60]);
    const hung = await page.evaluate(async () => (await import('./walk/walk.js')).debug.current.built.debug.game.hung);
    check('Fill the Frames is a bonus: the grate gives way before it is played', open.text === 'PHOTOGRAPHS HUNG 0/3' && open.visible && e.state === 'exit' && hung === 0, JSON.stringify({ tally: open.text, exit: e.state, hung }));
  }, async drive(page) {
    const exit0 = await page.evaluate(W.exitState);
    const i = await page.evaluate(W.info);
    check('flooded draw calls under 60', i.calls < 60, `${i.calls} calls, ${i.tris} tris`);
    check('flooded objective', i.objective === 'REACH THE RED DOOR', i.objective);
    await shot(page, 'flooded_start');
    // every drip over four seconds: a drip waits at most three before it falls, so one is always moving
    const drips = await page.evaluate(async () => { const c = (await import('./walk/walk.js')).debug.current; const cubes = c.built.debug.cubes; const n = 16 * cubes.count; const a = cubes.instanceMatrix.array.slice(0, n); c.sim(1 / 60, 240); const b = cubes.instanceMatrix.array.slice(0, n); let diff = 0; for (let k = 0; k < n; k++) diff += Math.abs(a[k] - b[k]); return diff; });
    check('the drips fall', drips > 0.01, `matrix change ${drips.toFixed(3)}`);
    // over one full cycle the door is dark for most of it, and bright for the rest
    const door = await page.evaluate(async () => { const c = (await import('./walk/walk.js')).debug.current; const d = c.built.debug; let dark = 0, lit = 0, n = 0; for (let k = 0; k < d.DOOR_PERIOD * 60; k += 6) { c.sim(1 / 60, 6); n++; if (d.doorLevel < 0.1) dark++; else if (d.doorLevel > 0.8) lit++; } return { dark: +(dark / n).toFixed(2), lit: +(lit / n).toFixed(2) }; });
    check('the red door is dark for most of its cycle, then lights up', door.dark > 0.5 && door.lit > 0.2, JSON.stringify(door));
    // the sodden heaps are solid
    const fg = await page.evaluate(async () => { const c = (await import('./walk/walk.js')).debug.current; const d = c.built.debug; return { heaps: d.game.heaps, heap: d.heap, heapTop: d.game.heaps && c.built.interact[0].y, frames: d.game.frames.map((f) => f.x), tally: document.getElementById('walkTally').textContent }; });
    await page.evaluate(W.place, [fg.heap.x, 0.9, 0, 0]);
    const hb = await page.evaluate(W.walk, ['forward', 120]);
    check('the heap of sodden boxes is solid', gapTo(hb, fg.heaps[0]) > 0.26, `stopped at z ${hb[2]}, heap ends at ${fg.heaps[0].maxZ.toFixed(2)}`);
    check('Fill the Frames opens on its score line', fg.tally === 'PHOTOGRAPHS HUNG 0/3', fg.tally);
    // the heaps as drawn: boxes on boxes, never in them, off the wall, out of the way, under the rail
    const fp = await pileChecks(page, 'flooded');
    // held where it touches, and reaching no further past that than it could bear: a wet sheet clings
    // to what it lies on, flattened cardboard droops, only a box can stand out a little
    // (the photographs are laid on the heap's top, and wet paper strewn over its bare lids: each must
    // lie on what holds it over nine tenths of it at least)
    const hold = await page.evaluate(W.heapHold);
    const strewnN = await page.evaluate(async () => (await import('./walk/walk.js')).debug.current.built.debug.strewn);
    const loose = hold.filter((q) => q.reach > q.limit || q.mid <= 0 || (q.laid && q.touch < 0.9)).sort((p, q) => q.reach / q.limit - p.reach / p.limit);
    const most = (k) => Math.max(0, ...hold.filter((q) => q.kind === k && !q.laid).map((q) => q.reach));
    const laid = hold.filter((q) => q.laid);
    check('every heap piece is held where it touches and never stands out over a drop, nor does a photograph or the wet paper on top', hold.length > 0 && strewnN >= 2 && laid.length === 3 + strewnN && loose.length === 0, `${hold.length - laid.length} pieces; furthest past what holds them: sheet ${most('sheet')} m, flattened ${most('flat')} m, box ${most('box')} m; photographs and ${strewnN} strewn sheets touch ${laid.map((q) => q.touch).join(' ')}, reach ${Math.max(0, ...laid.map((q) => q.reach))} m${loose.length ? '; too far ' + JSON.stringify(loose.slice(0, 4)) : ''}`);
    const hs = await page.evaluate(async () => { const b = (await import('./walk/walk.js')).debug.current.built; return { bounds: b.bounds, tops: b.debug.heapTops, counts: b.debug.pileItems.map((s) => s.pieces.length) }; });
    const clear = fg.heaps.map((h) => +(hs.bounds.maxZ - h.maxZ).toFixed(3)), off = fg.heaps.map((h) => +(h.minZ - hs.bounds.minZ).toFixed(4));
    check('the heaps leave the corridor clear and keep off the wall tile', clear.every((d) => d >= 2.2) && off.every((d) => d >= 0.002), `clear ${clear.join(' ')} m, off the wall ${off.join(' ')} m`);
    check('the heaps stand under the handrail brackets, and stand as heaps', hs.tops.every((y) => y >= 0.4 && y <= 0.88) && hs.counts.every((n) => n >= 18), `tops ${hs.tops.map((y) => y.toFixed(3)).join(' ')}, pieces ${hs.counts.join(' ')} (${fp.pieces} in all)`);
    // the photographs: level, each over the one before it and never through it, the top one at the take target
    const pp = await page.evaluate(async () => {
      const c = (await import('./walk/walk.js')).debug.current, g = c.built.debug.game, t = c.built.interact[0];
      const P = g.photos.map((p) => { p.mesh.updateMatrixWorld(true); const e = p.mesh.matrixWorld.elements, q = p.mesh.geometry.parameters; return { e, w: q.width, h: q.height, state: p.state }; });
      const at = (p, u, v) => [0, 1, 2].map((a) => p.e[a] * u + p.e[4 + a] * v + p.e[12 + a]);
      const unit = (x) => { const L = Math.hypot(...x); return x.map((y) => y / L); };
      const frameOf = (p) => ({ o: [p.e[12], p.e[13], p.e[14]], x: unit([p.e[0], p.e[1], p.e[2]]), y: unit([p.e[4], p.e[5], p.e[6]]), n: unit([p.e[8], p.e[9], p.e[10]]).map((a, _, n) => (n[1] < 0 ? -a : a)) });
      const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      const level = Math.min(...P.map((p) => frameOf(p).n[1]));
      let over = 0, low = Infinity;
      const centres = [];
      for (let k = 1; k < P.length; k++) {
        for (let j = 0; j < k; j++) {
          const F = frameOf(P[j]);
          for (let a = 0; a <= 10; a++) for (let b = 0; b <= 10; b++) {
            const q = at(P[k], (a / 10 - 0.5) * P[k].w, (b / 10 - 0.5) * P[k].h), d = [q[0] - F.o[0], q[1] - F.o[1], q[2] - F.o[2]];
            if (Math.abs(dot(d, F.x)) > P[j].w / 2 || Math.abs(dot(d, F.y)) > P[j].h / 2) continue;
            over++;
            low = Math.min(low, dot(d, F.n));
          }
        }
        // at print k's middle, how far it lies over the print before it
        const F = frameOf(P[k - 1]), q = at(P[k], 0, 0);
        centres.push(+(dot([q[0] - F.o[0], q[1] - F.o[1], q[2] - F.o[2]], F.n) / F.n[1]).toFixed(4));
      }
      const T = frameOf(P[P.length - 1]);
      const target = dot([t.x - T.o[0], t.y - T.o[1], t.z - T.o[2]], T.n) / T.n[1];
      return { states: P.map((p) => p.state), level: +level.toFixed(5), over, low: +low.toFixed(4), centres, target: +target.toFixed(4) };
    });
    check('the photographs lie level on the heap, each just over the one before and never through it', pp.states.every((s) => s === 'heap') && pp.level > 0.995 && pp.over > 0 && pp.low > 0.0005 && pp.centres.every((d) => d > 0.001 && d < 0.003) && Math.abs(pp.target) < 0.003, JSON.stringify(pp));
    // no drip lands on a heap: stand beside each and let them fall
    const wet = await page.evaluate(async () => {
      const m = await import('./walk/walk.js');
      const c = m.debug.current, d = c.built.debug, M4 = new m.debug.THREE.Matrix4();
      const grown = d.game.heaps.map((h) => ({ minX: h.minX - 0.2, maxX: h.maxX + 0.2, minZ: h.minZ - 0.2, maxZ: h.maxZ + 0.2 }));
      let seen = 0, onHeap = 0;
      for (const h of d.game.heaps) {
        c.controls.setPosition((h.minX + h.maxX) / 2, 1.62, 0.6);
        for (let k = 0; k < 120; k++) {
          c.sim(1 / 60, 10);
          for (let i = 0; i < d.cubes.count; i++) {
            d.cubes.getMatrixAt(i, M4);
            const x = M4.elements[12], y = M4.elements[13], z = M4.elements[14];
            if (y <= -1) continue;
            seen++;
            if (grown.some((b) => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ)) onHeap++;
          }
        }
      }
      return { seen, onHeap };
    });
    check('no drip falls on a heap', wet.seen > 0 && wet.onHeap === 0, `${wet.onHeap} of ${wet.seen} drip positions within 0.2 m of a heap`);
    await page.evaluate(W.place, [4.4, 0.4, -0.95, -0.4]);
    await shot(page, 'flooded_heap');
    const hangs = [];
    for (let k = 0; k < 3; k++) {
      const ah = await page.evaluate(W.aimAt, [fg.heap.x, fg.heapTop, fg.heap.z, fg.heap.x - 1, 0.4]);
      const uh = await pressUse(page);
      const fx = fg.frames[k + 1];
      const af = await page.evaluate(W.aimAt, [fx, 2.0, 1.55, fx - 0.6, 0.6]);
      // the last one is hung under reduced motion, as a player who asked for it would hang it
      if (k === 2) await page.evaluate(async () => { (await import('./walk/walk.js')).debug.current.ctx.reduced = true; });
      const uf = await pressUse(page);
      const ph = await page.evaluate(async (fx) => { const g = (await import('./walk/walk.js')).debug.current.built.debug.game; const p = g.photos.find((q) => q.state === 'hung' && g.frames[q.frame].x === fx); return p ? p.mesh.position.toArray().map((v) => +v.toFixed(2)) : null; }, fx);
      hangs.push({ take: ah.target, carrying: uh.tally, hang: af.target, at: ph, tally: uf.tally });
    }
    check('take a photograph off the heap and hang it, three times', hangs.every((h, k) => h.take === 'TAKE A PHOTOGRAPH' && /CARRYING A PHOTOGRAPH/.test(h.carrying) && h.hang === 'HANG IT' && h.at && h.at[0] === fg.frames[k + 1] && h.at[1] === 2 && h.at[2] > 1.5), JSON.stringify(hangs));
    // three hung: under reduced motion the painted sky clears and holds still; otherwise its clouds drift
    const sky = await page.evaluate(async () => {
      const c = (await import('./walk/walk.js')).debug.current, mu = c.built.debug.mural;
      const a = mu.map.offset.x;
      c.sim(1 / 60, 120);
      const still = { moved: mu.map.offset.x - a, glow: mu.emissive.getHexString(), done: c.built.debug.game.done, tally: document.getElementById('walkTally').textContent };
      c.ctx.reduced = false;
      const b = mu.map.offset.x;
      c.sim(1 / 60, 120);
      return { ...still, drift: mu.map.offset.x - b };
    });
    check('three hung under reduced motion: the painted sky clears and holds still', sky.done && sky.moved === 0 && sky.glow !== '000000' && sky.tally === 'PHOTOGRAPHS HUNG 3/3  ·  THE SKY CLEARS', JSON.stringify(sky));
    check('and without it the painted sky moves', sky.drift > 0.005, JSON.stringify(sky));
    await page.evaluate(W.place, [2.0, -0.2, -Math.PI / 2 - 0.55, 0.1]);
    await shot(page, 'flooded_frames');
    check('the game left the grate as it was (trigger, colliders, bounds)', (await page.evaluate(W.exitState)) === exit0);
    await page.evaluate(W.place, [28.6, 0.4, -Math.PI / 2, -0.35]);
    await shot(page, 'flooded_grate');
    const e = await page.evaluate(W.forwardUntilExit, [60]);
    check('the grate gives way', e.state === 'exit', JSON.stringify(e));
    const p = await page.evaluate(W.exitProgress, [60]);
    check('and the player falls', p && p.camY < 0.6, JSON.stringify(p));
    await shot(page, 'flooded_fall');
  } },
  F: { scene: 'trampoline', next: 'g.MP4', async drive(page) {
    const i = await page.evaluate(W.info);
    check('trampoline draw calls under 40', i.calls < 40, `${i.calls} calls, ${i.tris} tris`);
    check('trampoline objective', i.objective === 'KEEP MOVING', i.objective);
    await shot(page, 'trampoline_start');
    const led = await page.evaluate(async () => { const c = (await import('./walk/walk.js')).debug.current; const d = c.built.debug; let lo = 9, hi = 0; for (let k = 0; k < 180; k++) { c.sim(1 / 60, 1); lo = Math.min(lo, d.led.emissiveIntensity); hi = Math.max(hi, d.led.emissiveIntensity); } return { lo: +lo.toFixed(2), hi: +hi.toFixed(2) }; });
    check('the LED panels pulse', led.hi - led.lo > 0.3, JSON.stringify(led));
    // 40 m forward: the world wraps, the readout gives up on distance
    const w = await page.evaluate(async () => { const c = (await import('./walk/walk.js')).debug.current; c.controls.setKeys({ forward: true }); c.sim(1 / 60, 1100); c.controls.setKeys({}); c.step(1 / 60, 0); return { pos: c.controls.position().toArray().map((v) => +v.toFixed(2)), travelled: c.built.debug.travelled, readout: document.getElementById('walkReadout').textContent, CELL: c.built.debug.CELL }; });
    check('the park wraps around', w.pos[2] > -1.5 * w.CELL && w.travelled > 36, JSON.stringify(w));
    check('DISTANCE reads NaN after the wrap', w.readout === 'DISTANCE: NaN', w.readout);
    await shot(page, 'trampoline_loop');
    const g = await page.evaluate(async () => { const c = (await import('./walk/walk.js')).debug.current; c.controls.setKeys({ forward: true }); let n = 0; while (!c.built.debug.goalOn && n++ < 400) c.sim(1 / 60, 10); c.controls.setKeys({}); c.step(1 / 60, 0); return { goalOn: c.built.debug.goalOn, objective: document.getElementById('walkObjective').textContent, beacon: c.built.debug.beacon.position.toArray().map((v) => +v.toFixed(2)), travelled: +c.built.debug.travelled.toFixed(1) }; });
    check('the chime brings the red glow', g.goalOn && g.objective === 'HEAD FOR THE RED', JSON.stringify(g));
    await page.evaluate(async (b) => { const c = (await import('./walk/walk.js')).debug.current; c.controls.setPosition(b[0], 1.62, b[2] + 6); c.controls.setLook(0, 0); c.step(1 / 60, 1); }, g.beacon);
    await shot(page, 'trampoline_glow');
    const e = await page.evaluate(W.forwardUntilExit, [60]);
    check('the red glow ends the loop', e.state === 'exit', JSON.stringify(e));
  } },
  G: { scene: 'grocery', next: 'home', async unplayed(page) {
    const open = await page.evaluate(W.tally);
    const ex = await page.evaluate(async () => (await import('./walk/walk.js')).debug.current.built.debug.exit);
    await page.evaluate(W.place, [ex.x, ex.z + 3.2, 0, 0]);
    const e = await page.evaluate(W.forwardUntilExit, [60]);
    const held = await page.evaluate(async () => (await import('./walk/walk.js')).debug.current.built.debug.game.held);
    check('Shopping List is a bonus: the EXIT ends the walk before it is played', open.text === 'RED TINS 0/3' && open.visible && e.state === 'exit' && held === 0, JSON.stringify({ tally: open.text, exit: e.state, held }));
  }, async drive(page) {
    const exit0 = await page.evaluate(W.exitState);
    const i = await page.evaluate(W.info);
    check('grocery draw calls under 60', i.calls < 60, `${i.calls} calls, ${i.tris} tris`);
    check('grocery objective', i.objective === 'FIND THE EXIT', i.objective);
    await shot(page, 'grocery_start');
    // the maze is solvable: BFS on the scene's own wall grid from the entrance to the exit
    const maze = await page.evaluate(async () => {
      const c = (await import('./walk/walk.js')).debug.current;
      const { wall, entC, exitC } = c.built.debug.maze;
      const R = wall.length, C = wall[0].length;
      const seen = wall.map((row) => row.map(() => false));
      const q = [[R - 1, entC, 0]]; seen[R - 1][entC] = true;
      let best = -1, walls = 0;
      for (const row of wall) for (const w of row) if (w) walls++;
      while (q.length) {
        const [r, cc, d] = q.shift();
        if (r === 0 && cc === exitC) { best = d; break; }
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nr = r + dr, nc = cc + dc;
          if (nr < 0 || nr >= R || nc < 0 || nc >= C || seen[nr][nc] || wall[nr][nc]) continue;
          seen[nr][nc] = true; q.push([nr, nc, d + 1]);
        }
      }
      return { pathCells: best, walls, cells: R * C };
    });
    check('the maze has a route from the doors to the EXIT', maze.pathCells > 20, `${maze.pathCells} cells, ${maze.walls}/${maze.cells} shelving`);
    const fl = await page.evaluate(async () => { const c = (await import('./walk/walk.js')).debug.current; const seenVals = new Set(); for (let k = 0; k < 60; k++) { c.sim(1 / 60, 10); seenVals.add(c.built.debug.stripFlicker.emissiveIntensity.toFixed(2)); } return [...seenVals]; });
    check('the left light row flickers', fl.length >= 2, fl.join(','));
    const rows = await page.evaluate(async () => { const c = (await import('./walk/walk.js')).debug.current; const d = c.built.debug; let lo = 9, hi = 0; for (let k = 0; k < d.ROW_PERIOD * 60; k += 2) { c.sim(1 / 60, 2); lo = Math.min(lo, d.strip.emissiveIntensity); hi = Math.max(hi, d.strip.emissiveIntensity); } return { lo: +lo.toFixed(2), hi: +hi.toFixed(2) }; });
    check('the rows breathe and dip', rows.hi > rows.lo * 1.05 && rows.lo < 2, JSON.stringify(rows));
    const cart = await page.evaluate(async () => (await import('./walk/walk.js')).debug.current.built.debug.cart);
    await page.evaluate(W.place, [cart.x - 0.5, cart.z + 4.5, 0.1, 0]);
    await page.evaluate(W.walk, ['forward', 30]);
    const ping = await page.evaluate(W.info);
    check('the anomaly pings when you come near the cart', ping.readout === 'PING_DETECTED_0x8F', ping.readout);
    await shot(page, 'grocery_cart');
    // what is left: tins in the dead ends
    const gg = await page.evaluate(async () => {
      const c = (await import('./walk/walk.js')).debug.current;
      const d = c.built.debug;
      const { wall } = d.maze;
      return {
        piles: d.game.piles.map((p) => ({ ...p, closed: [[-1, 0], [1, 0], [0, -1], [0, 1]].filter(([dr, dc]) => wall[p.r + dr][p.c + dc]).length, centre: d.cellToWorld(p.r, p.c) })),
        tins: d.game.tins, tally: document.getElementById('walkTally').textContent, cell: d.CELL,
      };
    });
    check('the tins are piled only in dead ends, so no aisle is blocked', gg.piles.length >= 3 && gg.piles.every((p) => p.closed === 3), JSON.stringify(gg.piles.map((p) => [p.r, p.c, p.closed])));
    check('Shopping List opens on its score line', gg.tally === 'RED TINS 0/3', gg.tally);
    const games = gg.piles.filter((p) => p.game);
    // walk from the aisle into a pile (its tins, or its trays): it stops you
    const into = async (p, box = p.collider) => {
      const cx = (box.minX + box.maxX) / 2, cz = (box.minZ + box.maxZ) / 2;
      const yaw = Math.atan2(-(cx - p.centre[0]), -(cz - p.centre[1]));
      await page.evaluate(W.place, [p.centre[0], p.centre[1], yaw, 0]);
      return gapTo(await page.evaluate(W.walk, ['forward', 120]), box);
    };
    const gap0 = await into(games[0]);
    check('a pyramid of tins is solid', gap0 > 0.26, `gap ${gap0.toFixed(2)}`);
    // the piles as drawn: tins clear of each other, trays on the floor beside them, all in the dead end
    await pileChecks(page, 'grocery');
    const half = gg.cell / 2 - 0.01;
    const inCell = (p, b) => b && b.minX >= p.centre[0] - half && b.maxX <= p.centre[0] + half && b.minZ >= p.centre[1] - half && b.maxZ <= p.centre[1] + half;
    check('every pile and its trays stay inside the dead end, short of the shelving', gg.piles.every((p) => inCell(p, p.collider) && inCell(p, p.trays)), JSON.stringify(gg.piles.map((p) => [p.r, p.c, inCell(p, p.collider), inCell(p, p.trays)])));
    const apart = gg.piles.map((p) => +Math.max(p.trays.minX - p.collider.maxX, p.collider.minX - p.trays.maxX, p.trays.minZ - p.collider.maxZ, p.collider.minZ - p.trays.maxZ).toFixed(3));
    check('the trays stand clear of the tins', apart.every((a) => a >= 0.029), `gaps ${apart.join(' ')}`);
    const trayGaps = [];
    for (const p of gg.piles) trayGaps.push(+(await into(p, p.trays)).toFixed(2));
    check('every stack of trays is solid', trayGaps.every((g) => g > 0.26), `gaps ${trayGaps.join(' ')}`);
    const tinFaces = await page.evaluate(async () => {
      const m = await import('./walk/walk.js');
      const c = m.debug.current, d = c.built.debug, THREE = m.debug.THREE;
      c.built.group.updateMatrixWorld(true);
      const a = new THREE.Vector3(), b = new THREE.Vector3(), e = new THREE.Vector3(), n = new THREE.Vector3();
      let down = 0, tris = 0, low = Infinity;
      c.built.group.traverse((o) => {
        if (!o.isMesh || o.isInstancedMesh || !['tin', 'tin_band', 'cardboard'].includes(o.name)) return;
        const p = o.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) low = Math.min(low, a.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld).y);
        if (o.name !== 'tin') return;
        for (let i = 0; i + 2 < p.count; i += 3) {
          a.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
          b.fromBufferAttribute(p, i + 1).applyMatrix4(o.matrixWorld);
          e.fromBufferAttribute(p, i + 2).applyMatrix4(o.matrixWorld);
          n.crossVectors(b.sub(a), e.sub(a)).normalize();
          tris++;
          if (n.y < -0.99) down++;
        }
      });
      // and each red tin in its pyramid, at the height of a top layer
      const games = d.game.piles.filter((q) => q.game);
      const red = d.game.tins.map((t, k) => { const q = games[k].collider; return t.x >= q.minX - 1e-6 && t.x <= q.maxX + 1e-6 && t.z >= q.minZ - 1e-6 && t.z <= q.maxZ + 1e-6 && t.y > 0.1 && t.y < 0.6; });
      return { down, tris, low: +low.toFixed(5), red };
    });
    check('the pile tins have no bottoms to lie in the floor or on the lids below, and nothing goes under the floor', tinFaces.tris > 0 && tinFaces.down === 0 && tinFaces.low >= -1e-4, JSON.stringify(tinFaces));
    check('each red tin sits in its pyramid', tinFaces.red.length === 3 && tinFaces.red.every(Boolean), JSON.stringify(tinFaces.red));
    const takes = [];
    for (let k = 0; k < gg.tins.length; k++) {
      const t = gg.tins[k], p = games[k];
      const a = await page.evaluate(W.aimAt, [t.x, t.y, t.z, p.centre[0], p.centre[1]]);
      if (k === 0) await shot(page, 'grocery_red_tin');
      const u = await pressUse(page);
      const taken = await page.evaluate(async (k) => (await import('./walk/walk.js')).debug.current.built.debug.game.tins[k].taken, k);
      takes.push({ target: a.target, prompt: a.prompt, taken, tally: u.tally });
    }
    const key = opt.mobile ? 'TAP' : 'E';
    check(`the prompt offers the red tin (${key} to take it)`, takes.every((t) => t.target === 'TAKE THE RED TIN' && t.prompt.startsWith(key)), JSON.stringify(takes.map((t) => t.prompt)));
    check('each red tin can be taken, and is counted', takes.every((t, k) => t.taken && t.tally.startsWith(`RED TINS ${k + 1}/${takes.length}`)), JSON.stringify(takes.map((t) => t.tally)));
    const gap1 = await into(games[0]);
    check('the pyramid stays solid once its red tin is taken', gap1 > 0.26, `gap ${gap1.toFixed(2)}`);
    const cart2 = await page.evaluate(async () => (await import('./walk/walk.js')).debug.current.built.debug.cart);
    const ac = await page.evaluate(W.aimAt, [cart2.x, 0.85, cart2.z, cart2.x, cart2.z - 1.3]);
    const uc = await pressUse(page);
    const basket = await page.evaluate(async () => { const d = (await import('./walk/walk.js')).debug.current.built.debug; const m = new (await import('./walk/walk.js')).debug.THREE.Matrix4(); const n = d.game.tins.length; const ys = []; for (let i = 0; i < n; i++) { d.redBodies.getMatrixAt(n + i, m); ys.push(+m.elements[13].toFixed(2)); } return { done: d.game.done, ys }; });
    check('the red tins go back in the cart', ac.target === 'PUT THEM IN THE CART' && basket.done && basket.ys.every((y) => y > 0.6 && y < 0.8) && uc.readout === 'PING_ACKNOWLEDGED' && /LIST COMPLETE/.test(uc.tally), JSON.stringify({ target: ac.target, basket, readout: uc.readout, tally: uc.tally }));
    await page.evaluate(W.place, [cart2.x + 0.4, cart2.z - 1.8, 0.2 + Math.PI, -0.35]);
    await shot(page, 'grocery_cart_full');
    check('the game left the EXIT as it was (trigger, colliders, bounds)', (await page.evaluate(W.exitState)) === exit0);
    const ex = await page.evaluate(async () => (await import('./walk/walk.js')).debug.current.built.debug.exit);
    await page.evaluate(W.place, [ex.x, ex.z + 3.2, 0, 0]);
    await shot(page, 'grocery_exit');
    const e = await page.evaluate(W.forwardUntilExit, [60]);
    check('the EXIT door ends the walk', e.state === 'exit', JSON.stringify(e));
  } },
};

async function main() {
  const { server, port } = await startServer();
  const base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({ executablePath: opt.chromium, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
  const context = await browser.newContext(opt.mobile
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148' }
    : { viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') report.errors.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => report.errors.push(String(e)));

  const ids = Object.keys(CHAPTERS).filter((id) => !opt.scenes || opt.scenes.includes(id) || opt.scenes.includes(CHAPTERS[id].scene));
  for (const id of ids) {
    const ch = CHAPTERS[id];
    console.log(`--- chapter ${id} (${ch.scene})`);
    try {
      if (ch.unplayed) {
        // first a visit that leaves the game alone and walks straight out: the exit is open before it
        await enterWalk(page, base, id);
        await ch.unplayed(page);
        await page.evaluate(W.finishExit);
      }
      await enterWalk(page, base, id);
      check(`chapter ${id}: NEXT enters the ${ch.scene} walk`, true);
      await ch.drive(page);
      await expectAfter(page, ch.next);
    } catch (err) {
      check(`chapter ${id} completed`, false, String(err).split('\n')[0]);
      await page.screenshot({ path: path.join(opt.out, `fail_${id}${SFX}.png`) }).catch(() => {});
    }
  }

  const errs = report.errors.filter((e) => !/favicon|Autoplay|play\(\) request|WebGL.*software|GPU stall|swiftshader|404/i.test(e));
  check('no console errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  fs.writeFileSync(path.join(opt.out, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
  server.close();
  console.log(report.ok ? 'ALL PASS' : 'FAILURES');
  process.exit(report.ok ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
