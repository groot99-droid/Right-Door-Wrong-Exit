// Grocery Store — The Anomaly. A vast stripped big-box supermarket: glossy speckled vinyl
// tile, a suspended acoustic-tile ceiling with continuous rows of fluorescent strips (the
// left row flickers), square cream columns, empty grey gondola shelving, and in the middle
// a single red shopping cart roped off by sagging caution tape between chrome stanchions.
// From the log: a digital chime, a single red glow, the only thing that isn't supposed to
// be here. Here the shelving is a maze of aisles: the entrance doors behind you are locked,
// the roped-off cart stands in a clearing at the heart of it, and a lit EXIT sign shows over
// the shelves on the far wall. Find the way. The exit closes the loop.
import * as THREE from 'three';
import * as T from '../textures.js';
import { pbr, place, box, cyl, sphere, createBuilder, mirrorY } from '../build.js';

export const meta = {
  id: 'grocery',
  objective: 'FIND THE EXIT',
  arrive: 'EXIT',
  start: { x: 0, z: 0, yaw: 0 },  // filled in from the maze below
};

const CELL = 2.0;
const COLS = 19, ROWS = 23;              // odd: corridors on odd indices, shelving on even
const W = COLS * CELL, D = ROWS * CELL;  // 38 x 46 m
const HGT = 4.0;
const SHELF_H = 1.85;

// A perfect maze on the odd cells (recursive backtracker, seeded), then a few extra
// openings so there are loops, a clearing in the middle for the cart, the entrance at the
// front and the exit at the back right.
function makeMaze(seed) {
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const wall = [];
  for (let r = 0; r < ROWS; r++) { wall.push(new Array(COLS).fill(true)); }
  const stack = [[1, 1]];
  wall[1][1] = false;
  while (stack.length) {
    const [r, c] = stack[stack.length - 1];
    const opts = [];
    for (const [dr, dc] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) {
      const nr = r + dr, nc = c + dc;
      if (nr > 0 && nr < ROWS - 1 && nc > 0 && nc < COLS - 1 && wall[nr][nc]) opts.push([nr, nc, r + dr / 2, c + dc / 2]);
    }
    if (!opts.length) { stack.pop(); continue; }
    const [nr, nc, wr, wc] = opts[Math.floor(rnd() * opts.length)];
    wall[wr][wc] = false;
    wall[nr][nc] = false;
    stack.push([nr, nc]);
  }
  // loops: knock out some interior walls between corridors
  for (let k = 0; k < 26; k++) {
    const r = 1 + Math.floor(rnd() * (ROWS - 2)), c = 1 + Math.floor(rnd() * (COLS - 2));
    if (wall[r][c] && ((r % 2 === 0 && c % 2 === 1) || (r % 2 === 1 && c % 2 === 0))) wall[r][c] = false;
  }
  // the clearing for the cart
  const cr = Math.floor(ROWS / 2), cc = Math.floor(COLS / 2);
  for (let r = cr - 2; r <= cr + 2; r++) for (let c = cc - 2; c <= cc + 2; c++) wall[r][c] = false;
  // the entrance (front, centre) and the exit (back, right) cut through the perimeter shelving
  const entC = cc;
  wall[ROWS - 1][entC] = false;
  const exitC = COLS - 4;
  wall[0][exitC] = false;
  wall[1][exitC] = false;
  return { wall, entC, exitC, cr, cc };
}

const cx = (c) => -W / 2 + (c + 0.5) * CELL;
const cz = (r) => -D / 2 + (r + 0.5) * CELL;

