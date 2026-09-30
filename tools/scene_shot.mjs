#!/usr/bin/env node
// Screenshots of one walk scene from given viewpoints, for look development.
//   node tools/scene_shot.mjs <scene> [--mobile] [--out DIR] [--view "name:x,y,z,yaw,pitch"]...
// Without --view, the scene's start view is shot. `yaw`/`pitch` in radians; y = eye height.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const scene = args.find((a) => !a.startsWith('--')) || 'dining';
const opt = { out: path.join(ROOT, 'tools', 'out'), mobile: args.includes('--mobile'), views: [], walk: null };
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out') opt.out = path.resolve(args[++i]);
  else if (args[i] === '--view') opt.views.push(args[++i]);
  else if (args[i] === '--walk') opt.walk = args[++i]; // "forward:120" steps of a key before the shot
}
fs.mkdirSync(opt.out, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.normalize(path.join(ROOT, p));
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const chromiumPath = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const browser = await chromium.launch({ executablePath: chromiumPath, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext(opt.mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 720 } });
const page = await context.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://127.0.0.1:${port}/tools/scene.html?scene=${scene}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.walkReady === true, null, { timeout: 120000 });
await page.waitForTimeout(800);
const info = await page.evaluate(() => { const r = window.walk.debug.renderer; return { calls: r.info.render.calls, tris: r.info.render.triangles, textures: r.info.memory.textures, objective: document.getElementById('walkObjective').textContent }; });
console.log(scene, JSON.stringify(info));
const suffix = opt.mobile ? '_mobile' : '';
if (!opt.views.length) opt.views.push('start');
for (const v of opt.views) {
  const [name, spec] = v.split(':');
  if (spec) {
    const [x, y, z, yaw, pitch] = spec.split(',').map(Number);
    await page.evaluate(([x, y, z, yaw, pitch]) => { const c = window.walk.debug.current; c.controls.setPosition(x, y, z); c.controls.setLook(yaw, pitch || 0); c.step(1 / 60, 1); }, [x, y, z, yaw, pitch]);
  }
  if (opt.walk) {
    const [key, n] = opt.walk.split(':');
    await page.evaluate(([key, n]) => { const c = window.walk.debug.current; c.controls.setKeys({ [key]: true }); c.step(1 / 60, Number(n)); c.controls.setKeys({}); }, [key, n]);
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(opt.out, `${scene}_${name}${suffix}.png`) });
  const st = await page.evaluate(() => { const c = window.walk.debug.current; return c ? { state: c.state, pos: c.controls.position().toArray().map((v) => +v.toFixed(2)) } : { state: 'done', result: window.walkResult }; });
  console.log(' ', name, JSON.stringify(st));
}
if (errors.length) console.log('console errors:', errors.slice(0, 5));
await browser.close();
server.close();
