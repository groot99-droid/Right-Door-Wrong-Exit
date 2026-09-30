#!/usr/bin/env node
// Browser test for the walk phase, after the Chronicle Museum's walk_test.mjs.
//
//   node tools/walk_test.mjs [--out DIR] [--mobile] [--scene dining|hallway]
//
// Serves the repo, opens the game in headless Chromium (software WebGL), clicks
// through the gate and START, skips the first loading screen, ends the caption,
// presses NEXT, and then drives the 3D room: screenshots the start view, walks to
// the exit with the keyboard, and checks that the loading screen for the next
// chapter follows. Reports draw calls, triangles, frame time and console errors.
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
const opt = { out: path.join(ROOT, 'tools', 'out'), mobile: false, scene: null, chromium: process.env.CHROMIUM || '/opt/pw-browsers/chromium' };
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out') opt.out = path.resolve(args[++i]);
  else if (args[i] === '--mobile') opt.mobile = true;
  else if (args[i] === '--scene') opt.scene = args[++i];
}
if (!fs.existsSync(opt.chromium)) opt.chromium = undefined;
fs.mkdirSync(opt.out, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.mp4': 'video/mp4', '.MP4': 'video/mp4', '.mp3': 'audio/mpeg', '.png': 'image/png', '.PNG': 'image/png', '.jpg': 'image/jpeg' };
function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const file = path.normalize(path.join(ROOT, p === '/' ? '/index.html' : p));
      if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      fs.stat(file, (err, st) => {
        if (err || !st.isFile()) { res.writeHead(404); res.end('not found'); return; }
        const range = req.headers.range;
        const type = MIME[path.extname(file)] || 'application/octet-stream';
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

async function main() {
  const { server, port } = await startServer();
  const browser = await chromium.launch({ executablePath: opt.chromium, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
  const context = await browser.newContext(opt.mobile
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148' }
    : { viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') report.errors.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => report.errors.push(String(e)));

  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.click('#gate');
  await page.waitForTimeout(400);
  await page.click('#startBtn');
  await page.waitForSelector('body.phase-load', { timeout: 10000 });
  check('loading screen for A', true);
  // headless Chromium has no H.264: the clip errors out and the loader moves on by itself
  await page.waitForSelector('body.chapter-a', { timeout: 30000 });
  check('room A entered', true);

  // the walk scene is prepared while the room video plays
  await page.waitForFunction(() => document.querySelector('#walkMount canvas') !== null, null, { timeout: 60000 });
  check('walk renderer created while room A plays', true);
  await page.click('#captionCard');
  await page.waitForSelector('#nextBtn.visible', { timeout: 15000 });
  await page.click('#nextBtn');
  await page.waitForSelector('body.phase-walk', { timeout: 15000 });
  check('NEXT enters the walk phase', true);

  // wait for the walk to be live (controls attached) and the fade to lift
  await page.waitForFunction(async () => {
    const m = await import('./walk/walk.js');
    return m.debug.current && m.debug.current.state === 'walk';
  }, null, { timeout: 60000 });
  await page.waitForTimeout(1200);
  const info0 = await page.evaluate(async () => {
    const m = await import('./walk/walk.js');
    const r = m.debug.renderer;
    return { calls: r.info.render.calls, tris: r.info.render.triangles, geometries: r.info.memory.geometries, textures: r.info.memory.textures, quality: m.debug.quality, pos: m.debug.current.controls.position().toArray(), objective: document.getElementById('walkObjective').textContent };
  });
  console.log('walk info', JSON.stringify(info0));
  check('dining draw calls under 60', info0.calls < 60, `${info0.calls} calls, ${info0.tris} tris`);
  check('objective shown', info0.objective === 'FIND THE STAIRS', info0.objective);
  await page.screenshot({ path: path.join(opt.out, `dining_start${opt.mobile ? '_mobile' : ''}.png`) });

  // look around a little and screenshot the lamp side and the photo wall
  await page.evaluate(async () => { const m = await import('./walk/walk.js'); m.debug.current.controls.setLook(0.7, -0.05); });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(opt.out, `dining_left${opt.mobile ? '_mobile' : ''}.png`) });
  await page.evaluate(async () => { const m = await import('./walk/walk.js'); m.debug.current.controls.setLook(-0.8, 0.0); });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(opt.out, `dining_right${opt.mobile ? '_mobile' : ''}.png`) });

  // frame time over a second of walking with the keyboard, then steer to the stairs
  await page.evaluate(async () => { const m = await import('./walk/walk.js'); m.debug.current.controls.setLook(0.04, 0); });
  const t0 = Date.now();
  const frames0 = await page.evaluate(async () => (await import('./walk/walk.js')).debug.renderer.info.render.frame);
  await page.evaluate(async () => { const m = await import('./walk/walk.js'); const c = m.debug.current; c.controls.setKeys({ left: true }); c.step(1 / 60, 60); c.controls.setKeys({}); });
  await page.waitForTimeout(600);
  const frames1 = await page.evaluate(async () => (await import('./walk/walk.js')).debug.renderer.info.render.frame);
  const fps = (frames1 - frames0) / ((Date.now() - t0) / 1000);
  console.log(`software-GL fps while walking: ${fps.toFixed(1)}`);
  check('frames rendered while walking', frames1 > frames0);
  const posA = await page.evaluate(async () => (await import('./walk/walk.js')).debug.current.controls.position().toArray());
  check('A moves the player left', posA[0] < info0.pos[0] - 0.3, `x ${info0.pos[0].toFixed(2)} -> ${posA[0].toFixed(2)}`);
  await page.screenshot({ path: path.join(opt.out, `dining_walking${opt.mobile ? '_mobile' : ''}.png`) });

  // walk into the table: collision must stop the player short of it
  await page.evaluate(async () => { const m = await import('./walk/walk.js'); const c = m.debug.current.controls; c.setPosition(0.15, 1.62, 1.2); c.setLook(0, 0); });
  await page.evaluate(async () => { const m = await import('./walk/walk.js'); const c = m.debug.current; c.controls.setKeys({ forward: true }); c.step(1 / 60, 120); c.controls.setKeys({}); });
  const posT = await page.evaluate(async () => (await import('./walk/walk.js')).debug.current.controls.position().toArray());
  check('table blocks the player', posT[2] > 0.0, `z ${posT[2].toFixed(2)} (table edge at 0.09)`);

  // go round the table to the stairs
  await page.evaluate(async () => { const m = await import('./walk/walk.js'); const c = m.debug.current.controls; c.setPosition(-1.4, 1.62, 0.6); c.setLook(0, 0); });
  await page.evaluate(async () => { const m = await import('./walk/walk.js'); const c = m.debug.current; c.controls.setKeys({ forward: true }); c.step(1 / 60, 100); c.controls.setKeys({}); });
  const posN = await page.evaluate(async () => (await import('./walk/walk.js')).debug.current.controls.position().toArray());
  console.log('near stairs', posN.map((v) => v.toFixed(2)).join(', '));
  await page.evaluate(async () => { const m = await import('./walk/walk.js'); const c = m.debug.current.controls; c.setLook(Math.atan2(-(-0.05 - c.position().x), -(-3.2 - c.position().z)), 0); });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(opt.out, `dining_stairs${opt.mobile ? '_mobile' : ''}.png`) });
  const nearBefore = await page.evaluate(() => document.getElementById('walkObjective').textContent);
  const exitState = await page.evaluate(async () => {
    const m = await import('./walk/walk.js'); const c = m.debug.current;
    c.controls.setKeys({ forward: true });
    let n = 0;
    while (c.state === 'walk' && n++ < 60) c.step(1 / 60, 10);
    c.controls.setKeys({});
    const st = c.state;
    c.step(1 / 60, 50); // half a second into the climb
    return { state: st, near: document.getElementById('walkObjective').textContent, steps: n };
  });
  check('reaching the stairs starts the exit', exitState.state === 'exit', `after ${exitState.steps} steps, objective: ${nearBefore} -> ${exitState.near}`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(opt.out, `dining_climb${opt.mobile ? '_mobile' : ''}.png`) });
  await page.evaluate(async () => { const m = await import('./walk/walk.js'); const c = m.debug.current; if (c) c.step(1 / 60, 400); });
  await page.waitForSelector('body.phase-load, body.chapter-b', { timeout: 20000 });
  const loadSrc = await page.evaluate(() => document.getElementById('loadVideo').getAttribute('src'));
  check('loading screen for B follows the walk', loadSrc === 'b.MP4', loadSrc);
  await page.waitForSelector('body.chapter-b', { timeout: 30000 });
  check('room B entered', true);

  // hallway
  await page.click('#captionCard');
  await page.waitForSelector('#nextBtn.visible', { timeout: 15000 });
  await page.waitForFunction(async () => { const m = await import('./walk/walk.js'); return !!m; }, null, { timeout: 20000 });
  await page.waitForTimeout(3000); // let the hallway prepare
  await page.click('#nextBtn');
  await page.waitForSelector('body.phase-walk', { timeout: 15000 });
  await page.waitForFunction(async () => { const m = await import('./walk/walk.js'); return m.debug.current && m.debug.current.state === 'walk'; }, null, { timeout: 60000 });
  await page.waitForTimeout(1200);
  const infoH = await page.evaluate(async () => {
    const m = await import('./walk/walk.js');
    const r = m.debug.renderer;
    return { calls: r.info.render.calls, tris: r.info.render.triangles, objective: document.getElementById('walkObjective').textContent, pos: m.debug.current.controls.position().toArray() };
  });
  console.log('hallway info', JSON.stringify(infoH));
  check('hallway draw calls under 40', infoH.calls < 40, `${infoH.calls} calls, ${infoH.tris} tris`);
  check('hallway objective', infoH.objective === 'WALK TO THE END', infoH.objective);
  await page.screenshot({ path: path.join(opt.out, `hallway_start${opt.mobile ? '_mobile' : ''}.png`) });
  await page.evaluate(async () => { const m = await import('./walk/walk.js'); const c = m.debug.current.controls; c.setPosition(4.2, 1.62, 0.3); c.setLook(-Math.PI / 2 + 0.5, 0); });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(opt.out, `hallway_vending${opt.mobile ? '_mobile' : ''}.png`) });
  await page.evaluate(async () => { const m = await import('./walk/walk.js'); const c = m.debug.current.controls; c.setPosition(31, 1.62, 0); c.setLook(-Math.PI / 2, 0); });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(opt.out, `hallway_end${opt.mobile ? '_mobile' : ''}.png`) });
  const hallExit = await page.evaluate(async () => {
    const m = await import('./walk/walk.js'); const c = m.debug.current;
    c.controls.setKeys({ forward: true });
    let n = 0;
    while (c.state === 'walk' && n++ < 60) c.step(1 / 60, 10);
    c.controls.setKeys({});
    const st = c.state;
    c.step(1 / 60, 400);
    return st;
  });
  check('reaching the end of the hall starts the exit', hallExit === 'exit', hallExit);
  await page.waitForSelector('body.phase-load, body.chapter-c', { timeout: 20000 });
  const loadC = await page.evaluate(() => document.getElementById('loadVideo').getAttribute('src'));
  check('loading screen for C follows the hallway', loadC === 'c.MP4', loadC);

  const errs = report.errors.filter((e) => !/favicon|Autoplay|play\(\) request|WebGL.*software|GPU stall|swiftshader/i.test(e));
  check('no console errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  fs.writeFileSync(path.join(opt.out, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
  server.close();
  console.log(report.ok ? 'ALL PASS' : 'FAILURES');
  process.exit(report.ok ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