export async function build({ quality, yieldFrame }) {
  const S = quality.texSize;
  const s = Math.max(256, S / 2);
  const vinyl = T.tiles(S, { cols: 4, rows: 4, a: '#e9e3d3', b: '#e4ddcc', grout: '#ddd6c5', groutW: 0.012, seed: 221, tile: 1.2, gloss: 0.12, speckle: 0.02 });
  await yieldFrame();
  const acoustic = T.tiles(s, { cols: 4, rows: 4, a: '#eeece4', b: '#e8e6dd', grout: '#c9c6ba', groutW: 0.03, seed: 222, tile: 2.4, gloss: 0.9, speckle: 0.05, relief: 0.4 });
  await yieldFrame();
  const paint = T.plaster(s, { color: '#e6e0d2', seed: 223, tile: 3.0, relief: 0.2 });
  await yieldFrame();
  const tape = T.cautionTape();
  const exitTex = T.exitSign();

  const M = {
    floor: pbr(vinyl, { name: 'vinyl', roughness: 0.1, env: 1.6, normalScale: 0.15, transparent: true, opacity: 0.86, castShadow: false }),
    ceiling: pbr(acoustic, { name: 'acoustic', roughness: 0.95, env: 0.15, normalScale: 0.5, castShadow: false }),
    wall: pbr(paint, { name: 'wall', roughness: 0.9, env: 0.2, normalScale: 0.3 }),
    column: pbr(paint, { name: 'column', color: '#f0ebe0', roughness: 0.85, env: 0.25, normalScale: 0.3 }),
    strip: pbr(null, { name: 'strip', color: '#ffffff', roughness: 0.6, env: 0, emissive: '#fff6e6', emissiveIntensity: 3.2, castShadow: false }),
    stripFlicker: pbr(null, { name: 'strip_flicker', color: '#ffffff', roughness: 0.6, env: 0, emissive: '#fff6e6', emissiveIntensity: 3.2, castShadow: false }),
    stripHousing: pbr(null, { name: 'strip_housing', color: '#d5d2c8', roughness: 0.5, env: 0.3, castShadow: false }),
    gondola: pbr(null, { name: 'gondola', color: '#b9b8b2', roughness: 0.5, metalness: 0.4, env: 0.7 }),
    gondolaBack: pbr(null, { name: 'gondola_back', color: '#a3a29c', roughness: 0.7, metalness: 0.2, env: 0.4 }),
    kick: pbr(null, { name: 'kick', color: '#55544f', roughness: 0.7, env: 0.3 }),
    chrome: pbr(null, { name: 'chrome', color: '#d8dade', roughness: 0.2, metalness: 1, env: 1.4 }),
    cart: pbr(null, { name: 'cart_red', color: '#c8202a', roughness: 0.45, env: 0.6, emissive: '#5a0008', emissiveIntensity: 0.4 }),
    wheel: pbr(null, { name: 'wheel', color: '#151515', roughness: 0.8, env: 0.2 }),
    tape: pbr({ map: tape, tile: 1 }, { name: 'caution', roughness: 0.6, env: 0.3, side: THREE.DoubleSide, worldUV: false, castShadow: false }),
    exit: pbr({ map: exitTex, emissiveMap: exitTex, tile: 1 }, { name: 'exit_sign', color: '#ffffff', roughness: 0.6, env: 0, emissive: '#ffffff', emissiveIntensity: 2.2, worldUV: false, castShadow: false }),
    door: pbr(null, { name: 'exit_door', color: '#8d8f8a', roughness: 0.5, metalness: 0.3, env: 0.5 }),
    glass: pbr(null, { name: 'entrance_glass', color: '#0a0c10', roughness: 0.1, metalness: 0.2, env: 1.2 }),
    void: pbr(null, { name: 'void', color: '#000000', roughness: 1, env: 0, castShadow: false }),
    alarm: pbr(null, { name: 'alarm', color: '#d01818', roughness: 0.5, env: 0.3 }),
  };

  const maze = makeMaze(20261);
  const { wall, entC, exitC, cr, cc } = maze;
  meta.start.x = cx(entC);
  meta.start.z = cz(ROWS - 1) + 0.3;
  const EXIT_X = cx(exitC), EXIT_Z = -D / 2;

  const R = createBuilder();   // mirrored under the floor
  const F = createBuilder();   // the floor itself and what stands in the water-like gloss
  const hw = W / 2, hd = D / 2, TH = 0.15;

  // --- the box: walls, ceiling, entrance glass, exit door -----------------------------------
  R.add(box(TH, HGT, D + 2 * TH), M.wall, place(-hw - TH / 2, HGT / 2, 0));
  R.add(box(TH, HGT, D + 2 * TH), M.wall, place(hw + TH / 2, HGT / 2, 0));
  // back wall with the exit door
  const DW = 1.1, DH = 2.15;
  R.add(box(EXIT_X - DW / 2 + hw, HGT, TH), M.wall, place(-hw + (EXIT_X - DW / 2 + hw) / 2, HGT / 2, -hd - TH / 2));
  R.add(box(hw - EXIT_X - DW / 2, HGT, TH), M.wall, place(hw - (hw - EXIT_X - DW / 2) / 2, HGT / 2, -hd - TH / 2));
  R.add(box(DW, HGT - DH, TH), M.wall, place(EXIT_X, DH + (HGT - DH) / 2, -hd - TH / 2));
  R.add(box(DW - 0.04, DH - 0.02, 0.06), M.door, place(EXIT_X, DH / 2, -hd - 0.02));
  R.add(box(0.8, 0.06, 0.06), M.chrome, place(EXIT_X, 1.0, -hd + 0.06));           // push bar
  R.add(box(0.94, 0.38, 0.06), M.kick, place(EXIT_X, DH + 0.35, -hd + 0.03));       // the sign box, proud of the wall
  R.mesh(new THREE.PlaneGeometry(0.9, 0.34), M.exit, place(EXIT_X, DH + 0.35, -hd + 0.065));
  R.add(box(DW + 2, HGT, 1.2), M.void, place(EXIT_X, HGT / 2, -hd - TH - 0.6));   // beyond the door
  // front wall: the entrance, black glass doors that will not open
  const EW = 4.0, EX = cx(entC);
  R.add(box(EX - EW / 2 + hw, HGT, TH), M.wall, place(-hw + (EX - EW / 2 + hw) / 2, HGT / 2, hd + TH / 2));
  R.add(box(hw - EX - EW / 2, HGT, TH), M.wall, place(hw - (hw - EX - EW / 2) / 2, HGT / 2, hd + TH / 2));
  R.add(box(EW, HGT - 2.4, TH), M.wall, place(EX, 2.4 + (HGT - 2.4) / 2, hd + TH / 2));
  R.add(box(EW, 2.4, 0.05), M.glass, place(EX, 1.2, hd + 0.05));
  for (const dx of [-EW / 2, -EW / 4, 0, EW / 4, EW / 2]) R.add(box(0.06, 2.4, 0.08), M.chrome, place(EX + dx, 1.2, hd + 0.04));
  R.add(box(EW, 0.06, 0.08), M.chrome, place(EX, 2.4, hd + 0.04));
  // ceiling and the fluorescent rows (along z, one every 4 m), the leftmost flickers
  R.add(box(W + 2 * TH, TH, D + 2 * TH), M.ceiling, place(0, HGT + TH / 2, 0));
  const rows = [];
  for (let x = -16; x <= 16; x += 4) {
    R.add(box(0.3, 0.06, D - 1), M.stripHousing, place(x, HGT - 0.02, 0));
    R.add(box(0.22, 0.03, D - 1.2), x === -16 ? M.stripFlicker : M.strip, place(x, HGT - 0.05, 0));
    rows.push(x);
  }
  // columns on an 8 m grid (kept out of the aisles: they sit inside shelving cells)
  for (let c = 2; c < COLS - 1; c += 4) {
    for (let r = 2; r < ROWS - 1; r += 4) {
      if (Math.abs(r - cr) <= 2 && Math.abs(c - cc) <= 2) continue;
      wall[r][c] = true; // a column stands in a shelving cell; the maze routes around it
      R.add(box(0.5, HGT, 0.5), M.column, place(cx(c), HGT / 2, cz(r)));
      if (c === COLS - 3 && r === 2) R.add(box(0.12, 0.16, 0.05), M.alarm, place(cx(c) + 0.19, 1.5, cz(r) + 0.28));
    }
  }

  // --- the shelving maze ---------------------------------------------------------------------
  const colliders = [];
  const unit = (x, z, alongZ, len) => {
    const L = len, Dp = 1.2;
    const rot = alongZ ? Math.PI / 2 : 0;
    const at = (lx, ly, lz) => place(x, ly, z, rot).multiply(place(lx, 0, lz));
    R.add(box(L, 0.12, Dp), M.kick, at(0, 0.06, 0));
    R.add(box(L, SHELF_H, 0.06), M.gondolaBack, at(0, SHELF_H / 2, 0));
    for (let k = 0; k < 5; k++) R.add(box(L, 0.03, Dp), M.gondola, at(0, 0.16 + k * 0.4, 0));
    R.add(box(0.04, SHELF_H, Dp), M.gondola, at(-L / 2 + 0.02, SHELF_H / 2, 0));
    R.add(box(0.04, SHELF_H, Dp), M.gondola, at(L / 2 - 0.02, SHELF_H / 2, 0));
    R.add(box(L, 0.05, Dp), M.gondola, at(0, SHELF_H + 0.02, 0));
  };
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!wall[r][c]) continue;
      const isColumn = c % 4 === 2 && r % 4 === 2 && !(Math.abs(r - cr) <= 2 && Math.abs(c - cc) <= 2) && c >= 2 && c < COLS - 1 && r >= 2 && r < ROWS - 1;
      colliders.push({ minX: cx(c) - CELL / 2, maxX: cx(c) + CELL / 2, minZ: cz(r) - CELL / 2, maxZ: cz(r) + CELL / 2 });
      if (isColumn) continue;
      const n = r > 0 && wall[r - 1][c], sth = r < ROWS - 1 && wall[r + 1][c];
      const e = c < COLS - 1 && wall[r][c + 1], w = c > 0 && wall[r][c - 1];
      const alongZ = (n || sth) && !(e || w) ? true : (e || w) && !(n || sth) ? false : (r === 0 || r === ROWS - 1) ? false : (c === 0 || c === COLS - 1);
      unit(cx(c), cz(r), alongZ, CELL);
    }
  }

  // --- the monument: the red cart, roped off ---------------------------------------------------
  const CX = cx(cc), CZ = cz(cr);
  {
    const bx = CX, bz = CZ;
    const basketW = 0.55, basketL = 0.9, basketH = 0.42, y0 = 0.62;
    // basket: rails and thin bars
    for (const dy of [0, basketH]) {
      R.add(box(basketL, 0.02, 0.02), M.cart, place(bx, y0 + dy, bz - basketW / 2));
      R.add(box(basketL, 0.02, 0.02), M.cart, place(bx, y0 + dy, bz + basketW / 2));
      R.add(box(0.02, 0.02, basketW), M.cart, place(bx - basketL / 2, y0 + dy, bz));
      R.add(box(0.02, 0.02, basketW), M.cart, place(bx + basketL / 2, y0 + dy, bz));
    }
    for (let i = 0; i <= 8; i++) {
      const lx = -basketL / 2 + i * (basketL / 8);
      R.add(box(0.012, basketH, 0.012), M.cart, place(bx + lx, y0 + basketH / 2, bz - basketW / 2));
      R.add(box(0.012, basketH, 0.012), M.cart, place(bx + lx, y0 + basketH / 2, bz + basketW / 2));
    }
    for (let i = 0; i <= 4; i++) {
      const lz = -basketW / 2 + i * (basketW / 4);
      R.add(box(0.012, basketH, 0.012), M.cart, place(bx - basketL / 2, y0 + basketH / 2, bz + lz));
      R.add(box(0.012, basketH, 0.012), M.cart, place(bx + basketL / 2, y0 + basketH / 2, bz + lz));
    }
    R.add(box(basketL, 0.012, basketW), M.cart, place(bx, y0, bz));
    R.add(box(0.04, 0.03, basketW + 0.1), M.cart, place(bx - basketL / 2 - 0.05, y0 + basketH + 0.1, bz));       // handle
    R.add(box(0.03, 0.14, 0.03), M.cart, place(bx - basketL / 2 - 0.03, y0 + basketH + 0.03, bz - basketW / 2));
    R.add(box(0.03, 0.14, 0.03), M.cart, place(bx - basketL / 2 - 0.03, y0 + basketH + 0.03, bz + basketW / 2));
    // chrome chassis and four wheels
    R.add(box(basketL + 0.1, 0.03, 0.03), M.chrome, place(bx, 0.2, bz - basketW / 2 + 0.05));
    R.add(box(basketL + 0.1, 0.03, 0.03), M.chrome, place(bx, 0.2, bz + basketW / 2 - 0.05));
    for (const [dx, dz] of [[-0.4, -0.22], [0.4, -0.22], [-0.4, 0.22], [0.4, 0.22]]) {
      R.add(cyl(0.03, 0.03, y0 - 0.2, 6), M.chrome, place(bx + dx, (y0 + 0.2) / 2, bz + dz));
      R.add(cyl(0.05, 0.05, 0.03, 10), M.wheel, place(bx + dx, 0.05, bz + dz, 0, Math.PI / 2));
    }
    colliders.push({ minX: bx - 0.55, maxX: bx + 0.55, minZ: bz - 0.4, maxZ: bz + 0.4 });
    // stanchions on a square, tape sagging between them
    const posts = [[-1.5, -1.5], [1.5, -1.5], [1.5, 1.5], [-1.5, 1.5]].map(([dx, dz]) => [bx + dx, bz + dz]);
    for (const [px, pz] of posts) {
      R.add(cyl(0.02, 0.02, 0.95, 8), M.chrome, place(px, 0.5, pz));
      R.add(cyl(0.16, 0.18, 0.03, 12), M.chrome, place(px, 0.015, pz));
      R.add(sphere(0.035, 8, 6), M.chrome, place(px, 0.98, pz));
      colliders.push({ minX: px - 0.15, maxX: px + 0.15, minZ: pz - 0.15, maxZ: pz + 0.15 });
    }
    for (let i = 0; i < 4; i++) {
      const [ax, az] = posts[i], [bx2, bz2] = posts[(i + 1) % 4];
      const len = Math.hypot(bx2 - ax, bz2 - az);
      const g = new THREE.PlaneGeometry(len, 0.07, 14, 1);
      const pos = g.attributes.position;
      for (let k = 0; k < pos.count; k++) { const u = pos.getX(k) / len + 0.5; pos.setY(k, pos.getY(k) - 0.16 * (1 - Math.pow(2 * u - 1, 2))); }
      const uv = g.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (len / 0.75), uv.getY(k));
      const ang = Math.atan2(-(bz2 - az), bx2 - ax);
      R.mesh(g, M.tape, place((ax + bx2) / 2, 0.9, (az + bz2) / 2, ang));
    }
  }

  // --- floor (glossy, over the mirrored store) -------------------------------------------------
  const floorMesh = F.mesh(new THREE.PlaneGeometry(W + 2 * TH, D + 2 * TH), M.floor, place(0, 0, 0, 0, -Math.PI / 2));
  floorMesh.renderOrder = 2;
  F.add(box(W + 2 * TH, 0.5, D + 2 * TH), M.void, place(0, -HGT - 1, 0));

  const roomOut = R.finish();
  const floorOut = F.finish();
  const group = new THREE.Group();
  group.add(roomOut.group);
  group.add(mirrorY(roomOut.group, 0));
  group.add(floorOut.group);
  colliders.push(...roomOut.colliders, ...floorOut.colliders);
  colliders.push({ minX: EX - EW / 2, maxX: EX + EW / 2, minZ: hd - 0.2, maxZ: hd + 1 });

  // --- lights ------------------------------------------------------------------------------------
  const lights = new THREE.Group();
  lights.add(new THREE.HemisphereLight(0xfff3e0, 0xb3a894, 1.1)); // the ground tone also lights the ceiling's underside
  const pool = [];
  for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xfff1dc, 30, 20, 2); lights.add(l); pool.push(l); }
  const flickerLight = new THREE.PointLight(0xfff1dc, 20, 16, 2);
  flickerLight.position.set(-16, HGT - 0.4, 0);
  lights.add(flickerLight);
  const anomaly = new THREE.PointLight(0xff2020, 6, 8, 2);
  anomaly.position.set(CX, 1.2, CZ);
  lights.add(anomaly);

  // --- the goal: the EXIT door ---------------------------------------------------------------------
  const trigger = { minX: EXIT_X - 0.6, maxX: EXIT_X + 0.6, minZ: EXIT_Z - 0.2, maxZ: EXIT_Z + 0.55 };
  const nearGoal = { minX: EXIT_X - 2.5, maxX: EXIT_X + 2.5, minZ: EXIT_Z - 0.2, maxZ: EXIT_Z + 4 };

  let elapsed = 0, pinged = false, flickT = 0, flickState = 1;
  function update(p, dt, camera, ctx) {
    if (dt === undefined) return;
    elapsed += dt;
    // four strip lights follow the player along the rows
    const near = rows.slice().sort((a, b) => Math.abs(a - p.x) - Math.abs(b - p.x));
    const zz = Math.round(p.z / 4) * 4;
    pool[0].position.set(near[0], HGT - 0.4, zz);
    pool[1].position.set(near[0], HGT - 0.4, zz + (p.z > zz ? 4 : -4));
    pool[2].position.set(near[1], HGT - 0.4, zz);
    pool[3].position.set(near[1], HGT - 0.4, zz + (p.z > zz ? 4 : -4));
    flickerLight.position.z = zz;
    // the left row flickers: a hash-driven stutter every few seconds
    flickT += dt;
    const phase = elapsed % 9;
    if (phase > 6.2 && phase < 7.4) {
      const k = Math.floor(elapsed * 22);
      const on = ((k * 2654435761) >>> 0) % 7 < 4;
      flickState = on ? 1 : 0.1;
    } else flickState = 1;
    M.stripFlicker.emissiveIntensity = 3.2 * flickState;
    flickerLight.intensity = 20 * flickState;
    // the anomaly pulses; a chime the first time you come near it
    const dCart = Math.hypot(p.x - CX, p.z - CZ);
    anomaly.intensity = 5 + 3 * Math.sin(elapsed * 2.2);
    M.cart.emissiveIntensity = 0.35 + 0.25 * Math.sin(elapsed * 2.2);
    if (!pinged && dCart < 7) { pinged = true; ctx.sound.chime(); ctx.setReadout('PING_DETECTED_0x8F'); }
    if (pinged && dCart < 4 && Math.floor(elapsed * 0.7) !== Math.floor((elapsed - dt) * 0.7)) ctx.sound.ping();
  }

  return {
    meta, group, lights, colliders, update,
    bounds: { minX: -hw, maxX: hw, minZ: -hd, maxZ: hd },
    trigger, nearGoal,
    exitPath: [new THREE.Vector3(EXIT_X, 1.62, EXIT_Z - 0.2), new THREE.Vector3(EXIT_X, 1.62, EXIT_Z - 1.1)],
    exitLookAt: new THREE.Vector3(EXIT_X, 1.5, EXIT_Z - 6),
    exitDuration: 2.0, exitFadeStart: 0.3,
    fog: new THREE.FogExp2(0xd9d2c2, 0.014),
    background: 0xd9d2c2,
    far: 120,
    exposure: 1.0,
    debug: { maze, stripFlicker: M.stripFlicker, cart: { x: CX, z: CZ }, exit: { x: EXIT_X, z: EXIT_Z }, cellToWorld: (r, c) => [cx(c), cz(r)] },
  };
}
