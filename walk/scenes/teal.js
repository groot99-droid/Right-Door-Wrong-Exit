// Teal Room, Square Door — The Glitch. The room video: an empty clean teal box with a
// cream ceiling, a coarse brown flecked carpet, an orange angular leather sofa against the
// back wall left of centre, a plain rectangular doorway right of centre that is pitch black,
// and a small blocky plant in the corner. From the log: a watch whose second hand ticks
// backward, a fake window whose sun never moves, and the decision to close your eyes on the
// orange couch, "just for a minute". The goal is the couch; the next loading clip is the
// sleeper on it.
import * as THREE from 'three';
import * as T from '../textures.js';
import { pbr, place, box, cyl, sphere, createBuilder } from '../build.js';
import { tealMaterials, plantSmall, voidDoor } from './teal_common.js';

export const meta = {
  id: 'teal',
  objective: 'FIND SOMEWHERE TO REST',
  arrive: 'CLOSE YOUR EYES',
  start: { x: 0.35, z: 2.7, yaw: 0.02 },
};

const ROOM = { w: 5.2, d: 7.4, h: 2.5 }; // x: ±2.6, z: ±3.7

export async function build({ quality, yieldFrame }) {
  const M = await tealMaterials({ quality, yieldFrame, variant: 'c' });
  const win = T.fakeWindow(quality.phone ? 256 : 512);
  M.window = pbr(win, { name: 'fake_window', color: '#ffffff', roughness: 0.9, env: 0, emissive: '#ffffff', emissiveIntensity: 1.35, worldUV: false, castShadow: false });
  M.glass = pbr(null, { name: 'window_glass', color: '#dfeeff', roughness: 0.05, env: 1.2, transparent: true, opacity: 0.12, castShadow: false });

  const B = createBuilder();
  const { w, d, h } = ROOM;
  const hx = w / 2, hz = d / 2, TH = 0.12;

  // --- shell -----------------------------------------------------------------------
  B.add(box(w + 2 * TH, TH, d + 2 * TH), M.carpet, place(0, -TH / 2, 0));
  B.add(box(w + 2 * TH, TH, d + 2 * TH), M.ceiling, place(0, h + TH / 2, 0));
  B.add(box(TH, h, d + 2 * TH), M.wall, place(hx + TH / 2, h / 2, 0));       // right
  B.add(box(w, h, TH), M.wall, place(0, h / 2, hz + TH / 2));                 // front (behind the player)
  // left wall with the fake window
  const WZ = 0.2, WW = 1.5, WH = 1.05, WY = 1.5;
  const segA = (WZ - WW / 2) - (-hz - TH), segB = (hz + TH) - (WZ + WW / 2);
  B.add(box(TH, h, segA), M.wall, place(-hx - TH / 2, h / 2, -hz - TH + segA / 2));
  B.add(box(TH, h, segB), M.wall, place(-hx - TH / 2, h / 2, WZ + WW / 2 + segB / 2));
  B.add(box(TH, WY - WH / 2, WW), M.wall, place(-hx - TH / 2, (WY - WH / 2) / 2, WZ));
  B.add(box(TH, h - (WY + WH / 2), WW), M.wall, place(-hx - TH / 2, WY + WH / 2 + (h - WY - WH / 2) / 2, WZ));
  // back wall with the square doorway right of centre
  const DX = 1.35, DW = 0.95, DH = 2.05;
  const leftW = DX - DW / 2 + hx, rightW = hx - DX - DW / 2;
  B.add(box(leftW, h, TH), M.wall, place(-hx + leftW / 2, h / 2, -hz - TH / 2));
  B.add(box(rightW, h, TH), M.wall, place(hx - rightW / 2, h / 2, -hz - TH / 2));
  B.add(box(DW, h - DH, TH), M.wall, place(DX, DH + (h - DH) / 2, -hz - TH / 2));
  B.collider(-hx + leftW / 2, -hz - TH / 2, leftW, TH);
  B.collider(hx - rightW / 2, -hz - TH / 2, rightW, TH);
  voidDoor(B, M, { x: DX, z: -hz, w: DW, h: DH, depth: 0.7, facing: 1 });

  // the fake window: a shallow recess, a painted sky, a pane of glass and a cream sill
  B.add(box(0.1, WH + 0.12, WW + 0.12), M.trim, place(-hx + 0.05, WY, WZ));
  B.add(box(0.06, WH, WW), M.void, place(-hx + 0.07, WY, WZ));
  B.mesh(new THREE.PlaneGeometry(WW - 0.08, WH - 0.08), M.window, place(-hx + 0.105, WY, WZ, Math.PI / 2));
  B.add(box(0.02, WH - 0.06, 0.03), M.trim, place(-hx + 0.11, WY, WZ));            // mullion
  B.add(box(0.02, 0.03, WW - 0.06), M.trim, place(-hx + 0.11, WY, WZ));            // transom
  B.mesh(new THREE.PlaneGeometry(WW - 0.08, WH - 0.08), M.glass, place(-hx + 0.125, WY, WZ, Math.PI / 2));
  B.add(box(0.16, 0.03, WW + 0.2), M.trim, place(-hx + 0.08, WY - WH / 2 - 0.05, WZ));

  // --- the orange angular sofa ------------------------------------------------------
  const SX = -0.9, SZ = -hz + 0.5;
  B.add(box(2.2, 0.3, 0.9), M.leather, place(SX, 0.33, SZ));                       // base
  for (const dx of [-0.72, 0, 0.72]) B.add(box(0.7, 0.13, 0.8), M.leather, place(SX + dx, 0.545, SZ + 0.02));
  B.add(box(2.2, 0.5, 0.2), M.leather, place(SX, 0.75, SZ - 0.36));                // back
  B.add(box(0.26, 0.6, 0.9), M.leather, place(SX - 1.16, 0.6, SZ, 0, 0, 0.16));    // arms, splayed outward
  B.add(box(0.26, 0.6, 0.9), M.leather, place(SX + 1.16, 0.6, SZ, 0, 0, -0.16));
  for (const [dx, dz] of [[-0.95, -0.35], [0.95, -0.35], [-0.95, 0.35], [0.95, 0.35]]) B.add(box(0.08, 0.18, 0.08), M.foot, place(SX + dx, 0.09, SZ + dz));
  B.collider(SX, SZ, 2.6, 1.0);

  // the plant in the corner, right of the doorway
  plantSmall(B, M, hx - 0.4, -hz + 0.4);

  // flush dome light
  B.add(sphere(0.19, 20, 10), M.domeLight, place(0, h + 0.03, -0.4));
  B.add(cyl(0.22, 0.22, 0.02, 20), M.trim, place(0, h - 0.01, -0.4));

  const { group, colliders } = B.finish();

  // --- lights ----------------------------------------------------------------------------
  const lights = new THREE.Group();
  lights.add(new THREE.HemisphereLight(0xfff6e6, 0x1c5a58, 0.95));
  const ceilingLight = new THREE.PointLight(0xffefd8, 30, 12, 2);
  ceilingLight.position.set(0, h - 0.3, -0.4);
  ceilingLight.castShadow = quality.shadows;
  ceilingLight.shadow.mapSize.set(quality.shadowMap, quality.shadowMap);
  ceilingLight.shadow.bias = -0.004;
  ceilingLight.shadow.normalBias = 0.02;
  lights.add(ceilingLight);
  // the window: a warm, low, unmoving sun across the carpet
  const sun = new THREE.SpotLight(0xffe2b0, 9, 10, 0.6, 0.6, 1.5);
  sun.position.set(-hx + 0.2, WY + 0.2, WZ);
  sun.target.position.set(0.8, 0, WZ + 0.6);
  lights.add(sun);
  lights.add(sun.target);
  const fill = new THREE.PointLight(0xa8fff0, 0.8, 6, 2);
  fill.position.set(DX, 1.2, -hz + 1.2);
  lights.add(fill);

  // --- the goal: the couch --------------------------------------------------------------
  const trigger = { minX: SX - 1.0, maxX: SX + 1.0, minZ: SZ + 0.5, maxZ: SZ + 0.95 };
  const nearGoal = { minX: SX - 1.6, maxX: SX + 1.6, minZ: SZ, maxZ: SZ + 2.0 };
  const exitPath = [
    new THREE.Vector3(SX + 0.2, 1.2, SZ + 0.55),
    new THREE.Vector3(SX + 0.4, 0.72, SZ + 0.1),
    new THREE.Vector3(SX + 0.5, 0.62, SZ + 0.05),
  ];

  // the watch on the HUD: it runs backward, and its seconds make no sense
  let watchT = 0, mm = 27, ss = 81;
  function update(p, dt, camera, ctx) {
    if (dt === undefined) return;
    watchT += dt;
    if (watchT >= 1) {
      watchT -= 1;
      ss -= 1;
      if (ss < 0) { ss = 99; mm -= 1; if (mm < 0) mm = 27; }
      ctx.setReadout(`WATCH  ${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`);
    }
  }

  return {
    meta, group, lights, colliders, update,
    bounds: { minX: -hx, maxX: hx, minZ: -hz, maxZ: hz },
    trigger, nearGoal, exitPath, exitLookAt: new THREE.Vector3(SX + 0.5, h, SZ - 0.3),
    exitDuration: 3.0, exitFadeStart: 0.5, exitTurn: 0.9,
    fog: new THREE.FogExp2(0x041a1a, 0.02),
    background: 0x000000,
    exposure: 1.05,
  };
}
