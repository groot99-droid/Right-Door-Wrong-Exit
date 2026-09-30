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
// room) follows. Reports draw calls, triangles and console errors to tools/out/report.json.
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
};

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
  await page.waitForFunction(async () => { const m = await import('./walk/walk.js'); return m.debug.current && m.debug.current.state === 'walk'; }, null, { timeout: 120000 });
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
  A: { scene: 'dining', next: 'b.MP4', async drive(page) {
    const i = await page.evaluate(W.info);
    check('dining draw calls under 60', i.calls < 60, `${i.calls} calls, ${i.tris} tris`);
    check('dining objective', i.objective === 'FIND THE STAIRS', i.objective);
    await shot(page, 'dining_start');
    await page.evaluate(W.place, [0.15, 1.2, 0, 0]);
    const t = await page.evaluate(W.walk, ['forward', 120]);
    check('the table blocks the player', t[2] > 0.0, `z ${t[2]}`);
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
    await page.evaluate(W.place, [0.8, -1.2, 0, 0]);
    await shot(page, 'teal2_arch');
    const e = await page.evaluate(W.forwardUntilExit, [60]);
    check('the arch starts the exit', e.state === 'exit', JSON.stringify(e));
  } },
  E: { scene: 'flooded', next: 'f.MP4', async drive(page) {
    const i = await page.evaluate(W.info);
    check('flooded draw calls under 60', i.calls < 60, `${i.calls} calls, ${i.tris} tris`);
    check('flooded objective', i.objective === 'REACH THE RED DOOR', i.objective);
    await shot(page, 'flooded_start');
    const drips = await page.evaluate(async () => { const c = (await import('./walk/walk.js')).debug.current; const a = c.built.debug.cubes.instanceMatrix.array.slice(0, 16 * 4); c.sim(1 / 60, 30); const b = c.built.debug.cubes.instanceMatrix.array.slice(0, 16 * 4); let diff = 0; for (let k = 0; k < a.length; k++) diff += Math.abs(a[k] - b[k]); return diff; });
    check('the drips fall', drips > 0.01, `matrix change ${drips.toFixed(3)}`);
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
  G: { scene: 'grocery', next: 'home', async drive(page) {
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
    const cart = await page.evaluate(async () => (await import('./walk/walk.js')).debug.current.built.debug.cart);
    await page.evaluate(W.place, [cart.x - 0.5, cart.z + 4.5, 0.1, 0]);
    await page.evaluate(W.walk, ['forward', 30]);
    const ping = await page.evaluate(W.info);
    check('the anomaly pings when you come near the cart', ping.readout === 'PING_DETECTED_0x8F', ping.readout);
    await shot(page, 'grocery_cart');
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
