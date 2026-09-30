// The Hallway — The Descent. Rebuilt from `liminal_hallway_v2.blend`: a 36 m corridor,
// 3.4 m wide and 2.7 m high, mustard painted walls, grey carpet, a 0.5 x 0.25 m tile
// ceiling, nine fluorescent panels, nine doors a side (the second on the left replaced
// by a humming vending machine), outlets, baseboards, and a sign band at the far end
// that reads THE END. Blender's (x, y, z) become three.js (x, z, -y).
import * as THREE from 'three';
import * as T from '../textures.js';
import { pbr, place, box, cyl, createBuilder } from '../build.js';

export const meta = {
  id: 'hallway',
  objective: 'WALK TO THE END',
  arrive: 'THE END',
  start: { x: 1.0, z: 0, yaw: -Math.PI / 2 }, // looking down +x
};

const LEN = 36, WID = 3.4, HGT = 2.7;

function vendTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#3b6cff'); grad.addColorStop(0.5, '#1f4be0'); grad.addColorStop(1, '#183a9f');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 512);
  for (let row = 0; row < 6; row++) {
    const y = 40 + row * 74;
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(14, y + 44, 228, 6); // shelf
    for (let k = 0; k < 6; k++) {
      const x = 20 + k * 37;
      g.fillStyle = k % 2 ? 'rgba(5,10,40,0.75)' : 'rgba(10,20,60,0.65)';
      g.fillRect(x, y, 24, 44);
      g.fillStyle = 'rgba(120,170,255,0.35)';
      g.fillRect(x + 3, y + 4, 5, 36);
    }
  }
  g.fillStyle = 'rgba(0,0,0,0.5)';
  g.fillRect(0, 0, 256, 14); g.fillRect(0, 498, 256, 14); g.fillRect(0, 0, 10, 512); g.fillRect(246, 0, 10, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function signTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 168;
  const g = c.getContext('2d');
  g.fillStyle = '#bf9433';
  g.fillRect(0, 0, c.width, c.height);
  // worn band: darker speckle
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(60,40,10,${Math.random() * 0.12})`;
    g.fillRect(Math.random() * c.width, Math.random() * c.height, 2 + Math.random() * 4, 1 + Math.random() * 2);
  }
  g.fillStyle = '#0d0a08';
  g.font = 'bold 118px "Arial Narrow", Impact, "Oswald", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('THE END', c.width / 2, c.height / 2 + 6);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export async function build({ quality, yieldFrame }) {
  const S = quality.texSize;
  const s = Math.max(256, S / 2);

  const carpet = T.carpet(S, { color: '#77777a', shade: '#4d4d50', light: '#96969a', seed: 61, tile: 1.2 });
  await yieldFrame();
  const wall = T.backroomsWall(S, { seed: 62, tile: 3.0 });
  await yieldFrame();
  const tiles = T.ceilingTile(s, { seed: 63, tile: 2.0 });
  await yieldFrame();

  const M = {
    carpet: pbr(carpet, { name: 'carpet', roughness: 1, env: 0.1, normalScale: 0.7, castShadow: false }),
    wall: pbr(wall, { name: 'wall', roughness: 0.85, env: 0.2, normalScale: 0.7 }),
    ceiling: pbr(tiles, { name: 'ceiling', roughness: 0.95, env: 0.15, normalScale: 0.6, castShadow: false }),
    door: pbr(null, { name: 'door', color: '#9e9e99', roughness: 0.4, env: 0.35 }),
    frame: pbr(null, { name: 'door_frame', color: '#e6e6de', roughness: 0.5, env: 0.3 }),
    hardware: pbr(null, { name: 'hardware', color: '#a6a8ad', roughness: 0.3, metalness: 1, env: 1.2 }),
    trim: pbr(null, { name: 'trim', color: '#120d0a', roughness: 0.4, env: 0.3 }),
    outlet: pbr(null, { name: 'outlet', color: '#e0dfd2', roughness: 0.4, env: 0.3 }),
    panel: pbr(null, { name: 'fluorescent', color: '#ffffff', roughness: 0.6, env: 0, emissive: '#f5f9ff', emissiveIntensity: 4.5, castShadow: false }),
    panelRim: pbr(null, { name: 'fluorescent_rim', color: '#d9d9d3', roughness: 0.5, env: 0.3, castShadow: false }),
    vendBody: pbr(null, { name: 'vend_body', color: '#0d1020', roughness: 0.3, metalness: 0.2, env: 0.6 }),
    vendTrim: pbr(null, { name: 'vend_trim', color: '#bf101a', roughness: 0.35, metalness: 0.1, env: 0.6 }),
    vendGlow: (() => { const t = vendTexture(); const m = pbr({ map: t, tile: 1 }, { name: 'vend_glow', color: '#ffffff', roughness: 0.4, env: 0.3, emissive: '#ffffff', emissiveIntensity: 1.6, castShadow: false, worldUV: false }); m.emissiveMap = t; return m; })(),
    vendBadge: pbr(null, { name: 'vend_badge', color: '#ffffff', roughness: 0.5, env: 0, emissive: '#ffffff', emissiveIntensity: 3.0, castShadow: false }),
    cable: pbr(null, { name: 'cable', color: '#0a0a0a', roughness: 0.6, env: 0.2 }),
    signText: pbr({ map: signTexture(), tile: 1 }, { name: 'sign', roughness: 0.6, env: 0.2, worldUV: false }),
  };

  const B = createBuilder();
  const TH = 0.12;
  const hw = WID / 2;

  // shell (walls extend a little beyond both ends)
  B.add(box(LEN + 2 * TH, TH, WID + 2 * TH), M.carpet, place(LEN / 2, -TH / 2, 0));
  B.add(box(LEN + 2 * TH, TH, WID + 2 * TH), M.ceiling, place(LEN / 2, HGT + TH / 2, 0));
  B.add(box(LEN + 2 * TH, HGT, TH), M.wall, place(LEN / 2, HGT / 2, hw + TH / 2));   // Blender left (-y)
  B.add(box(LEN + 2 * TH, HGT, TH), M.wall, place(LEN / 2, HGT / 2, -hw - TH / 2));  // Blender right (+y)
  B.add(box(TH, HGT, WID + 2 * TH), M.wall, place(LEN + TH / 2, HGT / 2, 0));        // end wall
  B.add(box(TH, HGT, WID + 2 * TH), M.wall, place(-TH / 2, HGT / 2, 0));             // start wall
  // baseboards
  B.add(box(LEN, 0.1, 0.012), M.trim, place(LEN / 2, 0.05, hw - 0.006));
  B.add(box(LEN, 0.1, 0.012), M.trim, place(LEN / 2, 0.05, -hw + 0.006));
  B.add(box(0.012, 0.1, WID), M.trim, place(LEN - 0.006, 0.05, 0));

  // doors: Blender y = -1.65 (left, three z = +1.65) and +1.65 (right, three z = -1.65)
  for (let i = 0; i < 9; i++) {
    const x = 2 + i * 4;
    for (const side of [1, -1]) {
      if (side === 1 && i === 1) continue; // the vending machine stands here
      const z = side * 1.65;
      const zf = side * 1.68;
      B.add(box(1.14, 2.25, 0.05), M.frame, place(x, 1.1, zf));
      B.add(box(1.0, 2.15, 0.05), M.door, place(x, 1.08, z));
      B.add(box(0.03, 0.13, 0.05), M.hardware, place(x + 0.32, 0.9, side * 1.62));
      B.add(box(0.09, 0.14, 0.01), M.outlet, place(x + 1.4, 0.32, side * 1.69));
    }
    // fluorescent panel with a thin rim, on the ceiling
    B.add(box(2.4, 0.03, 0.55), M.panel, place(x, HGT - 0.02, 0));
    B.add(box(2.5, 0.02, 0.65), M.panelRim, place(x, HGT - 0.005, 0));
  }

  // vending machine (Blender y = -1.39 -> z = +1.39; its face looks into the corridor at z = 1.08)
  B.add(box(0.85, 1.85, 0.62), M.vendBody, place(6.0, 0.93, 1.39));
  B.add(box(0.85, 0.05, 0.62), M.vendTrim, place(6.0, 1.85, 1.39));
  B.mesh(new THREE.PlaneGeometry(0.62, 1.15), M.vendGlow, place(6.0, 1.15, 1.08));
  B.add(box(0.34, 0.34, 0.01), M.vendBadge, place(6.0, 1.45, 1.075));
  B.add(box(0.14, 0.18, 0.03), M.vendBody, place(6.28, 0.75, 1.1));
  B.add(box(0.05, 0.03, 0.02), M.trim, place(6.28, 0.55, 1.09));
  for (let i = 0; i < 5; i++) B.add(box(0.14, 0.01, 0.02), M.cable, place(5.65 + i * 0.13, 0.005, 1.08 + i * 0.05, -0.35));
  B.collider(6.0, 1.39, 0.9, 0.66);

  // end sign band (Blender x = 35.98 -> a plane just proud of the end wall)
  B.add(box(0.02, 0.5, 3.06), M.trim, place(LEN - 0.02, 2.15, 0));
  B.mesh(new THREE.PlaneGeometry(3.06, 0.5), M.signText, place(LEN - 0.032, 2.15, 0, -Math.PI / 2));

  const { group, colliders } = B.finish();

  // lights: warm dim ambient from the .blend world, and a pool of three point lights that
  // re-park on the nearest fluorescent panels as the player walks (constant light count,
  // so the shaders never recompile mid-walk).
  const lights = new THREE.Group();
  lights.add(new THREE.HemisphereLight(0xfff4d8, 0x5a4c20, 0.8));
  const fixtures = [];
  for (let i = 0; i < 9; i++) fixtures.push(new THREE.Vector3(2 + i * 4, HGT - 0.5, 0));
  const pool = [];
  for (let i = 0; i < 3; i++) {
    const l = new THREE.PointLight(0xeef3ff, 16, 13, 2);
    l.position.copy(fixtures[i]);
    lights.add(l);
    pool.push(l);
  }
  function update(playerPos) {
    const sorted = fixtures.slice().sort((a, b) => Math.abs(a.x - playerPos.x) - Math.abs(b.x - playerPos.x));
    for (let i = 0; i < pool.length; i++) pool[i].position.copy(sorted[i]);
  }

  const trigger = { minX: LEN - 1.35, maxX: LEN, minZ: -hw, maxZ: hw };
  const nearGoal = { minX: LEN - 5, maxX: LEN, minZ: -hw, maxZ: hw };
  const exitPath = [
    new THREE.Vector3(LEN - 1.3, 1.62, 0),
    new THREE.Vector3(LEN - 0.55, 1.62, 0),
  ];

  return {
    meta,
    group, lights, colliders, update,
    bounds: { minX: 0, maxX: LEN, minZ: -hw, maxZ: hw },
    trigger, nearGoal, exitPath, exitLookAt: new THREE.Vector3(LEN, 2.05, 0),
    fog: new THREE.FogExp2(0x1a1408, 0.035),
    background: 0x1a1408,
    exposure: 1.0,
  };
}
